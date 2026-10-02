# Plan de trabajo para la app móvil con modo offline

## 1. Alcance y objetivos del producto

### Core de negocio
Venta del servicio mensual de parqueadero para automóviles y motocicletas.

### Requisitos funcionales principales
- Comprar el servicio mensual de parqueadero.
- Soportar vehículos tipo automóvil y motocicleta.
- Enviar notificación al cliente al comprar el servicio.
- Enviar recordatorio diario de finalización del servicio 5 días antes de la fecha final.
- Permitir consultar el estado del servicio aunque la app esté sin conexión.
- Mostrar información del servicio activo, su vencimiento y su estado.

### Objetivos del producto
- Compra rápida y clara.
- Experiencia usable sin conexión.
- Notificaciones confiables y automáticas.
- Seguimiento del servicio activo y su vencimiento.

---

## 2. Definición del negocio y flujos clave

### Flujos principales
1. Registro e inicio de sesión del cliente.
2. Registro o selección del vehículo.
3. Selección del plan mensual.
4. Confirmación de compra.
5. Activación del servicio y generación de fecha de finalización.
6. Consulta del estado del servicio.
7. Envío de notificación de compra.
8. Envío de recordatorio 5 días antes del vencimiento.

### Casos de uso clave
- El cliente compra un servicio mensual con conexión.
- El cliente intenta comprar mientras está sin conexión y la compra queda pendiente.
- El cliente consulta su servicio activo sin conexión.
- El cliente recibe una notificación de confirmación al comprar.
- El cliente recibe recordatorios diarios a medida que se acerca la finalización.

---

## 3. Arquitectura recomendada

### Enfoque sugerido
- Arquitectura modular con capas bien definidas.
- Separar lógica de presentación, dominio y datos.
- Usar repositorios para abstraer la fuente de datos.

### Capas sugeridas
#### Frontend móvil
- UI
- ViewModel / BLoC / MVVM
- Repositorio
- Almacenamiento local
- Sincronización de pendientes

#### Backend
- API para autenticación y usuarios
- API para vehículos
- API para servicios mensuales
- API para compras y activación
- Servicio de notificaciones push
- Tareas programadas para recordatorios

#### Persistencia
- Base local en la app para datos críticos
- Cola de sincronización para compras y cambios pendientes
- Sincronización automática cuando regresa la red

---

## 4. Modelo de datos mínimo

### Entidades principales
#### Cliente
- id
- nombre
- email
- teléfono
- documento
- estado

#### Vehículo
- id
- clienteId
- tipo: automóvil / motocicleta
- placa
- marca
- modelo

#### Servicio mensual
- id
- clienteId
- vehículoId
- plan
- fechaInicio
- fechaFin
- estado: activo / vencido / por vencer / cancelado

#### Compra
- id
- servicioId
- monto
- método de pago
- estado: pendiente / pagado / fallido
- fecha

#### Notificación
- id
- clienteId
- tipo: compra / recordatorio
- fechaProgramada
- estado: pendiente / enviada / fallida
- mensaje

### Reglas de negocio clave
- Un cliente puede tener múltiples vehículos.
- Un servicio mensual debe estar asociado a un vehículo específico.
- El servicio activo debe tener una fecha de finalización.
- El recordatorio debe calcularse con base en la fecha de finalización.
- Si el servicio ya fue renovado o cancelado, no deben enviarse más recordatorios.

---

## 5. Experiencia de usuario

### Pantallas recomendadas
1. Login / registro
2. Inicio
3. Mis vehículos
4. Compra del servicio mensual
5. Resumen de compra
6. Confirmación de compra
7. Estado del servicio activo
8. Recordatorio de vencimiento
9. Historial de servicios

### Consideraciones UX
- Flujo de compra en pocos pasos.
- Mostrar estado del servicio y días restantes.
- Mostrar mensajes claros cuando no hay conexión.
- Permitir visualizar información del servicio aunque no haya internet.
- Hacer indiscutible la diferencia entre servicio activo, por vencer y vencido.

---

## 6. Estrategia de modo offline

### Objetivo
Que la app siga siendo útil sin conexión.

