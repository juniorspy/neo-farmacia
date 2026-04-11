# Plan: Catálogo + Agentes IA (Stage 4)

Plan de trabajo para configurar el catálogo de productos, Meilisearch, sinónimos, y los agentes de n8n que consumen todo esto.

## Contexto y decisiones tomadas

### Modelo de negocio confirmado
- **Neo Farmacia** = SaaS multi-tenant para farmacias
- **Leo** = el agente IA (personalidad del bot)
- **Problema a resolver**: cuello de botella en toma de pedidos por WhatsApp
- **Dos perfiles de cliente**:
  1. Farmacia con POS existente → conector de sync (Stage 6: POS Sync)
  2. Farmacia nueva/sin POS → neo incluye Odoo como POS

### Decisión sobre el catálogo maestro
**DESCARTADO**: La idea inicial de importar 17k productos como "catálogo maestro" compartido.

**Razón**: Confunde el modelo de ownership del dato. Cada farmacia debe tener su inventario real. El maestro crea la duda de "¿yo ajusto mi precio o el del maestro?".

### Decisión sobre la demo
Para demo de Leo → **100 productos comunes con imágenes reales** scrapeadas de Farmacia Carol (farmaciacarol.com). Más vendible visualmente que 17k productos sin imágenes.

### Decisiones confirmadas
- **Cantidad**: 100 productos (top comunes en farmacia)
- **Fuente de imágenes**: Farmacia Carol (farmaciacarol.com)
- **Dónde guardar imágenes**: `packages/dashboard/public/products/{sku}.jpg` commited al repo
- **Normalización**: se escribe limpio desde el principio, sin parsear descripciones sucias

### Infraestructura existente disponible
- **Meilisearch**: `https://melisearch.onrpa.com` (ya corriendo, compartida con neo_colmado)
  - Token: en `.env` del VPS (no committear)
  - Ya tiene índice `pharmacy_inventory` con 17k productos (no lo usamos pero queda como referencia)
- **n8n**: `https://automations.onrpa.com` (resucitado recientemente con 28 workflows)
  - Tiene un workflow "Farmacia Franklin" que era un agente simple con Meilisearch
  - Versión 2.3.5 (vieja, pendiente upgrade en sesión aparte)

## Etapas de implementación

### ✅ Etapa 0: Command router (hecho)

Ya está implementado en `packages/api/src/modules/commands/`:
- `POST /api/v1/commands` — endpoint único con dispatch por `command` field
- Handlers: `usuario.lookupCombined`, `usuario.ensure`, `catalogo.search`, `pedido.updateItems`, `pedido.consultarPrecio`, `pedido.despachar`, `pedido.cancel`
- Idempotencia via `ProcessedCommand` collection (24h TTL)
- Bearer auth via `N8N_API_KEY`

**Pendiente**: cambiar `catalogo.search` para usar Meilisearch en vez de Odoo `ilike`.

---

### Etapa 1: Curar 100 productos demo + imágenes

**Objetivo**: Tener 100 productos reales, con imágenes scrapeadas de Farmacia Carol, en Odoo + Meilisearch.

**Tareas:**
1. [ ] Script de scraping que busca en farmaciacarol.com los 100 productos más comunes de una farmacia
   - Extraer: nombre, precio, imagen URL, categoría, descripción
   - Guardar imágenes en `packages/dashboard/public/products/{sku}.jpg`
   - Guardar metadata en `scripts/products-seed.json`
2. [ ] Validar JSON manualmente (editar nombres/precios si hay algo raro)
3. [ ] Script de import a Odoo via JSON-RPC con:
   - `name`, `default_code`, `list_price`, `categ_id`, `barcode`, `image_1920`
   - Categorías: Analgésicos, Antigripales, Gastrointestinal, Antibióticos, Cardiovascular, Vitaminas, Primeros Auxilios, Cuidado Personal, etc.
4. [ ] Verificar en dashboard que los productos aparecen con imagen

**Lista inicial de productos sugerida:**

**Analgésicos**
- Acetaminofén 500mg (Dolex)
- Ibuprofeno 400mg (Advil)
- Diclofenac 50mg
- Naproxeno 500mg

