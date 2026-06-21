# Planteamiento del problema: IA conversacional para operar una farmacia con naturalidad y **seguridad**

**Corte:** 2026-06-21
**Estado:** conceptual / diseño (💡) — todavía nada de esto está construido; es el marco
para decidir qué construir y dónde.
**Documento hermano:** `neo_colmado/PLANTEAMIENTO_PROBLEMA_MODELO_NEGOCIO_IA.md`
(mismo problema de "IA que opera como un humano experto", contexto colmado).
**Relacionado:** `docs/architecture/comparison-colmado.md`, `ARQUITECTURA_MODELO_NEGOCIO.md`.

## 1. Resumen

El objetivo es el mismo que en colmado: que la IA atienda por chat (y voz) como lo
haría un **operador humano experto** — rápida, con sentido común, sin confundir
productos, sin hablar de más, y sabiendo cuándo **no** responder. Pero al pasar de
colmado a farmacia el problema **cambia de naturaleza**, y eso reordena todo el
planteamiento original.

## 2. El reencuadre central: de "no contaminar inventario" a "no equivocar el medicamento"

| | Colmado | Farmacia |
|---|---|---|
| **Optimiza por** | velocidad + no aprender basura | velocidad + **seguridad** |
| **Costo de un error de producto** | plata, mala experiencia | **la salud del cliente** |
| **Inventario** | aprendido pregunta a pregunta (precio 0 → confirma) | **confiable** desde el día 1 (Odoo + catálogo) |
| **El problema duro** | aprender mal nombres/precios | **desambiguar sin equivocar** (dosis, forma, LASA, Rx) |

La tesis: en farmacia, el inventario confiable **elimina** la mitad "aprender
basura" del problema de colmado, pero **endurece** la otra mitad —la
desambiguación— y la convierte en un asunto de **seguridad del paciente**, no de
calidad de datos.

## 3. Los tres cubos (cómo se traduce el doc de colmado)

### 🟢 Cubo A — Transfiere casi 1:1 (lo conversacional)

Aplica idéntico; Farmacia ya tiene parte de la maquinaria.

- **Turno inteligente** (por intención, no por mensaje): Farmacia ya acumula
  ráfagas con el **debounce**. Falta la capa de decisión explícita: *"¿este
  mensaje cambia, confirma, pide, corrige o no necesita respuesta?"*
- **Silencio como acción válida**: "Gracias" tras el despacho → sin respuesta.
- **Estilo configurable sin tocar reglas**: ya separado (`agent_config` + regla
  "cero prompts hardcodeados"). Matiz heredado: *breve no es rudo*.
- **Decisión estructurada por mensaje** (`intención/acción/confianza/respuesta`):
  contrato de salida limpio para los agentes n8n, sobre el command layer idempotente.

### 🟡 Cubo B — Transfiere pero **se invierte y se endurece** (inventario / desambiguación)

- "Inventario aprendido" → en Farmacia el catálogo es **confiable**, así que el
  riesgo de "aprender `gatorai azul` como producto" casi desaparece. **Pero** el
  problema gemelo —la desambiguación— se vuelve crítico:
  - Unidades/cajas/presentaciones del colmado → en farma: **dosis** (500mg vs 1g),
    **forma** (tableta/jarabe/cápsula/suspensión), **empaque** (caja de 30 vs
    blíster de 10 vs unidad).
  - "Confusión entre tamaños parecidos" → en farma es **LASA**
    (*look-alike / sound-alike*): Losartán/Loratadina, Clonazepam/Clobazam.
    Confundirlos no pierde plata: hace daño.
- El **`campoIa` / `noConfundirCon`** del doc de colmado → en farmacia es **oro y
  se vuelve un campo de seguridad**.
- **Sinónimos desde datos reales**: Farmacia ya siembra genérico↔marca; el loop
  (frase → IA interpretó → farmacéutico corrigió → despachado) es válido, pero con
  **barra altísima**: nunca auto-aprender un mapeo de medicamento desde un
  despacho no confirmado.

