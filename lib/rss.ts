export interface RssItem {
  titulo: string;
  link: string;
  fecha: number; // timestamp ms
}

function extraerTag(bloque: string, tag: string): string | null {
  const match = bloque.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!match) return null;
  const raw = match[1].trim();
  const cdata = raw.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  return (cdata ? cdata[1] : raw).trim();
}

/** Parser RSS minimalista para feeds simples (ítems planos, sin namespaces anidados). */
export function parseRss(xml: string): RssItem[] {
  const bloques = xml.match(/<item[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  const items: RssItem[] = [];

  for (const bloque of bloques) {
    const titulo = extraerTag(bloque, 'title');
    const link = extraerTag(bloque, 'link');
    const pubDate = extraerTag(bloque, 'pubDate');
    if (!titulo || !link) continue;

    const fecha = pubDate ? Date.parse(pubDate) : NaN;
    items.push({ titulo, link, fecha: isNaN(fecha) ? Date.now() : fecha });
  }

  return items;
}
