import { MAPEO_BONOS_ARG } from './bonosArg';

// ── Métricas de renta fija (TIR, duration, paridad) desde bonistas.com ─────
//
// bonistas.com embebe un array "bondData" (Next.js __NEXT_DATA__) en varias
// de sus páginas de contenido (ej. /bonos-cer-hoy), con el universo completo
// de bonos/ONs que trackean — no solo los de la categoría de esa página.
// Mismo patrón de scraping que ya usa bonosArg.ts para /proximos-pagos.

/** Agrupamiento por tipo de tasa — TIRs de distinto grupo no son comparables entre sí. */
export type GrupoBono = 'USD' | 'CER' | 'ARS_TASA' | 'DOLLAR_LINKED';

export interface BondMetric {
  ticker: string;          // símbolo cartera (ej. "AL30") si hay match en MAPEO_BONOS_ARG, si no el de bonistas
  tickerCartera: string | null; // ticker cartera solo si este bono está mapeado (para cruzar tenencias)
  bondFamily: string;
  moneda: string;         // moneda en la que se calculó la TIR (USD o ARS)
  grupo: GrupoBono;        // USD hard-dollar / CER (ajustado inflación) / ARS tasa (LECAP, dual, Tamar, Badlar) / dollar-linked
  tir: number;             // TIR efectiva anual, en tanto por uno
  tna: number;             // tasa nominal anual, en tanto por uno
  modifiedDuration: number; // años
  parity: number | null;    // precio/valor técnico, en tanto por uno (1 = a la par)
  fairValue: number | null;
  lastPrice: number | null;
  vencimiento: string;      // "YYYY-MM-DD"
  diasAlVencimiento: number;
}

// bonistas.com también trae tir_down_N/tir_up_N (sensibilidad a shocks de
// precio), pero se descartan: no documentan su fórmula y los valores no
// cuadran ni como TIR resultante absoluta ni como delta sobre la TIR base al
// contrastarlos con la aproximación estándar (ΔTIR ≈ Δprecio% / duration
// modificada). La sensibilidad se calcula en su lugar en performance.ts con
// esa fórmula estándar y verificable.
interface BondDataRaw {
  ticker: string;
  bond_family: string | null;
  emisor: string | null;
  index: string | null;
  tir: number | null;
  tna: number | null;
  modified_duration: number | null;
  parity: number | null;
  fair_value: number | null;
  last_price: number | null;
  end_date: string | null;
  days_to_finish: number | null;
}

let cache: { metrics: Map<string, BondMetric>; ts: number } | null = null;
const CACHE_MS = 6 * 60 * 60 * 1000; // 6 horas

/** Extrae el array bondData embebido en el HTML de cualquier página de contenido de bonistas.com. */
async function fetchBondDataRaw(): Promise<BondDataRaw[]> {
  const res = await fetch('https://bonistas.com/bonos-cer-hoy', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36' },
  });
  if (!res.ok) throw new Error(`bonistas.com: HTTP ${res.status}`);
  const html = await res.text();

  const marker = '"bondData":';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('bonistas.com: bondData no encontrado');

  const arrStart = html.indexOf('[', start);
  let depth = 0, end = -1;
  for (let i = arrStart; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error('bonistas.com: array bondData malformado');

  return JSON.parse(html.slice(arrStart, end));
}

/**
 * Mapa ticker → métricas de renta fija (TIR, TNA, duration, paridad,
 * sensibilidad) del universo de deuda PÚBLICA que trackea bonistas.com
 * (soberanos Argentina + BOPREAL/BCRA), no solo los tickers de
 * MAPEO_BONOS_ARG. Se excluyen ONs corporativas (YPF, Pampa, Vista, etc.) —
 * bonistas.com no cubre deuda provincial (Buenos Aires u otras) con TIR/
 * duration, así que no puede incluirse desde esta fuente.
 * Cuando el símbolo bonista tiene equivalente en MAPEO_BONOS_ARG, la entrada
 * usa el ticker cartera (ej. "AL30") como clave para poder cruzar tenencias;
 * si no, usa el símbolo tal cual lo publica bonistas (ej. "BPY26D").
 * Cuando un símbolo aparece más de una vez (ej. distinta legislación LA/NY),
 * se queda con el primero — no hay forma de saber cuál corresponde a la
 * tenencia sin ese dato en el Sheet.
 */
