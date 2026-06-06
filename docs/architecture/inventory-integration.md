# Integración de inventario: cómo una farmacia conecta su sistema

**Estado**: diseño aprobado (ADR-008, 2026-06-06) — se implementa cuando llegue
el primer cliente real.
**Audiencia**: este documento tiene dos partes — una explicación simple (para
entender el modelo y para la conversación comercial) y la especificación
técnica (para el equipo y para el IT de la farmacia).

---

## Parte 1 — La explicación simple

### El problema

Cada farmacia ya tiene un sistema donde vive su inventario (su POS). No hay dos
iguales: distintos fabricantes, distintas bases de datos, distintos formatos.
Un "conector universal" que funcione con todos automáticamente **no existe** —
ni para nosotros ni para nadie en la industria.

### La solución: nosotros ponemos el enchufe, no el cable

En vez de intentar adaptarnos a cada sistema (imposible de escalar), definimos
**una sola puerta de entrada, simple y bien documentada** — como un enchufe de
pared estándar. Quien quiera conectarse, conecta su cable a NUESTRO enchufe.

Esto les pasa la pelota de forma elegante: cuando el dueño compra, le dice a su
departamento de IT o al proveedor de su sistema *"trabajen con ellos"* — y lo
que su IT recibe de nosotros es una guía de **una página con 2 operaciones**.
Nada de reuniones interminables ni accesos raros a sus servidores.

### Las dos rutas para conectarse

| Ruta | Para quién | Cómo funciona |
|---|---|---|
| **A. Su IT se conecta** | Farmacias con departamento de IT o proveedor de software activo | Su sistema nos envía el catálogo (productos, precios, stock) y consulta las ventas de WhatsApp para registrarlas en su POS. Dos operaciones, una API key, listo. |
| **B. Nosotros nos conectamos** | Farmacias sin IT | Instalamos un conector nuestro que lee su base de datos y usa exactamente la misma puerta de entrada. La farmacia no hace nada. |

### La regla de oro: el pedido no es la venta

En la mayoría de farmacias **nada sale del anaquel sin pasar por caja y
facturarse** (control interno + obligación fiscal). Eso no es un obstáculo —
es parte del diseño:

```
Pedido WhatsApp (nuestra plataforma)  =  boleta de picking / orden de qué cobrar
Factura en SU caja (su POS)           =  la venta de registro (fiscal, NCF, stock)
```

Flujo de despacho real: pedido llega al panel → farmacéutico revisa → **lo
pasa por caja como cualquier venta** (factura, descuenta su stock) → marca
"despachado" → el delivery sale con la factura. Su proceso de control no se
toca; nuestro sistema le dice *qué* cobrar, su caja sigue siendo la caja.

Consecuencia clave: al facturar en caja, **su stock ya se descontó por su
propio proceso** — el sync de inventario lo trae corregido. El write-back
automático pasa de requisito a optimización opcional.

### La escalera de adopción (la integración es un upgrade, no un prerrequisito)

| Nivel | Qué obtiene la farmacia | Integración necesaria |
|---|---|---|
| **0 — Día 1** | Bot vende, pedidos al panel, caja factura como siempre, disponibilidad confirmada al despachar (patrón ✗) | **Ninguna** |
| **1 — Inventario** | Bot con stock y precios reales; lo facturado en caja se auto-corrige vía sync | Push de productos/stock (Ruta A) o conector (Ruta B) |
| **2 — Ventas (opcional)** | El pedido llega pre-cargado a su POS; la cajera solo confirma (ahorra digitación) | Pull + ack de ventas — solo si su IT lo quiere |

### 💡 Idea anotada (valor futuro): el que atendía WhatsApp se convierte en despachador

Hoy la farmacia tiene a alguien del mostrador atendiendo el WhatsApp a mano.
Cuando el bot toma ese rol, esa persona no sobra — **se reconvierte en
operador de despacho**: vive en nuestro panel revisando pedidos (✓/✗),
pasándolos por caja y coordinando deliveries. Y en farmacias con integración
profunda (nivel 2+), los pedidos de WhatsApp podrían salir **directo como
ventas en su sistema** (pre-cargados o confirmados en un paso), con esa
persona operando todo el ciclo desde un solo lugar.

El efecto neto es **eficientizar la cadena completa de venta**:

- El mismo empleado pasa de contestar "¿a cómo?" todo el día a despachar
  ventas que el bot ya cerró.
- **La cola del mostrador baja**: el cliente de WhatsApp ya no compite con la
  fila física — su pedido entra cerrado, cotizado y listo para cobrar.
