import { parseRss } from './rss';
import type { NoticiaItem, NoticiasResponse } from '@/types';

const AMBITO_FEEDS = [
  'https://www.ambito.com/rss/pages/economia.xml',
  'https://www.ambito.com/rss/pages/finanzas.xml',
  'https://www.ambito.com/rss/pages/negocios.xml',
];

const MAX_ITEMS_AMBITO = 20;

async function fetchNoticiasTicker(ticker: string): Promise<NoticiaItem[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&newsCount=5`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`Yahoo News (${ticker}): HTTP ${res.status}`);
  const json = await res.json();
  const news: { title: string; link: string; publisher: string; providerPublishTime: number }[] = json?.news ?? [];

  return news
    .filter((n) => n.title && n.link)
    .map((n) => ({
      titulo: n.title,
      link: n.link,
      fuente: n.publisher || 'Yahoo Finance',
      fecha: n.providerPublishTime * 1000,
      ticker,
    }));
}

async function fetchFeedAmbito(url: string): Promise<NoticiaItem[]> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRss(xml).map((item) => ({
      titulo: item.titulo,
      link: item.link,
      fuente: 'Ámbito',
      fecha: item.fecha,
    }));
  } catch {
    return [];
  }
}

async function fetchNoticiasAmbito(): Promise<NoticiaItem[]> {
  const resultados = await Promise.all(AMBITO_FEEDS.map(fetchFeedAmbito));
  return resultados.flat();
}

export async function fetchNoticias(tickers: string[]): Promise<NoticiasResponse> {
  const settledTickers = await Promise.allSettled(tickers.map((t) => fetchNoticiasTicker(t)));
  const settledAmbito = await fetchNoticiasAmbito().catch(() => [] as NoticiaItem[]);

  // Se mantienen separadas antes de unir: Ámbito publica con mucha más frecuencia
  // que las noticias específicas de un ticker, así que un solo corte por fecha
  // terminaría tapando las noticias de la cartera. Se cachea todo lo de tickers
  // (sin recorte) y se limita solo el volumen de Ámbito.
  const noticiasTickers: NoticiaItem[] = [];
  const errores: string[] = [];

  for (const r of settledTickers) {
    if (r.status === 'fulfilled') {
      noticiasTickers.push(...r.value);
    } else {
      errores.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
    }
  }

  noticiasTickers.sort((a, b) => b.fecha - a.fecha);
  const noticiasAmbito = [...settledAmbito].sort((a, b) => b.fecha - a.fecha).slice(0, MAX_ITEMS_AMBITO);

  const noticias = [...noticiasTickers, ...noticiasAmbito].sort((a, b) => b.fecha - a.fecha);

  return { noticias, errores, generatedAt: Date.now() };
}
