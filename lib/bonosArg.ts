import type { EventoCalendario } from '@/types';

// ── Mapeo Cocos/BYMA → símbolo de bonistas.com ──────────────────────────────
// Solo se incluyen tickers con match EXACTO verificado contra el dataset de
// bonistas (símbolo idéntico o especie "D"/cable). Meter un ticker mal mapeado
// mostraría el flujo de OTRO bono, así que se prefiere omitir antes que adivinar.
// Fuente: bonistas.com/proximos-pagos (initialPayments), verificado 2026-07.
export const MAPEO_BONOS_ARG: Record<string, string> = {
  // Soberanos USD (especie cable "D")
  GD30: 'GD30D', GD38: 'GD38D', GD41: 'GD41D',
  AE38: 'AE38D', AL29: 'AL29D', AL30: 'AL30D',
  // CER (símbolo idéntico)
  TX26: 'TX26', TX28: 'TX28',
  TZX27: 'TZX27', TZX28: 'TZX28', TZXD7: 'TZXD7', TZXM7: 'TZXM7', TZXO6: 'TZXO6',
  DICP: 'DICP', DIP0: 'DIP0', PARP: 'PARP',
  // Dual / Dollar-linked
  TZV27: 'TZV27', D30S6: 'D30S6',
  // Lecap / Boncap (fija)
  TTS26: 'TTS26', TTD26: 'TTD26', T30A7: 'T30A7', S31L6: 'S31L6',
};

interface PagoBonista {
  symbol: string;
  fecha: string;        // "YYYY-MM-DD"
  cupon: number;        // renta por 100 nominales
  principal: number;    // amortización por 100 nominales
  saldo: number;        // valor residual tras el pago
  total: number;
  moneda: string;
  bond_family?: string;
}

let cache: { payments: PagoBonista[]; ts: number } | null = null;
const CACHE_MS = 6 * 60 * 60 * 1000; // 6 horas

/** Extrae el array initialPayments embebido en el HTML de bonistas.com/proximos-pagos. */
async function fetchPagosBonistas(): Promise<PagoBonista[]> {
  if (cache && Date.now() - cache.ts < CACHE_MS) return cache.payments;

  const res = await fetch('https://bonistas.com/proximos-pagos', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36' },
  });
  if (!res.ok) throw new Error(`bonistas.com: HTTP ${res.status}`);
  const html = await res.text();

  // El HTML trae "initialPayments":[...] dentro del JSON de __NEXT_DATA__.
  const marker = '"initialPayments":';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('bonistas.com: initialPayments no encontrado');

  // Parseo balanceado del array que arranca en el primer '[' tras el marcador.
  const arrStart = html.indexOf('[', start);
  let depth = 0, end = -1;
  for (let i = arrStart; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error('bonistas.com: array initialPayments malformado');

  const payments: PagoBonista[] = JSON.parse(html.slice(arrStart, end));
  cache = { payments, ts: Date.now() };
  return payments;
}

/**
 * Devuelve eventos de renta y amortización de los bonos/ONs ARG de la cartera,
 * dentro del rango [desde, hasta], mapeando cada ticker al símbolo de bonistas.
 */
export async function fetchBonosArg(
  tickers: string[],
  desde: string,
  hasta: string,
): Promise<EventoCalendario[]> {
  // Símbolo bonista → ticker original, solo para los tickers pedidos que tengan mapeo.
  const simboloATicker = new Map<string, string>();
  for (const t of tickers) {
    const sym = MAPEO_BONOS_ARG[t.toUpperCase()];
    if (sym) simboloATicker.set(sym, t.toUpperCase());
  }
  if (simboloATicker.size === 0) return [];

  const payments = await fetchPagosBonistas();
  const eventos: EventoCalendario[] = [];

  for (const p of payments) {
    const ticker = simboloATicker.get(p.symbol);
    if (!ticker) continue;
    if (p.fecha < desde || p.fecha > hasta) continue;

    const moneda = p.moneda || 'USD';
    if (p.cupon > 0) {
      eventos.push({
        ticker,
        tipo: 'renta',
        fecha: p.fecha,
        detalle: `Renta ${p.cupon.toFixed(2)} ${moneda}`,
      });
    }
    if (p.principal > 0) {
      eventos.push({
        ticker,
        tipo: 'amortizacion',
        fecha: p.fecha,
        detalle: `Amort. ${p.principal.toFixed(2)} ${moneda}`,
      });
    }
  }

  return eventos;
}