### 🔴 Cubo C — Nuevo, porque es farmacia (no está en el doc de colmado)

- **Rx / controlados**: el control de confianza deja de ser solo calidad → **gate
  duro**. Un controlado/Rx **nunca** se agrega automático, sin importar la
  confianza; deriva al farmacéutico o pide la receta.
- **Frontera del consejo clínico**: "deme algo para la diarrea" roza el consejo
  clínico (responsabilidad legal). La IA debe **guiar a un producto sin recomendar
  dosis ni tratamiento**. Es la versión farmacéutica de "saber cuándo no
  responder": aquí es *saber cuándo NO aconsejar y derivar*. Ya existe en voz
  ("rechaza consejo clínico"); llevarlo a texto.
- **Historial = crónicos / refill**: "usar historial del cliente" en farma →
  *"¿tu Losartán de siempre?"*. Ya está en el post-MVP (recordatorios de refill).

## 4. Turno inteligente y silencio (ejemplos farmacia)

```
Cliente: Buenas, tienen acetaminofén?
Cliente: Mándame una caja
Bot:     Sí, acetaminofén 500mg caja de 24, RD$X. ¿Te la incluyo?
Cliente: Sí
Bot:     Anotado.
Cliente: Gracias
Bot:     (sin respuesta)
```

El silencio tras el cierre es comportamiento humano, no un error — **pero** la IA
nunca debe callar ante una pregunta real, una queja accionable o una instrucción
nueva (en farmacia, además: nunca callar ante una duda de seguridad).

## 5. Estilo configurable sin tocar reglas

El estilo (longitud, tono, formalidad) lo define la farmacia vía `agent_config`.
Lo que el estilo **NO** puede cambiar, en farmacia, se amplía respecto a colmado:

- precios, disponibilidad, confirmación de pedidos, reglas del carrito, flujo;
- **y además: seguridad** — manejo de Rx/controlados, la frontera del consejo
  clínico, y las reglas de desambiguación. Ninguna instrucción de estilo del dueño
  puede relajar estas.

## 6. Desambiguación segura del producto (la metadata clave)

Cada producto farmacéutico debería cargar metadata para que la IA desambigüe
**seguro** — la versión farma del "buen producto" del doc de colmado:

```json
{
  "nombre": "Losartán potásico 50mg",
  "forma": "tableta",
  "dosis": "50mg",
  "empaque": "caja de 30",
  "marca_generico": "generico",
  "sinonimos": ["losartan 50", "losartán de la presión"],
  "noConfundirCon": ["Loratadina 10mg", "Losartán 100mg"],
  "lasa": true,
  "rx": true,
  "controlado": false,
  "campoIa": "Antihipertensivo. Si el cliente dice 'mi pastilla de la presión' puede ser candidato, PERO Rx → no agregar directo; confirmar receta o derivar. No confundir con Loratadina (alergia)."
}
```

`campoIa` es nota **interna** (no se muestra al cliente), guía de razonamiento.
`noConfundirCon` + `lasa` son **features de seguridad**, no de calidad.

## 7. El modelo de confianza se convierte en modelo de seguridad

| Confianza | Colmado | Farmacia |
|---|---|---|
| Alta | agregar directo | agregar directo **— salvo Rx/controlado** |
| Media | agregar + flag | agregar + flag al farmacéutico |
| Baja | preguntar | preguntar (tamaño/dosis/presentación) |
| **Override (nuevo)** | — | **Rx / controlado / confundible LASA / síntoma→tratamiento → nunca auto; humano o aclarar** |

La diferencia clave: en colmado la confianza modula *velocidad*; en farmacia un
override de seguridad **gana siempre** sobre la confianza.

## 8. Decisión estructurada por mensaje (contrato)

Cada mensaje del cliente termina en una decisión estructurada que el command layer
materializa. Ejemplos farmacia:

