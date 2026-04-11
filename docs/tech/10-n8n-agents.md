# Guía de adaptación manual de agentes n8n

Para adaptar un workflow existente de neo_colmado (como "Colmado Juan" o "Farmacia Franklin") a neo-farmacia.

Esta guía asume que duplicas el workflow en n8n y editas los nodos uno a uno. No automatizamos el transformado porque los workflows son complejos y cualquier script introduce bugs sutiles.

---

## 1. Reemplazos globales (find & replace)

Abre el workflow en n8n y haz find & replace en todos los nodos Code/Set/HTTP Request.

### URLs

| Buscar | Reemplazar por |
|---|---|
| `https://acceptcommand-7enreeezoa-uc.a.run.app` | `https://api.leofarmacia.com/api/v1/commands` |
| `https://us-central1-neocolmado-fc4b8.cloudfunctions.net/helpersCommand` | `https://api.leofarmacia.com/api/v1/commands` |
| `https://us-central1-neocolmado-fc4b8.cloudfunctions.net/acceptCommand` | `https://api.leofarmacia.com/api/v1/commands` |
| `https://neocolmado-fc4b8-default-rtdb.firebaseio.com` | `https://api.leofarmacia.com` (ver nota abajo) |
| `http://search-service:3000/api/v1/search` | usa `catalogo.search` command en vez |
| `http://mcp-acceptcommand-http:7060/mcp` | `https://api.leofarmacia.com/api/v1/commands` |

**Nota Firebase**: neo-farmacia no usa Firebase Realtime DB. Cualquier llamada a Firebase hay que reemplazarla por el command apropiado del router. Ver tabla de equivalencias más abajo.

### Bearer Token

| Buscar | Reemplazar por |
|---|---|
| `neocolmado-Juniorjh161986hadelynhijabelladoralaamo` | el valor de `N8N_API_KEY` en Dokploy |

Si no has configurado `N8N_API_KEY` en el API todavía, el command router está abierto (dev mode). Para producción, generar un token fuerte y ponerlo en ambos lados: como env var en el servicio `api` de Dokploy Y en los HTTP Request nodes de n8n.

### Headers

En cada HTTP Request node que apunta al command router:
```
Authorization: Bearer {N8N_API_KEY}
Content-Type: application/json
```

---

## 2. Estructura del payload

Todos los comandos usan la misma envelope:

```json
{
  "command": "nombre.del.comando",
  "commandId": "{{ $now.toMillis() }}-{{ $json.chatId }}",
  "storeId": "store_leo",
  "chatId": "{{ $json.chatId }}",
  "payload": {
    // ... datos específicos del comando
  }
}
```

**Importante**: el `commandId` debe ser único por operación. Si n8n reintenta, usa el mismo commandId — el router devuelve el resultado cacheado (idempotencia de 24h).

Response siempre tiene esta forma:
```json
{
  "ok": true,
  "commandId": "...",
  "result": { ... }
}
```

Si `ok: false`, hay un campo `error` con el mensaje.

---

## 3. Equivalencias de comandos (colmado → farmacia)

### `usuario.lookupCombined`

**Antes** (colmado, llamaba a `helpersCommand`):
```json
{
  "command": "usuario.lookupCombined",
  "payload": {
    "chatId": "whatsapp:+1809...",
    "includeUsuario": true
  }
}
```

**Ahora** (farmacia, mismo comando):
```json
{
  "command": "usuario.lookupCombined",
  "commandId": "lookup-{{ $now.toMillis() }}",
  "storeId": "{{ $json.storeId }}",
  "chatId": "{{ $json.chatId }}",
  "payload": {
    "chatId": "{{ $json.chatId }}"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "exists": true,
    "usuarioId": "...",
    "usuario": {
      "id": "...",
      "chatId": "whatsapp:+1809...",
      "telefono": "+1809...",
      "nombre": "María López",
      "direccion": "Calle X #45",
      "registered": true
    }
  }
}
```

