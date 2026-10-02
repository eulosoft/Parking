# Arquitectura técnica detallada para la app móvil de parqueadero con modo offline

## 1. Visión general

Se propone una solución móvil para la venta mensual de parqueadero para automóviles y motocicletas, con soporte de uso offline, gestión de servicios activos y envío de notificaciones.

El sistema debe cumplir con las siguientes reglas de negocio:
- Venta del servicio mensual de parqueadero.
- Soporte para automóviles y motocicletas.
- Envío de notificación al cliente al comprar el servicio.
- Envío de recordatorio diario de finalización del servicio 5 días antes de que finalice.
- Persistencia local para permitir la consulta de datos sin conexión.
- Sincronización con backend cuando la red se recupere.

---

## 2. Objetivos técnicos

### Objetivos funcionales
- Comprar servicio mensual desde la app, tras confirmar el pago mediante una pasarela integrada.
- Consultar servicio activo.
- Ver estado del servicio y fecha de finalización.
- Recibir notificaciones de confirmación y recordatorios.
- Consultar información sin conexión.

### Objetivos no funcionales
- Disponibilidad en entornos con conectividad inestable.
- Correctitud de la lógica de negocio.
- Seguridad en autenticación y almacenamiento local.
- Escalabilidad para múltiples clientes.
- Rendimiento en dispositivos móviles.
- Trazabilidad y manejo de errores.

---

## 3. Arquitectura general

### Vista de capas

1. Capa de presentación móvil
   - App móvil (Android/iOS o React Native/Flutter si se desea un enfoque híbrido).
   - Pantallas: login, vehículos, compra, detalle del servicio, historial.
   - Estado local y UI state.

2. Capa de aplicación
   - Casos de uso / ViewModels / BLoC.
   - Validación de entrada.
   - Orquestación de acciones del usuario.
   - Manejo de estados de cargando, éxito, error y offline.

3. Capa de dominio
   - Entidades: Cliente, Vehículo, ServicioMensual, Compra, Notificacion.
   - Reglas de negocio.
   - Servicios de dominio.
   - Calculadora de vencimiento y recordatorios.

4. Capa de infraestructura
   - Clientes HTTP para API backend.
   - Persistencia local (SQLite, Room, Realm, Hive, AsyncStorage, etc.).
   - Cola de sincronización.
   - Módulo de notificaciones push.
   - Módulo de seguridad y almacenamiento seguro.

5. Capa backend
   - API REST/GraphQL.
   - Servicios de negocio.
   - Persistencia relacional o NoSQL.
   - Job scheduler para recordatorios.
   - Push notification service.

---

## 4. Diagrama conceptual de flujo

### Flujo de compra del servicio
Cliente -> App móvil -> Pasarela de pago -> confirmación/webhook validado en API Backend -> Base de datos -> Servicio de activación -> Push notification

### Flujo de consulta del servicio
Cliente -> App móvil -> Datos locales -> Si hay conexión consultar backend -> Actualizar caché local -> Mostrar estado

Las compras no se crean ni activan sin conexión: la app solo debe mostrar el servicio después de recibir confirmación del backend. La cola offline se reserva para cambios no financieros.

### Flujo de recordatorio
Servicio activo -> Scheduler backend -> Detecta fecha cercana -> Envía notificación push -> Cliente recibe recordatorio

---

## 5. Patrones de arquitectura recomendados

### Opción recomendada: Clean Architecture + Repository Pattern + Offline-first

#### Objetivo
Separar claramente la lógica del negocio de la capa de framework, networking y almacenamiento.

### Capa de dominio
Incluye:
- Entidades
- Casos de uso
- Reglas de negocio
- Validadores de servicio

Ejemplo:
- ComprarServicioUseCase
- ConsultarServicioActivoUseCase
- CalcularFechaFinServicio
- DeterminarSiDebeEnviarRecordatorio

### Capa de datos
Incluye:
- Repositorios
- Data sources locales
- Data sources remotos
- Mappers
- Modelos de persistencia

Ejemplo:
- ServicioRepository
- VehicleLocalDataSource
- VehicleRemoteDataSource
- ServiceSyncManager

### Capa de presentación
Incluye:
- Screen UI
- State Holder / ViewModel
- Mappers para presentación

Ejemplo:
- ServiceStatusScreen
- VehicleSelectionViewModel
- PurchaseServiceViewModel

