import { MAPEO_BONOS_ARG } from './bonosArg';

// ── Métricas de renta fija (TIR, duration, paridad) desde bonistas.com ─────
//
// bonistas.com embebe un array "bondData" (Next.js __NEXT_DATA__) en varias
// de sus páginas de contenido (ej. /bonos-cer-hoy), con el universo completo
// de bonos/ONs que trackean — no solo los de la categoría de esa página.
// Mismo patrón de scraping que ya usa bonosArg.ts para /proximos-pagos.

/** Agrupamiento por tipo de tasa — TIRs de distinto grupo no son comparables entre sí. */
export type GrupoBono = 'USD' | 'CER' | 'ARS_TASA' | 'DOLLAR_LINKED' | 'BOPREAL';

// Tickers puntuales excluidos a pedido (no una familia entera): BDC28.
const TICKERS_EXCLUIDOS = new Set(['BDC28']);

export interface BondMetric {
  ticker: string;          // símbolo cartera (ej. "AL30") si hay match en MAPEO_BONOS_ARG, si no el de bonistas
  tickerCartera: string | null; // ticker cartera solo si este bono está mapeado (para cruzar tenencias)
  bondFamily: string;
  moneda: string;         // moneda en la que se calculó la TIR (USD o ARS)
  grupo: GrupoBono;        // USD hard-dollar / CER (ajustado inflación, incluye duales CER/TAMAR) / ARS tasa (LECAP, Tamar, Badlar) / dollar-linked
  etiqueta: string | null;  // aclaración sobre el grupo (ej. "CER/TAMAR" en duales) cuando el grupo solo no alcanza para describir el instrumento
  tir: number;             // TIR efectiva anual, en tanto por uno
  tna: number;             // tasa nominal anual, en tanto por uno
  modifiedDuration: number; // años
  parity: number | null;    // precio/valor técnico, en tanto por uno (1 = a la par)
  fairValue: number | null;
  lastPrice: number | null;
  vencimiento: string;      // "YYYY-MM-DD"
  diasAlVencimiento: number;
  /** true si TIR/duration se calcularon acá (ver bonosProvinciales.ts) en vez de venir de bonistas. */
  calculoPropio?: boolean;
}

// bonistas.com también trae tir_down_N/tir_up_N (sensibilidad a shocks de
// precio), pero se descartan: no documentan su fórmula y los valores no
// cuadran ni como TIR resultante absoluta ni como delta sobre la TIR base al
// contrastarlos con la aproximación estándar (ΔTIR ≈ Δprecio% / duration
// modificada). La sensibilidad se calcula en su lugar en performance.ts con
// esa fórmula estándar y verificable.
interface BondDataRaw {
  ticker: string;
  bond_family: string | null;
  emisor: string | null;
  index: string | null;
  tir: number | null;
  tna: number | null;
  modified_duration: number | null;
  parity: number | null;
  fair_value: number | null;
  last_price: number | null;
  end_date: string | null;
  days_to_finish: number | null;
}

let cache: { metrics: Map<string, BondMetric>; ts: number } | null = null;
const CACHE_MS = 6 * 60 * 60 * 1000; // 6 horas

/** Extrae el array bondData embebido en el HTML de cualquier página de contenido de bonistas.com. */
async function fetchBondDataRaw(): Promise<BondDataRaw[]> {
  const res = await fetch('https://bonistas.com/bonos-cer-hoy', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0 Safari/537.36' },
  });
  if (!res.ok) throw new Error(`bonistas.com: HTTP ${res.status}`);
  const html = await res.text();

  const marker = '"bondData":';
  const start = html.indexOf(marker);
  if (start === -1) throw new Error('bonistas.com: bondData no encontrado');

  const arrStart = html.indexOf('[', start);
  let depth = 0, end = -1;
  for (let i = arrStart; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end === -1) throw new Error('bonistas.com: array bondData malformado');

  return JSON.parse(html.slice(arrStart, end));
}