**Antigripales / Alergia**
- Tabcin Extra Fuerte
- Panadol Antigripal
- Loratadina 10mg (Clarityne)
- Cetirizina 10mg
- Ibuprofeno Infantil jarabe

**Gastrointestinal**
- Omeprazol 20mg
- Loperamida 2mg (Imodium)
- Sales de rehidratación oral
- Ranitidina 150mg
- Metoclopramida

**Antibióticos**
- Amoxicilina 500mg
- Azitromicina 500mg
- Ciprofloxacino 500mg

**Cardiovascular / Crónicos**
- Enalapril 10mg
- Losartán 50mg
- Metformina 850mg
- Atorvastatina 20mg
- Amlodipino 5mg

**Vitaminas / Suplementos**
- Complejo B
- Vitamina C 1000mg
- Omega 3
- Centrum
- Sulfato ferroso

**Primeros auxilios**
- Alcohol isopropílico 70%
- Agua oxigenada
- Gasas estériles
- Curitas
- Termómetro digital

**Cuidado personal (típico farmacia RD)**
- Pañales desechables
- Shampoo Head & Shoulders
- Pasta dental Colgate
- Toallas sanitarias

---

### Etapa 2: Meilisearch client + sync

**Objetivo**: `catalogo.search` usa Meilisearch en vez de Odoo `ilike`.

**Tareas:**
1. [ ] Crear `packages/api/src/shared/meilisearch.ts` — cliente HTTP mínimo
2. [ ] Agregar env vars: `MEILISEARCH_URL`, `MEILISEARCH_API_KEY`
3. [ ] Crear índice por tienda: `store_{storeId}_products`
4. [ ] Schema del documento:
   ```json
   {
     "id": 123,              // Odoo product_id (primary key)
     "default_code": "...",  // SKU
     "name": "...",          // Nombre normalizado
     "description": "...",   // Descripción ampliada
     "category": "...",      // Categoría
     "price": 85.00,
     "barcode": "...",
     "image_url": "..."
   }
   ```
5. [ ] Configurar `searchableAttributes`: `name`, `description`, `default_code`, `barcode`
6. [ ] Configurar typo tolerance (default está bien)
7. [ ] Implementar sync Odoo → Meilisearch:
   - Cron cada 10 min (productos con `write_date > ultimo_sync`)
   - Endpoint manual `POST /api/v1/stores/:storeId/catalog/resync` (JWT) para full rebuild
8. [ ] Cambiar `catalogoSearch` handler para usar Meilisearch
9. [ ] El handler devuelve product_ids de Odoo → `pedido.updateItems` ya los sabe usar
10. [ ] Opcional: enriquecer top resultados con stock real de Odoo (porque Meilisearch puede estar stale unos minutos)

---

### Etapa 3: Sinónimos

**Objetivo**: "dolex" → acetaminofén, "advil" → ibuprofeno, etc.

**Tareas:**
1. [ ] Seed JSON con top 50 sinónimos brand→genérico para mercado RD:
   ```json
   {
     "acetaminofen": ["paracetamol", "dolex", "panadol", "tempra", "tylenol"],
     "ibuprofeno": ["advil", "motrin"],
     "loratadina": ["clarityne", "claritin"],
     "omeprazol": ["prilosec"],
     "metformina": ["glucophage"],
     ...
   }
   ```
2. [ ] Aplicar sinónimos al índice `store_{storeId}_products` en Meilisearch
3. [ ] Endpoint `POST /api/v1/stores/:storeId/catalog/synonyms` para editar desde dashboard
4. [ ] UI básica en settings para agregar/editar sinónimos
5. [ ] Logging: endpoint que captura búsquedas con 0 resultados para detectar sinónimos faltantes

---

### Etapa 4: Adaptar agentes n8n al command router

**Objetivo**: Los 5 agentes de n8n funcionan con neo-farmacia.

**Tareas:**
1. [ ] Exportar workflows base de n8n (ya pendiente del Claude del VPS):
   - `Farmacia Franklin` (id: `OMZ9aTxHLbqTWPFi`)
   - `Colmado Juan` más reciente (id: `mVpj6FH6mDSR7hGV`) — template más actualizado
