import { parseArgNum as parseArgNumOrNull } from './parser';

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseArgNum(s: string): number {
  return parseArgNumOrNull(s) ?? NaN;
}

/** "31/01/24" → "31/01/2024" */
function formatFecha(ddmmyy: string): string {
  const [dd, mm, yy] = ddmmyy.split('/');
  const yyyy = yy.length === 2 ? `20${yy}` : yy;
  return `${dd}/${mm}/${yyyy}`;
}

/**
 * Limpia el nombre del empleador extraído de la línea de "Acreditacion de haberes".
 * El texto trae basura pegada: un código de lote ("240130007"), a veces un
 * dígito de sufijo pegado al final ("renault argentina sa2"), y a veces el
 * CUIT del empleador antes o después del nombre.
 */
export function limpiarEmpleador(raw: string): string {
  let s = raw.trim();
  // CUIT (11 dígitos, con o sin guiones) en cualquier posición
  s = s.replace(/\b\d{2}-?\d{8}-?\d\b/g, ' ');
  // "cuit" suelto
  s = s.replace(/\bcuit\b/gi, ' ');
  // Código de lote: 6+ dígitos pegados al inicio del nombre (ej. "240130007renault...")
  s = s.replace(/\b\d{6,}/g, ' ');
  // Dígito de sufijo pegado a una palabra (ej. "argentina sa2" → "argentina sa")
  s = s.replace(/([a-záéíóúñ])\d+\b/gi, '$1');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

// ── Parser ────────────────────────────────────────────────────────────────────

export interface HaberRow {
  fecha: string;       // "DD/MM/YYYY"
  empleador: string;
  montoArs: number;
  montoUsd: number;
  concepto: string;
}

export interface ParsedHaberes {
  mesesKeys: string[];  // "YYYY-MM" de cada mes con al menos un haber detectado
  rows: HaberRow[];
}

/**
 * Extrae acreditaciones de haberes de un resumen de cuenta bancario (formato
 * Santander "SuperCuenta" verificado). Busca líneas dentro de "Movimientos en
 * pesos" y "Movimientos en dólares" que contienen "Acreditacion de haberes".
 *
 * Formato de línea (texto ya "aplanado" por unpdf, sin saltos de línea limpios):
 * "31/01/24 67332701 Acreditacion de haberes 30503317814 240130007renault argentina sa $ 276.000,00 $ 276.000,67"
 * FECHA | COMPROBANTE | "Acreditacion de haberes" | [CUIT] [código+empleador] | $ MONTO | $ SALDO
 */
export function parseHaberesText(fullText: string): ParsedHaberes {
  const rows: HaberRow[] = [];

  // Cada línea de movimiento arranca con "DD/MM/YY " — partimos el texto en
  // bloques por esa marca, igual que el parser de Movimientos de Cocos.
  const dateSplitRegex = /(?=\d{2}\/\d{2}\/\d{2}\s)/g;
  const chunks = fullText.split(dateSplitRegex).filter((c) => /^\d{2}\/\d{2}\/\d{2}\s/.test(c));

  // Dentro de cada bloque que contenga "Acreditacion de haberes": fecha, luego
  // todo el texto hasta el primer monto en $ (empleador+ruido), luego el monto.
  // El monto de la acreditación es el primero en $ tras el concepto (el segundo
  // $ es el saldo de cuenta y no nos interesa).
  const chunkRegex = /^(\d{2}\/\d{2}\/\d{2})\s+\d+\s+(Acreditaci[oó]n de haberes)\s+([\s\S]*?)\s*\$\s*([-\d.,]+)\s*\$/i;

  for (const chunk of chunks) {
    const m = chunkRegex.exec(chunk.trim());
    if (!m) continue;

    const fecha = formatFecha(m[1]);
    const concepto = m[2];
    const empleador = limpiarEmpleador(m[3]);
    const montoArs = parseArgNum(m[4]);

    if (!empleador || isNaN(montoArs) || montoArs <= 0) continue;

    rows.push({ fecha, empleador, montoArs, montoUsd: 0, concepto });
  }

  // Movimientos en dólares: mismo patrón de línea, pero el monto viene en USD.
  const usdSectionStart = fullText.indexOf('Movimientos en dólares');
  if (usdSectionStart !== -1) {
    const usdSection = fullText.slice(usdSectionStart);
    const usdChunks = usdSection.split(dateSplitRegex).filter((c) => /^\d{2}\/\d{2}\/\d{2}\s/.test(c));
    for (const chunk of usdChunks) {
      const m = chunkRegex.exec(chunk.trim());
      if (!m) continue;

      const fecha = formatFecha(m[1]);
      const concepto = m[2];
      const empleador = limpiarEmpleador(m[3]);
      const montoUsd = parseArgNum(m[4]);

      if (!empleador || isNaN(montoUsd) || montoUsd <= 0) continue;

      rows.push({ fecha, empleador, montoArs: 0, montoUsd, concepto });
    }
  }

  if (rows.length === 0) throw new Error('No se encontraron acreditaciones de haberes en el PDF');

  const mesesKeys = Array.from(new Set(rows.map((r) => {
    const [dd, mm, yyyy] = r.fecha.split('/');
    return `${yyyy}-${mm}`;
  }))).sort();

  return { mesesKeys, rows };
}