/**
 * Mapa ticker → métricas de renta fija (TIR, TNA, duration, paridad,
 * sensibilidad) del universo de deuda pública que trackea bonistas.com
 * (soberanos + Lecap/Boncap/Bonte-TX/BOPREAL, aunque el dataset los etiquete
 * con emisor "BCRA" sin distinguirlos de letras de regulación monetaria del
 * Central — no hay forma de diferenciarlos con los campos disponibles, y ya
 * varios de esos tickers están confirmados como Tesoro en MAPEO_BONOS_ARG),
 * no solo los tickers de MAPEO_BONOS_ARG. Se excluyen ONs corporativas (YPF,
 * Pampa, Vista, etc.) — bonistas.com tampoco cubre deuda provincial (Buenos
 * Aires u otras) con TIR/duration, así que no puede incluirse desde esta
 * fuente.
 * Cuando el símbolo bonista tiene equivalente en MAPEO_BONOS_ARG, la entrada
 * usa el ticker cartera (ej. "AL30") como clave para poder cruzar tenencias;
 * si no, usa el ticker sin sufijo de especie (ej. "AL41", no "AL41D").
 * Cuando un ticker normalizado aparece más de una vez (ej. sus 3 especies
 * Pesos/D/C, o distinta legislación LA/NY), se queda con el primero tras
 * priorizar la especie mapeada — no hay forma de saber cuál corresponde a la
 * tenencia sin ese dato en el Sheet.
 */
