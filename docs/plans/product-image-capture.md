# Captura de fotos de producto por la farmacia (diseño)

**Estado**: diseñado (2026-06-07), pendiente de construir.
**Origen**: la tienda online necesita fotos; en farmacia poner la imagen
equivocada a un medicamento es un riesgo real (no estético). Descartado buscar
imágenes en internet. La farmacia fotografía su propio producto físico — esa es
la única fuente de verdad aceptable.

## Principio

> **Correctitud sobre velocidad, pero ambas a la vez.** Cada foto debe quedar
> ligada a un producto único sin ambigüedad, y el levantamiento debe ser lo
> bastante rápido para cientos/miles de SKUs. El código de barras del producto
> resuelve las dos cosas: es el ancla inequívoca y elimina el tecleo.

## El mecanismo: bucle anclado al código de barras

Todo desde **un teléfono** (la cámara hace escaneo y foto):

```
1. Escanear barcode   → buscar el producto por ese código en SU catálogo
2. CONFIRMAR producto → "Advil 200mg x10 — ¿es este?" (+ foto actual si tiene)
3. Tomar la foto      → misma cámara
4. Revisar y guardar  → foto + nombre juntos; botón Guardar
5. Siguiente          → vuelve a escanear automáticamente
```

### Las dos rejas anti-error (lo crítico)
1. **Barcode = clave única.** No hay match por nombre parecido ni código
   tecleado mal. El escáner lee el código del empaque físico que el empleado
   tiene en la mano.
2. **Doble confirmación.** El producto se muestra (nombre + foto actual)
   ANTES de armar la cámara, y la foto + nombre se muestran ANTES de guardar.
   Imposible guardar a ciegas.

### Fallbacks
- **Sin barcode legible** (granel, reempaque) → "buscar por nombre", elegir de
  la lista, mismo paso de confirmación + foto.
