import os
from dotenv import load_dotenv

load_dotenv()


class Config:
    # LiveKit (dedicated farmacia project)
    LIVEKIT_URL = os.getenv("LIVEKIT_URL", "")
    LIVEKIT_API_KEY = os.getenv("LIVEKIT_API_KEY", "")
    LIVEKIT_API_SECRET = os.getenv("LIVEKIT_API_SECRET", "")

    # STT — plugin reads DEEPGRAM_API_KEY automatically
    DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")

    # LLM providers — which one a call uses comes from Store.voice_config
    OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

    # TTS providers
    ELEVEN_API_KEY = os.getenv("ELEVEN_API_KEY", os.getenv("ELEVENLABS_API_KEY", ""))
    CARTESIA_API_KEY = os.getenv("CARTESIA_API_KEY", "")

    # Neo Farmacia API (command-router tools). COMMAND_BEARER = N8N_API_KEY value.
    FARMACIA_API_URL = os.getenv("FARMACIA_API_URL", "https://api.leofarmacia.com")
    COMMAND_BEARER = os.getenv("COMMAND_BEARER", "")

    # ── Outbound SIP for mid-call third-party consult (e.g. insurance) ──
    # Telnyx trunk credentials (LiveKit SIP dials through it). See
    # docs/plans/voice-third-party-consult.md for the full setup checklist.
    SIP_TRUNK_HOSTNAME = os.getenv("SIP_TRUNK_HOSTNAME", "")  # e.g. sip.telnyx.com
    SIP_AUTH_USERNAME = os.getenv("SIP_AUTH_USERNAME", "")
    SIP_AUTH_PASSWORD = os.getenv("SIP_AUTH_PASSWORD", "")
    SIP_FROM_NUMBER = os.getenv("SIP_FROM_NUMBER", "")  # your Telnyx DID, E.164
    # For the pitch demo: the number you control that plays "insurance"
    # (a softphone/IVR you answer). Production: the real insurer line.
    THIRD_PARTY_NUMBER = os.getenv("THIRD_PARTY_NUMBER", "")

    @classmethod
    def sip_consult_enabled(cls) -> bool:
        """True only when the outbound SIP trunk + a destination are configured.
        Keeps the consult tool inert in environments without telephony."""
        return bool(cls.SIP_TRUNK_HOSTNAME and cls.SIP_FROM_NUMBER and cls.THIRD_PARTY_NUMBER)
