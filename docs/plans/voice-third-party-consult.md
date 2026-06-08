# Consulta a terceros en llamada de voz (diseño)

**Estado**: diseñado (2026-06-07), pendiente de construir.
**Origen**: durante una llamada con el cliente, si hace falta, el agente debe
poder **poner al cliente en espera y llamar a un tercero** (el caso bandera: el
seguro, para aprobar un medicamento) y volver con la respuesta. Capacidad
central de la presentación a inversionistas.

## Concepto: el patrón "consultation hold" con un agente IA

Es el patrón clásico de telefonía —poner en espera, llamar a un tercero,
volver— pero el que conduce ambas piernas es el agente IA.

```
Cliente ⇄ Agente farmacia        (llamada en curso, LiveKit ya existente)
   │ "¿mi seguro cubre esta insulina?"
   │ Agente: "Permítame un momento, consulto con su seguro."
   │ ── CLIENTE EN ESPERA (música/aviso) ──
   │                          Agente ⇄ Seguro   (segunda pierna)
   │                             │ da afiliado, medicamento
   │                             │ navega IVR / habla con rep
   │                             │ obtiene: aprobado + n.º autorización + copago
   │ ── CLIENTE REGRESA ──
   │ Agente: "Su seguro aprobó la insulina, autorización 12345, copago RD$150."
```

Para el cliente: una sola llamada fluida en la que "su asistente se encarga de
hablar con el seguro". Ese es el wow.

## Encaja en tu stack actual

- El `FarmaciaAgent` (LiveKit Agents 1.3) ya expone herramientas con
  `@function_tool` (hoy `search_product`). Se añade una herramienta nueva que
  el LLM invoca cuando detecta que necesita aprobación:

  ```python
  @function_tool
  async def consultar_seguro(self, context, medicamento: str,
                             afiliado_id: str | None = None) -> str:
      """Pone al cliente en espera, llama al seguro y trae la aprobación."""
  ```

- La herramienta dispara la **segunda pierna** y la espera; mientras, el cliente
  queda en hold. El resultado vuelve como retorno de la herramienta → el agente
  lo verbaliza al cliente.

## Espectro de fidelidad (clave para el pitch)

La "segunda pierna" puede tener tres niveles. **No hace falta telefonía real
para demostrar el flujo completo** — esto es lo que de-riesga la presentación:

| Nivel | La "pierna seguro" es… | Telefonía | Para qué |
|---|---|---|---|
| **A — Mock** | un endpoint backend que devuelve aprobación tras un retraso realista | ninguna | fallback ultra-confiable; el cliente oye hold + resultado |
| **B — Agente IA (recomendado para el pitch)** | un SEGUNDO agente LiveKit con persona de "rep de seguro" en otra room; el agente farmacia conversa con él (audio agente-a-agente, WebRTC) | **ninguna** | conversación de dos piernas REAL, repetible en tarima, sin costo ni números |
| **C — Producción** | un número real vía **LiveKit SIP** + trunk (Twilio/Telnyx); el agente navega IVR con DTMF y habla con el rep | SIP trunk + número | cliente real |

**Recomendación**: construir el **Nivel B** para el pitch. Demuestra el flujo
de punta a punta —cliente en espera, agente negociando con "el seguro",
volviendo con autorización— de forma fiable, sin depender del árbol telefónico
impredecible de una aseguradora real en vivo. Pasar a Nivel C luego es un cambio
de la pierna seguro (SIP en vez de segundo agente), MISMA orquestación.

## Arquitectura (lógica, niveles B/C)

```
Room A: Cliente ⇄ Agente farmacia (sesión existente)
   │ tool consultar_seguro(...)
   ▼
Orquestador (backend) crea la pierna seguro:
   • Nivel B → spawnea "Agente Seguro" (persona rep) en Room B
   • Nivel C → LiveKit SIP marca el número del seguro dentro de Room B
   │
Agente farmacia conduce la pierna seguro (da datos, pregunta, extrae):
   → { aprobado: bool, autorizacion: str, copago: number, motivo?: str }
   │
Cliente sale de espera → el agente reporta el resultado.
```

