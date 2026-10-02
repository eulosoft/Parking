# Parking

Aplicación móvil de administración de parqueadero y API. El alcance actual es
privado: solo inicia sesión el administrador; este registra vehículos y activa
o inactiva manualmente sus servicios. No se procesan pagos ni hay registro
público. La app se distribuye como APK, fuera de Play Store.

## Componentes

- `app`: React Native 0.81.4, Android APK.
- `api`: Node.js + Express, SQLite local persistente y Firebase opcional para
  notificaciones/sincronización.
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

## Despliegue de la API en Ubuntu

El dominio definitivo aún debe ser registrado/configurado. No se debe compilar
el APK de producción con una URL de ejemplo: Android release solo acepta HTTPS
y el hostname debe resolver al servidor real.

1. **DNS y servidor:** provisiona un VPS Ubuntu con IP pública fija y un dominio
   (por ejemplo `api.tudominio.com`). Crea un registro DNS `A` hacia la IPv4 y,
   si el servidor dispone de IPv6 funcional, un registro `AAAA`. Abre solo SSH,
   HTTP y HTTPS en el firewall. No expongas el puerto Node `4000` a Internet.
2. **Runtime:** instala Node.js 24 LTS y Nginx. Despliega el código de `api` en
   `/opt/parking-api` y ejecuta `npm ci --omit=dev`. Crea un usuario dedicado
   sin acceso interactivo con `sudo useradd --system --home /nonexistent --shell /usr/sbin/nologin parking-api` y permite que lea el código y las dependencias.
3. **Persistencia y secretos:** crea `/var/lib/parking-api` como directorio
   propiedad del usuario de servicio usando
   `sudo install -d -o parking-api -g parking-api -m 750 /var/lib/parking-api`.
   Crea `/etc/parking-api.env` con permisos `600` y los valores reales:

   ```dotenv
   NODE_ENV=production
   PORT=4000
   JWT_SECRET=<secreto aleatorio de al menos 32 caracteres>
   DATABASE_PATH=/var/lib/parking-api/parking.db
   ADMIN_NAME=Administrador
   ADMIN_EMAIL=<correo real del administrador>
   ADMIN_PASSWORD=<contraseña aleatoria de 16 a 128 caracteres>
   CORS_ORIGINS=
   REMINDER_INTERVAL_MS=3600000
   ```

   Firebase es opcional. Si se usan Firestore/FCM, añade credenciales seguras
   del entorno de ejecución; nunca guardes la cuenta de servicio en el
   repositorio. `CORS_ORIGINS` puede quedar vacío para el cliente móvil nativo;
   si se habilita una interfaz web, indica únicamente sus orígenes HTTPS.
4. **Proceso:** crea el usuario y el directorio de datos; copia
   `api/deploy/parking-api.service.example` a
   `/etc/systemd/system/parking-api.service`. Ajusta la ruta de Node si no es
   `/usr/bin/node`, luego ejecuta `sudo systemctl daemon-reload`,
   `sudo systemctl enable --now parking-api` y valida
   `sudo systemctl status parking-api` y `sudo journalctl -u parking-api`.
5. **Proxy y TLS:** configura Nginx para el dominio y reenvía
   `https://api.tudominio.com` a `http://127.0.0.1:4000`, preservando los
   encabezados `Host`, `X-Real-IP` y `X-Forwarded-For`. Habilita TLS con un
   certificado válido (por ejemplo, Let's Encrypt/Certbot) y redirección
   HTTP→HTTPS. `api/deploy/nginx-api.conf.example` contiene el bloque inicial
   HTTP; reemplaza el hostname, habilita Nginx y, después de que el DNS resuelva
   al servidor, ejecuta `sudo certbot --nginx --redirect -d api.tudominio.com`.
   Certbot instalará el certificado y la redirección HTTPS. Verifica
   `https://api.tudominio.com/health` y
   `https://api.tudominio.com/api/auth/login`.
6. **Operación:** comprueba que `/var/lib/parking-api/parking.db` sobrevive a
   reinicios, establece copias de seguridad periódicas de SQLite y prueba su
   restauración. Restringe el acceso a los secretos y al respaldo; monitoriza
   logs, espacio en disco, disponibilidad TLS y uso de recursos. Mantén una
   sola instancia de API para este SQLite local; para varias instancias se
   requiere migrar a una base de datos compartida.

El backend exige `JWT_SECRET`, `DATABASE_PATH`, `ADMIN_EMAIL` y
`ADMIN_PASSWORD` en producción. Antes de exponerlo, reemplaza todos los valores
de ejemplo. El secreto del administrador se aplica al arrancar, así que un
cambio del archivo de entorno también rota su contraseña. El login limita los
intentos por IP a 10 cada 15 minutos; el proxy Nginx de un salto es el único
proxy de confianza configurado en producción.

## Compilar y distribuir el APK

Una vez que TLS y DNS estén activos, reemplaza la URL en
`app/.env.production`:

```dotenv
API_URL=https://api.tudominio.com/api
```

Para una APK instalable y distribuible de forma privada, configura una clave de
firma Android protegida fuera del repositorio y proporciona al proceso Gradle
`ANDROID_UPLOAD_STORE_FILE`, `ANDROID_UPLOAD_STORE_PASSWORD`,
`ANDROID_UPLOAD_KEY_ALIAS` y `ANDROID_UPLOAD_KEY_PASSWORD`. Conserva una copia
de seguridad segura del keystore: las actualizaciones deben firmarse con la
misma clave. Puedes generar una clave PKCS12 así; keytool solicitará las
contraseñas sin guardarlas en el comando:

```powershell
keytool -genkeypair -v -storetype PKCS12 -keystore C:\secure\parking-upload.p12 -alias parking-upload -keyalg RSA -keysize 2048 -validity 10000
```

`ANDROID_UPLOAD_STORE_FILE` debe apuntar a esa ruta absoluta. Sin las cuatro
variables, Gradle produce un release sin firmar, que no debe distribuirse.

```powershell
cd app\android
.\gradlew.bat assembleRelease
```

El artefacto se genera en
`app/android/app/build/outputs/apk/release/app-release.apk`. Valida la firma
con `apksigner verify --verbose --print-certs <ruta-apk>` y prueba instalación,
inicio de sesión y activación/inactivación contra el dominio real en un
dispositivo Android antes de entregarlo. El identificador de paquete actual es
`com.helloworld`; cámbialo por uno controlado por el propietario antes de la
distribución definitiva.

## Limitaciones conocidas antes de producción

- El dominio y certificado reales, las credenciales del servidor y la clave de
  firma no están incluidos; deben proporcionarse/configurarse durante el
  despliegue.
- iOS no se compila ni valida desde Windows.
- La sesión móvil aún usa AsyncStorage; se recomienda migrar el token a
  Keychain/Android Keystore antes de una distribución de mayor riesgo.
- Firebase es opcional; las funciones que lo necesiten requieren su
  configuración antes de habilitarse.
