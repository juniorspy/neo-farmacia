# ADR-008: Ingestion API como contrato universal de integración de inventario

**Status**: accepted (2026-06-06)
**Relacionado**: ADR-007 (tiered POS sync), Stage 6 (POS Sync), Stage 10 (MVP escalable)

## Contexto

No existe estandarización en los sistemas de inventario/POS de farmacias: cada
vendor tiene su propio esquema (SQL Server, MySQL, Access, archivos planos,
APIs propietarias). Un "conector universal" es imposible.

El flujo comercial esperado: se cierra la venta → el dueño instruye a su
departamento de IT / vendor de su POS que "trabajen con nosotros". La carga de
integración cae en un tercero técnico que no controlamos. Lo que sí controlamos
es **qué tan fácil y profesional es integrarse con nosotros**.

Además, el riesgo más alto de ADR-007 era la dirección de escritura: pedir
acceso de escritura a la DB del POS de la farmacia es burocrático, riesgoso y
genera resistencia del vendor.

## Decisión

Estandarizar **nuestro lado** con una **Ingestion API pública, versionada y
documentada** — el contrato único de entrada/salida de inventario. La
variabilidad de la industria se absorbe en los clientes del contrato, nunca en
el pipeline interno.

### El contrato (mínimo viable)

1. **Catálogo/stock — push (farmacia → plataforma)**
   - `PUT /api/v1/ingest/products` — upsert por lotes (≤1000), idempotente
     por `external_code` (el SKU del sistema de la farmacia → `default_code`
     en su Odoo interno).
   - Campos: `external_code` (req), `name` (req), `price` (req), `stock?`,
     `barcode?`, `category?`, `unit?`, `expiry?`, `active?` (false = retirar).
   - Campos opcionales tolerados — aquí se absorbe la no-estandarización.
   - Auth: API key por farmacia (scoped, revocable). Full-sync diario
     aceptable al inicio; deltas después.

2. **Ventas WhatsApp — pull + ack (plataforma → farmacia)**
   - `GET /api/v1/ingest/sales?since=...` — ventas originadas en el canal
     WhatsApp/voz pendientes de reflejar en el POS físico.
   - `POST /api/v1/ingest/sales/:id/ack` — confirmación idempotente.
   - **Inversión deliberada de la dirección**: el POS hace pull de un endpoint
     limpio en vez de darnos acceso de escritura a su DB. Elimina la parte más
     burocrática/riesgosa de la integración para el vendor con IT.

### Semántica de venta de registro (amendment 2026-06-06)

En la mayoría de farmacias nada sale del anaquel sin facturarse en caja
(control interno + NCF fiscal). Por tanto: **el pedido de la plataforma es la
orden; la factura del POS de la farmacia es la venta de registro**. La cajera
factura el pedido WhatsApp al despachar como cualquier venta — su stock se
descuenta por su propio proceso y el sync de inventario lo refleja. Esto
convierte la Operación 2 (pull+ack) en **nivel opcional de comodidad**
(pre-cargar el pedido en su POS), no en requisito, y define la escalera de
adopción: nivel 0 sin integración (día 1), nivel 1 inventario (lectura),
nivel 2 ventas (opcional). Regla de consistencia: con integración activa, el
stock del POS siempre sobreescribe el espejo interno.

### Los conectores propios son clientes del mismo contrato

Para farmacias sin capacidad de IT, los adaptadores de ADR-007 (SQL Server,
MySQL) corren como servicio nuestro que **lee su DB y empuja por la misma
Ingestion API**. Una sola puerta de ingesta, N fuentes. Nunca dos caminos de
ingesta que mantener.

ADR-007 conserva la **semántica** (sync tiered, hold de stock crítico,
reconciliación nocturna); ADR-008 define el **transporte/contrato**.

## Consecuencias

- La guía de integración ("2 endpoints, aquí está tu API key") se vuelve un
  activo de venta — profesionalismo percibido al instruir al IT del dueño.
- El pipeline interno (Odoo por farmacia → Meilisearch → bot) tiene una sola
  entrada; el desarrollo de adaptadores queda desacoplado y priorizable por
  demanda real (qué POS tiene el primer cliente).
- El write-back por pull+ack reduce el riesgo legal/técnico de tocar DBs
  ajenas; el modo tiered de ADR-007 sigue disponible cuando el conector lo
  operamos nosotros.
- Requiere disciplina de contrato: documentación pública actualizada,
  versionado (`/v1/`), idempotencia y sandbox de prueba (la misma lección de
  "API documentada es una disciplina, no una propiedad").

## Especificación

Detalle completo del contrato (explicación simple + spec técnica con ejemplos
y diagramas): **`docs/architecture/inventory-integration.md`**.

## Implementación (cuando llegue el primer cliente real)

- Módulo `ingest` en el API: validación, API keys por store, upsert a Odoo
  scoped, rate limit por key.
- Documento público de integración (1 página) + colección de ejemplos.
- Adaptador del POS del primer cliente como primer cliente interno del
  contrato.
