"""FarmaciaAgent — voice agent with READ-ONLY tools against the Neo Farmacia API.

v1 policy (Stage 9 plan): the voice agent only clarifies and collects missing
info. It can SEARCH the catalog, but it must NOT mutate orders, confirm
purchases, give clinical/dosage advice, or confirm controlled substances —
those continue over WhatsApp text (n8n) / the pharmacist.
"""

import logging
from uuid import uuid4

import httpx
from livekit.agents import Agent, function_tool, RunContext

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