---

## 6. Modelo de dominio

### Entidad Cliente
Atributos principales:
- id: string
- nombre: string
- email: string
- telefono: string
- documento: string
- estado: enum

### Entidad Vehículo
- id: string
- clienteId: string
- tipo: enum { AUTOMOVIL, MOTOCICLETA }
- placa: string
- marca: string
- modelo: string

### Entidad ServicioMensual
- id: string
- clienteId: string
- vehículoId: string
- planId: string
- fechaInicio: datetime
- fechaFin: datetime
- estado: enum { ACTIVO, POR_VENCER, VENCIDO, CANCELADO }

### Entidad Compra
- id: string
- servicioId: string
- monto: decimal
- metodoPago: enum
- estado: enum { PENDIENTE, PAGADO, FALLIDO }
- fechaCompra: datetime

### Entidad Notificacion
- id: string
- clienteId: string
- tipo: enum { COMPRA, RECORDATORIO }
- mensaje: string
- fechaProgramada: datetime
- estado: enum { PENDIENTE, ENVIADA, FALLIDA }

---

## 7. Reglas de negocio clave

### 7.1 Compra del servicio
La compra debe:
- validar que el cliente exista,
- validar que el vehículo exista y pertenezca al cliente,
- validar que el tipo de servicio sea válido,
- registrar la compra,
- activar el servicio mensual,
- calcular la fecha de finalización,
- generar la notificación de compra.

### 7.2 Fecha de finalización
La fecha de finalización se calcula a partir de la fecha de inicio más la duración del servicio mensual.

Ejemplo:
- fechaInicio: 2026-09-01
- duración: 30 días
- fechaFin: 2026-10-01

### 7.3 Estado del servicio
El servicio debe calcularse en estos estados:
- ACTIVO: aún vigente
- POR_VENCER: faltan 5 días o menos para vencer
- VENCIDO: ya pasó la fecha de fin
- CANCELADO: el servicio fue cancelado

### 7.4 Recordatorio
Debe enviar un recordatorio diario cuando se cumpla la condición:
- fechaFin - fechaActual <= 5 días
- y el servicio siga activo

---

## 8. Estrategia de persistencia local y sincronización

### 8.1 Persistencia local
Se recomienda usar una base local para persistir:
- vehículos del usuario
- servicio activo
- compras recientes
- historial reciente
- cola de sincronización
- configuración de notificaciones

### 8.2 Objetivos de persistencia offline
- permitir consultar el servicio activo aun sin conexión
- permitir registrar una compra sin internet
- evitar pérdida de información cuando la red falle
- mejorar la experiencia de usuario en redes inestables

### 8.3 Cola de sincronización
Cada acción que requiera backend debe almacenarse en una cola local.

Ejemplo de eventos:
- CREATE_VEHICLE
- CREATE_SERVICE_PURCHASE
- UPDATE_SERVICE_STATUS

### 8.4 Estados de sincronización
- PENDIENTE
- EN_COLA
- SINCRONIZADO
- ERROR
- REINTENTO_PROGRAMADO

### 8.5 Política de reintentos
- reintentos con backoff exponencial
- límite máximo de reintentos
- registro de errores para observabilidad

---

## 9. Comunicación con backend

### API REST recomendada
#### Auth
- POST /auth/login
- POST /auth/register

#### Vehículos
- GET /vehicles
- POST /vehicles
- GET /vehicles/{id}

#### Servicios
- POST /services/purchase
- GET /services/active
- GET /services/history
- GET /services/{id}

#### Notificaciones
- POST /notifications/push-token
- GET /notifications/config

### Contrato de compra
Request:
```json
{
  "vehicleId": "veh_123",
  "planId": "monthly_basic",
  "paymentMethod": "CARD",
  "amount": 45000
}
```

Response:
```json
{
  "serviceId": "srv_456",
  "status": "ACTIVE",
  "dateStart": "2026-09-20T10:30:00Z",
  "dateEnd": "2026-10-20T10:30:00Z",
  "message": "Servicio activado exitosamente"
}
```

### Contrato de recordatorio
```json
{
  "serviceId": "srv_456",
  "customerId": "cus_789",
  "type": "REMINDER",
  "daysRemaining": 5,
  "message": "Tu servicio de parqueadero vence en 5 días"
}
```

---

## 10. Estrategia de notificaciones

