# Parking

Aplicación móvil de administración de parqueadero y API. El alcance actual es
privado: solo inicia sesión el administrador; este registra vehículos y activa
o inactiva manualmente sus servicios. No se procesan pagos ni hay registro
público. La app se distribuye como APK, fuera de Play Store.

## Componentes

- `app`: React Native 0.81.4, Android APK.
- `api`: Node.js + Express; SQLite en desarrollo/tests y Firestore como fuente
  persistente en producción sobre Vercel.
- La API es la fuente de verdad para la sesión, vehículos y servicios. El
  administrador puede activar un servicio hasta 365 días (la app ofrece 30 por
  defecto); repetir la activación de un servicio ya activo no crea uno nuevo.

## Desarrollo local

### API

Requisitos: Node.js 24 LTS (mínimo: 22.13) y npm.

```powershell
cd api
npm ci
Copy-Item .env.example .env
```

Edita `api/.env`: define un `JWT_SECRET` aleatorio de al menos 32 caracteres,
`ADMIN_EMAIL` y `ADMIN_PASSWORD` (16–128 caracteres). El arranque crea o
actualiza el único administrador configurado. No uses estas credenciales de
ejemplo en ningún entorno real.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm test
npm run dev
```

Comprobación local: `http://localhost:4000/health`.

### App Android

```powershell
cd app
npm ci
Copy-Item .env.development.example .env.development
Copy-Item .env.production.example .env.production
```

En `app/.env.development`, usa `http://10.0.2.2:4000/api` para el emulador de
Android. Para un teléfono físico, reemplaza `10.0.2.2` por la IP LAN del equipo
que ejecuta la API. Las compilaciones release requieren HTTPS.

```powershell
npm test -- --runInBand
npm run lint
npx tsc --noEmit
cd android
.\gradlew.bat assembleDebug
```

## Producción: Firebase Firestore y Vercel

Vercel ejecuta la API en funciones serverless: no se debe usar SQLite ni
depender de un proceso Node residente. Configura el proyecto de Vercel con
`api/` como **Root Directory** y Node.js 22.x (22.13 o posterior). El archivo
`api/vercel.json` enruta las solicitudes al handler Express y agenda diariamente
`GET /api/jobs/reminders` a las 08:00 UTC. El scheduler administrado de Vercel
es necesario para ejecutar recordatorios; no existe un cron residente en las
funciones. Verifica que el plan de Vercel habilite Cron Jobs; si no, configura
un scheduler administrado externo que invoque la misma ruta diaria con el
encabezado de autorización configurado. La solicitud de cron requiere el
secreto Vercel `CRON_SECRET`.

1. Crea un proyecto Firebase, habilita Firestore en Native mode y Cloud
   Messaging. Asigna a la identidad de servicio usada por la API permisos
   mínimos de Firestore (lectura/escritura) y FCM. La API usa Firebase Admin;
   reglas cliente de Firestore no sustituyen IAM para esta identidad.
   Despliega las reglas restrictivas incluidas en `api/firestore.rules` desde
   `api/` con `firebase deploy --only firestore:rules --project <id-proyecto>`.
   Las reglas bloquean todo acceso de clientes; el Admin SDK de servidor opera
   mediante IAM y no está sujeto a esas reglas.
2. En la configuración de entorno de Vercel, define para Production:

   ```dotenv
   NODE_ENV=production
   STORAGE_DRIVER=firestore
   FIREBASE_PROJECT_ID=<id-del-proyecto>
   FIREBASE_CLIENT_EMAIL=<email-de-la-cuenta-de-servicio>
   FIREBASE_PRIVATE_KEY=<clave-privada-protegida-de-la-cuenta-de-servicio>
   JWT_SECRET=<aleatorio-criptograficamente-seguro-de-al-menos-32-caracteres>
   ADMIN_NAME=Administrador
   ADMIN_EMAIL=<email-real-del-administrador>
   ADMIN_PASSWORD=<16-a-128-caracteres>
   CRON_SECRET=<secreto-aleatorio-de-al-menos-32-caracteres>
   CORS_ORIGINS=
   ```

   También se admite `FIREBASE_SERVICE_ACCOUNT_PATH` o Application Default
   Credentials en entornos compatibles, pero en Vercel se recomienda guardar
   los valores Firebase como secretos de entorno. En `FIREBASE_PRIVATE_KEY`,
   configura el valor PEM completo con saltos de línea escapados (`\n`) si el
   panel no permite saltos reales. Nunca pongas secretos en Git, archivos
   desplegados, comandos, logs o el APK. `DATABASE_PATH` no se configura en
   producción. La aplicación falla al iniciar si faltan Firestore, JWT o las
   credenciales admin requeridas; no degrada silenciosamente a SQLite.