export async function fetchBondMetrics(): Promise<Map<string, BondMetric>> {
  if (cache && Date.now() - cache.ts < CACHE_MS) return cache.metrics;

  const raw = await fetchBondDataRaw();

  // Símbolo bonista → ticker cartera, solo para el subconjunto mapeado.
  const simboloATickerCartera = new Map<string, string>();
  for (const [ticker, simbolo] of Object.entries(MAPEO_BONOS_ARG)) {
    simboloATickerCartera.set(simbolo, ticker);
  }

  // Bonistas no garantiza el orden de aparición de las varias especies de un
  // mismo bono (Pesos/D/C/P) ni de duplicados por legislación distinta — se
  // ordena para que la especie "correcta" gane siempre el `metrics.has` de
  // abajo, no la que azarosamente venga primero en el JSON: 1º la mapeada en
  // MAPEO_BONOS_ARG (la que se usa para cruzar tenencias), 2º entre las no
  // mapeadas, la que no lleva sufijo de especie D/C (ej. TY30P sobre TY30D,
  // T30A7 sobre TA7D) — es la que suele usarse como "ticker de pizarra".
  const ordenados = [...raw].sort((a, b) => {
    const aMapeado = simboloATickerCartera.has(a.ticker) ? 0 : 1;
    const bMapeado = simboloATickerCartera.has(b.ticker) ? 0 : 1;
    if (aMapeado !== bMapeado) return aMapeado - bMapeado;
    const aEspecie = /[DC]$/.test(a.ticker) ? 1 : 0;
    const bEspecie = /[DC]$/.test(b.ticker) ? 1 : 0;
    return aEspecie - bEspecie;
  });

  const metrics = new Map<string, BondMetric>();
  const vencimientosVistos = new Set<string>();
  for (const r of ordenados) {
    if (r.tir == null || r.tna == null || r.modified_duration == null) continue;
    // tir=0 y duration=0 a la vez es bonistas marcando "sin dato" (ONs sin
    // cotización), no un bono real a la par con duration cero — nunca aparece
    // duration=0 con tir≠0. Sin este filtro ensucian el scatter en el origen
    // y arrastran la línea de tendencia.
    if (r.tir === 0 && r.modified_duration === 0) continue;
    // Deuda pública únicamente: bond_family "ONS"/"ONS-CABLE" son obligaciones
    // negociables corporativas (YPF, Pampa, Vista, Tecpetrol...), no
    // emisiones del Estado. emisor "BCRA" NO implica letra de regulación
    // monetaria del Central: bonistas etiqueta así a Lecap/Boncap/Bonte/TX-TZX
    // del Tesoro también (ej. TA7D es la misma emisión que T30A7, mismo TEM/
    // TNA/vencimiento, solo cambia la especie de liquidación) — de hecho ya
    // varios de esos tickers (T30A7, TZX27, TZX28, S31L6...) están en
    // MAPEO_BONOS_ARG. No hay forma de distinguir Tesoro de BCRA-real con los
    // campos que trae este dataset, así que no se filtra por emisor.
    if (r.bond_family?.startsWith('ONS')) continue;
    // Tickers con sufijo (_PUT, _CAP, _TAM, _CER) no son bonos comprables de
    // forma independiente: _PUT son opciones (TIR sin relación con duration,
    // ej. -75% u 23%), _CAP trae TIR negativas que no coinciden con su propia
    // short_description, y _TAM/_CER son "piernas" hipotéticas de un dual
    // (qué pagaría si gana esa pata) con TIR siempre en 0 — dato dummy, no
    // calculado. Todos ensuciaban la curva o el universo con ruido.
    if (r.ticker.includes('_')) continue;
    if (r.end_date == null || r.days_to_finish == null) continue;
    // Exclusiones puntuales de tickers específicos (no de toda una familia).
    if (TICKERS_EXCLUIDOS.has(r.ticker)) continue;
    // BOPREAL: bonistas expone el mismo instrumento bajo 2 familias de
    // ticker — "BPOx7"/"BPOx8" (especie Pesos, sin sufijo D/C) y "BPx7D"/
    // "BPx7C"/"BPx8D"/"BPx8C" (especies D/Cable del mismo bono, sin la "O").
    // Mismo vencimiento y cupón que su par BPOx — no son bonos aparte, así
    // que se descarta la familia sin "O" para no duplicar el universo (se
    // conserva "BPOx7"/"BPOx8", que es la que ya se usaba en pantalla).
    if (/^BP[A-D][78][DC]?$/.test(r.ticker) && !/^BPO/.test(r.ticker)) continue;

    // Cada bono USD hard-dollar cotiza en 3 especies del mismo instrumento
    // (ej. AL30 en Pesos, AL30D en MEP/cable, AL30C en Cable/Contado con
    // Liqui) — mismo flujo de fondos, distinta liquidación. Mostrar las 3
    // duplicaría el bono en la curva/tabla, así que se normaliza al ticker
    // base (sin sufijo D/C) y se usa esa única entrada. Solo D/C son sufijo
    // de especie pura acá — a diferencia de TY30P más abajo, "AL30" sin
    // sufijo también circula como ticker propio (especie Pesos).
    const tickerBase = r.ticker.replace(/[DC]$/, '');

    // Otros bonos/letras (Lecap/Boncap/Bonte-TX/Tamar/BOPREAL) también tienen
    // especies duplicadas, pero ahí el ticker de la especie USD no sigue el
    // patrón "base + D/C" (ej. S31L6 → SL6D, T30A7 → TA7D, TML27 → TML7D,
    // TY30P → TY30D — la P de TY30P es parte del nombre, no un sufijo
    // separable). Se deduplica por emisor + índice + vencimiento en su
    // lugar: si ya se vio una entrada con esa combinación, esta es la
    // especie duplicada y se descarta (prevalece la primera, priorizada por
    // el sort de arriba). No se usa para bonos USD hard-dollar (index "USS"):
    // ahí distintos bonos (AL29 vs GD29, distinta legislación) comparten
    // emisor/vencimiento/index legítimamente y el regex de ticker ya los
    // separa bien.
    const tickerCartera = simboloATickerCartera.get(r.ticker) ?? simboloATickerCartera.get(tickerBase) ?? null;
    const claveVencimiento = r.index !== 'USS' ? `${r.emisor}|${r.index}|${r.end_date}` : null;
    // Excepción: si ESTE ticker está mapeado a su propio ticker de cartera
    // (ej. DICP y DIP0, Discount ley Arg en 2 especies pero ambas cargadas
    // como posiciones separadas en el Sheet), no se descarta por colisión de
    // vencimiento aunque la clave ya esté vista — el usuario ya decidió que
    // son entradas distintas. Si no está mapeado, sí se descarta cuando la
    // clave ya fue vista (haya sido por una entrada mapeada o no).
    if (claveVencimiento && vencimientosVistos.has(claveVencimiento) && tickerCartera == null) continue;

    const ticker = tickerCartera ?? tickerBase;
    if (metrics.has(ticker)) continue;
    if (claveVencimiento) vencimientosVistos.add(claveVencimiento);

    // "USS" = hard dollar (ley cable) → USD. "CER" = ajustado por inflación.
    // "USDL" = dollar-linked: sigue al tipo de cambio, no a la inflación ni a
    // una tasa en pesos — grupo aparte, no comparable con los otros tres.
    // Duales: pagan el máximo entre dos piernas, pero bonistas.com NUNCA
    // separa la TIR de cada pierna — todos los campos candidatos (tir_val,
    // tir_t0, ttir, uptir) vienen null/0 en los 18 registros duales del
    // dataset, solo hay una TIR "efectiva" del instrumento completo (que ya
    // asume qué pata gana). Por eso ningún dual —ni los CER/TAMAR (TXMJ0,
    // TXMJ8, TXMD8, TXMJ9...) ni los Fija/TAMAR (TTS26, TTD26)— va al grupo
    // CER: mezclarían una TIR no comparable con la de los CER puros (TX26,
    // TX28...) y arruinarían la curva/regresión de ese grupo. Todos los
    // duales quedan en ARS_TASA, distinguidos entre sí solo por `etiqueta`
    // ("CER/TAMAR" vs. "Fija/TAMAR").
    //
    // index "DualCER" = CER/TAMAR (ej. TXMJ0). index "Dual" a secas
    // normalmente es Fija/TAMAR (ej. TTS26, TTD26), salvo TXMJ9: bonistas le
    // pone index "Dual" y una description de texto "tasa fija y TAMAR" que
    // son ERRATA de carga de esa fuente — TXMJ9 es un dual CER/TAMAR real
    // (paga el máximo entre capital ajustado por CER, o TAMAR + 3% margen;
    // confirmado por prensa especializada, no solo por bonistas). Su
    // bond_family ("DUAL-CER-TAMAR") sí es correcto, así que para
    // desambiguar el caso "Dual" se usa bond_family como señal adicional en
    // vez de confiar ciegamente en index/description.
    const esDualCer = r.index === 'DualCER' || (r.index === 'Dual' && r.bond_family === 'DUAL-CER-TAMAR');
    const esDualFijaTamar = r.index === 'Dual' && !esDualCer;
    // BOPREAL (BCRA, deuda comercial con importadores) cotiza en especie
    // hard-dollar igual que los soberanos (index "USS"), pero es un emisor y
    // un riesgo de crédito distintos — no comparable en la misma curva que
    // AL30/GD30/AE38. bond_family lo identifica sin ambigüedad, pero varía
    // según la especie del ticker ("BOPREAL-PESOS" en BPOx7/BPOx8 sin
    // sufijo, "BOPREAL"/"BOPREAL-CABLE" en la familia BPx7D/BPx7C sin la
    // "O" — ya excluida más arriba por duplicar el mismo instrumento), así
    // que se matchea por prefijo en vez de una lista exacta de valores.
    const esBopreal = r.bond_family?.startsWith('BOPREAL') ?? false;
    const grupo: GrupoBono =
      esBopreal ? 'BOPREAL' :
      r.index === 'USS' ? 'USD' :
      r.index === 'USDL' ? 'DOLLAR_LINKED' :
      r.index === 'CER' ? 'CER' :
      'ARS_TASA';
    // Dentro de ARS_TASA no dual, el `index` distingue el tipo de tasa que
    // rige cada bono — no son comparables entre sí (Lecap a tasa fija vs.
    // Boncap TAMAR vs. Badlar), así que se etiquetan todos, no solo los
    // duales: "Fijo" (Lecap/Boncap, TEM capitalizable) → "Fija", "Tamar"
    // (TAMAR + spread) → "TAMAR", "Badlar" → "Badlar".
    const etiquetaTasa =
      esDualCer ? 'CER/TAMAR' :
      esDualFijaTamar ? 'Fija/TAMAR' :
      grupo === 'ARS_TASA' && r.index === 'Fijo' ? 'Fija' :
      grupo === 'ARS_TASA' && r.index === 'Tamar' ? 'TAMAR' :
      grupo === 'ARS_TASA' && r.index === 'Badlar' ? 'Badlar' :
      null;

    metrics.set(ticker, {
      ticker,
      tickerCartera,
      bondFamily: r.bond_family ?? '',
      moneda: grupo === 'USD' || grupo === 'BOPREAL' ? 'USD' : 'ARS',
      grupo,
      etiqueta: etiquetaTasa,
      tir: r.tir,
      tna: r.tna,
      modifiedDuration: r.modified_duration,
      parity: r.parity,
      fairValue: r.fair_value,
      lastPrice: r.last_price,
      vencimiento: r.end_date,
      diasAlVencimiento: r.days_to_finish,
    });
  }

  cache = { metrics, ts: Date.now() };
  return metrics;
}
