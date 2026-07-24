import type { EventoCalendario, CalendarioResponse } from '@/types';

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

async function fetchDividendos(ticker: string, desde: string, hasta: string, apiKey: string): Promise<EventoCalendario[]> {
  const url = `${FINNHUB_BASE}/stock/dividend?symbol=${encodeURIComponent(ticker)}&from=${desde}&to=${hasta}&token=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finnhub dividendos (${ticker}): HTTP ${res.status}`);
  const json = await res.json();
  const items: { date: string; payDate?: string; amount: number }[] = Array.isArray(json) ? json : [];

  return items.map((d) => ({
    ticker,
    tipo: 'dividendo' as const,
    fecha: d.payDate || d.date,
    detalle: d.amount != null ? `${d.amount} USD/acción` : undefined,
  }));
}

export async function fetchCalendarioFinanciero(
  tickers: string[],
  desde: string,
  hasta: string,
): Promise<CalendarioResponse> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return { eventos: [], errores: [], finnhubConfigured: false, generatedAt: Date.now() };
  }

  const settled = await Promise.allSettled(
    tickers.flatMap((t) => [
      fetchEarnings(t, desde, hasta, apiKey),
      fetchDividendos(t, desde, hasta, apiKey),
    ]),
  );

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

  return { eventos, errores, finnhubConfigured: true, generatedAt: Date.now() };
}
