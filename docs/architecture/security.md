# Seguridad — Neo Farmacia

**Estado**: vivo (actualizado 2026-06-07).
**Doble propósito**:
- **Parte 1** — One-pager para el departamento de IT de la farmacia (apto para
  enviar tal cual ante la pregunta "¿es seguro hospedar nuestros datos?").
- **Parte 2** — Checklist interno de postura de seguridad (qué está hecho, qué
  falta). No se envía al cliente.

Las afirmaciones de la Parte 1 son solo cosas **ciertas hoy**. Lo aspiracional
vive en la Parte 2 con su estado real.

---

## Parte 1 — One-pager para el IT de la farmacia

### En una línea

Neo Farmacia es un servicio gestionado (SaaS): la farmacia usa un bot de
WhatsApp y un panel web; **nosotros operamos la infraestructura, con los datos
de cada farmacia aislados, cifrados en tránsito y con acceso autenticado**. No
tocamos el sistema interno (POS) de la farmacia.

### Qué datos guardamos — y cuáles NO

| Guardamos | NO guardamos |
|---|---|
| Catálogo del negocio: productos, precios, stock (info que ya está en el anaquel) | **Récords clínicos / recetas médicas** |
| Pedidos: qué pidió, cantidades, total | **Fecha de nacimiento** |
| Cliente para el delivery: **nombre, teléfono, dirección** | **Seguro / ARS / póliza** |
| Cuentas del panel: email + contraseña (con hash bcrypt) del dueño/farmacéutico | **Datos de tarjeta / pago** (no procesamos pagos) |
| Historial de conversación de WhatsApp y transcript de las llamadas | **Cédula / documento de identidad** |

**Minimización de datos por diseño**: solo recolectamos lo mínimo para entregar
un pedido (nombre, teléfono, dirección). No pedimos ni almacenamos datos
clínicos ni de seguro porque el servicio no los necesita — vender y despachar
productos de mostrador por WhatsApp.

