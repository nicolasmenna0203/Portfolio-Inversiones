export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';

// ── Auth Sheets (write) ───────────────────────────────────────────────────────

function getAuthWrite() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta env var GOOGLE_SERVICE_ACCOUNT_JSON');
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function lastDayOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function formatFecha(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const y = date.getUTCFullYear();
  return `${d}/${m}/${y}`;
}

function formatArgentino(n: number): string {
  const [int, dec] = n.toFixed(2).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${intFmt},${dec}`;
}

/** Convierte número formato argentino "1.234.567,89" → 1234567.89 */
function parseArgNum(s: string): number {
  return parseFloat(s.replace(/\./g, '').replace(',', '.').replace(/[^0-9.\-]/g, ''));
}

// ── Parser PDF del broker ──────────────────────────────────────────────────────────

interface ParsedRow {
  ticker: string;
  tenenciaARS: number;
  tenenciaUSD: number;
}

interface ParsedPDF {
  fecha: string;    // "YYYY-MM-DD"
  dolarMep: number;
  rows: ParsedRow[];
}

function parseCocosText(fullText: string): ParsedPDF {
  // ── 1. Extraer dólar MEP ──────────────────────────────────────────────────
  const mepMatch = fullText.match(/cotizaci[oó]n\s+D[oó]lar\s+MEP\s+([\d.,]+)/i);
  const dolarMep = mepMatch ? parseArgNum(mepMatch[1]) : 0;

  // ── 2. Encontrar la última sección "POSICION AL CIERRE DEL" ──────────────
  const posRegex = /POSICION AL CIERRE DEL\s+(\d{2}-\d{2}-\d{4})/gi;
  let lastMatch: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  while ((m = posRegex.exec(fullText)) !== null) lastMatch = m;

  if (!lastMatch) throw new Error('No se encontró sección POSICION AL CIERRE en el PDF');

  const [dd, mm, yyyy] = lastMatch[1].split('-');
  const fecha = `${yyyy}-${mm}-${dd}`;

  // ── 3. Extraer texto desde esa sección hasta el Total ────────────────────
  const startIdx = lastMatch.index;
  const endMarker = fullText.indexOf('Total Posición al', startIdx);
  const section = endMarker > 0
    ? fullText.slice(startIdx, endMarker)
    : fullText.slice(startIdx);

  // ── 4. Parsear filas ──────────────────────────────────────────────────────
  // Patrón: nombre (TICKER)   cantidad   MONEDA   precio   totalMoneda   totalARS
  // El texto tiene múltiples espacios como separadores
  // Estrategia: buscar secuencias con ticker entre paréntesis seguidas de números y moneda

  const rows: ParsedRow[] = [];

  // Regex: (TICKER) cantidad MONEDA precio totalMoneda totalARS
  const rowRegex = /\(([A-Z0-9]+)\) ([\d.,]+) (ARS|USD MEP|USD CABLE) [\d.,]+ ([\d.,]+) ([\d.,]+)\*{0,2}/g;

  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(section)) !== null) {
    const ticker = rowMatch[1];
    const moneda = rowMatch[3];
    const totalEnMoneda = parseArgNum(rowMatch[4]);
    const totalARS = parseArgNum(rowMatch[5]);

    // Ignorar saldos de efectivo por contexto previo
    const before = section.slice(Math.max(0, rowMatch.index - 20), rowMatch.index);
    if (/Saldo\s+(ARS|USD)/.test(before)) continue;
    if (['ARS', 'MEP', 'CABLE'].includes(ticker)) continue;

    let tenenciaUSD: number;
    if (moneda === 'ARS') {
      tenenciaUSD = dolarMep > 0 ? totalARS / dolarMep : 0;
    } else {
      tenenciaUSD = totalEnMoneda;
    }

    rows.push({ ticker, tenenciaARS: totalARS, tenenciaUSD });
  }

  if (rows.length === 0) throw new Error('No se pudieron extraer instrumentos del PDF');

  return { fecha, dolarMep, rows };
}

// ── Leer tickers de la hoja Activos ──────────────────────────────────────────

async function fetchTickersActivos(): Promise<Set<string>> {
  const id = process.env.SPREADSHEET_ID;
  if (!id) return new Set();
  const auth = getAuthWrite();
  const sheets = google.sheets({ version: 'v4', auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: id,
    range: 'Activos!A:A',
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const rows = res.data.values ?? [];
  const tickers = rows.slice(1).map((r) => (r[0] ?? '').trim()).filter(Boolean);
  return new Set(tickers);
}

// ── GET: meses ya cargados ────────────────────────────────────────────────────

export async function GET() {
  try {
    const id = process.env.SPREADSHEET_ID;
    if (!id) return NextResponse.json({ error: 'Falta SPREADSHEET_ID' }, { status: 500 });

    const auth = getAuthWrite();
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: 'Tenencias!D:D',
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rows = res.data.values ?? [];
    const fechas = rows.slice(1).map((r) => r[0] ?? '').filter(Boolean);

    const mesesCargados = new Set<string>();
    for (const f of fechas) {
      let d: Date | null = null;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(f)) {
        const [dd, mm2, yyyy2] = f.split('/');
        d = new Date(Date.UTC(+yyyy2, +mm2 - 1, +dd));
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
        const [yyyy2, mm2, dd] = f.split('-');
        d = new Date(Date.UTC(+yyyy2, +mm2 - 1, +dd));
      }
      if (d) mesesCargados.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }

    return NextResponse.json({ mesesCargados: Array.from(mesesCargados) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST: parse / add-activos / confirm ──────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') ?? 'parse';

    // ── ADD-ACTIVOS: sube activos nuevos a la hoja Activos ────────────────
    if (action === 'add-activos') {
      interface NuevoActivo {
        ticker: string;
        broker: string;
        tipo: string;
        riesgo: string;
        sectorGeo: string;
        renta: string;
        moneda: string;
      }
      const body = await req.json() as { activos: NuevoActivo[] };
      if (!Array.isArray(body.activos) || body.activos.length === 0) {
        return NextResponse.json({ ok: true, filas: 0 });
      }

      const id = process.env.SPREADSHEET_ID!;
      const auth = getAuthWrite();
      const sheets = google.sheets({ version: 'v4', auth });

      const sheetRows = body.activos.map((a) => [
        a.ticker,
        a.broker,
        a.tipo,
        a.riesgo,
        a.sectorGeo,
        a.renta,
        a.moneda,
      ]);

      await sheets.spreadsheets.values.append({
        spreadsheetId: id,
        range: 'Activos!A:G',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: sheetRows },
      });

      return NextResponse.json({ ok: true, filas: sheetRows.length });
    }

    // ── CONFIRM: recibe datos ya parseados y sube al sheet ────────────────
    if (action === 'confirm') {
      const body = await req.json() as {
        mesKey: string;
        fechaStr: string;
        dolarMep: number;
        rows: ParsedRow[];
      };

      // Re-verificar que el mes no esté ya cargado
      const getRes = await GET();
      const getBody = await getRes.json();
      if ((getBody.mesesCargados as string[]).includes(body.mesKey)) {
        return NextResponse.json({ error: `El mes ${body.mesKey} ya está cargado en Tenencias.` }, { status: 409 });
      }

      const id = process.env.SPREADSHEET_ID!;
      const auth = getAuthWrite();
      const sheets = google.sheets({ version: 'v4', auth });

      const sheetRows = body.rows.map((r) => [
        r.ticker,
        formatArgentino(r.tenenciaARS),
        formatArgentino(r.tenenciaUSD),
        body.fechaStr,
      ]);

      await sheets.spreadsheets.values.append({
        spreadsheetId: id,
        range: 'Tenencias!A:D',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: sheetRows },
      });

      return NextResponse.json({
        ok: true,
        mes: body.mesKey,
        fecha: body.fechaStr,
        filas: sheetRows.length,
        dolarMep: body.dolarMep,
      });
    }

    // ── PARSE: extrae datos del PDF sin subir al sheet ────────────────────
    const formData = await req.formData();
    const file = formData.get('pdf') as File | null;
    if (!file) return NextResponse.json({ error: 'No se recibió PDF' }, { status: 400 });

    const pdfBytes = await file.arrayBuffer();
    const { extractText } = await import('unpdf');
    const { text: fullText } = await extractText(new Uint8Array(pdfBytes), { mergePages: true });

    let parsed: ParsedPDF;
    try {
      parsed = parseCocosText(fullText);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Error parseando PDF: ${msg}` }, { status: 400 });
    }

    const [yyyy, mm, dd] = parsed.fecha.split('-').map(Number);
    const fechaOriginal = new Date(Date.UTC(yyyy, mm - 1, dd));
    const fechaFin = lastDayOfMonth(fechaOriginal);
    const fechaStr = formatFecha(fechaFin);
    const mesKey = `${fechaFin.getUTCFullYear()}-${String(fechaFin.getUTCMonth() + 1).padStart(2, '0')}`;

    // Verificar mes duplicado antes de mostrar preview
    const getRes = await GET();
    const getBody = await getRes.json();
    if ((getBody.mesesCargados as string[]).includes(mesKey)) {
      return NextResponse.json({ error: `El mes ${mesKey} ya está cargado en Tenencias.` }, { status: 409 });
    }

    // Detectar tickers que no están en la lista maestra de Activos
    const tickersActivos = await fetchTickersActivos();
    const activosFaltantes = parsed.rows
      .map((r) => r.ticker)
      .filter((t) => !tickersActivos.has(t));

    return NextResponse.json({
      preview: true,
      mes: mesKey,
      fecha: fechaStr,
      dolarMep: parsed.dolarMep,
      filas: parsed.rows.length,
      rows: parsed.rows,
      activosFaltantes,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