Detalle de "espera": al entrar a la herramienta, se pausa el camino
STT/TTS hacia el cliente (opcional: reproducir audio de espera) y se reanuda al
volver. Mecanismo exacto del hold/bridge en LiveKit Agents 1.3 = **spike de 1
día** (dos opciones: dos rooms + orquestador, o misma room con ruteo de tracks;
el doc no las cierra a propósito hasta el spike).

## Datos que el agente necesita ANTES de llamar al seguro

La aprobación real exige datos estructurados; el agente debe tenerlos o
pedírselos al cliente primero:
- ID de afiliado / póliza (ARS en RD)
- Medicamento (nombre; idealmente código)
- Prescriptor / receta (según la ARS)

Sin esto, la llamada al seguro no avanza. La herramienta valida que los tenga;
si falta, el agente se los pide al cliente antes de poner en espera.

## Partes difíciles del mundo real (para responder al inversionista que sepa)

Honestidad para no quedar expuesto en el pitch (la lección de seguridad):

1. **IVR impredecible**: las líneas de seguro tienen árboles ("marque su
   número"), colas de espera y luego humanos. El agente necesita DTMF +
   paciencia + conversación robusta. Por eso el demo es Nivel B controlado.
2. **Aprobación / prior-auth real** es un proceso estructurado y a veces
   regulado (en EE.UU. NCPDP/portales/fax; en RD vía ARS por teléfono/portal).
   El agente telefónico resuelve MUCHOS casos (cobertura, copago, aprobaciones
   simples), no el 100% de los prior-auth complejos. Posicionar como "resuelve
   el bloqueo más común en la conversación", no "automatiza todo prior-auth".
3. **Cumplimiento / PHI**: llamar al seguro en nombre del paciente, grabar y
   manejar datos de salud es área sensible. En RD menos regulado que EE.UU.,
   pero hay que: consentimiento del cliente, minimización, y registro auditable.
   Encaja con `docs/architecture/security.md` (retención + audit log pendientes).
4. **Latencia y costo**: STT→LLM→TTS en DOS piernas; la pierna seguro dura
   minutos (cliente en espera). Nivel C añade costo de minutos PSTN por llamada.

## Posicionamiento para el pitch (defendible y potente)

> El agente no solo atiende: cuando topa un bloqueo —¿lo cubre el seguro?, ¿hay
> en bodega del proveedor?, ¿el médico confirma la receta?— **levanta el
> teléfono y lo resuelve por ti**, sin colgarle al cliente. La aprobación de
> medicamento con el seguro es el primer caso; la misma capacidad sirve para
> proveedores y prescriptores.

Encuadrarlo como **"consulta a terceros mid-llamada"** (no solo seguro) lo hace
más grande y más creíble a la vez.

## Qué hace falta para construir cada nivel

- **Nivel B (pitch)**: NADA extra de infra. Segundo persona de agente +
  orquestación + la herramienta + el hold. Todo sobre LiveKit que ya corre.
- **Nivel C (producción)**: SIP trunk + número (Twilio/Telnyx con cobertura
  RD/internacional), config LiveKit SIP, manejo de DTMF/IVR. Costo y setup
  reales.

## Registro / panel

La sub-llamada al seguro se transcribe y su resultado (aprobado/n.º
autorización/copago) se adjunta a la sesión de voz y al pedido, visible en el
panel — igual que el transcript de voz actual. Auditable.

## Fases sugeridas

1. **Spike (1 día)**: mecanismo de hold + segunda pierna en LiveKit Agents 1.3
   (decide dos-rooms vs ruteo de tracks).
2. **Nivel B**: herramienta `consultar_seguro` + persona "Agente Seguro" +
   orquestación + reporte de resultado + registro. Demo end-to-end para el pitch.
3. **Nivel C**: swap de la pierna seguro a LiveKit SIP + trunk; DTMF/IVR;
   datos estructurados del afiliado.

## Referencias
- Worker de voz: `packages/voice-agent/agent/main.py`,
  `farmacia_agent.py` (patrón `@function_tool`)
- Pipeline de voz construido: `docs/sessions/` (llamadas de voz, 2026-06-04)
- LiveKit SIP (producción): https://docs.livekit.io/sip/
- Cumplimiento: `docs/architecture/security.md`
