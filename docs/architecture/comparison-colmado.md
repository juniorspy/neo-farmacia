# Neo Farmacia vs NeoColmado — comparación arquitectónica

**Corte:** 2026-06-20
**Fuentes:** `ARQUITECTURA_MODELO_NEGOCIO.md` (este repo) y
`neo_colmado/ARQUITECTURA_MODELO_NEGOCIO.md` (proyecto hermano).
**Propósito:** dejar por escrito en qué se parecen y en qué difieren los dos
sistemas — Farmacia nació calcado de la plantilla de Colmado, así que las
diferencias son decisiones de diseño, no accidentes.

## 1. Veredicto

**Mismo modelo de negocio, arquitectura corregida.** NeoColmado es el sistema
vivo y más maduro pero con deuda estructural; Neo Farmacia es el rediseño que
ataca los riesgos críticos de Colmado **antes** de escalar. Cada riesgo crítico
de Colmado tiene una contramedida explícita en Farmacia.

Frase núcleo idéntica en ambos: *"convierte conversaciones en operaciones
comerciales trazables"*. Lo que cambia es el **cómo**.

## 2. Comparación por dimensión

| Dimensión | NeoColmado | Neo Farmacia |
|---|---|---|
| **Núcleo de datos** | **Firebase RTDB** = fuente operativa + bus de eventos + historial + realtime (todo en uno) | **Sin Firebase (ADR-003)**: API Fastify (único punto de contratos) + MongoDB (estado) + Redis (efímero) + **Odoo por farmacia** (motor transaccional) + Meilisearch (búsqueda) |
| **Bus de eventos** | Implícito en rutas RTDB → **riesgo crítico #1** | Explícito vía `POST /api/v1/commands` idempotente — *diseñado para eliminar ese riesgo* |
| **Estructura de repos** | **Polirepo** (6+: conecta2, admin-backend, functions, search-service, whatsapp-service, Neo_WebRtc) | **Monorepo** (`packages/api`, `dashboard`, `voice-agent`) |
| **Interfaz del operador** | **App Android** (primaria) + Admin web Spring Boot → *duplicidad funcional (riesgo)* | **Web-only (ADR-006)**: Dashboard Next.js + super-admin. Sin app nativa |
| **Modelo de inventario** | **Progresivo/aprendido**: precio 0 → el colmadero confirma → conocimiento local | **Inverso**: la farmacia ya tiene catálogo confiable (maestro → conector POS). El "aprendizaje" se reemplaza por el **patrón ✗** al despachar |
| **Motor transaccional** | RTDB guarda los pedidos directamente | **Odoo 17, una DB por farmacia**, SSoT del canal (ADR-004) — la farmacia nunca lo ve |
| **WhatsApp** | **WhatsApp Service** dedicado entre Evolution y RTDB | La **propia API Fastify** maneja el webhook (debounce/mutex/handover/idempotencia consolidados) |
| **Búsqueda** | **Search Gateway** dedicado frente a Meili (batch query) | API habla con Meilisearch directo (módulo `catalog-sync`) |
| **Voz** | Proveedores fijos (Deepgram/OpenAI/ElevenLabs), **herramientas de carrito** (muta pedidos) | Proveedores **configurables por farmacia** (`voice_config`), **read-only v1** (no muta, rechaza consejo clínico) + **consulta al seguro por SIP** (capacidad nueva) |
| **Aislamiento tenant** | slug/tiendaId bajo rutas RTDB | **DB Odoo + índice Meili separados por farmacia**, pipeline de provisioning de 8 pasos |
| **Seguridad** | Mezcla Bearer compartido + acceso Firebase directo + SHA-256 (*requiere endurecer*) | Auth fail-closed, JWT, `store_id` auditado, usuario de servicio por farmacia |
| **Madurez** | **En producción**, colmados reales, wallet/banca en admin | **MVP** (M1 en prod; M2/M3/M4 código completo, e2e pendiente) |

## 3. ADN compartido (lo que Farmacia heredó a propósito)

- **Un solo workflow n8n compartido** sirve a N tenants (Farmacia cita la lección
  del `colmado-router-app`; el payload lleva `storeId` + `store_config`).
