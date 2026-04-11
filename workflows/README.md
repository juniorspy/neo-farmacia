# n8n Workflows

## `neo-farmacia-simple-agent.json` — Agente de prueba

Workflow mínimo con **1 agente LLM + 3 tools** para probar el flujo end-to-end del command router.

### Qué hace
- Recibe un POST en `/webhook/neo-farmacia-test` con `{ text, chatId, storeId, phone, pushName }`
- Un solo agente (GPT-4.1 mini) con memoria de 10 mensajes
- 3 tools conectadas al command router de neo-farmacia:
  - `catalogo_search` → `catalogo.search`
  - `carrito_agregar` → `pedido.updateItems`
  - `crear_cliente` → `usuario.ensure`
- Devuelve `{ "text": "..." }`

### Cómo importarlo

1. n8n → Workflows → **Import from File**
2. Seleccioná `neo-farmacia-simple-agent.json`
3. Asigná la credencial OpenAI existente al nodo `OpenAI GPT-4.1 mini`
4. Guardá y activá
5. El webhook queda en: `https://automations.onrpa.com/webhook/neo-farmacia-test`

### Probarlo con curl

```bash
# Saludo
curl -X POST https://automations.onrpa.com/webhook/neo-farmacia-test \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hola, buenas tardes",
    "chatId": "test-maria-001",
    "storeId": "store_leo",
    "phone": "+18095550001",
    "pushName": "María"
  }'

# Preguntar por medicamento con marca comercial
curl -X POST https://automations.onrpa.com/webhook/neo-farmacia-test \
  -H "Content-Type: application/json" \
  -d '{
    "text": "¿Tienen dolex?",
    "chatId": "test-maria-001",
    "storeId": "store_leo",
    "phone": "+18095550001",
    "pushName": "María"
  }'

# Pedir agregar al carrito
curl -X POST https://automations.onrpa.com/webhook/neo-farmacia-test \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Mándame 2 cajas",
    "chatId": "test-maria-001",
    "storeId": "store_leo",
    "phone": "+18095550001",
    "pushName": "María"
  }'

# Registrar cliente
curl -X POST https://automations.onrpa.com/webhook/neo-farmacia-test \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Soy María López y vivo en Gazcue, calle Santiago #45",
    "chatId": "test-maria-001",
    "storeId": "store_leo",
    "phone": "+18095550001",
    "pushName": "María"
  }'
```

### Verificación

Después de las pruebas:

1. **Orders en dashboard**: entra a `https://app.leofarmacia.com/orders` — deberías ver un pedido draft para `test-maria-001`
2. **Customer en dashboard**: `/customers` debería mostrar "María López" registrada
3. **Logs de n8n**: en la UI, click en Executions para ver cada tool call y respuesta del agente

### Limitaciones de este workflow simple

- Solo 1 agente (no clasifica intenciones — el LLM decide qué tool usar)
- No tiene flujo de confirmación de pedido (`pedido.despachar` no está conectado)
- No maneja handover manual
- No maneja audio / imágenes

Cuando este workflow funcione bien, podés adaptar el workflow completo de Colmado Juan siguiendo [docs/tech/10-n8n-agents.md](../docs/tech/10-n8n-agents.md).
