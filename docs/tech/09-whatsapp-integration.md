# WhatsApp Integration (Evolution API + Webhook Pipeline)

How messages flow from a customer's WhatsApp into the system and back. Covers Evolution API usage and the full webhook pipeline in the Fastify API.

## Why Evolution API (and not direct Baileys)

Baileys is the open-source WhatsApp Web library everyone ends up using. We don't use it directly — we use **Evolution API**, which wraps Baileys with a stable HTTP interface:

- Multi-instance management (one instance = one WhatsApp number)
- REST endpoints for sending messages, getting QR codes, checking status
- Webhook dispatch to our API on every incoming event
- Session persistence across restarts
- Runs as a separate service, so upgrading Baileys doesn't touch our code

Evolution API is hosted externally at `https://evo.onrpa.com` (shared with other projects). Neo Farmacia creates its own instances there via the master key.

## Instance model

An **instance** in Evolution is one logged-in WhatsApp number. A pharmacy may have more than one:
- `farmacia_leo_principal` — the main customer number
- `farmacia_leo_delivery` — a secondary number for delivery coordination

Instance naming convention: `farmacia_{store_slug}[_{suffix}]`. The webhook handler uses the instance name to resolve which store the message belongs to.

## Reference: neo_colmado's whatsapp-service

The related project **neo_colmado** has a dedicated `whatsapp-service` (Node + Express + Firebase) that acts as an intermediate layer between Evolution and Firebase. It handles:
- Multi-number management per tenant
- Slug-based routing
- Message enrichment with user profiles
- Outbound queue via Firebase listeners

**Neo Farmacia deliberately does NOT have a separate whatsapp-service.** Instead, the Fastify API handles the webhook directly. The reasons:
- Fewer moving parts
- No Firebase (we use MongoDB + Redis)
- The API already has all the context (Odoo, MongoDB, Redis) in one process
- Lower latency — no extra HTTP hop

The trade-off is that the API is slightly bigger, but at this scale it's fine.

## Architecture

```
Customer (WhatsApp)
      │
      ▼
┌─────────────────────┐
│  Evolution API      │  (external, https://evo.onrpa.com)
│  - Baileys under    │
│    the hood         │
│  - Multi-instance   │
└──────┬──────────────┘
       │ POST /webhook/evolution
       ▼
┌─────────────────────┐
│  Fastify API        │
│  (webhook.handler)  │
│                     │
│  1. Idempotency     │  ← Redis
│  2. Debounce        │  ← Redis
│  3. Handover check  │  ← Redis
│  4. Mutex           │  ← Redis
│  5. Log to Mongo    │  ← MongoDB
│  6. Forward to n8n  │  ← n8n webhook
│  7. Re-check        │
│  8. Send reply      │  ← Evolution API
└─────────────────────┘
```

## Creating an instance

The dashboard (or an admin) creates a new Evolution instance via:

```
POST /api/v1/stores/:storeId/whatsapp/instances
Body: { "name": "farmacia_leo_principal" }
```

The API proxies to Evolution:
```
POST https://evo.onrpa.com/instance/create
Headers: { apikey: EVOLUTION_MASTER_KEY }
Body:    { instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true }
```

Evolution returns:
- `apikey` — a per-instance API key we'll use for sending messages later
- `qrcode.base64` — the QR to scan from the phone's WhatsApp

The user scans the QR from their phone. Evolution then notifies us via `/webhook/evolution` with connection events.

**TODO**: persist the per-instance apikey in MongoDB so we can send outbound messages. Currently the webhook handler has `TODO: get apiKey from store config` at the send-reply step.

## Webhook payload

Evolution sends events via POST. We care primarily about `messages.upsert`:

```json
{
  "event": "messages.upsert",
  "instance": "farmacia_leo_principal",
  "data": {
    "key": {
      "remoteJid": "18095550101@s.whatsapp.net",
      "fromMe": false,
      "id": "BAE5..."
    },
    "pushName": "María López",
    "message": {
      "conversation": "necesito paracetamol"
      // or extendedTextMessage.text, imageMessage.caption, etc.
    },
    "messageTimestamp": 1775848000,
    "messageType": "conversation"
  }
}
```

The `evolution.types.ts` module has helper functions:
- `extractText(data)` — handles conversation, extendedTextMessage, imageMessage caption, etc.
- `extractPhone(remoteJid)` — strips `@s.whatsapp.net`

## Webhook pipeline (step by step)

Defined in `packages/api/src/modules/webhook/webhook.handler.ts`.

### Step 0: Respond 200 OK immediately
Evolution API has a timeout. We must respond before starting any async work, otherwise Evolution retries and we get duplicate events.

```ts
reply.status(200).send({ ok: true });
```

The rest of the pipeline runs as a detached async continuation.

### Step 1: Filter events
Only process `messages.upsert` where `fromMe: false`. Ignore everything else (status updates, our own messages, etc.).

### Step 2: Idempotency check
```ts
if (await isDuplicate(redis, messageId)) return;
```
Redis key `idempotent:{messageId}` with 1-hour TTL. Prevents processing the same message twice if Evolution retries.

### Step 3: Log to MongoDB
Save the inbound message to the `messages` collection. Uses `insertOne` with `message_id` unique index — if the write fails with duplicate key error, we silently ignore (idempotent).

### Step 4: Debounce
Customers often send several short messages in a row:
```
Hola
Necesito
Paracetamol 500mg
```

If we forwarded each one to n8n separately, the AI agent would process three incomplete requests. Instead, we accumulate:

```ts
const accumulated = await debounceMessage(redis, storeId, chatId, text, 2000);
if (!accumulated) return;
```

