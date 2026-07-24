import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarioFinanciero } from '@/lib/calendario';
import type { CalendarioResponse } from '@/types';

export const revalidate = 21600; // 6 horas

function fmtFecha(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tickersParam = url.searchParams.get('tickers');
    if (!tickersParam) {
      return NextResponse.json({ error: 'Falta query param tickers' }, { status: 400 });
    }
    const tickers = tickersParam.split(',').filter(Boolean);

    const hoy = new Date();
    const en90dias = new Date(hoy.getTime() + 90 * 86_400_000);
    const desde = fmtFecha(hoy);
    const hasta = fmtFecha(en90dias);

    const body: CalendarioResponse = await fetchCalendarioFinanciero(tickers, desde, hasta);

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
