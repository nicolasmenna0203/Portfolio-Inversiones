import type { EventoCalendario, CalendarioResponse } from '@/types';
import { fetchBonosArg } from './bonosArg';
import { fetchDividendosFuturos } from './dividendosFuturos';
import { fetchEarningsUsa } from './yahooEarnings';
import { preciosAcciones, preciosBonos } from './precios';

/** Dividendos ya pagados (histórico real de Yahoo Finance chart). */
async function fetchDividendos(
  ticker: string,
  desde: string,
  hasta: string,
  tenenciaUsd?: number,
  precio?: number,
): Promise<EventoCalendario[]> {
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
    .map((d) => {
      // cobro ≈ (tenencia_usd / precio_acción) × dividendo_por_acción
      const montoEstimado = tenenciaUsd && precio ? (tenenciaUsd / precio) * d.amount : undefined;
      return {
        ticker,
        tipo: 'dividendo' as const,
        fecha: new Date(d.date * 1000).toISOString().slice(0, 10),
        detalle: `${d.amount} USD/acción`,
        ...(montoEstimado != null ? { montoEstimado, monedaMonto: 'USD' } : {}),
      };
    });
}

export async function fetchCalendarioFinanciero(
  tickersUsa: string[],
  tickersArg: string[],
  desde: string,
  hasta: string,
  tenencias: Record<string, number> = {},
): Promise<CalendarioResponse> {
  // Precios de mercado para estimar unidades a partir del valor de cada posición.
  const [pxAcciones, pxBonos] = await Promise.all([
    preciosAcciones(tickersUsa),
    preciosBonos(tickersArg),
  ]);

  // Acciones/ETF USA: dividendos históricos (Yahoo chart) + futuros confirmados (Nasdaq) + balances (Yahoo calendarEvents).
  const tareas: Promise<EventoCalendario[]>[] = tickersUsa.map((t) =>
    fetchDividendos(t, desde, hasta, tenencias[t.toUpperCase()], pxAcciones[t.toUpperCase()]),
  );
  tareas.push(fetchDividendosFuturos(tickersUsa, desde, hasta, tenencias, pxAcciones));
  tareas.push(fetchEarningsUsa(tickersUsa, desde, hasta));
  // Bonos/ONs ARG: renta + amortización (bonistas), con cobro estimado por tenencia/precio.
  tareas.push(fetchBonosArg(tickersArg, desde, hasta, tenencias, pxBonos));

  const settled = await Promise.allSettled(tareas);

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

  return { eventos, errores, generatedAt: Date.now() };
}
