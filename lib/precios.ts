import { MAPEO_BONOS_ARG } from './bonosArg';

// Precios de mercado para estimar cuántas unidades/nominales tenés a partir del
// valor de tu posición (el Sheet guarda valor en USD, no cantidad).

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36';

// ── Acciones/ETF USA: precio por acción (Yahoo chart) ───────────────────────

const cachePrecioAccion = new Map<string, { px: number; ts: number }>();
const CACHE_MS = 60 * 60 * 1000; // 1 hora

async function fetchPrecioAccion(ticker: string): Promise<number | null> {
  const hit = cachePrecioAccion.get(ticker);
  if (hit && Date.now() - hit.ts < CACHE_MS) return hit.px;
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=1d`;
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const json = await res.json();
    const px: number | undefined = json?.chart?.result?.[0]?.meta?.regularMarketPrice;
    if (typeof px !== 'number' || px <= 0) return null;
    cachePrecioAccion.set(ticker, { px, ts: Date.now() });
    return px;
  } catch {
    return null;
  }
}

/** Mapa ticker USA → precio por acción (USD). */
export async function preciosAcciones(tickers: string[]): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const results = await Promise.all(tickers.map(async (t) => [t.toUpperCase(), await fetchPrecioAccion(t)] as const));
  for (const [t, px] of results) if (px != null) out[t] = px;
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
