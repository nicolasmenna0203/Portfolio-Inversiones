# MCP server de la cartera

Expone los datos de la cartera como herramientas para Claude Desktop y Claude Code,
para poder preguntar en lenguaje natural sobre tenencias, evolución y concentración.

**No consume tokens de API.** El razonamiento lo hace el Claude que ya estás pagando
con tu suscripción; este proceso solo lee el Google Sheet y devuelve JSON.

## Herramientas

### Cartera (leen el Google Sheet)

| Herramienta | Devuelve |
|---|---|
| `resumen_cartera` | KPIs: total USD/ARS, aportes, rendimiento, TIR, cantidad de activos |
| `listar_tenencias` | Todas las posiciones de un mes con peso y atributos |
| `distribucion` | Agrupado por tipo, riesgo, geografía, renta o moneda |
| `evolucion_mensual` | Serie mensual + mejor y peor mes (acepta rango) |
| `historico_ticker` | Evolución de una posición puntual mes a mes |
| `metricas_concentracion` | Top 1/3/5, índice HHI y posiciones ordenadas por peso |

Los meses se piden en formato `YYYY-MM` (ej. `2026-07`). Si se omite, se usa el último disponible.

### Mercado (consultan fuentes externas)

| Herramienta | Devuelve | Fuente |
|---|---|---|
| `calendario_cobros` | Dividendos, cupones y amortizaciones próximas con monto neto estimado, más el yield de cada posición | Yahoo, Nasdaq, bonistas.com |
| `renta_fija_bonos` | TIR, TNA, duration, paridad y vencimiento de los bonos en cartera, con ponderados por grupo de tasa | bonistas.com |
| `renta_fija_fci` | VCP y rendimientos (día/mes/año/12m) de los FCI de Cocos | Planilla CAFCI |
| `renta_variable_acciones` | Precio, variaciones, P/E, market cap, 52 semanas y dividend yield | Yahoo Finance |
| `comparar_benchmarks` | Cartera vs. S&P 500, inflación, MEP, Bitcoin y oro (índice base 100) | Varias |

Los tickers **no se pasan como parámetro**: se derivan de la cartera con el mismo criterio
que usa el dashboard ([tickersElegibles.ts](lib/tickersElegibles.ts)).

Estas herramientas tardan entre 0,6 y 3 segundos la primera vez. Después salen del cache
(15 minutos), así que un análisis largo no vuelve a esperar.

## Sutilezas que el modelo conoce

Las descripciones de las herramientas y el system prompt le advierten al modelo sobre
cuatro cosas que, si se ignoran, producen respuestas equivocadas:

1. **Los dividendos van netos** (30% de retención de origen + 0,6% de impuesto al cheque =
   factor 0,694). No descuentan la comisión del depositario, así que el neto real puede ser
   1-2% menor. Los bonos ARG van al 100%.
2. **El yield publicado es bruto, el cobro estimado es neto.** Son inconsistentes a
   propósito: el yield así se compara con cualquier screener.
3. **Las TIR de bonos solo se comparan dentro del mismo grupo** (USD, CER, ARS_TASA,
   DOLLAR_LINKED, BOPREAL). Cruzar grupos no significa nada.
4. **En `comparar_benchmarks`, la serie de la cartera incluye aportes nuevos.** No es
   rendimiento puro: la cartera "creció" mucho más que cualquier benchmark simplemente
   porque le fuiste agregando plata. Para rendimiento real, `resumen_cartera`.

## Probarlo localmente

```bash
npm run mcp
```

Debería imprimir `[cartera-mcp] Server activo por stdio.` y quedarse esperando.
Se corta con Ctrl+C. Por sí solo no hace nada: necesita un cliente MCP conectado.

## Conectarlo a Claude Desktop

**Ya está configurado.** El bloque se agregó a `%APPDATA%\Claude\claude_desktop_config.json`
conservando las preferencias que ya tenía el archivo. Solo falta **reiniciar Claude Desktop
por completo** (cerralo desde la bandeja del sistema, no solo la ventana) y las 11
herramientas de `cartera` aparecen en el ícono de herramientas del cuadro de texto.

