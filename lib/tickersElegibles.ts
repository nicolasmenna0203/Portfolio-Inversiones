import type { TenenciaActual } from '@/types';
import { MAPEO_BONOS_ARG } from './bonosArg';

// Decisión y alternativas descartadas: docs/decisiones/0012-criterio-unico-de-tickers-elegibles.md
//
// Solo acciones y ETFs tienen un símbolo de mercado real cotizable en Yahoo/Finnhub.
// FCIs (los fondos del broker), bonos y activos ARG quedan afuera por defecto —
// pedirles noticias a Yahoo con un ticker inválido devuelve resultados basura (fuzzy match).
export const TIPOS_VALIDOS = new Set(['ACCIONES', 'ACCION', 'ETF']);

// Excepciones puntuales: tickers que sí tienen símbolo real en Yahoo/Finnhub pero
// quedan categorizados en el Sheet con un TIPO que no pasa el filtro de arriba (ALTS).
// IBIT/ETHA son los ETFs cripto-spot de iShares (Bitcoin/Ether Trust): cotizan
// como cualquier ETF en NASDAQ/Cboe, Yahoo los resuelve tal cual.
export const TICKERS_INCLUIR = new Set(['GLD', 'BTC', 'IBIT', 'ETHA']);

// Excepciones inversas: tickers con TIPO válido en el Sheet (ej. ETF) pero que en
// realidad son fondos del broker sin símbolo cotizable en Yahoo.
export const TICKERS_EXCLUIR = new Set(['COCOACCA']);

// Alias de símbolo: la forma "natural" de escribir el ticker (sin el separador
// que usa Yahoo) mapeada al símbolo real. Existe para que la pestaña de Ratios
// y cualquier otro punto de entrada acepten la forma común sin que el usuario
// tenga que recordar la convención de Yahoo para acciones con clase.
export const ALIAS_TICKER_YAHOO: Record<string, string> = {
  BRKB: 'BRK-B',
  BRKA: 'BRK-A',
  BFB: 'BF-B',
};

/** Traduce un ticker a su símbolo real de Yahoo si tiene alias; si no, lo deja igual. */
export function aliasYahoo(ticker: string): string {
  return ALIAS_TICKER_YAHOO[ticker.toUpperCase()] ?? ticker;
}

/**
 * Deriva de las tenencias del último mes los tres insumos que necesita
 * `fetchCalendarioFinanciero`: tickers USA elegibles, tickers ARG con
 * cronograma de bonista mapeado, y el valor USD de cada posición.
 *
 * Misma regla que usa `CalendarioTab.tsx` en el cliente — se centraliza acá
 * para que el job server-side de alertas ([lib/alertas.ts](../lib/alertas.ts))
 * no duplique el criterio y se desalinee con lo que ve el usuario en pantalla.
 */
export function tickersDeCartera(items: TenenciaActual[]): {
  tickersUsa: string[];
  tickersArg: string[];
  tenencias: Record<string, number>;
} {
  const usa = new Set<string>();
  const arg = new Set<string>();
  const tenencias: Record<string, number> = {};

  for (const t of items) {
    const ticker = t.ticker.toUpperCase();

    const esUsa =
      !TICKERS_EXCLUIR.has(ticker) &&
      (TICKERS_INCLUIR.has(ticker) ||
        (TIPOS_VALIDOS.has(t.TIPO?.toUpperCase()) && t.SECTOR_GEO !== 'ARG'));
    if (esUsa) usa.add(ticker);

    if (ticker in MAPEO_BONOS_ARG) arg.add(ticker);

    if (t.tenencia_usd > 0) tenencias[ticker] = t.tenencia_usd;
  }

  return {
    tickersUsa: [...usa].sort(),
    tickersArg: [...arg].sort(),
    tenencias,
  };
}
