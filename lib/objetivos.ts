// Decisión y alternativas descartadas: docs/decisiones/0017-objetivos-de-composicion-en-el-sheet.md
//
// ── Objetivos de composición de cartera ─────────────────────────────────────
//
// El % objetivo de cada categoría, por dimensión (tipo de activo, riesgo,
// moneda, tipo de renta, geografía). Es lo que la pestaña de Proyecciones
// compara contra la composición real para mostrar cuánto falta o sobra.
//
// Viven en la hoja `Objetivos` del Sheet y no en localStorage del navegador,
// que es donde estaban: ahí solo existían en el browser que los cargó, se
// perdían al limpiar datos del sitio y —lo que motivó la mudanza— el servidor
// MCP no podía leerlos, así que el asesor daba recomendaciones de rebalanceo
// sin conocer el objetivo contra el cual rebalancear.
//
// La hoja se crea sola en el primer guardado si no existe, para no obligar a
// prepararla a mano.

import { google } from 'googleapis';
import { readSheet } from './sheets';

export const HOJA = 'Objetivos';

/** Dimensiones por las que se puede fijar una composición objetivo. */
export const DIMENSIONES = ['TIPO', 'RIESGO', 'MONEDA', 'RENTA', 'SECTOR_GEO'] as const;
export type Dimension = (typeof DIMENSIONES)[number];

export function esDimension(v: string): v is Dimension {
  return (DIMENSIONES as readonly string[]).includes(v);
}

/** { TIPO: { "Acciones": 40, ... }, RIESGO: {...}, ... } */
export type ObjetivosPorDimension = Record<Dimension, Record<string, number>>;

function vacio(): ObjetivosPorDimension {
  return { TIPO: {}, RIESGO: {}, MONEDA: {}, RENTA: {}, SECTOR_GEO: {} };
}

/**
 * Acepta tanto "40" como "40,5" (formato argentino) y "40.5". El Sheet devuelve
 * strings ya formateados, y el separador decimal depende de su locale.
 */
function parsePct(raw: string): number | null {
  const limpio = raw.trim().replace('%', '').replace(',', '.');
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Lee los objetivos del Sheet. Si la hoja no existe todavía devuelve la
 * estructura vacía en vez de fallar: es el estado normal antes del primer
 * guardado.
 */
export async function leerObjetivos(): Promise<ObjetivosPorDimension> {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('Falta env var SPREADSHEET_ID');

  let filas: Record<string, string>[];
  try {
    filas = await readSheet(id, `${HOJA}!A:C`);
  } catch {
    return vacio();
  }

  const out = vacio();
  for (const f of filas) {
    const dim = (f['Dimension'] ?? f['DIMENSION'] ?? '').trim().toUpperCase();
    const categoria = (f['Categoria'] ?? f['CATEGORIA'] ?? '').trim();
    const pct = parsePct(f['Porcentaje'] ?? f['PORCENTAJE'] ?? '');
    if (!esDimension(dim) || !categoria || pct == null) continue;
    out[dim][categoria] = pct;
  }
  return out;
}

function getAuthWrite() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta env var GOOGLE_SERVICE_ACCOUNT_JSON');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

type SheetsApi = ReturnType<typeof google.sheets>;

/** Crea la hoja si falta. Idempotente: si ya está, no hace nada. */
async function asegurarHoja(sheets: SheetsApi, id: string): Promise<void> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id });
  const existe = meta.data.sheets?.some((s) => s.properties?.title === HOJA);
  if (existe) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: { requests: [{ addSheet: { properties: { title: HOJA } } }] },
  });
}

/**
 * Reemplaza todos los objetivos por los recibidos.
 *
 * Es un overwrite completo, no un merge: la UI siempre manda el set entero, y
 * mezclar dejaría categorías viejas colgadas cuando se renombra o elimina una.
 * Se limpia un rango holgado antes de escribir para no dejar filas residuales
 * de un guardado anterior más largo.
 */
export async function guardarObjetivos(objetivos: ObjetivosPorDimension): Promise<number> {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error('Falta env var SPREADSHEET_ID');

  const sheets = google.sheets({ version: 'v4', auth: getAuthWrite() });
  await asegurarHoja(sheets, id);

  const filas: string[][] = [['Dimension', 'Categoria', 'Porcentaje']];
  for (const dim of DIMENSIONES) {
    for (const [categoria, pct] of Object.entries(objetivos[dim] ?? {})) {
      if (!Number.isFinite(pct)) continue;
      filas.push([dim, categoria, String(pct)]);
    }
  }

  await sheets.spreadsheets.values.clear({ spreadsheetId: id, range: `${HOJA}!A1:C1000` });
  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: `${HOJA}!A1:C${filas.length}`,
    valueInputOption: 'RAW',
    requestBody: { values: filas },
  });

  return filas.length - 1; // sin el header
}

/** Normaliza cualquier objeto entrante al shape esperado, descartando basura. */
export function normalizar(input: unknown): ObjetivosPorDimension {
  const out = vacio();
  if (!input || typeof input !== 'object') return out;

  for (const [dim, cats] of Object.entries(input as Record<string, unknown>)) {
    const d = dim.trim().toUpperCase();
    if (!esDimension(d) || !cats || typeof cats !== 'object') continue;
    for (const [cat, val] of Object.entries(cats as Record<string, unknown>)) {
      const n = typeof val === 'number' ? val : Number(val);
      if (!Number.isFinite(n) || n < 0 || n > 100) continue;
      const nombre = cat.trim();
      if (nombre) out[d][nombre] = n;
    }
  }
  return out;
}
