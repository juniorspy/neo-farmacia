# API — convenciones y referencia

> **La referencia COMPLETA y siempre actual de endpoints es el Swagger UI del
> propio API: `/docs`** (`https://api.leofarmacia.com/docs`, en dev
> `http://localhost:3000/docs`). Se auto-genera de los `schema` de cada ruta, así
> que no puede driftar. Este archivo NO lista endpoints — solo documenta las
> convenciones transversales (auth, mapeos de estado, errores) que OpenAPI no
> expresa bien.

## Modelo de autenticación

| Superficie | Auth |
|---|---|
| Rutas del dashboard | **JWT** Bearer (de `POST /api/v1/auth/login`); scoped por `store_id`, un farmacéutico solo accede a sus stores |
| Callbacks de n8n (`/commands`, `/products/search`, `/orders/update`, `/users/lookup`, voz create/transcript) | **`Authorization: Bearer N8N_API_KEY`** (timing-safe, fail-closed en prod) |
| Admin / provisioning | JWT con `role: admin` |
| Webhook `/webhook/evolution` | sin auth (origen Evolution) |
| Página de llamada del cliente | token firmado de un solo uso (`?t=`), NO JWT |
| Tienda pública (`/storefront/*`) | sin auth; el POST de pedido tiene rate limit por IP |

El boot **falla cerrado** en producción: sin `JWT_SECRET` ni `N8N_API_KEY` el
API no arranca (ver `docs/architecture/security.md`).

## Mapeo de estado de pedidos (Dashboard ↔ Odoo)

El dashboard usa estados propios; Odoo usa los suyos. La traducción
(`mapOdooState` / `mapDashboardAction` en `orders.routes.ts`):

| Dashboard | Estado Odoo | Acción Odoo al setear |
|---|---|---|
| `pending` | `draft` / `sent` | `action_draft` |
| `ready` | `sale` | `action_confirm` |
| `dispatched` | `done` | `action_lock` (Odoo 17; fallback `action_done`) |
| `cancelled` | `cancel` | `action_cancel` |

Línea con `qty: 0` = ítem rechazado (patrón ✗, M2) — traza, no se elimina.
Pedido web = `sale.order` con `client_order_ref: 'web'` (cae en la misma cola
`/orders` que WhatsApp y voz).

## Formato de error

Todas las respuestas de error siguen:
```json
{ "error": "mensaje legible" }
```

Códigos comunes:
- `400` — body/params inválidos o faltantes (los `schema` validan en el borde)
- `401` — auth faltante/ inválida
- `403` — autenticado pero sin permiso (p.ej. no-admin a ruta admin, o store ajeno)
- `404` — recurso no encontrado
- `409` — conflicto de estado (p.ej. store no activo, llamada no contestable)
- `422` — entidad no procesable (p.ej. producto no disponible en pedido web)
- `429` — rate limit (POST público de la tienda)
- `500` — error interno (logueado con stack en el backend)

## Convenciones de respuesta

- Las rutas que mutan suelen devolver `{ ok: true, ... }` o el recurso actualizado.
- Listas paginadas: query `limit` / `offset` (defaults documentados por ruta en `/docs`).
- Los precios se leen SIEMPRE del servidor; el cliente nunca fija precio.

---

¿Falta un endpoint o su shape exacto? **No está aquí a propósito** — míralo en
`/docs`, que refleja el código vivo.
