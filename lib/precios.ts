import { MAPEO_BONOS_ARG } from './bonosArg';

// Precios de mercado para estimar cuántas unidades/nominales tenés a partir del
// valor de tu posición (el Sheet guarda valor en USD, no cantidad).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36';

// ── Acciones/ETF USA: precio por acción (Yahoo chart) ───────────────────────

/** Precio spot + dividend yield trailing 12 meses, derivados de la misma llamada. */
export interface DatosAccion {
  px: number;
  /** Dividendos por acción sumados en los últimos 12 meses (USD). 0 si no paga. */
  divAnual: number;
  /** divAnual / px, en tanto por uno (0.0093 = 0.93%). */
  yieldAnual: number;
  /** Cantidad de pagos en los últimos 12 meses; permite inferir la frecuencia. */
  pagos: number;
}

const cachePrecioAccion = new Map<string, { datos: DatosAccion; ts: number }>();
const CACHE_MS = 60 * 60 * 1000; // 1 hora

// El yield se deriva del historial de dividendos del chart en vez de pedir
// quoteSummary: ese endpoint devuelve 401 sin cookie+crumb, y el chart ya se
// consulta igual para el precio, así que el yield sale sin request extra.
async function fetchDatosAccion(ticker: string): Promise<DatosAccion | null> {
  const hit = cachePrecioAccion.get(ticker);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.datos;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1y&interval=3mo&events=div`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    const px: number | undefined = result?.meta?.regularMarketPrice;
    if (typeof px !== 'number' || px <= 0) return null;

    const dividends: Record<string, { amount: number; date: number }> = result?.events?.dividends ?? {};
    const desde = Date.now() / 1000 - 365 * 86_400;
    const ultimos = Object.values(dividends).filter((d) => d.date >= desde);
    const divAnual = ultimos.reduce((s, d) => s + d.amount, 0);

    const datos: DatosAccion = { px, divAnual, yieldAnual: divAnual / px, pagos: ultimos.length };
    cachePrecioAccion.set(ticker, { datos, ts: Date.now() });
    return datos;
  } catch {
    return null;
  }
}

/** Mapa ticker USA → precio por acción (USD). */
export async function preciosAcciones(tickers: string[]): Promise<Record<string, number>> {
  const datos = await datosAcciones(tickers);
  const out: Record<string, number> = {};
  for (const [t, d] of Object.entries(datos)) out[t] = d.px;
  return out;
}

/** Mapa ticker USA → precio, dividendo anual y yield trailing 12m. */
export async function datosAcciones(tickers: string[]): Promise<Record<string, DatosAccion>> {
  const out: Record<string, DatosAccion> = {};
  const results = await Promise.all(
    tickers.map(async (t) => [t.toUpperCase(), await fetchDatosAccion(t)] as const),
  );
  for (const [t, d] of results) if (d != null) out[t] = d;
  return out;
}

// ── Bonos/ONs ARG: precio en USD por 100 nominales (data912, especie "D") ────

let cacheBonos: { precios: Record<string, number>; ts: number } | null = null;

async function fetchTodosPreciosBonos(): Promise<Record<string, number>> {
  if (cacheBonos && Date.now() - cacheBonos.ts < CACHE_MS) return cacheBonos.precios;

  const endpoints = ['arg_bonds', 'arg_corp', 'arg_notes'];
  const precios: Record<string, number> = {};

  await Promise.all(
    endpoints.map(async (ep) => {
      try {
        const res = await fetch(`https://data912.com/live/${ep}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
        if (!res.ok) return;
        const rows: { symbol: string; px_bid: number; px_ask: number; c: number }[] = await res.json();
        for (const r of rows) {
          // Preferir el precio de cierre; si no, el mid de bid/ask.
          const px = r.c > 0 ? r.c : (r.px_bid > 0 && r.px_ask > 0 ? (r.px_bid + r.px_ask) / 2 : 0);
          if (px > 0) precios[r.symbol] = px;
        }
      } catch { /* endpoint puntual falla, seguimos con los demás */ }
    }),
  );

  cacheBonos = { precios, ts: Date.now() };
  return precios;
}

/**
 * Mapa ticker-cartera (ej. "AL30") → precio USD por 100 nominales, usando la
 * especie "D"/cable de data912 (que cotiza en USD igual que el valor del Sheet).
 */
export async function preciosBonos(tickers: string[]): Promise<Record<string, number>> {
  const todos = await fetchTodosPreciosBonos();
  const out: Record<string, number> = {};
  for (const t of tickers) {
    const key = t.toUpperCase();
    const simboloD = MAPEO_BONOS_ARG[key];
    if (!simboloD) continue;
    // Preferimos la especie "D" (USD). Si no cotiza, probamos el símbolo tal cual.
    const px = todos[simboloD] ?? todos[key];
    if (px != null && px > 0) out[key] = px;
  }
  return out;
}

/**
 * Mapa ticker-cartera → precio ARS por 100 nominales, usando el símbolo base
 * (no la especie "D"/cable). Bonos que solo pagan en pesos (CER, duales,
 * dollar-linked, Lecap/Boncap) no siempre tienen especie "D", así que este
 * precio es el que corresponde para calcular nominales cuando el pago es en ARS.
 */
export async function preciosBonosArs(tickers: string[]): Promise<Record<string, number>> {
  const todos = await fetchTodosPreciosBonos();
  const out: Record<string, number> = {};
  for (const t of tickers) {
    const key = t.toUpperCase();
    if (!MAPEO_BONOS_ARG[key]) continue;
    const px = todos[key];
    if (px != null && px > 0) out[key] = px;
  }
  return out;
}

// ── Dólar MEP spot ───────────────────────────────────────────────────────────

let cacheMep: { valor: number; ts: number } | null = null;

/** Dólar MEP actual (pesos por dólar), para convertir tenencias USD del Sheet a ARS. */
export async function mepSpot(): Promise<number | null> {
  if (cacheMep && Date.now() - cacheMep.ts < CACHE_MS) return cacheMep.valor;
  try {
    const res = await fetch('https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa', {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json: { fecha: string; venta: number }[] = await res.json();
    if (json.length === 0) return null;
    const ultimo = json.reduce((a, b) => (b.fecha > a.fecha ? b : a));
    cacheMep = { valor: ultimo.venta, ts: Date.now() };
    return ultimo.venta;
  } catch {
    return null;
  }
}
