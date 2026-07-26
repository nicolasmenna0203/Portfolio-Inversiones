import { NextRequest, NextResponse } from 'next/server';
import { fetchCalendarioFinanciero } from '@/lib/calendario';
import type { CalendarioResponse } from '@/types';

export const runtime = 'nodejs'; // Nasdaq/bonistas requieren fetch con User-Agent en runtime Node
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
    const tickersUsa = tickersParam.split(',').filter(Boolean);
    const tickersArg = (url.searchParams.get('tickersArg') ?? '').split(',').filter(Boolean);

    const yearParam = url.searchParams.get('year');
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getUTCFullYear();

    const desde = fmtFecha(new Date(Date.UTC(year, 0, 1)));
    const hasta = fmtFecha(new Date(Date.UTC(year, 11, 31)));

    const body: CalendarioResponse = await fetchCalendarioFinanciero(tickersUsa, tickersArg, desde, hasta);

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
