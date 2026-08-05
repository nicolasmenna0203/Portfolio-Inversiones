export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { parseHaberesText, type HaberRow } from '@/lib/haberes';
import { fetchMepPorFecha } from '@/lib/benchmarks';

// ── Auth ──────────────────────────────────────────────────────────────────────

function getAuthWrite() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('Falta env var GOOGLE_SERVICE_ACCOUNT_JSON');
  const credentials = JSON.parse(raw);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function formatArgentino(n: number): string {
  const [int, dec] = n.toFixed(2).split('.');
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${intFmt},${dec}`;
}

// ── GET: meses ya cargados en Ingresos ─────────────────────────────────────────

export async function GET() {
  try {
    const id = process.env.SPREADSHEET_ID;
    if (!id) return NextResponse.json({ error: 'Falta SPREADSHEET_ID' }, { status: 500 });

    const auth = getAuthWrite();
    const sheets = google.sheets({ version: 'v4', auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: id,
      range: 'Ingresos!A:B',
      valueRenderOption: 'FORMATTED_VALUE',
    });

    const rawRows = res.data.values ?? [];
    const dataRows = rawRows.slice(1);
    const fechas = dataRows.map((r) => r[0] ?? '').filter(Boolean);
    const empleadoresConocidos = Array.from(new Set(dataRows.map((r) => r[1] ?? '').filter(Boolean)));

    const mesesCargados = new Set<string>();
    for (const f of fechas) {
      let d: Date | null = null;
      if (/^\d{2}\/\d{2}\/\d{4}$/.test(f)) {
        const [dd, mm, yyyy] = f.split('/');
        d = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(f)) {
        const [yyyy, mm, dd] = f.split('-');
        d = new Date(Date.UTC(+yyyy, +mm - 1, +dd));
      }
      if (d) mesesCargados.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }

    return NextResponse.json({ mesesCargados: Array.from(mesesCargados), empleadoresConocidos });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST: parse (action=parse) o confirm (action=confirm) ────────────────────

export async function POST(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action') ?? 'parse';

    // ── CONFIRM: recibe filas ya parseadas (y editadas por el usuario) y sube ──
    if (action === 'confirm') {
      const body = await req.json() as { rows: HaberRow[] };
      if (!Array.isArray(body.rows) || body.rows.length === 0) {
        return NextResponse.json({ error: 'No hay filas para subir' }, { status: 400 });
      }

      const id = process.env.SPREADSHEET_ID!;
      const auth = getAuthWrite();
      const sheets = google.sheets({ version: 'v4', auth });

      const sheetRows = body.rows.map((r) => [
        r.fecha,
        r.empleador,
        formatArgentino(r.montoArs),
        formatArgentino(r.montoUsd),
        r.concepto,
      ]);

      await sheets.spreadsheets.values.append({
        spreadsheetId: id,
        range: 'Ingresos!A:E',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: sheetRows },
      });

      return NextResponse.json({
        ok: true,
        filas: sheetRows.length,
        rows: body.rows,
      });
    }

    // ── PARSE: extrae datos del PDF sin subir al sheet ────────────────────
    const formData = await req.formData();
    const file = formData.get('pdf') as File | null;
    if (!file) return NextResponse.json({ error: 'No se recibió PDF' }, { status: 400 });

    const pdfBytes = await file.arrayBuffer();
    const { extractText } = await import('unpdf');
    const { text: fullText } = await extractText(new Uint8Array(pdfBytes), { mergePages: true });

    let parsed;
    try {
      parsed = parseHaberesText(fullText);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: `Error parseando PDF: ${msg}` }, { status: 400 });
    }

    // Excluir del preview los meses que ya están cargados en la hoja
    const getRes = await GET();
    const getBody = await getRes.json();
    const mesesCargados = new Set<string>(getBody.mesesCargados ?? []);
    const empleadoresConocidos: string[] = getBody.empleadoresConocidos ?? [];

    const rowsNuevas = parsed.rows.filter((r) => {
      const [dd, mm, yyyy] = r.fecha.split('/');
      return !mesesCargados.has(`${yyyy}-${mm}`);
    });

    if (rowsNuevas.length === 0) {
      return NextResponse.json(
        { error: 'Todos los meses detectados en este PDF ya están cargados en Ingresos.' },
        { status: 409 }
      );
    }

    // ── Conversión ARS→USD con el MEP del día exacto de cada acreditación ──
    const fechasArs = Array.from(new Set(
      rowsNuevas.filter((r) => r.montoArs > 0).map((r) => {
        const [dd, mm, yyyy] = r.fecha.split('/');
        return `${yyyy}-${mm}-${dd}`;
      })
    ));
    let mepPorFecha: Record<string, number> = {};
    try {
      mepPorFecha = await fetchMepPorFecha(fechasArs);
    } catch {
      // Si falla la fuente de MEP, se sube igual sin conversión (montoUsd queda en 0).
    }

    const rowsConUsd: HaberRow[] = rowsNuevas.map((r) => {
      if (r.montoArs <= 0) return r;
      const [dd, mm, yyyy] = r.fecha.split('/');
      const mep = mepPorFecha[`${yyyy}-${mm}-${dd}`];
      return mep ? { ...r, montoUsd: r.montoArs / mep } : r;
    });

    // ── Empleadores nuevos: no están (case-insensitive) entre los ya cargados ──
    const conocidosNorm = new Set(empleadoresConocidos.map((e) => e.toLowerCase()));
    const empleadoresDetectados = Array.from(new Set(rowsConUsd.map((r) => r.empleador)));
    const empleadoresNuevos = empleadoresDetectados.filter((e) => !conocidosNorm.has(e.toLowerCase()));

    return NextResponse.json({
      preview: true,
      filas: rowsConUsd.length,
      rows: rowsConUsd,
      empleadores: empleadoresDetectados,
      empleadoresNuevos,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