The `debounceMessage` service uses a sliding 2-second window in Redis:
- First message → sets the key with text + starts timer, returns `null`
- Second message before timeout → appends text, resets timer, returns `null`
- After 2s of silence → returns the accumulated text to the last caller that set it

Only one call returns the full accumulated text. All earlier calls return `null` and exit.

### Step 5: Handover check (ingress)
```ts
if (!(await isBotActive(redis, storeId, chatId))) return;
```

Redis key `session:{store}:{chat}` stores `bot` or `manual`. If the pharmacist took over the conversation manually (via the dashboard), we don't forward to the AI bot.

### Step 6: Mutex
```ts
if (!(await acquireMutex(redis, storeId, chatId, 30000))) return;
```

`SETNX` lock on `mutex:{store}:{chat}` with a 30-second TTL. Prevents two parallel webhook executions from hitting n8n at the same time for the same chat.

### Step 7: Forward to n8n
```ts
await axios.post(N8N_WEBHOOK_URL, {
  text: accumulated,
  storeId, chatId, phone, pushName, instanceName,
  timestamp: Date.now(),
}, {
  timeout: 30000,
  headers: { 'X-API-Key': N8N_API_KEY },
});
```

n8n runs the 5-agent pipeline (Intention → Dialogue/Cart/Registration/Fallback) and returns a response text. See the upcoming Stage 4 docs for the n8n side.

### Step 8: Handover check (egress)
Between sending to n8n and getting a reply (could be 10+ seconds), the pharmacist might have clicked "modo manual" on the dashboard. Check again:
```ts
if (!(await isBotActive(redis, storeId, chatId))) return;
```

If manual now, we drop the bot's reply. The pharmacist will handle it.

### Step 9: Log outbound + send reply
```ts
await Message.create({ ..., sender: 'bot', direction: 'outbound' });
// TODO: sendText(instanceName, apiKey, remoteJid, replyText);
```

Currently only the log step is complete — the `sendText` call is TODO pending the apikey persistence work.

### Step 10: Release mutex
In the `finally` block so it always runs, even on errors.

## Evolution client

`packages/api/src/modules/evolution/evolution.client.ts` wraps the Evolution HTTP API:

| Function | Endpoint | Auth | Purpose |
|---|---|---|---|
| `sendText(instanceName, apiKey, number, text)` | `/message/sendText/:instance` | instance apikey | Send a text message |
| `sendTyping(instanceName, apiKey, jid)` | `/chat/updatePresence/:instance` | instance apikey | Typing indicator |
| `getConnectionState(instanceName, apiKey)` | `/instance/connectionState/:instance` | instance apikey | Is the number connected? |
| `fetchInstances()` | `/instance/fetchInstances` | master key | List all instances |
| `createInstance(name)` | `/instance/create` | master key | Create new instance + QR |
| `getInstanceQr(name)` | `/instance/connect/:name` | master key | Fetch current QR code |
| `deleteInstance(name)` | `/instance/delete/:name` | master key | Remove instance |
| `logoutInstance(name)` | `/instance/logout/:name` | master key | Log out without deleting |

`sendText` has 3 retries with exponential backoff (1s, 2s, 3s) — Evolution can occasionally hiccup.

## Environment variables

```
EVOLUTION_API_URL=https://evo.onrpa.com
EVOLUTION_MASTER_KEY=<master-key-from-evolution>
```

The master key is used for instance management (list/create/delete). For sending messages, each instance has its own apikey returned at creation time.

## Limitations and TODOs

### 1. Per-instance apikey not persisted
When `createInstance` returns the apikey, we don't save it anywhere. Need to:
- Add `whatsapp_instances` collection in MongoDB (store_id, instance_name, apikey, created_at)
- Update `createInstance` route to persist
- Update webhook handler to look up apikey when sending reply
- Update `sendText` calls to use the persisted apikey

### 2. Store resolution is naive
`resolveStoreId` just strips the `farmacia_` prefix. When a store has multiple instances, we need a proper mapping in MongoDB.

### 3. Handover is store-agnostic
Currently the manual mode toggle applies to `{storeId, chatId}`. If the same customer talks to two different stores (unlikely but possible), that works. But if a store has multiple numbers, the mode should be per-instance too.

### 4. No outbound queue
Neo colmado uses a Firebase queue to buffer outbound messages and retry failures. We send directly and rely on Evolution's retry logic. If Evolution is down, the reply is lost (only logged in MongoDB). For production, consider a simple Redis queue with retry worker.

### 5. Webhook authentication
`/webhook/evolution` is public. Anyone who knows the URL can POST fake messages. Options:
- Shared secret in a header (Evolution supports this)
- IP allowlist
- Signature verification

### 6. Media messages
Only text is handled right now. Images, audio, and documents are silently dropped in `extractText`. For voice notes, we'd want to download the audio, run speech-to-text, and forward the transcript to n8n.

## Differences vs neo_colmado's whatsapp-service

| Aspect | neo_colmado whatsapp-service | neo_farmacia Fastify API |
|---|---|---|
| **Process** | Separate Node service | Part of main API |
| **Storage** | Firebase Realtime DB | MongoDB + Redis |
| **Outbound** | Firebase queue + listener | Direct call (no queue yet) |
| **Multi-tenant routing** | Slug lookups in Firebase | Instance name prefix |
| **User enrichment** | 60s cache via lookupCache service | Inline `User.findOne` per message |
| **Instance management API** | Full CRUD endpoints with auth | Full CRUD endpoints with JWT |
| **Deployment** | Standalone container | Part of the api service |

The neo_colmado approach is more scalable (stateless webhook workers + queue), but the neo_farmacia approach is simpler and faster for a single-VPS deployment.
