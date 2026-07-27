import type { TenenciaActual } from '@/types';
import { MAPEO_BONOS_ARG } from './bonosArg';

// Solo acciones y ETFs tienen un símbolo de mercado real cotizable en Yahoo/Finnhub.
// FCIs (ej. fondos de Cocos Capital), bonos y activos ARG quedan afuera por defecto —
// pedirles noticias a Yahoo con un ticker inválido devuelve resultados basura (fuzzy match).
export const TIPOS_VALIDOS = new Set(['ACCIONES', 'ACCION', 'ETF']);

// Excepciones puntuales: tickers que sí tienen símbolo real en Yahoo/Finnhub pero
// quedan categorizados en el Sheet con un TIPO que no pasa el filtro de arriba (ALTS).
export const TICKERS_INCLUIR = new Set(['GLD', 'BTC']);

// Excepciones inversas: tickers con TIPO válido en el Sheet (ej. ETF) pero que en
// realidad son fondos de Cocos Capital sin símbolo cotizable en Yahoo.
export const TICKERS_EXCLUIR = new Set(['COCOACCA']);

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
