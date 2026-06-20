"""STT / LLM / TTS pipeline construction — shared by the customer agent
(main.py) and the mid-call consult negotiator (consult.py).

The worker builds the pipeline PER CALL from the per-pharmacy voice_config
(edited in the super-admin). No provider is hardcoded — same builders for both
legs so the insurance-consult leg gets the same streaming TTS + tuning as the
customer leg (DRY: one place to fix latency or add a provider).
"""

import logging
import os

from livekit.plugins import deepgram, openai

from agent.config import Config

logger = logging.getLogger("farmacia-voice-agent")

# Optional plugins — imported defensively so a missing extra never kills boot.
try:
    from livekit.plugins import anthropic as anthropic_llm
except Exception as _e:  # noqa: BLE001
    print(f"[agent.pipeline] anthropic plugin not available: {_e}", flush=True)
    anthropic_llm = None
try:
    from livekit.plugins import elevenlabs
except Exception as _e:  # noqa: BLE001
    print(f"[agent.pipeline] elevenlabs plugin not available: {_e}", flush=True)
    elevenlabs = None
try:
    from livekit.plugins import cartesia
except Exception as _e:  # noqa: BLE001
    print(f"[agent.pipeline] cartesia plugin not available: {_e}", flush=True)
    cartesia = None
try:
    from livekit.plugins import google as google_tts
except Exception as _e:  # noqa: BLE001
    print(f"[agent.pipeline] google TTS plugin not available: {_e}", flush=True)
    google_tts = None

# Ensure plugin env vars are set before any plugin init (plugins read these).
os.environ.setdefault("DEEPGRAM_API_KEY", Config.DEEPGRAM_API_KEY)
os.environ.setdefault("ELEVEN_API_KEY", Config.ELEVEN_API_KEY)
os.environ.setdefault("CARTESIA_API_KEY", Config.CARTESIA_API_KEY)
os.environ.setdefault("ANTHROPIC_API_KEY", Config.ANTHROPIC_API_KEY)

print(
    f"[agent.pipeline] Plugins | anthropic={'yes' if anthropic_llm else 'no'} | "
    f"elevenlabs={'yes' if elevenlabs else 'no'} | cartesia={'yes' if cartesia else 'no'} | "
    f"google={'yes' if google_tts else 'no'}",
    flush=True,
)

# Valid OpenAI TTS voices (plugin enum). A voice from another provider (e.g. a
# stray ElevenLabs id) would 400 the whole call, so build_tts coerces to a valid
# one when openai is the selected/fallback provider.
_OPENAI_TTS_VOICES = {
    "alloy", "ash", "ballad", "coral", "echo",
    "fable", "onyx", "nova", "sage", "shimmer",
}

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
    # Negotiator (mid-call consult) prompt. Admin-owned; the backend always
    # sends it. Empty here only as a fallback for tokens minted before the field
    # existed — consult.py degrades to a minimal instruction in that case.
    "consult_prompt_template": "",
}


def _clamped_float(value, default: float) -> float:
    """Parse a 0-1 float from config; fall back to default on garbage."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return default
    return min(1.0, max(0.0, v))


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
        # Cartesia (sonic) streams natively → low TTS TTFB, the production choice.
        # Pass language so sonic speaks Spanish; empty voice uses the plugin's
        # default voice id.
        return cartesia.TTS(voice=voice, language=lang) if voice else cartesia.TTS(language=lang)
    if provider == "google" and google_tts:
        return google_tts.TTS(voice_name=voice or "es-US-Studio-B", language="es-US")
    # Default/fallback: OpenAI TTS (plugin always installed). NOTE: openai TTS
    # does NOT stream → higher per-turn latency; prefer cartesia for prod calls.
    # Defensive: coerce a non-OpenAI voice id to a valid one so it never 400s.
    if voice and voice not in _OPENAI_TTS_VOICES:
        logger.warning(f"TTS openai: invalid voice {voice!r} → falling back to 'nova'")
        voice = ""
    return openai.TTS(model="tts-1", voice=voice or "nova")


def provider_availability() -> dict:
    """Which provider keys this worker has (booleans ONLY — never the secrets).
    The super-admin UI uses this to gray out unavailable providers in the
    per-pharmacy voice config dropdowns."""
    return {
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
