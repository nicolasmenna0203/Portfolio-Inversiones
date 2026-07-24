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