- **Se eliminan pasos de la cadena**: hoy es preguntar → buscar precio →
  responder → anotar a mano → re-digitar en caja → despachar; con el ciclo
  integrado queda pedido cerrado por el bot → caja confirma → sale.
- Argumento de venta — la respuesta a la objeción "la IA me quita personal"
  es *"no: te lo convierte en el que despacha más pedidos"*.

Sin compromiso de fecha; se explora cuando haya farmacias en nivel 2.

1. Su inventario aparece en el bot de WhatsApp **con sus precios y su stock
   real** — el bot deja de depender de confirmación manual de disponibilidad.
2. Lo que factura en caja se refleja en el bot en el próximo sync — físico y
   digital no se desincronizan.
3. Si cambian un precio en su sistema, el bot lo sabe en minutos.

### La frase para la venta

> "Tu farmacia empieza a vender por WhatsApp **hoy, sin integrar nada** — tu
> caja sigue facturando como siempre. Cuando quieras que el bot tenga tu stock
> y precios al día, tu técnico entra a nuestra guía: son 2 operaciones con
> ejemplos copy-paste. Y si no tienes técnico, lo conectamos nosotros."

---

## Parte 2 — Especificación técnica

### Arquitectura

```mermaid
flowchart LR
  subgraph Farmacia["Sistema de la farmacia (cualquier POS)"]
    POS[(DB del POS)]
    IT[Script del IT/vendor]
  end
  subgraph Nuestro["Plataforma Neo Farmacia"]
    ING[Ingestion API<br/>contrato único v1]
    CON[Conector propio<br/>adapter por vendor - ADR-007]
    ODOO[(Odoo interno<br/>por farmacia)]
    MEILI[(Meilisearch<br/>por farmacia)]
    BOT[Bot WhatsApp/Voz]
  end

  POS --> IT
  IT -->|Ruta A: push productos / pull ventas| ING
  POS -.->|Ruta B: lectura directa| CON
  CON -->|mismo contrato| ING
  ING --> ODOO
  ODOO -->|sync| MEILI
  MEILI --> BOT
  BOT -->|pedidos| ODOO
```

**Invariante**: una sola puerta de ingesta. Los conectores propios (Ruta B) son
clientes del mismo contrato que el IT externo (Ruta A). Nunca dos caminos de
ingesta que mantener.

### Autenticación

- **API key por farmacia**, emitida desde el super-admin, revocable, con scope
  al `store_id`. Header: `Authorization: Bearer <key>`.
- Rate limit por key. Toda petición queda logueada (auditoría por tenant).

### Operación 1 — Catálogo y stock (farmacia → plataforma)

```
PUT /api/v1/ingest/products
Content-Type: application/json
Authorization: Bearer <api-key-de-la-farmacia>
```

```json
{
  "products": [
    {
      "external_code": "11422",
      "name": "ADVIL X 12 TAB",
      "price": 11.12,
      "stock": 34,
      "barcode": "7460123456789",
      "category": "Analgésicos",
      "unit": "UNIDAD",
      "expiry_tracking": true,
      "active": true
    }
  ]
}
```

| Campo | Req | Notas |
|---|---|---|
| `external_code` | ✔ | El SKU del sistema de la farmacia. **Llave de idempotencia** → `default_code` en su Odoo |
| `name` | ✔ | Descripción del producto |
| `price` | ✔ | Precio de venta (moneda del store) |
| `stock` | — | Si se omite, no se toca el stock existente |
| `barcode` | — | Duplicados se ignoran con warning, nunca rompen el lote |
| `category` | — | Se crea si no existe (plana) |
| `unit` | — | Mapeo best-effort a `uom`; default UNIDAD |
| `expiry_tracking` | — | Activa lotes/vencimiento (`product_expiry`) |
| `active` | — | `false` = retirar del catálogo del bot (archiva en Odoo) |

Semántica:

- **Upsert idempotente** por `external_code`: reenviar el mismo payload es
  seguro. Lotes de **≤1000 productos**; respuesta por lote con conteos
  `{created, updated, skipped, errors[]}` y detalle por registro fallido.
- La no-estandarización de la industria **se absorbe aquí**: solo 3 campos
  obligatorios; todo lo demás es opcional y tolerante.
- Full-sync periódico (p. ej. nocturno) es válido y suficiente al inicio;
  deltas cuando el vendor pueda.
- Tras la ingesta, el pipeline existente hace el resto: Odoo (SSoT del canal)
  → sync → Meilisearch → bot. Con stock real fluyendo, se apaga el
  `disponibleVentas: || true`.

### Operación 2 — Ventas WhatsApp (plataforma → farmacia), invertida a pull — NIVEL 2, OPCIONAL