```json
{ "intencion": "agregar_producto", "productoSolicitado": "acetaminofen caja",
  "productoNormalizado": "Acetaminofén 500mg caja de 24", "cantidad": 1,
  "confianzaProducto": 0.93, "rx": false, "accion": "agregar_al_pedido",
  "respuesta": "Anotado." }
```

```json
{ "intencion": "cortesia_post_cierre", "accion": "no_responder", "respuesta": null }
```

```json
{ "intencion": "producto_rx", "productoSolicitado": "amoxicilina 500",
  "rx": true, "accion": "derivar_farmaceutico",
  "respuesta": "La amoxicilina requiere receta. El farmacéutico la revisa contigo." }
```

```json
{ "intencion": "consejo_clinico", "texto": "algo para la diarrea",
  "accion": "guiar_sin_aconsejar",
  "respuesta": "Tenemos suero y antidiarreicos de venta libre. Para indicarte cuál, el farmacéutico te orienta." }
```

`no_responder`, `derivar_farmaceutico` y `guiar_sin_aconsejar` son **acciones de
primera clase** propias de farmacia.

## 9. Reparto de responsabilidad (quién construye qué)

| Concepto | Dónde vive | Dueño |
|---|---|---|
| Turno inteligente, silencio, estilo, gating conversacional | agentes **n8n** | user-owned ⚠️ |
| Contrato de decisión estructurada + `derivar`/`no_responder` | **command layer** (API) + salida n8n | nosotros + n8n |
| Metadata de desambiguación (`campoIa`, LASA, Rx, forma/dosis) | **modelo de producto** (Odoo y/o índice Meili) | nosotros |
| Gate de seguridad (Rx/controlado/clínico) | regla transversal — n8n **y** validación en API | nosotros (no negociable por estilo) |

Conceptualizar bien = decidir esta repartición antes de codear.

## 10. Lo que ya existe vs lo que falta diseñar

**Ya existe el hogar:** debounce (turno), handover (supervisión humana),
`agent_config` (estilo), sinónimos Meili (genérico↔marca), idempotencia de
comandos, voz read-only + no consejo clínico.

**Falta diseñar:**
1. El contrato de **decisión estructurada por mensaje** con `no_responder` /
   `derivar_farmaceutico` / `guiar_sin_aconsejar`.
2. La **metadata de desambiguación del producto** (dónde vive: ¿campo Odoo? ¿extra
   en el índice Meili? ¿colección aparte? — decisión abierta).
3. La **política de confidence-gating como gate de seguridad** (Rx/controlado/LASA/clínico).

## 11. La pregunta afilada (versión farmacia)

> ¿Cómo diseñamos un sistema que entienda intención, contexto, inventario,
> historial, confianza y estilo antes de decidir si responde, pregunta, agrega o
> calla — **y, antes de agregar, decide si es seguro hacerlo automáticamente o
> debe derivar al farmacéutico (Rx, controlado, confundible LASA, o síntoma que
> pide tratamiento)?**

## 12. Decisiones abiertas (próximos ejes a conceptualizar)

1. **Metadata de producto**: esquema final + dónde persiste + cómo se siembra
   (¿el catálogo maestro ya trae `campoIa`/LASA? ¿se cura aparte?).
2. **Contrato de decisión + silencio + confianza**: forma exacta del JSON, cómo lo
   emiten los agentes n8n y cómo lo valida/ejecuta el command layer.
3. **Gate de seguridad**: catálogo de reglas duras (qué clases de fármaco, qué
   dispara `derivar`, cómo se marca Rx/controlado en el dato).

## 13. Fuentes

- `neo_colmado/PLANTEAMIENTO_PROBLEMA_MODELO_NEGOCIO_IA.md` (planteamiento original).
- `docs/architecture/comparison-colmado.md` (por qué farmacia diverge).
- `ARQUITECTURA_MODELO_NEGOCIO.md` (estado real del sistema y los agentes n8n).