Configuración aplicada, por si hay que rehacerla:

```json
{
  "mcpServers": {
    "cartera": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": [
        "C:\\Users\\nicol\\OneDrive\\Desktop\\PRUEBA AGENTE CLAUDE\\node_modules\\tsx\\dist\\cli.mjs",
        "C:\\Users\\nicol\\OneDrive\\Desktop\\PRUEBA AGENTE CLAUDE\\mcp\\server.ts"
      ]
    }
  }
}
```

Dos decisiones a tener en cuenta si algún día lo tocás:

- **Se invoca `node.exe` con la ruta absoluta al cli de `tsx`**, en vez de `npx tsx`. Claude
  Desktop no hereda el PATH del shell, así que `npx` puede no resolver y el server no arranca.
- **Las barras invertidas van dobladas**: es JSON, `\` es carácter de escape.

> El archivo original quedó respaldado como
> `claude_desktop_config.backup-AAAAMMDD-HHMMSS.json` en la misma carpeta.

## Proyecto de Claude Desktop

Para no re-explicar el contexto en cada conversación, conviene crear un Proyecto con
instrucciones propias. El texto listo para pegar está en
[PROYECTO-CLAUDE.md](PROYECTO-CLAUDE.md).

Las herramientas del MCP funcionan igual dentro o fuera de un Proyecto — se configuran
a nivel aplicación. El Proyecto solo agrega las instrucciones.

## Conectarlo a Claude Code

Desde la raíz del proyecto:

```bash
claude mcp add cartera -- npx tsx ./mcp/server.ts
```

## Ejemplos de preguntas

**Cartera**
- ¿Cómo viene la cartera este mes?
- ¿Cuáles son mis cinco posiciones más grandes y cuánto pesan juntas?
- ¿Estoy muy concentrado? ¿Qué debería mirar?
- ¿Cómo evolucionó SPY desde que lo compré?
- ¿Qué mes fue el peor y qué pasó con la cartera ese mes?

**Mercado**
- ¿Cuánto voy a cobrar de renta en los próximos seis meses?
- ¿Qué bonos tengo con más duration y qué riesgo implica?
- ¿Cómo vienen mis acciones este año? ¿Alguna cerca de su máximo de 52 semanas?
- ¿Le estoy ganando a la inflación?
- Entre mis FCI y mis bonos CER, ¿qué rindió mejor?

**Cruzadas** (varias herramientas en una respuesta)
- Mirá mi concentración y mis próximos cobros: ¿tiene sentido reinvertir la renta en algo distinto?
- Compará el rendimiento de mi renta fija contra lo que hubiera dado quedarme en MEP.

## Credenciales

El server lee `.env` de la raíz del proyecto. Necesita `SPREADSHEET_ID` y
`GOOGLE_SERVICE_ACCOUNT_JSON`, las mismas que usa el dashboard. Si falta
`SPREADSHEET_ID`, sale con un error explícito en vez de arrancar roto.

## Si algo falla

El server escribe sus logs a **stderr** (stdout es el canal del protocolo MCP).
Claude Desktop los guarda en `%APPDATA%\Claude\logs\`.

| Síntoma | Causa habitual |
|---|---|
| Las herramientas no aparecen | Claude Desktop no se reinició del todo, o el path del JSON está mal |
| `Falta SPREADSHEET_ID` | El `.env` no está en la raíz del proyecto |
| Error de Google al llamar una herramienta | `GOOGLE_SERVICE_ACCOUNT_JSON` vencido o sin permiso sobre el Sheet |

## Nota sobre los datos

Las herramientas cachean la lectura del Sheet 60 segundos, porque una sola pregunta
suele disparar varias llamadas. Si acabás de subir un archivo al dashboard y querés
verlo reflejado, esperá un minuto o reiniciá el server.
