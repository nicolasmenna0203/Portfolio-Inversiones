import type { EventoCalendario, CalendarioResponse } from '@/types';
import { fetchBonosArg } from './bonosArg';
import { fetchDividendosFuturos } from './dividendosFuturos';

const FINNHUB_BASE = 'https://finnhub.io/api/v1';

async function fetchEarnings(ticker: string, desde: string, hasta: string, apiKey: string): Promise<EventoCalendario[]> {
  const url = `${FINNHUB_BASE}/calendar/earnings?from=${desde}&to=${hasta}&symbol=${encodeURIComponent(ticker)}&token=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub earnings (${ticker}): HTTP ${res.status}`);
  const json = await res.json();
  const items: { date: string; epsEstimate: number | null }[] = json?.earningsCalendar ?? [];

  return items.map((e) => ({
    ticker,
    tipo: 'earnings' as const,
    fecha: e.date,
    detalle: e.epsEstimate != null ? `EPS est. ${e.epsEstimate}` : undefined,
  }));
}

/** Finnhub /stock/dividend requiere plan pago; se usa el histórico real de Yahoo Finance en su lugar. */
async function fetchDividendos(ticker: string, desde: string, hasta: string): Promise<EventoCalendario[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5y&interval=3mo&events=div`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(8000), // Yahoo a veces cuelga; no arrastrar toda la request
  });
  if (!res.ok) throw new Error(`Yahoo dividendos (${ticker}): HTTP ${res.status}`);
  const json = await res.json();
  const dividends: Record<string, { amount: number; date: number }> | undefined =
    json?.chart?.result?.[0]?.events?.dividends;
  if (!dividends) return [];

  const desdeTs = new Date(desde + 'T00:00:00Z').getTime() / 1000;
  const hastaTs = new Date(hasta + 'T23:59:59Z').getTime() / 1000;

  return Object.values(dividends)
    .filter((d) => d.date >= desdeTs && d.date <= hastaTs)
    .map((d) => ({
      ticker,
      tipo: 'dividendo' as const,
      fecha: new Date(d.date * 1000).toISOString().slice(0, 10),
      detalle: `${d.amount} USD/acción`,
    }));
}

// Los logos no cambian con el tiempo: se cachean en memoria del proceso para no
// repetir requests a Finnhub en cada carga del calendario.
const logoCache = new Map<string, string | null>();

async function fetchLogo(ticker: string, apiKey: string): Promise<[string, string | null]> {
  if (logoCache.has(ticker)) return [ticker, logoCache.get(ticker)!];

  try {
    const url = `${FINNHUB_BASE}/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const logo: string | null = json?.logo || null;
    logoCache.set(ticker, logo);
    return [ticker, logo];
  } catch {
    logoCache.set(ticker, null);
    return [ticker, null];
  }
}

export async function fetchCalendarioFinanciero(
  tickersUsa: string[],
  tickersArg: string[],
  desde: string,
  hasta: string,
): Promise<CalendarioResponse> {
  const apiKey = process.env.FINNHUB_API_KEY;

  // Acciones/ETF USA: dividendos históricos (Yahoo) + futuros confirmados (Nasdaq) + balances (Finnhub).
  const tareas: Promise<EventoCalendario[]>[] = tickersUsa.map((t) => fetchDividendos(t, desde, hasta));
  tareas.push(fetchDividendosFuturos(tickersUsa, desde, hasta));
  if (apiKey) {
    tareas.push(...tickersUsa.map((t) => fetchEarnings(t, desde, hasta, apiKey)));
  }
  // Bonos/ONs ARG: renta + amortización (bonistas).
  tareas.push(fetchBonosArg(tickersArg, desde, hasta));

  const [settled, logos] = await Promise.all([
    Promise.allSettled(tareas),
    apiKey
      ? Promise.all(tickersUsa.map((t) => fetchLogo(t, apiKey)))
      : Promise.resolve([] as [string, string | null][]),
  ]);

  const eventos: EventoCalendario[] = [];
  const errores: string[] = [];

  for (const r of settled) {
    if (r.status === 'fulfilled') {
      eventos.push(...r.value);
    } else {
      errores.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }

  eventos.sort((a, b) => a.fecha.localeCompare(b.fecha));

  const logosPorTicker: Record<string, string> = {};
  for (const [ticker, logo] of logos) {
    if (logo) logosPorTicker[ticker] = logo;
  }

  return { eventos, errores, finnhubConfigured: !!apiKey, logos: logosPorTicker, generatedAt: Date.now() };
}