3. Haz el despliegue y comprueba `/health`, login y operaciones de vehículos y
   servicios con un cliente autorizado. No hay compra habilitada: el endpoint
   existente sigue respondiendo `503 PAYMENTS_NOT_CONFIGURED`. Configura
   `CORS_ORIGINS` solo si existe un cliente web; para el APK nativo puede quedar
   vacío. El login limita a 10 intentos por IP cada 15 minutos usando Firestore
   distribuido en producción. Configura una política TTL de Firestore para el
   campo `expiresAt` de `rateLimits` para limpiar documentos vencidos.

### Migrar `api/parking.db` preservando los registros

La migración es manual, de solo lectura sobre SQLite, idempotente y no se
ejecuta durante el despliegue. Haz primero una copia de seguridad privada de
`api/parking.db`; configura acceso Firebase local de forma segura (sin
incorporar credenciales al repositorio), y ejecuta desde `api/` apuntando
`DATABASE_PATH` a la base existente:

```powershell
$env:STORAGE_DRIVER = "firestore"
$env:FIREBASE_PROJECT_ID = "<id-del-proyecto>"
$env:FIREBASE_SERVICE_ACCOUNT_PATH = "C:\secure\firebase-service-account.json"
$env:DATABASE_PATH = ".\parking.db"
npm run migrate:firestore
```

El archivo de servicio debe estar en una ruta privada fuera del repositorio y
con permisos restringidos. Alternativamente, entrega `FIREBASE_CLIENT_EMAIL` y
`FIREBASE_PRIVATE_KEY` mediante un gestor de secretos que inyecte variables al
proceso; no escribas la clave en comandos, historial de shell o logs. El migrador
usa operaciones create-only por ID: conserva el SQLite original, no sobrescribe
un documento ya existente para las otras colecciones y al repetirse omite los
documentos migrados. En `users`, escribe/actualiza únicamente `password_hash`
para completar perfiles creados por el antiguo mirror. Lee la contraseña local
solo para reconocer un hash scrypt existente o convertir un plaintext legado a
scrypt en memoria; nunca sube texto claro, ni lo imprime. El hash scrypt se
guarda en `users.password_hash` y se verifica server-side con Admin SDK. Imprime
solo conteos agregados. Migra usuarios, vehículos, servicios, notificaciones y
tokens. Antes de apuntar producción a Firestore, valida los conteos y relaciones
con acceso administrativo seguro. No borres el origen hasta completar respaldos
y validación funcional.

SQLite permanece como opción local y en tests (`STORAGE_DRIVER=sqlite`); no es
una alternativa de producción en Vercel. Para desarrollo, `npm test` no requiere
credenciales Firebase ni una cuenta cloud.

## Compilar y distribuir el APK

El paquete Android de producción es `com.eulosoft.parking` y ya está registrado
en el proyecto Firebase `parking-9f1ce`; `app/android/app/google-services.json`
contiene la configuración cliente de ese paquete. Cuando la API esté desplegada
en Vercel, configura la URL HTTPS real en `app/.env.production`:

```dotenv
API_URL=https://parking-one-coral.vercel.app/api
```

El keystore de release de esta estación se guarda fuera del repositorio en
`%USERPROFILE%\.parking-release\parking-upload.p12`; su contraseña se conserva
cifrada con DPAPI en la misma carpeta y solo la puede descifrar la cuenta de
Windows que la creó. No borres ni publiques esos archivos: Android exige firmar
las futuras actualizaciones con la misma clave. Mantén esta cuenta/estación
disponible y conserva un respaldo seguro del keystore para recuperación.
El script usa esa contraseña protegida, la pasa a Gradle solo durante la
compilación y limpia las variables al terminar. Requiere JDK 17 en `PATH`:

```powershell
cd app\android
.\build-production-apk.ps1
```

El artefacto se genera en
`app/android/app/build/outputs/apk/release/app-release.apk`. Valida la firma
con `apksigner verify --verbose --print-certs <ruta-apk>` y prueba instalación,
inicio de sesión y activación/inactivación contra el dominio real en un
dispositivo Android antes de entregarlo.

## Limitaciones conocidas antes de producción

- La carga inicial de SQLite a Firestore se completó; el archivo SQLite y un
  respaldo privado se conservaron. Antes de habilitar el servicio, configura
  las credenciales privadas de producción en Vercel y valida el flujo de login
  y operaciones con la API desplegada.
- iOS no se compila ni valida desde Windows.
- La sesión móvil aún usa AsyncStorage; se recomienda migrar el token a
  Keychain/Android Keystore antes de una distribución de mayor riesgo.
- El paquete Android está registrado en Firebase y la API tiene un proyecto
  Vercel con despliegue inicial. No se han publicado credenciales privadas.