export async function fetchBondMetrics(): Promise<Map<string, BondMetric>> {
  if (cache && Date.now() - cache.ts < CACHE_MS) return cache.metrics;

  const raw = await fetchBondDataRaw();

  // Símbolo bonista → ticker cartera, solo para el subconjunto mapeado.
  const simboloATickerCartera = new Map<string, string>();
  for (const [ticker, simbolo] of Object.entries(MAPEO_BONOS_ARG)) {
    simboloATickerCartera.set(simbolo, ticker);
  }

  const metrics = new Map<string, BondMetric>();
  for (const r of raw) {
    if (r.tir == null || r.tna == null || r.modified_duration == null) continue;
    // tir=0 y duration=0 a la vez es bonistas marcando "sin dato" (ONs sin
    // cotización), no un bono real a la par con duration cero — nunca aparece
    // duration=0 con tir≠0. Sin este filtro ensucian el scatter en el origen
    // y arrastran la línea de tendencia.
    if (r.tir === 0 && r.modified_duration === 0) continue;
    // Deuda pública únicamente: bond_family "ONS"/"ONS-CABLE" son
    // obligaciones negociables corporativas (YPF, Pampa, Vista, Tecpetrol...),
    // no emisiones del Estado. El resto de familias (BONO-*, LETRA(S)-*,
    // DUAL*, BOPREAL*) tiene emisor Argentina/Argentino/BCRA.
    if (r.bond_family?.startsWith('ONS')) continue;
    // Tickers con sufijo (_PUT, _CAP, _TAM, _CER) no son bonos comprables de
    // forma independiente: _PUT son opciones (TIR sin relación con duration,
    // ej. -75% u 23%), _CAP trae TIR negativas que no coinciden con su propia
    // short_description, y _TAM/_CER son "piernas" hipotéticas de un dual
    // (qué pagaría si gana esa pata) con TIR siempre en 0 — dato dummy, no
    // calculado. Todos ensuciaban la curva o el universo con ruido.
    if (r.ticker.includes('_')) continue;
    if (r.end_date == null || r.days_to_finish == null) continue;

    const tickerCartera = simboloATickerCartera.get(r.ticker) ?? null;
    const ticker = tickerCartera ?? r.ticker;
    if (metrics.has(ticker)) continue;

    // "USS" = hard dollar (ley cable) → USD. "CER" = ajustado por inflación.
    // "USDL" = dollar-linked: sigue al tipo de cambio, no a la inflación ni a
    // una tasa en pesos — grupo aparte, no comparable con los otros tres. El
    // resto (Fijo, Tamar, Dual, Badlar) es tasa fija/variable en pesos.
    const grupo: GrupoBono =
      r.index === 'USS' ? 'USD' :
      r.index === 'CER' ? 'CER' :
      r.index === 'USDL' ? 'DOLLAR_LINKED' :
      'ARS_TASA';

    metrics.set(ticker, {
      ticker,
      tickerCartera,
      bondFamily: r.bond_family ?? '',
      moneda: grupo === 'USD' ? 'USD' : 'ARS',
      grupo,
      tir: r.tir,
      tna: r.tna,
      modifiedDuration: r.modified_duration,
      parity: r.parity,
      fairValue: r.fair_value,
      lastPrice: r.last_price,
      vencimiento: r.end_date,
      diasAlVencimiento: r.days_to_finish,
    });
  }

  cache = { metrics, ts: Date.now() };
  return metrics;
}