2. [ ] Importar a n8n como copia "Neo Farmacia v1"
3. [ ] Adaptar cada agente:
   - **Intention Agent**: ajustar clasificaciones para contexto farmacia (agregar `receta_medica`?, `consulta_medicamento`?)
   - **Dialogue Agent**: sistema prompt reescrito para farmacia
   - **Cart Agent**: payloads del command router (`pedido.updateItems`, etc.)
   - **Registration Agent**: mismo flujo, valida nombre + dirección
   - **Fallback Agent**: respuestas adaptadas a "no tenemos este medicamento"
4. [ ] Cambiar URLs de HTTP nodes:
   - Old: `https://acceptcommand-7enreeezoa-uc.a.run.app`
   - New: `https://api.leofarmacia.com/api/v1/commands`
5. [ ] Configurar Bearer auth con `N8N_API_KEY`
6. [ ] Ajustar entrada del webhook de n8n para recibir payload de Fastify:
   ```json
   { "text": "...", "storeId": "store_leo", "chatId": "whatsapp:+1809...", ... }
   ```
7. [ ] Configurar salida del webhook → texto plano que Fastify reenvía por Evolution
8. [ ] Agregar env vars en n8n:
   - `NEO_API_URL=https://api.leofarmacia.com`
   - `NEO_API_KEY=<same as N8N_API_KEY in Fastify>`

---

### Etapa 5: Flujo end-to-end de prueba

**Objetivo**: Cliente envía mensaje por WhatsApp → agente responde con producto encontrado → crea orden en Odoo → aparece en dashboard.

**Tareas:**
1. [ ] Conectar un número WhatsApp de prueba via Evolution (instance `farmacia_leo_test`)
2. [ ] Persistir el instance apikey en MongoDB (TODO pendiente del webhook handler)
3. [ ] Completar el `sendText` en webhook handler (TODO pendiente)
4. [ ] Prueba manual:
   - "Hola, necesito paracetamol 500mg" → Intention → Dialogue → encuentra producto → responde
   - "Mándame 2 cajas" → Cart → `pedido.updateItems` → crea sale.order draft en Odoo
   - "Eso es todo" → Cart → confirma → aparece en dashboard como pending
   - Pharmacist ve el pedido, marca listo, despacha, imprime
5. [ ] Validar en logs que cada paso fue exitoso
6. [ ] Documentar el flujo en `docs/tech/09-whatsapp-integration.md`

---

### Etapa 6: Pulir y documentar

**Tareas:**
1. [ ] Actualizar docs técnicos con los cambios
2. [ ] Session log
3. [ ] Actualizar roadmap
4. [ ] Commit + push

## Decisiones tomadas

- ✅ **Cantidad**: 100 productos comunes de farmacia
- ✅ **Fuente**: Farmacia Carol (farmaciacarol.com)
- ✅ **Imágenes**: `packages/dashboard/public/products/{sku}.jpg` + `image_1920` en Odoo
- ✅ **Normalización**: se escribe limpio desde el scraping, sin parsear descripciones sucias
- ✅ **Categorías**: asignadas por el script según keywords del nombre

## Out of scope (futuro)

- **Ecommerce storefront** (shop.leofarmacia.com) — proyecto separado cuando llegue el momento
- **POS Sync (Stage 6)** — cuando onboardeemos una farmacia con POS existente
- **Control de lotes y vencimientos** — Odoo lo soporta nativamente, activarlo cuando la farmacia lo pida
- **Receta médica / RX required** — flag en Odoo, requiere flujo adicional con foto de receta
- **Multi-company Odoo** — una empresa por tienda. Por ahora single company, se migra cuando entre la segunda farmacia
- **Upgrade de n8n 2.3.5 → 1.80+** — sesión aparte con backup previo y plan de regression

## Referencias

- **neo_colmado workflows**: `C:\Users\junio\OneDrive\Documentos\proyects\neo_colmado\firebase_functions_github` (patrón acceptCommand)
- **Meilisearch existente**: `https://melisearch.onrpa.com`
- **n8n existente**: `https://automations.onrpa.com` (workflows de Colmado Juan, Farmacia Franklin como base)
- **Template n8n original**: `C:\Users\junio\Downloads\main template_001.json` (5 agentes)
