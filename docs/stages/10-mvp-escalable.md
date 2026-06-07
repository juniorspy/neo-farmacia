# Stage 10: MVP Escalable — ciclo completo y alta sistemática

**Status**: `in_progress`
**Depends on**: Stage 4 (Multi-tenant Provisioning), Stage 6 (WhatsApp), Stage 9 (Voice)
**Goal**: Cerrar el ciclo completo (WhatsApp → pedido → despacho → cliente informado, con voz integrada) de forma que **el alta de una farmacia nueva sea sistemática**: provisionar → escanear QR → vender, sin pasos manuales del operador de la plataforma.

**Documento de contexto**: `ARQUITECTURA_MODELO_NEGOCIO.md` (raíz del repo) — mapa
integral con indicadores de estado. Este stage ejecuta su sección 12.

## Por qué

El valor núcleo (bot que vende 24/7 con precio real) ya está construido y validado
por proxy en NeoColmado. Lo que falta no son features nuevas sino **cerrar gaps que
bloquean la farmacia #2**: hoy una farmacia recién provisionada nace con Odoo vacío
(bot mudo) y con un sync/comandos que autentican con un usuario que no existe en su
DB (pedidos rotos). El MVP se diseña para escalar la operación, no para demo.

## Modelo de catálogo (decisión)

En colmado el inventario se aprende operando (precio 0 → confirmación). En farmacia
es **inverso: el catálogo llega completo** y la farmacia ajusta.

1. **MVP (sin farmacias reales)**: catálogo maestro propio, clonado al Odoo de cada
   farmacia nueva durante el provisioning. *No es el estándar de operación.*
2. **Estándar (post-MVP)**: conector con el POS real de la farmacia (ADR-007,
   Stage 6 POS Sync). El conector solo cambia *quién alimenta* el motor interno
   (Odoo → Meilisearch); no es rearquitectura.

Mientras no haya stock real, la disponibilidad la confirma el humano al despachar
(**patrón ✗**, heredado del colmado y probado allí).

**Principio operativo (nota 2026-06-06)**: el ✗ es **camino de excepción, no
verificación obligatoria**. La meta es el pedido casi automático — el
farmacéutico solo imprime y revisa empíricamente al pickear — sostenida por la
fuente de verdad en la DB de la farmacia (nivel 1+ de integración, ADR-008).
En nivel 0 el ✗ cubre discrepancias; con stock real conectado tiende a
desaparecer. Nada en el flujo debe BLOQUEAR un pedido esperando confirmación
manual.

## Milestones

### M1 — Alta sistemática ✅ COMPLETADO (2026-06-06, verificado en producción)

> Farmacia nueva = provisionar + QR + vender. Nada más.

- [x] **Fix auth por farmacia (crítico)** — `getScopedOdoo(config, db)` usa
  `config.odoo.user/password` (admin global) contra DBs por farmacia donde ese
  login no existe. Afecta **catalog-sync Y todo `/api/v1/commands`** (pedidos)
  de cualquier farmacia nueva (`farmacia_geremy`).
  - **Decisión D1 — usuario de servicio interno compartido**: el paso
    `odoo_seed_admin` crea en cada DB nueva un usuario de servicio con login
    `config.odoo.user` y password `config.odoo.password` (Dokploy env), con los
    mismos grupos que el admin. Así TODOS los call sites existentes
    (`getScopedOdoo` en commands, catalog-sync, stats, orders, products) quedan
    arreglados sin tocarlos.
  - *Trade-off*: credencial compartida entre DBs tenant vs. password por farmacia
    cifrado en Mongo. Se elige compartida porque: (a) Odoo es interno — la
    farmacia nunca recibe acceso; (b) la alternativa pone la clave de cifrado en
    el mismo env → mismo radio de explosión con más complejidad; (c) cero cambios
    en call sites. Revisar si algún día las farmacias acceden a su Odoo.
  - [x] Ruta admin de reparación para farmacias ya rotas: crea el usuario de
    servicio usando el password admin del job (paso `email_credentials`) si aún
    no fue entregado; si no está disponible → re-provisionar.
    (`POST /api/v1/admin/pharmacies/:storeId/repair-odoo-service`)
- [x] **Paso `odoo_seed_catalog`** — nuevo paso del pipeline tras `odoo_seed_admin`.
  Nota de implementación: la DB nueva nace solo con `base` — el paso instala
  `sale_management` primero (sin él ni siquiera existe `product.product`).
  - **Decisión D2 — copia JSON-RPC desde DB maestra** (no duplicación de DB
    template): lee `product.category` + `product.product (sale_ok=true)` de
    `MASTER_CATALOG_DB` (default: la DB principal con el catálogo actual) y los
    crea por lotes en la DB nueva. Se descarta el template-DB porque exige
    mantener una DB plantilla sincronizada; la copia explícita es idempotente
    (salta productos ya existentes por `default_code`/nombre), controla campos y
    no arrastra datos operativos (pedidos/clientes de Leo).
  - [x] Idempotente ante re-runs (retry de step no duplica productos).
  - [x] `meilisearch_index` además de crear el índice dispara
    `fullRebuildStoreIndex` → la farmacia nace con búsqueda poblada, sin esperar
    el sync periódico.