> Nota honesta de alcance: el contenido libre de los chats podría contener
> información de salud que el cliente mencione por su cuenta (ej. "necesito mi
> insulina"). Lo tratamos como dato sensible: mismo aislamiento, control de
> acceso y política de retención que el resto del PII.

### Aislamiento por farmacia (multi-tenant)

Cada farmacia es un inquilino completamente separado:

- **Base de datos dedicada por farmacia** (una DB Odoo aislada por tenant), más
  índice de búsqueda propio.
- Cada registro lleva su `store_id`; **ninguna consulta cruza datos entre
  farmacias** — está garantizado en el control de acceso, no por convención.
- Una cuenta de farmacéutico solo puede ver las farmacias asignadas a su
  usuario (el super-admin es el único con vista de flota).

### Autenticación y acceso

- **Panel web**: login con contraseña (hash **bcrypt**, nunca en texto plano);
  acceso por token firmado (JWT) con expiración.
- **Cada endpoint del API exige autenticación** — no hay rutas abiertas que
  escriban o lean datos de la farmacia (auditado y cerrado 2026-06-07).
- **Integraciones máquina-a-máquina** (n8n, worker de voz) usan claves de API
  con verificación de tiempo constante; la página del cliente para llamadas usa
  enlaces firmados de un solo uso.
- El sistema **falla cerrado**: si falta un secreto de seguridad, el servicio no
  arranca — nunca queda abierto por un descuido de configuración.

### Lo que NUNCA tocamos: el POS de la farmacia

La integración de inventario es **push hacia nosotros**: el sistema de la
farmacia (o un conector que instalamos, según el caso) **nos envía** su catálogo
a un contrato documentado. Nosotros **no entramos a su base de datos, ni
leemos, ni escribimos**. La factura fiscal (NCF) siempre la emite el POS de la
farmacia — nuestro pedido es la orden, su factura es la venta. Ver
`docs/architecture/inventory-integration.md`.

### Infraestructura

- Servicio sobre **HTTPS/TLS** de extremo a extremo (cifrado en tránsito).
- Hospedado en VPS dedicado bajo nuestra operación; despliegue reproducible
  desde el repositorio (infra como código).
- Los secretos viven en variables de entorno del entorno de despliegue, **nunca
  en el código** ni en el repositorio.

### Sobre "open source = inseguro"

Es un mito. Open source describe la licencia del software, no su seguridad. La
mayor parte de la infraestructura de internet —incluida la de bancos y
gobiernos— corre sobre componentes open source (Linux, PostgreSQL). La
seguridad la determina **cómo se despliega, aísla y controla el acceso**, no la
licencia. Nuestra postura de aislamiento, autenticación y minimización aplica
igual sin importar qué motor usemos por debajo — que para el cliente es un
detalle de implementación, no parte del producto.

### Ante un incidente

Punto de contacto único: [correo/owner]. Proceso de respuesta a incidentes
documentado internamente (notificación, contención, post-mortem). *(Formalizar
— ver Parte 2.)*

---

## Parte 2 — Checklist interno de postura de seguridad

Estados: ✅ hecho · ⚠️ parcial / a verificar · ⏳ pendiente.

### Autenticación y autorización
- ✅ Contraseñas del panel con bcrypt (cost 10), nunca en texto plano.
- ✅ JWT con expiración; `JWT_SECRET` obligatorio en producción (boot falla si
  falta o es el default de dev) — `2026-06-07`.
- ✅ Todos los endpoints autenticados; cerrados los que estaban abiertos
  (`orders/update`, `users/lookup`, handover, products legacy) — `2026-06-07`.
- ✅ Claves M2M (n8n) con comparación de tiempo constante; fail-closed en prod.
- ✅ Control de acceso por tenant: un farmacéutico solo accede a sus stores
  (`store-context.plugin.ts`).
- ⏳ Rate limiting por IP / por API key (hoy no hay).
- ⏳ Rotación de claves de API documentada.

### Aislamiento multi-tenant
- ✅ DB Odoo dedicada + índice de búsqueda por farmacia.
- ✅ `store_id` en todo registro; consultas scoped por `resolveStore`.
- ✅ Sin fugas cross-tenant verificadas en el path de acceso.

### Protección de datos
- ✅ TLS en tránsito (HTTPS).
- ⚠️ **Cifrado en reposo**: verificar que el disco/volumen de Mongo y Postgres
  en el VPS tenga cifrado activado — hoy asumido, no confirmado.
- ✅ Secretos solo en env del despliegue, nunca en el repo.
- ⏳ Backups cifrados + prueba de restauración documentada.

### Ciclo de vida del PII
- ✅ Minimización: no se recolecta DOB, email de cliente, seguro ni datos
  clínicos (el modelo `User` solo tiene nombre/teléfono/dirección/chat_id).
- ⏳ Política de retención (cuánto tiempo se guardan chats/transcripts).
- ⏳ Endpoint / proceso de borrado de datos de un cliente a pedido ("derecho al
  olvido"): hoy sería manual.
- ⚠️ Contenido conversacional puede contener info de salud volunteada — mitigado
  por aislamiento + acceso, falta retención.

### Operacional
- ⏳ **Audit log por tenant**: quién accedió/modificó qué. No existe hoy.
- ⏳ Plan de respuesta a incidentes escrito (contacto, contención, notificación).
- ⏳ Monitoreo/alertas de seguridad (Stage 8 sigue pendiente).
- ⚠️ **Deuda conocida**: la contraseña admin de la farmacia vive en texto plano
  dentro del job de provisioning hasta que el super-admin la marca "entregada".
  Endurecer con entrega por email real.
- ⚠️ `/webhook/evolution` sin auth: inyectar eventos requiere adivinar un
  `instance_name` (sufijo hex aleatorio, entropía moderada). Endurecer con
  secreto en la URL del webhook.
- ⚠️ `/docs` (Swagger) pública: solo revela superficie del API, no da acceso;
  `DOCS_ENABLED=false` la oculta si se decide.

### Prioridad sugerida (mayor valor/esfuerzo primero)
1. Verificar cifrado en reposo del VPS (rápido, alto valor de cara al IT).
2. Política de retención + borrado de cliente (es lo que un IT serio pregunta).
3. Audit log por tenant.
4. Plan de respuesta a incidentes (1 página).
5. Rate limiting.

---

## Referencias
- Aislamiento e integración: `docs/architecture/inventory-integration.md`
- Contrato de ingesta (no tocamos su POS): ADR-008
  `docs/decisions/008-ingestion-api-contract.md`
- Hardening de auth 2026-06-07: `docs/sessions/2026-06-07-01.md`
