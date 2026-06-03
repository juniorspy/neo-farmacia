FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent/ ./agent/

# Download model files (Silero VAD + turn-detector ONNX) at build time
RUN python -m agent.main download-files

ENV PYTHONUNBUFFERED=1

# The worker connects OUTBOUND to LiveKit Cloud — no inbound port needed.
CMD ["python", "-m", "agent.main", "start"]
