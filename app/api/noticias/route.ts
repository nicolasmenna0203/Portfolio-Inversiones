import { NextRequest, NextResponse } from 'next/server';
import { fetchNoticias } from '@/lib/noticias';
import type { NoticiasResponse } from '@/types';

export const revalidate = 3600; // 1 hora

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tickersParam = url.searchParams.get('tickers') ?? '';
    const tickers = tickersParam.split(',').filter(Boolean);

    const body: NoticiasResponse = await fetchNoticias(tickers);

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=7200' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