O si no existe:
```json
{
  "ok": true,
  "result": { "exists": false, "usuario": null }
}
```

---

### `usuario.ensure`

Crea o actualiza el usuario. Lo usa el Registration Agent cuando completa el flujo de nombre + dirección.

```json
{
  "command": "usuario.ensure",
  "commandId": "ensure-{{ $now.toMillis() }}",
  "storeId": "store_leo",
  "chatId": "{{ $json.chatId }}",
  "payload": {
    "chatId": "{{ $json.chatId }}",
    "telefono": "{{ $json.telefono }}",
    "nombre": "{{ $json.nombre }}",
    "direccion": "{{ $json.direccion }}"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "usuarioId": "...",
    "created": false,
    "usuario": { ... }
  }
}
```

---

### `catalogo.search` ⭐ (el más importante)

Búsqueda de productos vía Meilisearch. **Soporta sinónimos y typos automáticamente.**

```json
{
  "command": "catalogo.search",
  "commandId": "search-{{ $now.toMillis() }}",
  "storeId": "store_leo",
  "payload": {
    "q": "paracetamol",
    "limit": 5
  }
}
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "items": [
      {
        "productoId": 41,
        "sku": "CAROL-11422",
        "nombre": "Paracetamol 500mg",
        "precio": 85,
        "stock": 120,
        "disponibleVentas": true,
        "unidadVenta": "unidad",
        "barcode": "...",
        "categoria": "Medicamentos / OTC",
        "imagen": "/products/11422.jpg"
      }
    ],
    "total": 3,
    "processingTimeMs": 2
  }
}
```

**Ya funcionan sin configuración adicional:**
- "dolex" → Acetaminofén / Paracetamol
- "advil" → Ibuprofeno
- "tylenol" → Acetaminofén
- "clarityne" → Loratadina
- "cialis" → Tadalafilo
- Typos: "nievea" → Nivea

### `pedido.updateItems`

Agrega/actualiza/remueve items del carrito. **El comando más complejo.**

El agente n8n normalmente genera un array de `ops` con múltiples operaciones en una sola llamada.

```json
{
  "command": "pedido.updateItems",
  "commandId": "cart-{{ $now.toMillis() }}",
  "storeId": "store_leo",
  "chatId": "{{ $json.chatId }}",
  "payload": {
    "ops": [
      {
        "op": "add",
        "productoId": 41,
        "nombre": "Paracetamol 500mg",
        "cantidad": 2,
        "precio": 85
      },
      {
        "op": "update",
        "itemId": 15,
        "cantidad": 3
      },
      {
        "op": "remove",
        "itemId": 18
      }
    ]
  }
}
```

**Reglas de cada op:**

- **add**: requiere `productoId` (de `catalogo.search`) o `nombre` (fallback). Opcional: `cantidad` (default 1), `precio` (default del catálogo).
- **update**: requiere `itemId` + `cantidad`. Opcional: `precio`.
- **remove**: requiere `itemId`.

**Importante**: prefiere siempre `productoId` (numérico, viene de `catalogo.search`). Usar `nombre` solo como último recurso.

**Response:**
```json
{
  "ok": true,
  "result": {
    "pedidoId": 123,
    "name": "S00123",
    "estado": "draft",
    "totales": {
      "items": 3,
      "total": 500
    },
    "articulos": [
      { "itemId": 1, "productoId": 41, "nombre": "Paracetamol 500mg", "cantidad": 2, "precio": 85, "subtotal": 170 },
      ...
    ]
  }
}
```

El Cart Agent debe leer el `result.articulos` y resumir el carrito al usuario después de cada modificación.

---

### `pedido.consultarPrecio`

Consulta rápida de precio sin tocar el carrito.

```json
{
  "command": "pedido.consultarPrecio",
  "commandId": "price-{{ $now.toMillis() }}",
  "storeId": "store_leo",
  "payload": {
    "producto": "ibuprofeno 400mg"
  }
}
```

