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

## Mecanismo verificado (spike resuelto, 2026-06-07)

LiveKit ya documenta exactamente este patrón ("agent-assisted warm transfer").
Adoptamos su mecánica pero MÁS simple: el agente consulta al tercero en privado
y vuelve al cliente — NO se conecta cliente↔seguro (saltamos el
`move_participant` final del warm transfer).

- **Hold del cliente** (nativo, simple):
  ```python
  customer_session.input.set_audio_enabled(False)
  customer_session.output.set_audio_enabled(False)
  ```
- **Sala de consulta privada**: un `rtc.Room()` nuevo con su token; el cliente
  no oye nada de esa room.
- **Marcar al tercero** vía SIP a esa room. LiveKit soporta DOS modos
  (verificado contra `docs.livekit.io/sip`); el worker usa Modo 1 si
  `SIP_TRUNK_ID` está seteado, si no cae al Modo 2 inline:
  ```python
  # Modo 1 (recomendado): trunk outbound pre-creado en LiveKit (ST_…)
  api.CreateSIPParticipantRequest(
      sip_trunk_id=SIP_TRUNK_ID, sip_call_to=THIRD_PARTY_NUMBER,
      room_name=consult_room_name, participant_identity="Seguro",
      wait_until_answered=True)
  # Modo 2 (inline): credenciales Telnyx por llamada
  api.CreateSIPParticipantRequest(
      trunk=SIPOutboundConfig(hostname=..., auth_username=..., auth_password=...),
      sip_number=SIP_FROM_NUMBER, sip_call_to=THIRD_PARTY_NUMBER,
      room_name=consult_room_name, participant_identity="Seguro",
      wait_until_answered=True)
  ```
- **Negociador**: un segundo `AgentSession` en la sala de consulta con una
  persona enfocada. Su prompt es **admin-owned** —
  `Store.voice_config.consult_prompt_template`, editable en el panel igual que
  el del agente principal; el worker lo renderiza por consulta con
  `{store_name} {medicamento} {afiliado_id}` (cero texto hardcodeado en el
  worker, regla del proyecto). Tiene una herramienta `registrar_resultado(aprobado,
  autorizacion, copago, motivo)` que captura la decisión y termina.
- **Volver**: off-hold y el resultado se devuelve al agente del cliente.

Implementado (scaffold, **pendiente de prueba en vivo con el trunk**):
- `packages/voice-agent/agent/consult.py` — `consult_insurance()` +
  `_NegotiatorAgent` + `summarize_for_customer()`. Marca al tercero por **Modo 1
  (`SIP_TRUNK_ID`) o Modo 2 (inline)** según lo que esté configurado.
- `agent/farmacia_agent.py` — herramienta `consultar_seguro` (gateada por
  `Config.sip_consult_enabled()`; inerte sin trunk).
- `agent/config.py` + `.env.example` — vars SIP (`SIP_TRUNK_ID` o el set inline).

