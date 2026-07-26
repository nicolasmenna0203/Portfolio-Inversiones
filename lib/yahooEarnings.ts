import type { EventoCalendario } from '@/types';

// Reemplazo de Finnhub para balances: Yahoo Finance calendarEvents da la próxima
// fecha de earnings por ticker + estimación de EPS. Sin API key; requiere una
// cookie de sesión + "crumb" que Yahoo exige para su endpoint quoteSummary.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

let crumbCache: { crumb: string; cookie: string; ts: number } | null = null;
const CRUMB_TTL = 30 * 60 * 1000; // 30 min

/** Obtiene (y cachea) el par cookie+crumb necesario para quoteSummary. */
async function getCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (crumbCache && Date.now() - crumbCache.ts < CRUMB_TTL) {
    return { crumb: crumbCache.crumb, cookie: crumbCache.cookie };
  }
  try {
    // fc.yahoo.com responde 404 pero igual devuelve las cookies A1/A3 en Set-Cookie.
    const resCookie = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8000),
    });
    const setCookie = resCookie.headers.get('set-cookie') ?? '';
    const cookie = setCookie.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
    if (!cookie) return null;

    const resCrumb = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA, Cookie: cookie },
      signal: AbortSignal.timeout(8000),
    });
    const crumb = (await resCrumb.text()).trim();
    if (!crumb || crumb.includes('<')) return null;

    crumbCache = { crumb, cookie, ts: Date.now() };
    return { crumb, cookie };
  } catch {
    return null;
  }
}

interface YahooEarnings {
  earningsDate?: { raw: number; fmt: string }[];
  earningsAverage?: { raw: number };
}

async function fetchEarningsTicker(
  ticker: string,
  cred: { crumb: string; cookie: string },
): Promise<EventoCalendario[]> {
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=calendarEvents&crumb=${encodeURIComponent(cred.crumb)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Cookie: cred.cookie },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Yahoo earnings (${ticker}): HTTP ${res.status}`);
  const json = await res.json();
  const earnings: YahooEarnings | undefined = json?.quoteSummary?.result?.[0]?.calendarEvents?.earnings;
  const fechas = earnings?.earningsDate ?? [];
  if (fechas.length === 0) return [];

  const eps = earnings?.earningsAverage?.raw;
  // Yahoo puede dar un rango (2 fechas); tomamos la primera como estimada.
  return [{
    ticker,
    tipo: 'earnings' as const,
    fecha: fechas[0].fmt,
    detalle: eps != null ? `EPS est. ${eps.toFixed(2)}` : undefined,
  }];
}

/**
 * Próxima fecha de balance (earnings) de cada ticker USA, dentro del rango pedido.
 * Devuelve [] si no se pudo obtener el crumb (no rompe el resto del calendario).
 */
export async function fetchEarningsUsa(
  tickers: string[],
  desde: string,
  hasta: string,
): Promise<EventoCalendario[]> {
  if (tickers.length === 0) return [];
  const cred = await getCrumb();
  if (!cred) return [];

  const settled = await Promise.allSettled(tickers.map((t) => fetchEarningsTicker(t, cred)));
  const eventos: EventoCalendario[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      for (const e of r.value) {
        if (e.fecha >= desde && e.fecha <= hasta) eventos.push(e);
      }
    }
  }
  return eventos;
}