- **Barcode no encontrado** en el catálogo → aviso claro ("no existe en tu
  inventario"), no se crea nada.
- **Filtro "solo sin foto"** + contador (`23/165 con foto`) para trabajar los
  huecos sin repetir.
- **Reemplazar** una foto existente (corrige una mala): el flujo es el mismo,
  sobrescribe.

## Almacenamiento: Odoo nativo (decisión)

Las fotos viven en `product.product.image_1920` del **Odoo de cada farmacia**.

| Por qué | |
|---|---|
| Por-tenant | Cada foto en la DB Odoo de su farmacia, aislada como todo lo demás |
| Fuente de verdad | Viaja con el producto; si se exporta/migra el producto, va la foto |
| Sin pieza nueva | No montamos almacenamiento de objetos ni backups aparte |
| Variantes gratis | Odoo genera `image_128/256/512` para thumbnails |

Descartado: almacenamiento propio (volumen/objeto) — más control de CDN pero
añade backups y otra pieza que mantener; no se justifica al MVP.

## Arquitectura y flujo de datos

```
Teléfono (staff, logueado)                Plataforma                 Odoo farmacia
  │ escanea barcode                          │                            │
  │ ── GET .../by-barcode/:code ───────────► │ ── search por barcode ───► │
  │ ◄──────── producto (id, nombre, img?) ── │ ◄───────────────────────── │
  │ confirma + toma foto (resize cliente)    │                            │
  │ ── POST .../:id/image (jpeg base64) ───► │ ── write image_1920 ─────► │
  │ ◄──────────────── ok ─────────────────── │   + invalida caché Redis   │
                                              │
Tienda pública (cliente)                      │
  │ ── GET storefront/.../:id/image ───────► │ ── (caché Redis) o read ─► │
  │ ◄──────────── image/jpeg (cache) ─────── │   image_1920 de Odoo       │
```

## Superficie de API a construir

**Staff (JWT, scoped por store):**
- `GET /api/v1/stores/:storeId/products/by-barcode/:code` — busca por `barcode`
  en el Odoo de la farmacia; 404 si no existe. Devuelve `{ id, name, has_image }`.
- `POST /api/v1/stores/:storeId/products/:productId/image` — body con la imagen
  (jpeg base64, ya redimensionada en el cliente). Escribe `image_1920`,
  invalida la caché. Valida tamaño máx (p.ej. ≤2MB tras resize).
- `DELETE /api/v1/stores/:storeId/products/:productId/image` — quita una foto
  mala (set `image_1920 = false`).
- `GET /api/v1/stores/:storeId/products?has_image=false&limit=&offset=` —
  listado para el filtro "solo sin foto" + contador.

**Tienda pública (sin auth):**
- `GET /api/v1/storefront/:storeId/products/:productId/image` — stream
  `image/jpeg` desde Odoo, con `Cache-Control` y caché en Redis (clave por
  store+producto, invalidada en cada upload). Evita pegarle a Odoo por request.

**Catalog sync (cambio):**
- Al construir el doc de Meili, si el producto tiene imagen en Odoo, setear
  `image_url` al endpoint de streaming de arriba; si no, mantener el fallback
  estático `/products/<code>.jpg` (así las ~110 imágenes CAROL existentes
  siguen funcionando). Layering de prioridad:

  ```
  foto de la farmacia (Odoo image_1920)
    └─ si no → /products/<code>.jpg (estáticas que ya existen)
        └─ si no → placeholder (ProductImage degrada en onError)
  ```

  El `ProductImage` del storefront ya degrada a placeholder en error, así que
  el layering es robusto sin lógica extra en el cliente.

## UX (pantallas)

1. **Escáner** — visor de cámara con marco; lee el barcode en vivo. Header con
   contador `N/total con foto` y toggle "solo sin foto". Botón "buscar por
   nombre" (fallback).
2. **Confirmar producto** — nombre grande, categoría, foto actual si tiene,
   botones "Sí, es este" / "No, volver a escanear".
3. **Capturar** — cámara; botón disparar; opción de la galería como alternativa.
4. **Revisar** — foto tomada + nombre; "Guardar" / "Repetir".
5. Tras guardar → vuelve a (1) automáticamente.

Mobile-first; pensado para que un empleado lo haga de corrido en el mostrador.

## Notas técnicas

- **Escaneo de barcode**: lib cross-browser (`@zxing/browser`) en vez de solo
  `BarcodeDetector` (soporte parcial en iOS Safari). Decodifica de
  `getUserMedia` + canvas.
- **Resize en el cliente** antes de subir: bajar a ~1000px lado mayor, JPEG
  ~0.8. La cámara da 12MP; subir eso por datos móviles y meterlo en Odoo es
  innecesario. `image_1920` espera ~1920px máx; 1000-1280 es de sobra para la
  tienda.
- **Caché de servido**: la foto casi nunca cambia → `Cache-Control` largo +
  bytes en Redis con TTL, invalidados en upload. Sin esto, cada vista de la
  tienda lee base64 de Odoo (pesado).
- **Permisos de cámara**: manejar denegación con mensaje claro (igual que el
  flujo del `/call`).
- **Seguridad**: el upload es ruta JWT scoped (staff de la farmacia), no
  pública. El servido público es solo lectura de imagen.

## Riesgo y mitigación (resumen)

| Riesgo | Mitigación |
|---|---|
| Foto en el producto equivocado | Ancla por barcode + doble confirmación con nombre/foto |
| Barcode mal leído | El producto confirmado se muestra antes de disparar; si no matchea, no deja continuar |
| Producto sin barcode | Fallback por nombre con la misma confirmación |
| Carga a Odoo por servir imágenes | Caché Redis + Cache-Control; resize en cliente |
| Foto vieja/mala | Flujo de reemplazo + DELETE |

## Fases sugeridas (cuando se construya)

1. **Backend**: by-barcode lookup, POST/DELETE image (Odoo image_1920),
   streaming público cacheado, cambio en catalog-sync (`image_url` layering).
2. **Capturador móvil**: escáner (`@zxing/browser`) → confirmar → capturar →
   guardar; fallback por nombre; filtro "solo sin foto" + contador.
3. **Pulido**: lote/sesión de captura, métricas de cobertura por farmacia en el
   health board (`% productos con foto`).

## Referencias
- Tienda online: `docs/sessions/2026-06-07-01.md` (arco tienda)
- Catálogo/sync: `packages/api/src/modules/catalog-sync/catalog-sync.service.ts`
- ProductImage (degradación): `packages/dashboard/src/app/store/[storeId]/page.tsx`
