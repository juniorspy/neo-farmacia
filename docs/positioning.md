# Posicionamiento y narrativa (pitch)

**Propósito**: cómo contamos qué es Neo Farmacia — para inversionistas y para
la venta. La regla central: **no somos un chatbot**. Documento vivo
(2026-06-08).

---

## El problema de categoría: "chatbot con IA" nos mata

El mercado está **saturado** de chatbots con IA. Es una categoría commoditizada,
de baja percepción de valor, que nos encasilla como *feature* barata y nos baja
el múltiplo de valoración. Competir ahí es competir en precio contra mil
clones. **Cambiar el frame cambia cuánto valemos.**

## El reframe: vendemos la OPERACIÓN de ventas, no la conversación

Un chatbot **habla**. Nosotros **transaccionamos**.

> **Gancho (familiar, se entiende en 3 segundos):**
> *"Le instalamos a tu farmacia un call center con IA — todos los canales,
> inbound y outbound, más tu tienda online, en un clic."*

> **Categoría (la que sube la valoración):**
> *"El sistema operativo de ventas para farmacias."*

El gancho aterriza; la categoría captura el valor. El núcleo: la capa que
**toma pedidos en cada canal, los mete al sistema, los despacha, y hasta llama
por ti.** Resultado, no charla.

## Las 5 pruebas de que NO somos un chatbot (y ya están construidas)

1. **Transacciona, no conversa** — vende, toma el pedido, lo procesa en Odoo, lo
   despacha. Outcome, no diálogo.
2. **Omnicanal, un solo buzón** — WhatsApp + voz + web → la MISMA cola de
   pedidos. Un chatbot es un canal de habla; nosotros somos todos los canales de
   comercio.
3. **Outbound, no solo inbound** — llama de vuelta al cliente (perdidas, refills)
   Y llama a terceros (el seguro, para autorizar un medicamento mid-llamada).
   Los chatbots son pasivos. Outbound = capacidad de call center de verdad.
4. **Viene con la tienda** — ecommerce por farmacia incluido. Ningún chatbot te
   da un canal de venta.
5. **Un clic / minutos** — provisioning real por farmacia. La velocidad de
   instalación es producto; se vende.

## Por qué esto importa para el cheque

La **categoría define el múltiplo**:
- "Chatbot" = feature = valoración baja.
- "Plataforma de operaciones de comercio para farmacias" = empresa = valoración
  de categoría.

Los inversionistas pagan por *"el Shopify/Toast de las farmacias"*, no por
*"otro bot de WhatsApp"*. Estamos **creando la categoría**, no compitiendo en la
saturada.

## La demanda es real e inbound (el activo más fuerte)

No salimos a vender esto: **las farmacias vinieron a nosotros, desesperadas, y
dieron acceso a su sistema.** Eso es *demand pull* — mata la pregunta #1 del
inversionista ("¿alguien quiere esto?"). El dolor concreto:
- Clientes esperando **horas** una respuesta por WhatsApp.
- **Ventas perdidas** por no contestar a tiempo.
- Volúmenes de pedidos que un humano no puede seguir.
- "Me dieron acceso a su sistema" = confianza + profundidad de integración =
  foso que un competidor no consigue fácil.

**Pendiente (convierte la anécdota en evidencia, sube las odds de cheque):**
- Cuantificar: mensajes/día, tiempo de espera, RD$ de ventas perdidas/mes, #
  de farmacias que lo han pedido.
- 2-3 **cartas de compromiso de pago** ("pagaría RD$X/mes"). Una slide de
  *"4 lo piden, 3 comprometidas a pagar RD$X/mes"* levanta plata; *"están
  desesperadas"* solo levanta cejas.
- Una **frase textual del dolor** de un dueño + screenshot de WhatsApp con
  clientes esperando. La evidencia cruda convence más que la demo.

## El cold-open del pitch (no abrir con tecnología)

> *"Una farmacia me dio acceso a su sistema y me rogó que automatizara su
> WhatsApp. Pierden ventas todos los días porque un humano no puede con el
> volumen. No fui yo a venderles — ellos vinieron a mí."*

Después: el producto (la amplitud), el valor (~RD$60-90k/mes por farmacia), la
tracción, y el ask.

## Estructura de valor por farmacia

Jerarquía: **WhatsApp = núcleo** (resuelve el dolor agudo) → **voz =
diferenciador** (outbound, el momento mágico del seguro) → **tienda online =
canal extra del paquete** → **refill lock-in = futuro**. Valor estimado
~RD$60-90k/mes por farmacia (ver `ARQUITECTURA_MODELO_NEGOCIO.md`).

## Guardrails honestos (la lección de Leo)

Exagerar la **visión** está bien y se espera; el **núcleo** tiene que aguantar
cuando aprieten:
- *"Todos los canales", "un clic", "outbound", "tienda"* → casi todo real ya.
  El demo debe **MOSTRAR la amplitud** (buzón único, 3 canales, tienda, llamada
  saliente) para que el *"no es un chatbot"* sea **evidente**, no solo dicho.
- El **insurance-call**: véndelo como *"resuelve el bloqueo mid-conversación"*,
  NO como *"automatizo todo prior-auth"* (un inversionista que sepa de salud
  tumba lo segundo). Ver `docs/plans/voice-third-party-consult.md`.
- **PHI/seguridad**: ten lista la respuesta — `docs/architecture/security.md`.
- **Interés ≠ cheque**: el demo genera interés (alcanzable); el cheque lo decide
  la **tracción** (farmacias pagando). Entrar con "ya vende y aquí está cuánto"
  dispara las odds.

## Una línea para recordar

> Gánchalos con *"call center + tienda en un clic"*, posiciónate como *"el OS de
> ventas para farmacias"*, y demuestra la amplitud para que el frame de chatbot
> ni se les ocurra.

## Referencias
- Modelo de negocio y valor: `ARQUITECTURA_MODELO_NEGOCIO.md`
- Buzón omnicanal (tienda): `docs/sessions/2026-06-07-01.md`
- Momento mágico (seguro): `docs/plans/voice-third-party-consult.md`
- Seguridad (objeción IT/PHI): `docs/architecture/security.md`
