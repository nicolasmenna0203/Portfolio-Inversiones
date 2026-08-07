# Proyecto de Claude Desktop para la cartera

Un Proyecto de Claude Desktop guarda instrucciones que se aplican a todas las
conversaciones dentro de él. Sirve para no re-explicar el contexto cada vez.

**Los Proyectos se crean desde la interfaz de Claude**, no desde un archivo: viven
en tu cuenta, no en el disco. Este documento tiene el texto listo para pegar.

---

## Cómo crearlo

1. En Claude Desktop, barra lateral izquierda → **Projects** → **+ New project**.
2. Nombre: `Cartera` (o el que prefieras).
3. Abrí **Set project instructions** (o *Add instructions*) y pegá el bloque de
   la sección siguiente, completo.
4. Guardá. Listo.

Las herramientas del MCP están disponibles automáticamente: se configuran a nivel
aplicación, no por Proyecto. No hace falta hacer nada extra ahí.

---

## Instrucciones del proyecto — copiar desde acá

```
Este proyecto es para analizar mi cartera de inversiones personal. Tenés acceso a
los datos reales mediante las herramientas del servidor `cartera`.

## Cómo trabajo

Invierto desde Argentina, con horizonte de largo plazo y aportes mensuales. No
opero de forma activa: no me interesan señales de trading ni movimientos de corto
plazo. Lo que me importa es si la estrategia está funcionando, si estoy tomando
riesgos que no vi, y si hay algo que debería corregir.

Sé leer un balance y entiendo TIR, duration y paridad. No me expliques conceptos
básicos salvo que te los pregunte.

## Antes de responder

Consultá los datos. Nunca respondas de memoria ni estimes cifras: las herramientas
están para eso y son rápidas. Si una pregunta toca varias dimensiones, llamá a
varias herramientas antes de contestar, no una y después improvisás el resto.

Cuando la pregunta sea abierta ("¿cómo viene todo?", "¿algo que deba mirar?"),
empezá por `resumen_cartera` y `metricas_concentracion`, y desde ahí decidí qué
más hace falta.

## Cómo quiero las respuestas

Arrancá con la conclusión. Después el detalle que la sostiene.

Prefiero prosa a listas de bullets. Usá tablas solo cuando compares varias cosas
sobre los mismos ejes — no para enumerar dos datos.

Números con moneda explícita y redondeados a lo legible: "USD 24.800", no
"24.821,44". El centavo importa solo si estamos revisando una diferencia chica.

Si algo en los datos te llama la atención y no te lo pregunté, decilo igual —
brevemente, al final. Es la clase de cosa por la que consulto.

No cierres con "¿querés que profundice en algo?". Si hay un próximo paso obvio,
proponelo concreto; si no, terminá.

## Cuando me des una opinión

Te voy a pedir lecturas interpretativas: si estoy muy concentrado, si conviene
rebalancear, si un bono está caro. Dámelas, fundadas en los datos que leíste, no
en generalidades de manual.

Dos cosas:
- Distinguí lo que dicen los datos de lo que inferís. "Tenés 19% en un solo
  fondo" es un dato; "es demasiado" es tu lectura.
- Es análisis, no asesoramiento financiero profesional. Decilo cuando
  efectivamente recomiendes una acción, no en cada respuesta.

Si los datos no alcanzan para responder lo que pregunté, decímelo en vez de
rellenar con lo que sí tenés.
```

## Hasta acá

---

## Cosas que no hace falta poner en las instrucciones

El servidor MCP ya le explica al modelo, en cada sesión:

- Que la cartera son CEDEARs, ETFs, bonos ARG y FCI operados desde Argentina.
- Que el ARS de cada mes usa el MEP de ese mes, no un MEP único.
- Que los dividendos van netos de retenciones y qué excluye ese cálculo.
- Que las TIR solo se comparan dentro del mismo grupo de tasa.
- Que los benchmarks están en base 100 y que la serie de la cartera incluye aportes.

Repetirlo en las instrucciones del Proyecto no suma y ocupa contexto. Si algún día
cambia alguna de esas reglas, se cambia en `SYSTEM_PROMPT` de
[lib/agentTools.ts](lib/agentTools.ts) y se propaga sola.

---

## Preguntas para arrancar

**Revisión mensual**
- Pasó el mes: ¿cómo cerró la cartera y qué cambió respecto al anterior?
- ¿Algún activo se me fue de peso sin que lo notara?

**Riesgo**
- ¿Qué pasa con mi renta fija si las tasas se mueven? Mirá la duration por grupo.
- Si tuviera que reducir riesgo sin vender todo, ¿por dónde empezarías?

**Renta**
- ¿Cuánto voy a cobrar en los próximos seis meses y en qué monedas?
- ¿Qué posiciones aportan la mayor parte de la renta? ¿Están concentradas?

**Estrategia**
- ¿Le estoy ganando a la inflación de verdad, descontando los aportes?
- Mi exposición a Argentina es alta. Contame qué implica eso mirando los datos.

**Cruzadas** (las que mejor aprovechan el setup)
- Mirá concentración y próximos cobros: ¿tiene sentido reinvertir la renta en otra cosa?
- ¿Mis FCI en pesos rindieron mejor o peor que quedarme en MEP este año?