- Reglas transversales casi 1:1: mensaje persistido **antes** de procesar,
  aislamiento por tenant, idempotencia at-least-once, handover humano (la IA
  calla tras el takeover), **n8n nunca es fuente de verdad**.
- Mismo despliegue: **Dokploy auto-deploy + Traefik**, con Evolution + n8n +
  Meilisearch + LiveKit.
- Mismo reparto de canales base: WhatsApp como entrada principal + voz.

## 4. Las divergencias profundas (el porqué)

### 4.1 Firebase RTDB → contratos API explícitos
Es **la** diferencia. En Colmado, RTDB es a la vez base de datos, bus de eventos,
historial y canal realtime: potente para desacoplar, pero cualquier cambio de
ruta puede romper Functions, Android, web, WhatsApp Service y n8n a la vez (su
deuda crítica). Farmacia parte ese nudo: cada responsabilidad tiene dueño
explícito (API/Mongo/Redis/Odoo/Meili) y todos los contratos pasan por la API.

### 4.2 Inventario aprendido → inventario confiable
En Colmado el conocimiento se construye pregunta a pregunta (el precio `0` no es
verdad; genera consulta al colmadero). En Farmacia el catálogo llega completo
(maestro hoy, conector POS mañana — ADR-007/008) y la farmacia solo ajusta
precios. El equivalente al aprendizaje es el **patrón ✗** al despachar, y solo
mientras no haya stock real conectado.

### 4.3 RTDB-como-pedidos → Odoo por farmacia
Colmado no tiene motor transaccional dedicado: los pedidos viven en RTDB.
Farmacia introduce **Odoo 17, una DB por farmacia**, como motor interno y SSoT
del canal WhatsApp — invisible para la farmacia. Da semántica real de
`sale.order`, lotes y caducidad (relevante en farma), a cambio de más peso
operativo por tenant.

### 4.4 Android+web → web-only
Colmado arrastra duplicidad funcional entre la app Android del colmadero y el
admin web. Farmacia decide **web-only** (ADR-006): un solo lugar para operar y
administrar. Menos superficie, menos duplicación.

## 5. Qué conviene retro-portar de Farmacia a Colmado

- **Contratos idempotentes con `commandId`** y colección `processed_commands`:
  reduciría los duplicados que Colmado mitiga con `_processed`/locks ad-hoc.
- **Voz read-only por defecto** + `voice_config` por tenant: Colmado deja que la
  voz mute pedidos con proveedores fijos; el modelo de Farmacia es más seguro y
  configurable.
- **Endurecimiento de auth fail-closed**: ataca directo el riesgo crítico de
  seguridad de Colmado (Bearer compartido + SHA-256).
- **Leyenda de estado + tabla de milestones**: el doc de Colmado describe todo
  como si estuviera operativo; los indicadores ✅/⚠️/⏳/💡 separan
  producción/prueba/planeado (deuda operativa que Colmado lista como pendiente).

## 6. Qué deuda de Colmado todavía arrastra Farmacia

- **Punto único de fallo**: ambos dependen de un solo VPS/Dokploy. No resuelto
  en ninguno (Stage 8 de Farmacia sigue `pending`).
- **n8n user-owned y frágil al parsing**: los dos dependen de la calidad del
  agente y del estado de n8n; en Farmacia los 5 agentes están en adaptación.
- **Módulos/credenciales legacy conviviendo con lo nuevo**: Colmado lo tiene como
  riesgo; Farmacia ya carga su versión (`odoo.ts` muerto ~280 LOC, password
  admin en texto plano en el job hasta marcar "entregado").
- **Disponibilidad sin validar**: el `disponibleVentas || true` de Farmacia es el
  primo del "precio desconocido" de Colmado — promete lo que no verifica hasta
  que entra el conector real.

## 7. Diferencia de estilo del documento

El doc de Farmacia es un **documento vivo de ejecución** (leyenda de estado,
milestones M1–M4, doc de posicionamiento "no un chatbot, el OS de ventas para
farmacias"). El de Colmado es un **mapa de arquitectura más plano** que inventaría
lo que existe. Ambos comparten la columna vertebral (secciones 1–13).

## 8. En una frase

Colmado es el laboratorio en producción; Farmacia es la misma idea reconstruida
para escalar limpio — con la cuenta pendiente, en ambos, de la alta
disponibilidad.
