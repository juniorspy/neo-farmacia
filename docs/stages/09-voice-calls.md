# Stage 9 — AI-initiated Voice Calls (LiveKit pipeline)

Status: `in progress` — Phases 1-4 + A-D **built and pushed** (`0adcd16`, `6c446a5`, `41dafe3`).
Pending: LiveKit creds + Dokploy voice-agent env (user), E (real context), F (n8n trigger), G (hardening).
Owner: platform
Created: 2026-06-03 · **v3 — LiveKit pipeline + per-pharmacy voice_config (2026-06-03)**

> Lineage:
> - **v1** (Claude) initial plan.
> - **v2** (Claude + Codex) hardened: signed-link, atomic state machine, chat∈store,
>   idempotency, no-Firebase, OpenAI Realtime (speech-to-speech) for voice.
> - **v3**: voice transport pivots to a **LiveKit pipeline** (Deepgram STT → LLM → TTS),
>   modeled on the **proven `neo_colmado/WebRtc` agent**, but keeping all v2 robustness and
>   making the providers **configurable per-pharmacy in the super-admin** (not env-hardcoded).
>   Reference (mechanics only, no shared code): `C:\Users\junio\...\neo_colmado\WebRtc`.

## Why v3 (LiveKit pipeline instead of OpenAI Realtime)

The user already runs a working voice agent in neo_colmado on **LiveKit Agents** with a
pluggable TTS. OpenAI Realtime (speech-to-speech) has good plumbing but its **voice quality
didn't convince** — and the best voices (ElevenLabs/Cartesia/Sesame) are **TTS**, which means
a **pipeline** (STT → LLM → TTS), not speech-to-speech. A pipeline also lets us use **Claude**
as the brain. So v3 adopts the colmado pipeline mechanics and layers our robustness on top.

## What we KEEP from Phases 1-4 (already built, provider-agnostic)
- `voice_call_sessions` model + **atomic guarded transitions** + Redis one-active lock + missed-ring sweep.
- **One-time signed invite link** (hashed token, TTL, single-use) + public `/call/:id` page (ring/answer/reject).
- `POST /api/v1/voice-calls` (n8n bearer): **chat∈store validation**, idempotency `{store_id, idempotency_key}`, one-active guard, returns the signed link.
- No Firebase → tools hit our `/api/v1/commands` → Odoo. Tenant isolation by `store_id`.

## What v3 PIVOTS (the voice leg)
- `GET /:id/token`: stop minting an OpenAI client secret → mint a **LiveKit access token** whose `participant.metadata` carries the assembled context + the store's `voice_config`.
- `/call/:id` frontend: replace browser-WebRTC-to-OpenAI with the **LiveKit JS SDK** (join the room).
- `openai-realtime.ts` → superseded by `livekit-token.ts`.
- **New: a Python LiveKit agent worker** (adapted from `neo_colmado/WebRtc/agent`): Deepgram STT + configurable LLM + configurable TTS, tools → our command router, reads `voice_config` + context from metadata.

---

## 1. Architecture (v3)

```
            ┌─────────────┐  {action:"start_voice_call", summary, missing_fields, corr_id}
WhatsApp ◀─▶│  n8n agent  │──────────────────────────────────────────────┐
   ▲        └─────────────┘  (decision/orchestration ONLY)                 │
   │ sends signed link                                                     ▼
   │                                                       ┌────────────────────────────┐
   │                                                       │   Backend API (Fastify)     │
   └────────────────────────────────────────────────────  │  session + security +       │
                                                           │  context assembly +         │
                                                           │  mints LiveKit token        │
                                                           └──────┬───────────┬──────────┘
              customer opens /call/:id?t=…                         │           │ reads Store.voice_config,
                              │                                    │           │ messages, Odoo order
                    ┌─────────▼──────────┐  LiveKit token          ▼           ▼
                    │ /call/:id (LiveKit │  (metadata = ctx +   ┌────────────────────────────┐
                    │  JS SDK) joins room│   voice_config)      │ Mongo / Redis / Odoo        │
                    └─────────┬──────────┘                      └────────────────────────────┘
                              │ audio ⇄ LiveKit room
                              ▼
                 ┌──────────────────────────────────────────────────────────┐
                 │  Python LiveKit Agent Worker (joins the room)             │
                 │   Deepgram STT → LLM (OpenAI/Claude) → TTS (ElevenLabs/…) │
                 │   reads voice_config + context from participant.metadata  │
                 │   tools → POST /api/v1/commands (pedido.*, catalogo.search)│
                 └──────────────────────────────────────────────────────────┘
       ✱ Audio flows browser ⇄ LiveKit ⇄ agent worker. n8n never touches audio.
       ✱ Provider API keys live on the worker/server, never in the browser.
```

