"""FarmaciaAgent — voice agent with READ-ONLY tools against the Neo Farmacia API.

v1 policy (Stage 9 plan): the voice agent only clarifies and collects missing
info. It can SEARCH the catalog, but it must NOT mutate orders, confirm
purchases, give clinical/dosage advice, or confirm controlled substances —
those continue over WhatsApp text (n8n) / the pharmacist.
"""

import logging
from uuid import uuid4

import httpx
from livekit.agents import Agent, function_tool, RunContext, get_job_context

from agent.config import Config

logger = logging.getLogger("farmacia-voice-agent")


class FarmaciaAPI:
    """Thin client for the Neo Farmacia command router (POST /api/v1/commands)."""

    def __init__(self, base_url: str, bearer: str, store_id: str, chat_id: str):
        self._base = base_url.rstrip("/")
        self._store_id = store_id
        self._chat_id = chat_id
        self._client = httpx.AsyncClient(
            timeout=10.0,
            headers={"Authorization": f"Bearer {bearer}"},
        )

    async def command(self, command: str, payload: dict) -> dict:
        body = {
            "command": command,
            "commandId": f"voice_{uuid4().hex}",
            "storeId": self._store_id,
            "chatId": self._chat_id,
            "payload": payload,
        }
        resp = await self._client.post(f"{self._base}/api/v1/commands", json=body)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise RuntimeError(data.get("error", "command failed"))
        return data.get("result", {})

    async def close(self) -> None:
        await self._client.aclose()


class FarmaciaAgent(Agent):
    """Voice agent for a pharmacy. Instructions come pre-built from the backend
    (LiveKit token metadata) so the agent never starts cold."""

    def __init__(self, store: dict, api: FarmaciaAPI):
        super().__init__(instructions=store["instructions"])
        self.store = store
        self.api = api

    # ── Product search (READ-ONLY) ──────────────────────────

    @function_tool
    async def search_product(self, context: RunContext, query: str) -> str:
        """Buscar productos en el catalogo de la farmacia.
        Usa esto para confirmar nombre, precio y disponibilidad de un producto
        que el cliente mencione. NO modifica el pedido.

        Args:
            query: nombre o descripcion del producto a buscar
        """
        try:
            result = await self.api.command("catalogo.search", {"q": query, "limit": 5})
        except Exception as e:
            logger.error(f"search_product error: {type(e).__name__}: {e!r}")
            return "Hubo un problema buscando el producto. Sigue con los demas datos."

        items = result.get("items", [])
        if not items:
            return "No encontre ese producto en el catalogo. Pide que lo confirmen por WhatsApp."

        lines = []
        for item in items:
            nombre = item.get("nombre", "?")
            try:
                precio = float(item.get("precio", 0) or 0)
            except (TypeError, ValueError):
                precio = 0.0
            stock = item.get("stock", None)
            stock_str = f" | stock: {stock}" if stock is not None else ""
            lines.append(f"- {nombre}: {precio:.0f} pesos{stock_str}")

        return "Productos encontrados:\n" + "\n".join(lines)

    # ── Mid-call third-party consult (e.g. insurance approval) ──────────
    # Only effective when the outbound SIP trunk is configured; otherwise it
    # returns a graceful fallback so the conversation never stalls. The
    # per-pharmacy prompt decides WHEN to use it (e.g. "si preguntan por
    # cobertura del seguro, usa consultar_seguro").

    @function_tool
    async def consultar_seguro(
        self,
        context: RunContext,
        medicamento: str,
        afiliado_id: str = "",
    ) -> str:
        """Pone al cliente en espera, llama a su seguro y vuelve con la respuesta
        sobre si un medicamento esta cubierto (autorizacion y copago).

        Usa esto SOLO cuando el cliente pregunte si su seguro cubre un
        medicamento y haga falta confirmarlo con la aseguradora. Antes de
        llamar, asegurate de tener el numero de afiliado.

        Args:
            medicamento: nombre del medicamento a autorizar
            afiliado_id: numero de afiliado/poliza del cliente
        """
        if not Config.sip_consult_enabled():
            return ("Ahora mismo no puedo llamar al seguro. Dile al cliente que el "
                    "farmaceutico confirma la cobertura por WhatsApp.")
        if not afiliado_id:
            return "Necesito el numero de afiliado del cliente antes de llamar al seguro. Pideselo."

        # Lazy import so the telephony deps/paths only load when actually used.
        from agent.consult import consult_insurance, summarize_for_customer

        try:
            result = await consult_insurance(
                job_ctx=get_job_context(),
                customer_session=context.session,
                medicamento=medicamento,
                afiliado_id=afiliado_id,
                store_name=self.store.get("store_name", ""),
                # Admin-owned negotiator prompt (voice_config). No prompt text
                # lives in this worker — the backend sends the template.
                prompt_template=(self.store.get("voice_config") or {}).get(
                    "consult_prompt_template", ""
                ),
                # Build the negotiator pipeline from the same per-store config →
                # streaming TTS + tuning on the insurance leg too.
                voice_config=self.store.get("voice_config") or {},
            )
        except Exception as e:
            logger.error(f"consultar_seguro error: {type(e).__name__}: {e!r}")
            return ("No pude completar la consulta con el seguro. Dile al cliente que lo "
                    "confirmamos por WhatsApp.")

        return summarize_for_customer(result)