- [x] **Verificación de alta e2e** (2026-06-06, producción, 3 corridas):
  farmacia de prueba provisionada con 8 pasos en verde — catálogo maestro
  (165 productos) copiado 1:1 a su Odoo, índice Meili poblado (165 docs +
  91 sinónimos), usuario de servicio autenticando contra su DB, sync periódico
  sin errores, y **`/products` mostrando el catálogo en el dashboard**.
  Hallazgos corregidos en vivo (misma clase: campos de módulos no instalados —
  la DB nueva nace solo con `base`):
  - `8897aad` — `qty_available` requiere `stock` (falló corrida 1 en
    `meilisearch_index`)
  - `92dffa9` — `use_expiration_date` requiere `product_expiry` (falló la
    página `/products` en corrida 2)
  - `REQUIRED_MODULES` final: `sale_management`, `stock`, `product_expiry`
  La prueba a nivel comandos (`catalogo.search` / `pedido.updateItems`) queda
  cubierta por la pasada e2e formal de M4 con n8n.

### M1.5 — Prueba de estrés con catálogo real (OPCIONAL, despriorizada)

> En la instancia compartida de Meilisearch vive **`pharmacy_inventory` —
> 17,456 productos reales** (export de POS de farmacia,
> `codigo/descripcion/precio/unidad`, DOP). NO es "el catálogo a usar en
> producción": el flujo real es alta + inventario de CADA farmacia vía el
> contrato de ingesta (**ADR-008**). Este milestone es solo una prueba de
> estrés del pipeline (seed, sync, búsqueda, n8n) a escala realista de 17k
> productos. Para el MVP, el maestro de 165 es suficiente.

- [ ] (Opcional) Importador: `pharmacy_inventory` (Meili) → DB Odoo dedicada
  `pharmacy_master_catalog` → `MASTER_CATALOG_DB` → provisionar farmacia de
  prueba → medir: tiempo de seed, sync, latencia de búsqueda, calidad de
  respuestas del bot con catálogo grande.

### Integración de inventario real — decisión tomada (ADR-008)

El "conector universal" no existe (cero estandarización entre POS de
farmacias). Lo que se estandariza es **nuestro contrato**: una Ingestion API
pública y documentada (`PUT /ingest/products` por lotes + `GET /ingest/sales`
con ack — write-back invertido a pull). Los conectores propios de ADR-007
(SQL Server/MySQL) son clientes del mismo contrato. Se construye cuando exista
el primer cliente real; el activo de venta es la guía de integración de 1
página para el IT del dueño.

### M2 — Ciclo de pedido cerrado (patrón ✗) — código completo (2026-06-06), pendiente verificación e2e

> El farmacéutico confirma disponibilidad al despachar; el cliente siempre queda informado.

- [x] Acciones por ítem en `/orders` del dashboard: ✗ por línea (líneas
  rechazadas quedan tachadas como traza). (`4f3a7f1`)
- [x] ✗ → `POST /orders/:id/items/:lineId/reject` → la línea queda en qty 0
  (no se elimina: Odoo 17 bloquea unlink en pedidos confirmados, y qty-0 es
  la traza); si era la última línea viva, cancela el pedido → evento a n8n
  (`N8N_ORDER_EVENT_WEBHOOK_URL`, payload con `store_config` + pedido +
  rechazado) → **la IA redacta el aviso** con sustitutos → **fallback a
  plantilla** vía Evolution si n8n falla o no está configurado (el cliente
  nunca queda sin aviso). Si el chat está en handover manual, NO se envía
  (el panel le dice al farmacéutico que avise él).
- [x] Despachar → `POST /orders/:id/dispatch` → confirm/lock en Odoo +
  notificación WhatsApp. Semántica en el UI: *"Despachar = ya pasó por caja ·
  se avisa al cliente"* (regla #12). Fix de paso: `action_done` ya no existe
  en sale.order de Odoo 17 → `action_lock` con fallback.
- [x] Registro: línea qty-0 como traza en Odoo + aviso persistido en Mongo
  (`messages`, meta.source `n8n-order-event`/`order-event-template`/
  `order-dispatch`) + logs estructurados.
