"""Mid-call third-party consult (e.g. insurance approval).

Implements the "consultation hold" pattern on top of LiveKit SIP, grounded in
LiveKit's documented warm-transfer mechanics — but SIMPLER: the agent consults
the third party privately and returns to the customer; the customer and the
third party are NEVER connected to each other.

Flow:
  1. Put the customer on hold        → customer_session.input/output disabled
  2. Private consult room + token    → a fresh rtc.Room the customer can't hear
  3. Dial the third party via SIP     → create_sip_participant into that room
  4. A focused "negotiator" agent talks to the third party, extracts the
     decision via a structured tool, then ends.
  5. Take the customer off hold and return the result to the caller agent.

Requires the Telnyx trunk + LiveKit SIP (Config.sip_consult_enabled()). Until
that infra exists this module is never reached. PENDING LIVE TESTING against a
real trunk — the LiveKit SIP/agent API surface is verified from the docs but
the orchestration must be exercised end-to-end with a controlled number.

Refs: docs/plans/voice-third-party-consult.md
"""

import asyncio
import logging
from uuid import uuid4

from livekit import api, rtc
from livekit.agents import Agent, AgentSession, function_tool, RunContext
from livekit.plugins import deepgram, openai, silero
from livekit.protocol.sip import SIPOutboundConfig

from agent.config import Config

logger = logging.getLogger("farmacia-voice-agent")

# How long to let the third-party conversation run before giving up and
# returning the customer to the agent with a "no response" result.
CONSULT_TIMEOUT_S = 150


class _NegotiatorAgent(Agent):
    """Plays the pharmacy calling the third party. One job: get the decision and
    call registrar_resultado. The instructions stay in code (not admin-owned)
    because this is an internal operational call, not the customer persona."""

    def __init__(self, store_name: str, medicamento: str, afiliado_id: str,
                 done: asyncio.Event, result: dict):
        super().__init__(instructions=(
            f"Eres el asistente de {store_name or 'una farmacia'} y estas LLAMANDO a la "
            f"aseguradora del paciente para AUTORIZAR un medicamento. Hablas espanol, claro y breve.\n"
            f"Medicamento: {medicamento}.\n"
            f"Numero de afiliado: {afiliado_id or '(no provisto; pidelo si lo solicitan)'}.\n\n"
            "Saluda, di que llamas de la farmacia para autorizar ese medicamento, entrega el numero "
            "de afiliado si lo piden, y averigua: si esta cubierto, el numero de autorizacion y el copago. "
            "EN CUANTO tengas la decision, llama a la herramienta registrar_resultado con los datos y "
            "despidete. No te extiendas: tu unico objetivo es traer la respuesta."
        ))
        self._done = done
        self._result = result

    @function_tool
    async def registrar_resultado(
        self,
        context: RunContext,
        aprobado: bool,
        autorizacion: str = "",
        copago: float = 0.0,
        motivo: str = "",
    ) -> str:
        """Registra el resultado de la consulta al seguro y termina la llamada.

        Args:
            aprobado: true si el seguro autorizo el medicamento
            autorizacion: numero de autorizacion si lo dieron
            copago: monto del copago si aplica
            motivo: razon del rechazo si no fue aprobado
        """
        self._result.update(
            aprobado=aprobado,
            autorizacion=autorizacion,
            copago=copago,
            motivo=motivo,
        )
        self._done.set()
        return "Resultado registrado. Despidete y termina."