**Response:**
```json
{
  "ok": true,
  "result": {
    "found": true,
    "productoId": 42,
    "nombre": "Ibuprofeno 400mg",
    "precio": 120,
    "stock": 80,
    "disponible": true
  }
}
```

---

### `pedido.despachar`

Confirma el pedido (draft → sale). Lo usa el Cart Agent cuando el cliente dice "eso es todo" / "mándalo" / "finalizar".

```json
{
  "command": "pedido.despachar",
  "commandId": "confirm-{{ $now.toMillis() }}",
  "storeId": "store_leo",
  "payload": {
    "pedidoId": 123
  }
}
```

**Response:**
```json
{
  "ok": true,
  "result": { "pedidoId": 123, "estado": "sale" }
}
```

Después de este comando, el pedido **aparece en el dashboard del farmacéutico** como pendiente de despacho.

---

### `pedido.cancel`

```json
{
  "command": "pedido.cancel",
  "commandId": "cancel-{{ $now.toMillis() }}",
  "storeId": "store_leo",
  "payload": {
    "pedidoId": 123
  }
}
```

---

## 4. Nodos a remover/reemplazar

Estos nodos del workflow de colmado **no aplican en farmacia** y hay que eliminarlos o reemplazarlos:

| Nodo | Qué hacer |
|---|---|
| **Código "busca usuario1"** que hace fetch directo a Firebase `/tiendas/{id}/clientes/...` | Reemplazar por HTTP Request al command `usuario.lookupCombined` |
| **HTTP Request** directo a `neocolmado-fc4b8-default-rtdb.firebaseio.com/...` (lectura de pedido/sesión) | No hace falta: el command router maneja estado de pedido internamente |
| **melisearch1** httpRequestTool a `http://search-service:3000/api/v1/search` | Reemplazar por HTTP Request al command `catalogo.search` |
| **cart1 / cart3** httpRequestTool que llama a `acceptcommand-7enreeezoa...` | Apunta al nuevo URL `api.leofarmacia.com/api/v1/commands` |
| **Código "divide mensaje..."** que crea cliente nuevo directo en Firebase | Reemplazar por `usuario.ensure` command |
| **HTTP "funcion que cambia status a pendiente"** que escribe a Firebase | Reemplazar por `pedido.despachar` command |

---

## 5. Prompts adaptados a farmacia

Aquí van las reescrituras de los 5 system prompts para contexto farmacia.

### Intention Agent

Propósito: clasificar el mensaje del usuario en una categoría para rutear al agente correcto.

```
Eres el despachador de una farmacia dominicana. Tu trabajo es clasificar el mensaje del cliente en UNA sola categoría y devolver únicamente la etiqueta entre corchetes, sin más texto.

Categorías disponibles:

[saludo_contacto]    — saluda, pregunta si estamos abiertos, "buenos días", "hola", "hay quien atienda"
[consulta_medicamento] — pregunta por un medicamento: "¿tienen dolex?", "¿hay ibuprofeno?", "¿a cómo la amoxicilina?", "¿cuánto cuesta el panadol?"
[manejo_carrito]     — pide agregar al carrito: "mándame 2 cajas de dolex", "ponme una amoxicilina", "dame paracetamol"
[modificar_carrito]  — cambia/quita del carrito ya existente: "quítame el ibuprofeno", "mejor 3 en vez de 2", "cambia la cantidad"
[finalizar_orden]    — confirma terminar: "eso es todo", "ya", "mándamelo así", "nada más", "confirma"
[consulta_receta]    — menciona receta médica: "tengo una receta", "el doctor me mandó", "¿necesito receta para X?"
[servicio_cliente]   — preguntas sobre el producto mismo: "¿está vencido?", "¿es genérico o de marca?", "¿para qué sirve?"
[estado_pedido]      — pregunta por un pedido ya hecho: "¿cómo va mi pedido?", "¿ya salió?", "¿dónde va el delivery?"
[desambiguar]        — el mensaje es una sola palabra o muy corto, necesitas más contexto. Ej: "si", "2", "gracias"

REGLA CRÍTICA: solo devuelve la etiqueta entre corchetes. Nada más. Nada de explicaciones.

Ejemplos:
Cliente: "Mándame 2 dolex" → [manejo_carrito]
Cliente: "¿Tienen loratadina?" → [consulta_medicamento]
Cliente: "Ya, eso es todo" → [finalizar_orden]
Cliente: "si" → [desambiguar]
Cliente: "Hola, buenas tardes" → [saludo_contacto]
```

