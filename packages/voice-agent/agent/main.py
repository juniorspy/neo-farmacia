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
worker builds STT/LLM/TTS PER CALL from it (no hardcoded provider).
"""

import json
import logging
import os
import sys

import httpx

print(f"[agent.main] Starting... Python {sys.version}", flush=True)

from livekit import agents
from livekit.agents import AgentSession, AgentServer, RoomInputOptions
from livekit.plugins import deepgram, openai, silero

# Optional plugins — imported defensively so a missing extra never kills boot.
try:
    from livekit.plugins import anthropic as anthropic_llm
except Exception as _e:
    print(f"[agent.main] anthropic plugin not available: {_e}", flush=True)
    anthropic_llm = None
try:
    from livekit.plugins import elevenlabs
except Exception as _e:
    print(f"[agent.main] elevenlabs plugin not available: {_e}", flush=True)
    elevenlabs = None
try:
    from livekit.plugins import cartesia
except Exception as _e:
    print(f"[agent.main] cartesia plugin not available: {_e}", flush=True)
    cartesia = None
try:
    from livekit.plugins import google as google_tts
except Exception as _e:
    print(f"[agent.main] google TTS plugin not available: {_e}", flush=True)
    google_tts = None
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from agent.config import Config
from agent.farmacia_agent import FarmaciaAgent, FarmaciaAPI

logger = logging.getLogger("farmacia-voice-agent")
logger.setLevel(logging.INFO)

# Ensure plugin env vars are set before plugin init
os.environ.setdefault("DEEPGRAM_API_KEY", Config.DEEPGRAM_API_KEY)
os.environ.setdefault("ELEVEN_API_KEY", Config.ELEVEN_API_KEY)
os.environ.setdefault("CARTESIA_API_KEY", Config.CARTESIA_API_KEY)
os.environ.setdefault("ANTHROPIC_API_KEY", Config.ANTHROPIC_API_KEY)

print(
    f"[agent.main] Imports OK | LIVEKIT_URL={Config.LIVEKIT_URL[:30]}... | "
    f"anthropic={'yes' if anthropic_llm else 'no'} | elevenlabs={'yes' if elevenlabs else 'no'} | "
    f"cartesia={'yes' if cartesia else 'no'} | google={'yes' if google_tts else 'no'}",
    flush=True,
)

DEFAULT_VOICE_CONFIG = {
    "language": "es",
    "stt_provider": "deepgram",
    "stt_model": "nova-3",
    "llm_provider": "openai",
    "llm_model": "gpt-4o-mini",
    "tts_provider": "openai",
    "tts_voice": "nova",
    "tts_stability": 0.5,
    "tts_style": 0.2,
    "greeting": "",
}


def _clamped_float(value, default: float) -> float:
    """Parse a 0-1 float from config; fall back to default on garbage."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    return min(1.0, max(0.0, v))


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


def build_stt(vc: dict):
    # Only deepgram in v1 (enum enforced by the super-admin endpoint).
    return deepgram.STT(
        model=vc.get("stt_model") or "nova-3",
        language=vc.get("language") or "es",
        punctuate=True,
        interim_results=True,
    )


def build_llm(vc: dict):
    provider = (vc.get("llm_provider") or "openai").lower()
    model = vc.get("llm_model") or "gpt-4o-mini"
    if provider == "anthropic" and anthropic_llm and Config.ANTHROPIC_API_KEY:
        logger.info(f"LLM: anthropic {model}")
        return anthropic_llm.LLM(model=model)
    logger.info(f"LLM: openai {model if provider == 'openai' else 'gpt-4o-mini (fallback)'}")
    return openai.LLM(
        model=model if provider == "openai" else "gpt-4o-mini",
        api_key=Config.OPENAI_API_KEY,
    )


def build_tts(vc: dict):
    provider = (vc.get("tts_provider") or "openai").lower()
    voice = vc.get("tts_voice") or ""
    lang = vc.get("language") or "es"
    logger.info(f"TTS: {provider} voice={voice or '(default)'}")

    if provider == "elevenlabs" and elevenlabs and Config.ELEVEN_API_KEY:
        # Expressiveness knobs come from the per-store voice_config (super-admin):
        # stability low = expressive/variable, high = consistent/flat;
        # style = energy. Tunable per pharmacy without redeploying.
        stability = _clamped_float(vc.get("tts_stability"), 0.5)
        style = _clamped_float(vc.get("tts_style"), 0.2)
        logger.info(f"TTS elevenlabs settings: stability={stability} style={style}")
        return elevenlabs.TTS(
            voice_id=voice,
            model="eleven_turbo_v2_5",
            language=lang,
            voice_settings=elevenlabs.VoiceSettings(
                stability=stability,
                similarity_boost=0.8,
                style=style,
                use_speaker_boost=True,
            ),
        )
    if provider == "cartesia" and cartesia and Config.CARTESIA_API_KEY:
        return cartesia.TTS(voice=voice) if voice else cartesia.TTS()
    if provider == "google" and google_tts:
        return google_tts.TTS(voice_name=voice or "es-US-Studio-B", language="es-US")
    # Default: OpenAI TTS (openai plugin is always installed)
    return openai.TTS(model="tts-1", voice=voice or "nova")


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
    )

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
    availability = {
        "stt": {"deepgram": bool(Config.DEEPGRAM_API_KEY)},
        "llm": {
            "openai": bool(Config.OPENAI_API_KEY),
            "anthropic": bool(anthropic_llm and Config.ANTHROPIC_API_KEY),
        },
        "tts": {
            "openai": bool(Config.OPENAI_API_KEY),
            "elevenlabs": bool(elevenlabs and Config.ELEVEN_API_KEY),
            "cartesia": bool(cartesia and Config.CARTESIA_API_KEY),
            "google": bool(google_tts and os.getenv("GOOGLE_APPLICATION_CREDENTIALS")),
        },
    }
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