> El prompt por-farmacia decide CUÁNDO usar la herramienta (p.ej. "si preguntan
> por cobertura del seguro, usa consultar_seguro"). Sin esa línea en el prompt,
> la herramienta existe pero el agente no la invoca — opt-in por farmacia.

## Checklist de setup (Telnyx + LiveKit SIP)

Lo que TÚ debes provisionar antes de probar (es el gate real):

1. **Telnyx**: crear cuenta → Voice → SIP Trunking → crear un trunk con auth
   por **usuario/contraseña** (Credentials) → comprar un número (DID) →
   habilitar **outbound**. Anotar: signaling address (`sip.telnyx.com`),
   usuario, contraseña, y el número en E.164.
2. **LiveKit**: dashboard → Telephony → SIP trunks → Create → JSON editor →
   dirección **Outbound**, apuntando al `sip.telnyx.com` con esas credenciales.
   (O `CreateSIPOutboundTrunk` por API.)
3. **Número "seguro" controlado** para el demo: un softphone (Zoiper/Linphone)
   o tu celular que conteste haciendo de aseguradora — `THIRD_PARTY_NUMBER`.
4. **Env del voice-agent** (Dokploy). Modo 1 (recomendado, si el trunk se creó
   en LiveKit): `SIP_TRUNK_ID` + `THIRD_PARTY_NUMBER`. Modo 2 (inline, solo
   Telnyx): `SIP_TRUNK_HOSTNAME`, `SIP_AUTH_USERNAME`, `SIP_AUTH_PASSWORD`,
   `SIP_FROM_NUMBER` + `THIRD_PARTY_NUMBER`.
5. **Telnyx**: habilitar SIP REFER en el trunk solo si luego quieres transferir
   de verdad (no hace falta para este patrón de consulta-y-vuelve).

Guías: LiveKit SIP outbound trunk (`docs.livekit.io/sip/trunk-outbound/`) y la
guía oficial Telnyx↔LiveKit.

## Estado de provisioning (verificado por API Telnyx, 2026-06-08)

Datos no-secretos del trunk real (la `SIP_AUTH_PASSWORD` vive solo en Dokploy):

- **Telnyx trunk** `Neo_farmacia` (credential connection) — activo; user SIP
  `juniorjh16`; signaling `sip.telnyx.com`.
- **DID** `+16465409450` (US) → `SIP_FROM_NUMBER`.
- **Outbound voice profile** `neo-farmacia` — enabled, `service_plan=global`,
  `max_destination_rate=$20/min`, atado al trunk.
- **Modo elegido**: **2 (inline)** — el worker marca con las credenciales
  Telnyx; NO hace falta crear un trunk en LiveKit. (`SIP_TRUNK_ID` queda como
  alternativa si algún día se crea uno.)
- ⚠️ **Whitelist de destinos = `US, CA, MX, PM`** → República Dominicana
  (`DO`, los +1809/829/849) **NO está**. Añadir `DO` al perfil antes de llamar
  a números de RD (seguro/clientes reales). Demo a número US funciona sin esto.
- ⛔ **Balance = $0** al momento del registro → gate: fondear antes de la
  primera llamada PSTN.

## Prueba en vivo (2026-06-08) — telefonía OK, latencia/UX por resolver

Primera prueba e2e contra el trunk real (ver `docs/sessions/2026-06-08-01.md`):

- ✅ **SIP outbound FUNCIONA**: el agente decidió llamar (`consultar_seguro` es
  function-tool del LLM, no hardcodeado), el **número US sonó y fue contestado**.
  Telnyx→LiveKit→SIP probado en vivo.
- ✅ Prompt del negociador ya es **admin-owned** (`voice_config.consult_prompt_template`).
- ❌ **El consult no regresó al cliente**: probable timeout 150s (negociador no
  captó `registrar_resultado`) + test solo (no se puede ser cliente y aseguradora
  a la vez). Falta confirmar con `consult result:` de logs (timeout vs off-hold).
- ❌ **UX de hold**: silencio total hasta 150s, sin aviso.
- 🔴 **Latencia descomunal por turno**: TTS OpenAI `streamed:false` (sintetiza la
  frase completa antes de hablar) + endpointing + posible CPU del VPS.
- 🐛 **Footgun de voz**: un `tts_voice` inválido (id de ElevenLabs en provider
  openai) tumba la llamada con 400 — falta fallback defensivo en `build_tts`.

## Fases

1. ✅ **Spike** — mecanismo verificado (arriba).
2. ✅ **Scaffold + telefonía e2e** — el SIP marca y conecta en vivo (2026-06-08).
3. ⏳ **Pulido producción** (lo que sigue, priorizado):
   - ✅ **Latencia (código, 2026-06-20)**: builders movidos a `agent/pipeline.py`
     (compartidos cliente+negociador, DRY); el negociador ya NO usa `tts-1`
     hardcodeado → stremea con la misma config del store. `AgentSession` con
     `preemptive_generation=True` + `min_endpointing_delay=0.3` en ambas piernas.
     Handler `metrics_collected` para medir EOU/LLM TTFT/TTS TTFB. `build_tts`
     defensivo (voz openai inválida → `nova`). **Falta medir en vivo** + setear
     `CARTESIA_API_KEY` y `tts_provider=cartesia` en el store. Migración a
     **LiveKit Inference** queda como limpieza posterior (no baja latencia sola).
   - **UX hold**: anuncio antes de mutear (`session.say`), `CONSULT_TIMEOUT_S` 150→~45s,
     verificar off-hold restaura audio.
   - **Registro de la sub-llamada** (transcript del seguro) en el panel; datos
     estructurados del afiliado; DTMF/IVR real; grabación (Egress) opcional.
   - Añadir **`DO`** al whitelist Telnyx si se llaman números de RD.

## Referencias
- Worker de voz: `packages/voice-agent/agent/main.py`,
  `farmacia_agent.py` (patrón `@function_tool`)
- Pipeline de voz construido: `docs/sessions/` (llamadas de voz, 2026-06-04)
- LiveKit SIP (producción): https://docs.livekit.io/sip/
- Cumplimiento: `docs/architecture/security.md`