### Ownership
| Component | Owns |
|---|---|
| **n8n** | Decision + summary + correlation id; sends the signed link. No audio/DB. |
| **Backend API** | Session lifecycle, security (signed link, chat∈store, ownership), context assembly, **LiveKit token minting with `voice_config` + context in metadata**, rate limits, tenant isolation. |
| **Frontend `/call/:id`** | Ring/answer/reject + **LiveKit JS SDK** (join room, mic, play agent audio). Only ever gets a scoped LiveKit token. |
| **LiveKit** | Media transport (room). LiveKit Cloud (reuse the colmado project or a new one) or self-host. |
| **Python agent worker** | The pipeline: Deepgram STT + configurable LLM + configurable TTS; reads `voice_config`+context from metadata; tools call our command router. Read-only/clarification-only in v1. |
| **MongoDB** | `voice_call_sessions`, `messages`, `users`, **`Store.voice_config`**. No Firebase. |
| **Redis** | Ring TTL, one-active lock, rate limits. |
| **Odoo** | Order/stock for context + command tools (scoped, read-only in v1). |

---

## 2. Per-pharmacy voice config (the transparent super-admin piece)

Instead of neo_colmado's global env (`TTS_PROVIDER`, `OPENAI_TTS_VOICE`, …), the config lives
**on the Store** and is edited by the **super-admin** (platform role), per pharmacy:

```ts
Store.voice_config = {
  enabled: boolean,        // is voice calling on for this pharmacy
  language: string,        // 'es'
  stt_provider: string,    // 'deepgram'
  stt_model: string,       // 'nova-3'
  llm_provider: string,    // 'openai' | 'anthropic'  ← Claude vs OpenAI = a toggle, not a fork
  llm_model: string,       // 'gpt-4o-mini' | 'claude-...'
  tts_provider: string,    // 'openai' | 'elevenlabs' | 'cartesia' | 'google'
  tts_voice: string,       // voice id / name
  greeting: string,        // optional custom greeting
}
```

Flow: **super-admin edits `voice_config`** → backend `GET /:id/token` reads it →
**embeds it in the LiveKit token metadata** → the agent worker's `build_stt/build_llm/build_tts`
read it **per call**. No env edits, no redeploy, per-pharmacy. Global env values act only as the
**default** when a store hasn't overridden them. API keys stay server-side (env), never per-store.

Endpoints (scoped via `resolveStore`):
- `GET /api/v1/stores/:storeId` → now also returns `voice_config`.
- `PATCH /api/v1/stores/:storeId/voice-config` → **super-admin (role=admin) only**; validates provider enums; invalidates resolver cache.

---

## 3. Database — `voice_call_sessions` (unchanged from v2) + `Store.voice_config` (new)

`voice_call_sessions`: as built in Phase 1 (status machine `ringing → connecting → active →
ended` + `rejected/missed/failed/expired`, atomic transitions, one-time token fields,
`{store_id, idempotency_key}` unique, `last_state_at`). `provider_session_id` now holds the
LiveKit room name. Add `Store.voice_config` (see §2).

---

## 4. API contract (v3)

| Method | Path | Caller | Auth | Change vs v2 |
|---|---|---|---|---|
| POST | `/api/v1/voice-calls` | n8n | Bearer | unchanged |
| GET | `/api/v1/voice-calls/:id?t=` | call page | link token | unchanged |
| POST | `/api/v1/voice-calls/:id/answer?t=` | call page | link token | unchanged |
| POST | `/api/v1/voice-calls/:id/reject?t=` | call page | link token | unchanged |
| POST | `/api/v1/voice-calls/:id/end` | call page | link token | unchanged |
| GET | `/api/v1/voice-calls/:id/token?t=` | call page | link token | **mints a LiveKit token** (room + metadata) instead of an OpenAI client secret |
| GET | `/api/v1/stores/:storeId` | dashboard/admin | JWT + scope | now returns `voice_config` |
| PATCH | `/api/v1/stores/:storeId/voice-config` | super-admin | JWT + role=admin | **new** |

