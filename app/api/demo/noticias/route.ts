import { NextResponse } from 'next/server';
import { buildNoticias } from '@/lib/demo/fixtures';
import type { NoticiasResponse } from '@/types';

// Espejo sintético de /api/noticias: unas pocas noticias ficticias con fechas
// recientes relativas a hoy, sin pegarle a Yahoo/Ámbito.
export async function GET() {
  try {
    const { noticias, errores } = buildNoticias();
    const body: NoticiasResponse = { noticias, errores, generatedAt: Date.now() };
    return NextResponse.json(body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