### 10.1 Notificación de compra
Se dispara en el backend una vez se confirma la compra.

Contenido sugerido:
- “Tu servicio de parqueadero ha sido activado correctamente.”
- Incluye fecha de inicio y finalización.

### 10.2 Recordatorio de finalización
Se ejecuta con un scheduler en backend:
- programador diario
- consulta servicios activos
- determina cuáles faltan 5 días para vencer
- envía notificación push
- registra la notificación como enviada

### 10.3 Consideraciones móviles
- solicitar permisos de notificación
- manejar casos en los que la app está cerrada
- permitir configuración para activar o desactivar recordatorios

---

## 11. Seguridad

### Requisitos mínimos
- Autenticación con tokens seguros.
- OAuth2 / JWT o alternativa equivalente.
- Uso de HTTPS obligatorio.
- Almacenamiento seguro de sesión para la app.
- No guardar información sensible sin cifrar.
- Validación de entradas y protección contra abuso en backend.
- Control de permisos por usuario.

### Almacenamiento local seguro
- token / sesión cifrada
- datos sensibles no en texto plano
- almacenamiento local bajo política de cifrado del dispositivo

---

## 12. Calidad y pruebas

### Pruebas funcionales
- registro de vehículos
- compra exitosa
- servicio activo
- recordatorio de vencimiento
- compra offline y sincronización posterior

### Pruebas de integración
- comunicación móvil-backend
- sincronización de cola local
- manejo de errores de red
- activación de notificaciones por backend

### Pruebas de rendimiento
- tiempos de carga de la app
- consumo de memoria y batería
- reintentos con conexión inestable

### Pruebas de seguridad
- validación de tokens
- protección de endpoints
- manejo seguro de datos almacenados

---

## 13. Arquitectura recomendada para implementación real

### Frontend móvil
- React Native o Flutter
- Manejo de estado con Redux Toolkit, Zustand, Riverpod, Bloc o ViewModel
- Persistencia local con SQLite / Room / Hive / Realm
- Notificaciones con Firebase Cloud Messaging o equivalente

### Backend
- Node.js + NestJS o Java + Spring Boot
- API REST con OpenAPI / Swagger
- Base de datos relacional (PostgreSQL)
- Scheduler para recordatorios (cron job / queues)
- Push service con Firebase

### Infraestructura sugerida
- API Gateway / Load Balancer
- Base de datos PostgreSQL
- Redis para cache y queue (opcional)
- Observabilidad con logs, métricas y trazas

---

## 14. Flujo de trabajo propuesto por fases

### Fase 1: diseño
- Definición de usuarios, roles y casos de uso.
- Definición de entidad de negocio.
- Definición de endpoints y contratos API.
- Diseño de sincronización offline.

### Fase 2: backend base
- Autenticación
- CRUD de vehículos
- Servicios mensuales
- Compra del servicio
- Notificación de compra
- Job de recordatorios

### Fase 3: frontend móvil
- Login
- Registro de vehículo
- Compra de servicio
- Estado del servicio
- Historial
- Notificaciones

### Fase 4: offline y sincronización
- Cola local
- Reintentos automáticos
- Manejo de respuestas fallidas
- Sincronización posterior

### Fase 5: hardening
- seguridad
- QA
- validación de edge cases
- observabilidad y monitoreo

---

## 15. Riesgos y mitigaciones

### Riesgo: compra no sincronizada
Mitigación: cola local y reintentos con backoff.

### Riesgo: notificación perdida
Mitigación: backend con scheduler y registro de entregas.

### Riesgo: estado inconsistente luego de reconexión
Mitigación: validación del lado del servidor y actualización del estado local.

### Riesgo: datos sensibles en el dispositivo
Mitigación: uso de almacenamiento seguro y cifrado.

### Riesgo: conexión inestable
Mitigación: diseño offline-first y manejo de errores explicitos.

---

## 16. Conclusión

La arquitectura más adecuada para este proyecto es una solución móvil con enfoque offline-first, separada por capas y con un backend robusto para la venta del servicio, la consulta del estado y la gestión de notificaciones. La clave del sistema está en combinar:
- persistencia local,
- cola de sincronización,
- contratos claros de API,
- automatización de recordatorios,
- y un diseño modular y seguro.

Esto permite una solución móvil confiable para un negocio con alta dependencia de continuidad de servicio, disponibilidad y recordatorios oportunos.