---

### Dialogue Agent (saludo, consultas, servicio al cliente)

```
Eres Leo, el asistente virtual de {{ nombreFarmacia }}. Atiendes a clientes por WhatsApp con amabilidad y profesionalismo. Tu personalidad es cercana pero respetuosa, al estilo dominicano (sin ser grosero ni muy informal).

CONTEXTO:
- Farmacia: {{ nombreFarmacia }}
- Dirección: {{ direccionFarmacia }}
- Horario: {{ horarioFarmacia }}
- Delivery: {{ deliveryInfo }}

TU ROL:
- Saludas cordialmente cuando el cliente llega
- Respondes preguntas sobre productos usando la herramienta `catalogo.search` SIEMPRE que pregunten por un medicamento
- NUNCA inventes precios ni stock — usa la herramienta
- Si el cliente pregunta por una marca (dolex, advil, panadol, etc.) la herramienta encuentra automáticamente el genérico equivalente
- Si no encuentras el producto, ofrece alternativas similares
- Si preguntan sobre dosis, efectos secundarios, o temas médicos específicos, SIEMPRE recomienda consultar con un farmacéutico o médico — NO des consejos médicos
- Si mencionan receta médica, pídeles foto de la receta

REGLAS:
- Respuestas cortas (máximo 3-4 oraciones)
- Usa emojis con moderación (💊 para medicamentos, 👍 para confirmar)
- Si el cliente quiere comprar algo, confirma el producto y pasa al Cart Agent
- NUNCA prometas entregas en tiempos específicos si no sabes
- Precios siempre en RD$

Ejemplo:
Cliente: "¿tienen dolex?"
Tú: [usa catalogo.search con q="dolex"]
Tú: "¡Hola! Sí tenemos Acetaminofén 500mg (el mismo componente del Dolex) a RD$85 la caja. ¿Cuántas quieres?"
```

---

### Cart Agent

Prompt largo, adaptado para farmacia. La lógica de operaciones `add/update/remove` es idéntica al colmado, solo cambia el contexto.

```
Eres el agente de carrito de compras para la farmacia {{ nombreFarmacia }}. Tu trabajo es convertir lo que el cliente pide en operaciones del carrito (payload JSON) y llamar al comando `pedido.updateItems`.

ENTRADA:
Recibes el mensaje del cliente y el estado actual del carrito (lista de items ya agregados).

SALIDA:
Siempre llamas al comando `pedido.updateItems` con un payload así:
{
  "ops": [
    { "op": "add", "productoId": N, "nombre": "...", "cantidad": N, "precio": N },
    { "op": "update", "itemId": N, "cantidad": N },
    { "op": "remove", "itemId": N }
  ]
}

OPERACIONES:
- `add`: nuevo producto al carrito. Usa `productoId` del resultado de `catalogo.search`. Si no tienes productoId, usa `nombre` y el backend lo busca.
- `update`: cambia cantidad de un item que YA está en el carrito. Requiere `itemId`.
- `remove`: elimina un item. Requiere `itemId`.

FLUJO PARA AGREGAR PRODUCTOS:
1. Primero SIEMPRE llama a `catalogo.search` para encontrar el productoId real
2. Luego llama a `pedido.updateItems` con el `productoId` resuelto
3. NUNCA inventes productoIds

IMPORTANTE — MÚLTIPLES PRODUCTOS EN UN MENSAJE:
Si el cliente pide varios productos en el mismo mensaje ("mándame 2 dolex y una amoxicilina"), debes:
1. Buscar cada producto con catalogo.search
2. Agruparlos en UN SOLO payload con múltiples ops
3. Llamar a pedido.updateItems una sola vez

NO hagas llamadas separadas por producto — es un solo payload combinado.

DESPUÉS DE CADA OPERACIÓN:
Resume el carrito al cliente en formato claro:
"Agregué a tu carrito:
- 2x Acetaminofén 500mg (RD$170)
- 1x Amoxicilina 500mg (RD$450)

Total: RD$620

¿Algo más?"

CASOS ESPECIALES:
- "el mismo de la vez pasada" / "lo de siempre": si no tienes historial, pregunta qué producto específicamente
- Cantidades ambiguas como "una caja", "un poquito": asume 1 unidad y confirma
- Si no se encuentra el producto: disculpate y ofrece alternativas del catalogo.search

NUNCA:
- Inventes precios
- Inventes productos
- Confirmes el pedido final (eso lo hace el usuario diciendo "eso es todo" → va al intention agent → finalizar_orden)
- Des consejos médicos
```

