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
    # LiveKit reaches the trunk in one of two documented ways (docs.livekit.io/sip):
    #   Mode 1 (recommended): a pre-created LiveKit outbound trunk, referenced by
    #     id → set SIP_TRUNK_ID (e.g. ST_xxxx). The trunk already holds the
    #     provider address + auth + from-number.
    #   Mode 2 (inline): pass the Telnyx creds per call → SIP_TRUNK_HOSTNAME +
    #     SIP_AUTH_USERNAME/PASSWORD + SIP_FROM_NUMBER.
    # consult.py uses Mode 1 when SIP_TRUNK_ID is set, otherwise Mode 2.
    # Full setup: docs/plans/voice-third-party-consult.md
    SIP_TRUNK_ID = os.getenv("SIP_TRUNK_ID", "")  # LiveKit outbound trunk id, e.g. ST_xxxx
    SIP_TRUNK_HOSTNAME = os.getenv("SIP_TRUNK_HOSTNAME", "")  # inline mode, e.g. sip.telnyx.com
    SIP_AUTH_USERNAME = os.getenv("SIP_AUTH_USERNAME", "")
    SIP_AUTH_PASSWORD = os.getenv("SIP_AUTH_PASSWORD", "")
    SIP_FROM_NUMBER = os.getenv("SIP_FROM_NUMBER", "")  # your Telnyx DID, E.164 (inline mode)
    # For the pitch demo: the number you control that plays "insurance"
    # (a softphone/IVR you answer). Production: the real insurer line.
    THIRD_PARTY_NUMBER = os.getenv("THIRD_PARTY_NUMBER", "")

    @classmethod
    def sip_consult_enabled(cls) -> bool:
        """True only when we can actually place the outbound call: a destination
        number AND a way to reach the trunk — a LiveKit outbound trunk id
        (Mode 1) or inline trunk creds + from-number (Mode 2). Keeps the consult
        tool inert in environments without telephony."""
        has_trunk = bool(cls.SIP_TRUNK_ID) or bool(cls.SIP_TRUNK_HOSTNAME and cls.SIP_FROM_NUMBER)
        return bool(has_trunk and cls.THIRD_PARTY_NUMBER)