**Por defecto esta operación no hace falta**: la venta de registro es la
factura que la cajera emite en su POS al despachar (regla de oro, Parte 1) —
su stock se descuenta por su propio proceso y el sync de nivel 1 lo trae de
vuelta. Esta operación existe solo como comodidad para farmacias con IT que
quieran el pedido **pre-cargado** en su POS (la cajera confirma en vez de
digitar). Además, muchos POS no permiten que un sistema externo emita
facturas (control de secuencia NCF) — otra razón por la que la factura
siempre es de ellos.

El riesgo más alto del diseño original (ADR-007) era escribir nosotros en la DB
del POS ajeno. **Se invierte la dirección**: el sistema de la farmacia consulta
y confirma.

```
GET /api/v1/ingest/sales?since=2026-06-06T00:00:00Z&status=pending
```

```json
{
  "sales": [
    {
      "sale_id": "S00042",
      "created_at": "2026-06-06T14:22:10Z",
      "items": [
        { "external_code": "11422", "qty": 2, "unit_price": 11.12 }
      ],
      "total": 22.24,
      "channel": "whatsapp"
    }
  ]
}
```

```
POST /api/v1/ingest/sales/S00042/ack     → marca la venta como reflejada en el POS
```

Semántica:

- `GET` es paginado y repetible; una venta sale de `pending` solo con su `ack`
  (idempotente — re-ack no falla).
- El IT decide la frecuencia del poll (cada 1-5 min es típico).
- La **semántica tiered de ADR-007 se conserva** donde aplica: ventas con stock
  crítico (<5) entran como `pending_confirmation` y el farmacéutico confirma
  desde el panel antes de exponerse al pull; reconciliación nocturna detecta
  ventas sin ack.
- Cuando el conector lo operamos nosotros (Ruta B), el mismo flujo corre con el
  adapter haciendo el poll + escritura al POS según ADR-007.

### Flujo completo (Ruta A)

```mermaid
sequenceDiagram
  participant POS as POS farmacia
  participant IT as Script del IT
  participant ING as Ingestion API
  participant O as Odoo interno
  participant B as Bot WhatsApp

  Note over IT: Nocturno (o deltas)
  IT->>ING: PUT /ingest/products (lotes)
  ING->>O: upsert por external_code
  O-->>B: catálogo/stock/precios al día (via Meili)

  Note over B: Durante el día
  B->>O: venta WhatsApp (sale.order)

  Note over IT: Poll cada pocos minutos
  IT->>ING: GET /ingest/sales?since=...
  ING-->>IT: ventas pendientes
  IT->>POS: registra la venta / descuenta stock
  IT->>ING: POST /ingest/sales/:id/ack
```

### Regla de consistencia de stock

Con integración activa (nivel 1+), **el stock del POS siempre gana**: el sync
POS → plataforma sobreescribe el stock del Odoo interno, que es espejo y nunca
compite con la caja. La ventana entre la factura en caja y el siguiente sync se
reconcilia con la lógica de "in-flight sales" del Stage 6 (el stock entrante se
ajusta por ventas WhatsApp aún no reflejadas, para no pisar ni duplicar).

### Qué NO es este contrato

- No es acceso a nuestro Odoo ni al de la farmacia — ninguna de las dos partes
  toca la DB de la otra.
- **No es un sistema de facturación**: la factura (y el NCF) siempre la emite
  el POS de la farmacia. Nuestro pedido es la orden; su factura es la venta.
- No reemplaza el comando `catalogo.search` de n8n (eso es consumo interno del
  bot); esto es exclusivamente la frontera con sistemas externos.
- No exige tiempo real: el MVP del contrato funciona con full-sync nocturno +
  poll de ventas.

### Plan de implementación (cuando llegue el primer cliente)

1. Módulo `ingest` en el API: API keys por store (modelo + emisión en
   super-admin), validación de lotes, upsert a Odoo scoped, endpoints de sales
   + ack, rate limit.
2. Guía pública de integración (1 página) con ejemplos copy-paste y sandbox
   (farmacia de prueba con API key de prueba).
3. Primer adapter (según el POS del primer cliente) construido como cliente
   interno del contrato — valida que la Ruta B y la Ruta A son la misma puerta.

### Referencias

- **ADR-008** — decisión y racional: `docs/decisions/008-ingestion-api-contract.md`
- **ADR-007** — semántica tiered del write-back: `docs/decisions/007-tiered-pos-sync.md`
- **Stage 6 (POS Sync)** — adapters por vendor: `docs/stages/06-pos-sync.md`
- **Mapa de negocio** — contexto completo: `ARQUITECTURA_MODELO_NEGOCIO.md` §4.5