LiveKit token metadata (JSON) = `{ store_id, chat_id, store_name, voice_config, context:{summary, recent_messages, current_order, missing_fields, customer_profile}, agent_instructions }`.

---

## 5. n8n — unchanged (decision + send link). 6. Frontend state machine — unchanged, except `connecting`/`active` are driven by LiveKit room connection events instead of an RTCPeerConnection.

## 7. Context injection — same assembler (Phase 6); the output goes into the **LiveKit token metadata** + the agent's system prompt, instead of OpenAI session `instructions`. Read-only/clarification-only, refuses clinical advice, no Odoo mutation from voice.

## 8. Security — all v2 controls hold. LiveKit token is short-lived, scoped to one room, carries only this call's context. Provider API keys never leave the worker/server. CORS allowlist for the call endpoints. No raw context endpoint in v1.

## 9. Failure modes — v2 list holds; "voice agent unavailable" now means LiveKit/worker/provider down → `failed(provider_unavailable)` → text fallback. Add: agent worker not registered / room join timeout.

---

## 10. Phases (v3, revised)

| Phase | Deliverable | Status |
|---|---|---|
| 1. Session model | atomic transitions, indexes, Redis lock, sweep | ✅ done |
| 2. Signed-link + `/call/:id` shell | one-time token, ring/answer/reject | ✅ done |
| 3. (was OpenAI WebRTC POC) | superseded by v3 | ↩︎ pivoted |
| 4. n8n create endpoint | bearer, chat∈store, idempotency, returns link | ✅ done |
| **A. `Store.voice_config` + super-admin config** | model field + `PATCH /voice-config` (admin) + super-admin UI + **"apply to all"** | ✅ done (`6c446a5`) |
| **B. LiveKit token** | `GET /:id/token` mints LiveKit token (metadata = ctx + voice_config, gated by `enabled`); env LIVEKIT_* | ✅ done (`41dafe3`) |
| **C. `/call/:id` → LiveKit SDK** | join room, mic, play agent audio | ✅ done (`41dafe3`) |
| **D. Python agent worker** | `packages/voice-agent/`: Deepgram + configurable LLM/TTS per call; read-only `search_product` tool → command router | ✅ done (`41dafe3`) |
| **E. Real context assembler** | messages (Mongo) + order (Odoo) + customer + n8n summary → metadata.instructions | ◀ **next** |
| **F. n8n trigger** | decision → create → send link | next |
| **G. Hardening** | watchdog, transcripts, missed-call, human takeover, observability | later |

> First e2e voice test is blocked only on infra: LiveKit Cloud creds in the `api` env +
> the Dokploy `voice-agent` service env (see §11). Everything else is deployed.

---

## 11. Checklist (v3 delta)
- [x] `Store.voice_config` field + defaults; `PATCH /voice-config` (super-admin only); GET returns it.
- [x] Super-admin UI to view/edit each pharmacy's voice_config (provider/voice/llm) + "apply to all".
- [x] `livekit-token.ts` mint + `GET /:id/token` returns `{ token, url, room }`.
- [x] `/call/:id` connects via LiveKit JS SDK.
- [x] Python agent worker (`packages/voice-agent/`, own Dockerfile): pipeline + metadata read + read-only command-router tool.
- [ ] **env (USER)**: `LIVEKIT_URL/API_KEY/API_SECRET` on `api` + voice-agent; `DEEPGRAM_API_KEY`, `OPENAI_API_KEY` (+ optional ANTHROPIC/ELEVEN/CARTESIA), `FARMACIA_API_URL`, `COMMAND_BEARER` on the voice-agent service.
- [ ] First e2e voice call (enable voice_config → create via bearer → open link → answer → agent speaks).
- [ ] Phase E: context assembler → metadata + system prompt.
- [ ] Phase F: n8n trigger sends link.

## Constraints honored
- n8n decision-only, no audio. Backend owns session + security + token minting.
- Frontend gets only a scoped LiveKit token; provider keys stay server-side.
- Voice agent read-only/clarification-only in v1; no Odoo mutation from voice.
- No Firebase. Tenant-scoped by `store_id`. Per-pharmacy config in super-admin, not env.
