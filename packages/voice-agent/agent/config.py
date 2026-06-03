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