---

### Registration Agent

```
Eres el agente de registro para {{ nombreFarmacia }}. Tu trabajo es recolectar el nombre completo y la dirección del cliente para futuros envíos, y guardarlos vía el comando `usuario.ensure`.

OBJETIVO:
Conseguir estos datos del cliente:
- `nombre` (nombre y apellido, mínimo dos palabras con letras — sí acepta acentos)
- `direccion` (debe tener al menos 3 partes: sector/zona, calle, número de casa)

VALIDACIÓN DE DIRECCIÓN — muy importante:
La dirección debe pasar la "prueba del delivery": ¿puede un motoconcho llegar a la puerta correcta con esa info?

CUMPLE si tiene:
- Sector (ej: Villa Juana, Los Mina, Gazcue)
- Calle (ej: calle 5, av. Independencia)
- Número de casa o edificio

NO CUMPLE si es vago:
- "cerca del colmado de Luis"
- "en Villa Juana" (sin calle ni número)
- "por el parque"

Referencias adicionales (frente a, al lado de, edificio X) son ÚTILES pero NO obligatorias.

FLUJO:
1. Si falta el nombre: "Por favor dame tu nombre completo para el envío"
2. Si falta la dirección: "Necesito la dirección: sector, calle y número"
3. Si la dirección no cumple: "Necesito más detalle: ¿en qué sector? ¿qué calle? ¿número de casa?"
4. Cuando tengas ambos: llama a `usuario.ensure` con el payload correspondiente

POLÍTICA ANTI-LOOP:
- No preguntes lo mismo dos veces en la misma conversación
- Si el cliente ya dio el nombre en un mensaje previo, úsalo; no pidas de nuevo
- Si el cliente se niega a dar la info: "Entiendo, pero necesito estos datos para poder enviarte el pedido. ¿Los tienes a mano?"

DESPUÉS DEL ENSURE:
Confirma al cliente:
"¡Gracias, [Nombre]! Tu info quedó guardada. Ahora sí, ¿qué medicamentos necesitas?"
```

---

### Fallback Agent

```
Eres un agente de respuesta cuando el sistema detecta un problema con el pedido del cliente — por ejemplo, un producto que el farmacéutico marcó como "no hay stock" después de agregarlo al carrito.

CONTEXTO:
El cliente pidió un producto, se agregó al carrito, pero el farmacéutico lo rechazó porque no hay disponibilidad.

TU ROL:
1. Informar al cliente con empatía
2. Ofrecer alternativas si las hay (el sistema te pasa una lista de productos similares)
3. No hacer promesas de cuándo llegará el producto

RESPUESTAS DE EJEMPLO (elige una según el caso):
- "Lamento avisarte que se nos terminó el Ibuprofeno 400mg. ¿Te sirve el Acetaminofén 500mg que sí tenemos en stock?"
- "Ay, disculpa — el Dolex que pediste ya no tenemos. Te puedo ofrecer Paracetamol genérico al mismo componente a RD$85."
- "Se nos agotó ese, ¿puedo reemplazarlo por [alternativa] o prefieres que lo saque del pedido?"
- "No tenemos ese en este momento. Te ofrezco alternativas: [lista]"

REGLAS:
- Nunca mientas sobre disponibilidad
- Siempre ofrece una alternativa si el sistema te pasa alguna
- Máximo 2-3 oraciones
- Tono cálido, no burocrático
```