- [ ] **Verificación e2e en producción**: pedido real por WhatsApp → ✗ → aviso
  recibido por el cliente → despacho → notificación. Requiere el loop n8n
  activo (se solapa con M4). El workflow n8n del evento ✗ es user-owned;
  mientras no exista, opera en modo plantilla.

### M3 — Voz dentro del ciclo (Stage 9 Phases F+G mínimo) — código completo (2026-06-06)

- [x] **Phase F (lado plataforma)**: `POST /api/v1/voice-calls` acepta
  `send_link: true` → el API entrega el link firmado por WhatsApp él mismo —
  el nodo n8n queda reducido a **una sola llamada HTTP**. Sin el flag, n8n
  recibe el link y lo fraseaa dentro de su respuesta (comportamiento
  original). (`1280588`)
- [ ] **Phase F (lado n8n, user-owned)**: nodo de decisión que llama al
  endpoint cuando la conversación lo amerite.
- [x] **Phase G mínimo — transcripts**: el worker Python acumula la
  conversación (`conversation_item_added`) y la postea al cerrar
  (`POST /voice-calls/:id/transcript`, bearer). Queda en la sesión (capped)
  y como registro condensado 📞 en el chat del dashboard (idempotente).
  Bonus mini-watchdog: si el navegador del cliente se cerró sin reportar el
  hangup, el post final cierra la sesión y libera el slot.
- [x] **Phase G mínimo — llamada perdida**: hallazgo: `expireStaleRings`
  existía pero **nunca estaba cableado**. Nuevo sweep (60s) → `missed`
  (transición atómica = follow-up exactly-once) → mensaje WhatsApp de
  seguimiento, respetando handover manual.
- [x] Sender saliente compartido extraído a `whatsapp/outbound.service.ts`
  (pedidos + voz, un solo camino Evolution + persistencia Mongo).
- [ ] Verificación e2e (con M4): llamada real disparada desde n8n →
  transcript visible en el chat → llamada perdida → follow-up.
- [ ] Watchdog/takeover humano completo queda en Stage 9 Phase G (post-MVP si
  hace falta recortar).

### M4 — Operar la flota

- [ ] Health board en `/admin`: por farmacia — conexión WhatsApp viva, último
  sync de catálogo + conteo del índice, último mensaje procesado, errores
  recientes, llamadas de voz del día.
- [ ] **Pasada e2e formal** del ciclo completo con una farmacia recién
  provisionada: WhatsApp → n8n → respuesta → pedido → ✗/✓ → despacho → voz.
  (Cierra también la verificación pendiente del fix del silent-drop.)

## Fuera de alcance (post-MVP, señalizado)

- Conector POS real (ADR-007 / Stage 6) — sustituye el catálogo clonado como
  fuente; habilita stock real y apagar `disponibleVentas || true` de raíz.
- Email real de credenciales (hoy: entrega manual desde super-admin).
- Landing page de adquisición.
- Recordatorios de refill a clientes crónicos (sobre la infraestructura de
  llamadas salientes ya construida — mayor ratio valor/esfuerzo del roadmap).
- Facturación SaaS a farmacias.

## Decisiones tomadas en este stage

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| D1 | Usuario de servicio interno compartido (env) creado por provisioning | Password por farmacia cifrado en Mongo | Odoo es interno; misma superficie de riesgo con más complejidad; cero cambios en call sites |
| D2 | Seed de catálogo por copia JSON-RPC desde `MASTER_CATALOG_DB` | Duplicación de DB template de Odoo | Sin DB plantilla que mantener; idempotente; no arrastra datos operativos |
| D3 | Disponibilidad por patrón ✗ al despachar (MVP) | Esperar stock real (ADR-007) | Probado en colmado; no bloquea el MVP; ADR-007 lo resuelve de raíz después |
| D4 | Aviso de ✗ redactado por IA vía n8n | Plantilla fija desde el API | Sin contexto la conversación se rompe; permite sugerir sustitutos |
| D5 | Catálogo maestro real en DB Odoo dedicada (`pharmacy_master_catalog`) importada desde `pharmacy_inventory` (Meili, 17,456) | Importar al Odoo principal | El Odoo principal es el POS vivo de Farmacia Leo — no se contamina con 17k productos |

## Código relevante

- Provisioning: `packages/api/src/modules/provisioning/` (pipeline, steps, worker)
- Auth scoped: `packages/api/src/shared/odoo-scoped.ts`, `odoo-scoped-cache.ts`
- Catalog sync: `packages/api/src/modules/catalog-sync/catalog-sync.service.ts`
- Comandos n8n: `packages/api/src/modules/commands/`
- Pedidos dashboard: `packages/dashboard/src/app/(dashboard)/orders/`
- Voz: `packages/api/src/modules/voice-calls/`, `packages/voice-agent/`
