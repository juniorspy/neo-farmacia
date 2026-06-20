"""Neo Farmacia Voice Agent — LiveKit entrypoint.

Multi-tenant: the backend (Fastify) mints a LiveKit token whose
participant.metadata carries the full per-call context:

{
  "session_id": "...", "store_id": "farmacia_x", "store_name": "Farmacia X",
  "chat_id": "whatsapp:+1809...", "reason": "...",
  "voice_config": { enabled, language, stt_provider, stt_model,
                    llm_provider, llm_model, tts_provider, tts_voice, greeting },
  "instructions": "<system prompt built by the backend — never start cold>"
}

voice_config is the per-pharmacy selection edited in the super-admin — the
worker builds STT/LLM/TTS PER CALL from it (no hardcoded provider). The
builders live in agent/pipeline.py (shared with the consult negotiator).
"""

import json
import logging
import sys

import httpx

print(f"[agent.main] Starting... Python {sys.version}", flush=True)

from livekit import agents
from livekit.agents import (
    AgentServer,
    AgentSession,
    MetricsCollectedEvent,
    RoomInputOptions,
    metrics,
)
from livekit.plugins import silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from agent.config import Config
from agent.farmacia_agent import FarmaciaAgent, FarmaciaAPI
from agent.pipeline import (
    DEFAULT_VOICE_CONFIG,
    build_llm,
    build_stt,
    build_tts,
    provider_availability,
)

logger = logging.getLogger("farmacia-voice-agent")
logger.setLevel(logging.INFO)

print(f"[agent.main] Imports OK | LIVEKIT_URL={Config.LIVEKIT_URL[:30]}...", flush=True)


def parse_call_context(participant) -> dict:
    """Extract the per-call context the backend embedded in the token metadata."""
    ctx: dict = {}
    raw = participant.metadata or ""
    if raw:
        try:
            ctx = json.loads(raw)
        except json.JSONDecodeError:
            logger.warning(f"Invalid metadata JSON: {raw[:200]}")

    vc = {**DEFAULT_VOICE_CONFIG, **(ctx.get("voice_config") or {})}
    return {
        "session_id": ctx.get("session_id", ""),
        "store_id": ctx.get("store_id", ""),
        "store_name": ctx.get("store_name", "la farmacia"),
        "chat_id": ctx.get("chat_id", ""),
        "reason": ctx.get("reason", ""),
        "voice_config": vc,
        # The fully-rendered prompt comes from the backend (admin-owned template
        # + per-call context). NO prompt text lives in this worker.
        "instructions": ctx.get("instructions", ""),
    }


server = AgentServer()


@server.rtc_session()
async def handle_session(ctx: agents.JobContext):
    await ctx.connect()
    participant = await ctx.wait_for_participant()
    call = parse_call_context(participant)

    logger.info(
        f"Call connected: {participant.identity} | store={call['store_id']} "
        f"session={call['session_id']} | tts={call['voice_config']['tts_provider']} "
        f"llm={call['voice_config']['llm_provider']}"
    )

    api = FarmaciaAPI(
        Config.FARMACIA_API_URL,
        Config.COMMAND_BEARER,
        store_id=call["store_id"],
        chat_id=call["chat_id"],
    )
    assistant = FarmaciaAgent(store=call, api=api)

    vc = call["voice_config"]
    session = AgentSession(
        stt=build_stt(vc),
        llm=build_llm(vc),
        tts=build_tts(vc),
        vad=silero.VAD.load(),
        turn_detection=MultilingualModel(),
        # Latency tuning (verified for livekit-agents 1.3.12): speculate the LLM
        # reply before the end-of-turn is confirmed, and shorten the silence the
        # agent waits before taking its turn. The big win is streaming TTS
        # (cartesia) selected per-store in voice_config — see agent/pipeline.py.
        preemptive_generation=True,
        min_endpointing_delay=0.3,
    )

    # Phase G: accumulate the conversation; flush to the backend at call end
    # so the transcript lands on the session + the dashboard chat history.
    transcript: list[dict] = []

    @session.on("conversation_item_added")
    def _on_item(ev):
        item = getattr(ev, "item", None)
        role = getattr(item, "role", "") or ""
        text = (getattr(item, "text_content", None) or "").strip()
        if text and role in ("user", "assistant"):
            transcript.append(
                {"role": "customer" if role == "user" else "agent", "text": text[:1000]}
            )

    # Log latency metrics (EOU delay / LLM TTFT / TTS TTFB) so the streaming +
    # tuning win is measurable in the worker logs, before/after.
    @session.on("metrics_collected")
    def _on_metrics(ev: MetricsCollectedEvent):
        metrics.log_metrics(ev.metrics)

    async def _flush_transcript():
        if not transcript or not call["session_id"]:
            return
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(
                    f"{Config.FARMACIA_API_URL.rstrip('/')}/api/v1/voice-calls/{call['session_id']}/transcript",
                    json={"entries": transcript, "final": True},
                    headers={"Authorization": f"Bearer {Config.COMMAND_BEARER}"},
                )
                resp.raise_for_status()
            logger.info(f"Transcript flushed: {len(transcript)} entries session={call['session_id']}")
        except Exception as e:
            logger.warning(f"Transcript flush failed (non-fatal): {e}")

    ctx.add_shutdown_callback(_flush_transcript)

    await session.start(
        room=ctx.room,
        agent=assistant,
        room_input_options=RoomInputOptions(text_enabled=True),
    )

    # First utterance. If the super-admin set a greeting instruction
    # (voice_config.greeting), use it verbatim; otherwise the agent opens
    # guided purely by the admin-owned system prompt. No hardcoded text here.
    greeting = (vc.get("greeting") or "").strip()
    if greeting:
        await session.generate_reply(instructions=greeting)
    else:
        await session.generate_reply()


def report_provider_availability() -> None:
    """Tell the backend which provider keys this worker has (booleans ONLY —
    never the secrets). The super-admin UI uses this to gray out unavailable
    providers in the per-pharmacy voice config dropdowns."""
    availability = provider_availability()
    try:
        httpx.post(
            f"{Config.FARMACIA_API_URL.rstrip('/')}/api/v1/voice-providers/report",
            json=availability,
            headers={"Authorization": f"Bearer {Config.COMMAND_BEARER}"},
            timeout=5.0,
        ).raise_for_status()
        print(f"[agent.main] Provider availability reported: {availability}", flush=True)
    except Exception as e:
        print(f"[agent.main] Provider availability report failed (non-fatal): {e}", flush=True)


if __name__ == "__main__":
    print("[agent.main] Launching LiveKit agent worker...", flush=True)
    # Only on a real `start` — never during the Docker-build `download-files` run.
    if "start" in sys.argv:
        report_provider_availability()
    agents.cli.run_app(server)