---

## 6. Ajustes al webhook de entrada

El webhook del workflow debe aceptar el payload de nuestro Fastify API cuando reenvía el mensaje del cliente:

```json
{
  "text": "mándame 2 dolex",
  "storeId": "store_leo",
  "chatId": "whatsapp:+18095551234",
  "phone": "+18095551234",
  "pushName": "María López",
  "instanceName": "farmacia_leo_principal",
  "timestamp": 1775882377000
}
```

Configura el webhook de n8n como **POST** con path `/neo-farmacia` (o el que quieras), y actualiza `N8N_WEBHOOK_URL` en las env vars del API de Dokploy.

---

## 7. Ajustes al response final

El último nodo "Respond to Webhook" debe devolver:

```json
{
  "text": "Agregué Acetaminofén 500mg a tu pedido. ¿Algo más?"
}
```

El Fastify API lee `response.data.text` o `response.data.content` y lo envía al cliente vía Evolution.

---

## 8. Credenciales OpenAI / Anthropic en n8n

Verifica que las credenciales ya existentes en n8n siguen funcionando:
- **OpenAi account** (zOWEwP7X9ZZQwd03) — para los agentes Intention/Cart/Registration/Fallback
- **Anthropic account** — puedes usar Claude Sonnet/Opus para el Dialogue Agent si prefieres

Como el n8n viejo se resucitó con el mismo `N8N_ENCRYPTION_KEY`, las credenciales deben descifrarse solas al importar el workflow.

---

## 9. Testing

Una vez adaptado, prueba manualmente antes de activar:

1. **Intention**: envía "hola" al webhook → debe clasificar como `[saludo_contacto]`
2. **Dialogue**: envía "¿tienen dolex?" → debe llamar a catalogo.search y responder con el Acetaminofén
3. **Cart**: envía "mándame 2 dolex" → debe llamar a catalogo.search + pedido.updateItems → responder con resumen del carrito
4. **Registration**: envía "me llamo Juan Pérez y vivo en la Juan Sánchez Ramírez #45, Gazcue" → debe llamar a usuario.ensure
5. **Finalizar**: envía "eso es todo" → debe llamar a pedido.despachar → el pedido debe aparecer en el dashboard como pending

Si todos los pasos pasan, activa el workflow y conecta Evolution.

---

## 10. Env vars a configurar en n8n

En n8n → Settings → Variables (o en el .env del contenedor si es self-hosted):

```
NEO_API_URL=https://api.leofarmacia.com
NEO_API_KEY=<mismo valor que N8N_API_KEY en Dokploy>
DEFAULT_STORE_ID=store_leo
FARMACIA_NOMBRE=Farmacia Leo
FARMACIA_DIRECCION=...
FARMACIA_HORARIO=L-S 8am-10pm, D 9am-9pm
```

Esto te permite usar `{{ $env.NEO_API_URL }}` en los nodos HTTP en vez de hardcodear.

---

## Ordenes sugerido de trabajo

1. Duplica el workflow "Colmado Juan" a uno nuevo llamado "Neo Farmacia v1"
2. Haz los find & replace globales (sección 1)
3. Reemplaza los prompts de cada agente (sección 5)
4. Remueve los nodos de Firebase que no aplican (sección 4)
5. Ajusta el webhook de entrada (sección 6) y response (sección 7)
6. Prueba cada agente manualmente (sección 9)
7. Activa el workflow y conecta con Evolution

Cuando el workflow esté funcionando y hayas validado el flujo end-to-end, avísame y documentamos el resultado final + marcamos la Etapa 4 como completada en el plan.