async def consult_insurance(
    *,
    job_ctx,
    customer_session,
    medicamento: str,
    afiliado_id: str,
    store_name: str,
) -> dict:
    """Run the full consult-hold cycle. Returns a structured result dict:
    { aprobado: bool|None, autorizacion, copago, motivo, timeout?, error? }.
    Always takes the customer off hold, even on failure."""
    # 1. Hold the customer — they hear nothing of the third-party call.
    customer_session.input.set_audio_enabled(False)
    customer_session.output.set_audio_enabled(False)

    result: dict = {}
    consult_room: rtc.Room | None = None
    nsession: AgentSession | None = None
    try:
        consult_room_name = f"consult-{job_ctx.room.name}-{uuid4().hex[:6]}"
        token = (
            api.AccessToken(Config.LIVEKIT_API_KEY, Config.LIVEKIT_API_SECRET)
            .with_identity("negotiator")
            .with_grants(api.VideoGrants(
                room_join=True,
                room=consult_room_name,
                can_publish=True,
                can_subscribe=True,
            ))
            .to_jwt()
        )
        consult_room = rtc.Room()
        await consult_room.connect(Config.LIVEKIT_URL, token)

        # 2. Dial the third party (controlled number for the demo) into the
        #    private consult room via the Telnyx trunk.
        await job_ctx.api.sip.create_sip_participant(api.CreateSIPParticipantRequest(
            trunk=SIPOutboundConfig(
                hostname=Config.SIP_TRUNK_HOSTNAME,
                auth_username=Config.SIP_AUTH_USERNAME,
                auth_password=Config.SIP_AUTH_PASSWORD,
            ),
            sip_number=Config.SIP_FROM_NUMBER,
            sip_call_to=Config.THIRD_PARTY_NUMBER,
            room_name=consult_room_name,
            participant_identity="Seguro",
            wait_until_answered=True,
        ))

        # 3. Negotiator drives the third-party conversation.
        done = asyncio.Event()
        negotiator = _NegotiatorAgent(store_name, medicamento, afiliado_id, done, result)
        nsession = AgentSession(
            stt=deepgram.STT(model="nova-3", language="es"),
            llm=openai.LLM(model="gpt-4o-mini", api_key=Config.OPENAI_API_KEY),
            tts=openai.TTS(model="tts-1", voice="nova"),
            vad=silero.VAD.load(),
        )
        await nsession.start(room=consult_room, agent=negotiator)
        await nsession.generate_reply()  # negotiator opens the call

        try:
            await asyncio.wait_for(done.wait(), timeout=CONSULT_TIMEOUT_S)
        except asyncio.TimeoutError:
            logger.warning("insurance consult timed out")
            result.setdefault("aprobado", None)
            result["timeout"] = True
    except Exception as e:  # noqa: BLE001 — never let a consult failure drop the customer
        logger.error(f"consult_insurance error: {type(e).__name__}: {e!r}")
        result["error"] = str(e)
    finally:
        if nsession is not None:
            try:
                await nsession.aclose()
            except Exception:
                pass
        if consult_room is not None:
            try:
                await consult_room.disconnect()
            except Exception:
                pass
        # 4. Off hold — the customer agent resumes.
        customer_session.input.set_audio_enabled(True)
        customer_session.output.set_audio_enabled(True)

    logger.info(f"consult result: {result}")
    return result


def summarize_for_customer(result: dict) -> str:
    """Turn the structured consult result into a short line the customer agent
    can speak. Kept here so the tool stays thin."""
    if result.get("error") or result.get("timeout"):
        return ("No logre una respuesta del seguro en este momento. "
                "Lo verificamos por WhatsApp y te confirmamos enseguida.")
    if result.get("aprobado") is True:
        auth = result.get("autorizacion")
        copago = result.get("copago")
        parts = ["Tu seguro aprobo el medicamento"]
        if auth:
            parts.append(f"autorizacion {auth}")
        if copago:
            parts.append(f"copago {copago:.0f} pesos")
        return ", ".join(parts) + "."
    if result.get("aprobado") is False:
        motivo = result.get("motivo")
        return ("Tu seguro no autorizo el medicamento"
                + (f": {motivo}" if motivo else "")
                + ". El farmaceutico te ofrece opciones por WhatsApp.")
    return "Consulte con tu seguro; te confirmamos el resultado por WhatsApp."