### Datos que deben guardarse localmente
- Vehículos del cliente
- Servicio activo
- Compras recientes
- Estado del servicio
- Cola de sincronización

### Reglas de sincronización
- Si la compra se realiza sin conexión, se guarda localmente como pendiente.
- La acción se sincroniza cuando la red está disponible.
- Si la sincronización falla, se reintenta con backoff.
- La app debe informar al usuario que la compra está pendiente de envío.

### Casos críticos a manejar
- Compra realizada offline y luego sincronizada.
- Consulta del estado del servicio sin conexión.
- Cambio de estado del servicio mientras la app estaba offline.
- Conflictos entre datos locales y datos del backend.

---

## 7. Backend y servicios necesarios

### API necesaria
- Login / registro
- Registro de vehículo
- Crear servicio mensual
- Consultar servicio activo
- Historial de servicios
- Confirmación de compra
- Estado del servicio

### Servicio de notificaciones
- Notificación inmediata al comprar el servicio.
- Recordatorio diario 5 días antes de la fecha de finalización.

### Tareas programadas
- Revisión diaria de servicios activos.
- Identificación de servicios que faltan 5 días para vencerse.
- Envío de recordatorios a los clientes correspondientes.

---

## 8. Lógica de notificaciones

### Regla de negocio
Cuando un servicio se activa, se calcula la fecha de finalización.

### Recordatorio
- Si faltan 5 días para finalizar el servicio, se dispara el primer recordatorio.
- Los recordatorios pueden repetirse diariamente hasta el vencimiento o renovación.
- Si el servicio ya fue cancelado o renoado, no deben enviarse más recordatorios.

### Canales sugeridos
- Push notification
- Notificaciones locales del dispositivo
- Correo si se requiere más tarde

---

## 9. Fases de implementación

### Fase 1: MVP
- Registro y login
- Registro de vehículos
- Compra del servicio mensual
- Estado del servicio activo
- Confirmación de compra
- Recordatorio 5 días antes del vencimiento
- Offline básico para lectura y compra pendiente

### Fase 2: mejora funcional
- Historial de servicios
- Renovación del plan
- Mejor manejo de reintentos
- Mejor UX para sincronización

### Fase 3: producción y escalabilidad
- Observabilidad
- Auditoría y trazabilidad
- Mejoras de rendimiento
- Más métricas operativas y seguridad

---

## 10. QA, seguridad y validación

### Recomendaciones de seguridad
- Usar autenticación segura y tokens seguros.
- Guardar sesiones de forma segura.
- Validar todos los datos en backend.
- Usar HTTPS y configuraciones seguras.
- No guardar información sensible en texto plano.

### Validaciones funcionales
- Compra exitosa con conexión.
- Compra exitosa sin conexión y sincronización posterior.
- Estado del servicio activo visible offline.
- Recordatorio enviado 5 días antes del vencimiento.
- Notificación de compra al momento de pagar o activar el servicio.

### Pruebas recomendadas
- Pruebas unitarias
- Pruebas de integración API
- Pruebas de sincronización offline
- Pruebas de notificaciones
- Pruebas de UI móvil

---

## 11. Secuencia recomendada de trabajo

1. Definir alcance y usuarios.
2. Modelar el negocio y los flujos.
3. Diseñar arquitectura y capa de persistencia.
4. Definir el modelo de datos.
5. Definir contratos de API.
6. Implementar backend de compra y servicios.
7. Implementar notificaciones y recordatorios.
8. Implementar frontend móvil con soporte offline.
9. Integrar sincronización y manejo de pendientes.
10. Validar seguridad y QA.
11. Preparar despliegue y lanzamiento.

---

## 12. Criterios de éxito

La solución será exitosa si:
- el cliente puede comprar el servicio mensual sin fricción,
- la app funciona con o sin conexión,
- los recordatorios se envían correctamente,
- la información del servicio activo es confiable,
- el sistema es seguro y escalable,
- la experiencia del cliente es clara y consistente.

---

## 13. Siguiente paso recomendado

El siguiente paso ideal es convertir este plan en:
- backlog de historias de usuario,
- arquitectura técnica detallada,
- modelo de datos final,
- y lista de endpoints del backend.
