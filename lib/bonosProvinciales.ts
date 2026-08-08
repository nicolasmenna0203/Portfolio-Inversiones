import type { GrupoBono } from '@/types';
import type { BondMetric } from './bondMetrics';

// Decisión y alternativas descartadas: docs/decisiones/0001-tir-duration-propias-bonos-provinciales.md
//
// ── Bonos sin cobertura en bonistas.com: TIR y duration calculadas acá ───────
//
// bonistas.com —la fuente de toda la curva de renta fija— no trackea deuda
// provincial ni los Bonos de Consolidación: su dataset (907 registros al
// 2026-08-06) solo tiene emisores "Argentina", "BCRA" y ONs corporativas. Se
// relevaron las alternativas y ninguna sirve como fuente directa:
//
//   · data912 (ya usada en precios.ts): tiene los tres tickers con buena
//     liquidez, pero solo precio — ni TIR ni duration.
//   · IAMC (informe diario de títulos públicos): es el único que publica TIR
//     Y duration de provinciales, pero las tablas del PDF son imágenes
//     escaneadas (231 objetos de imagen, streams de texto vacíos) → haría
//     falta OCR, demasiado frágil para un dato que se muestra como preciso.
//   · Rava: solo OHLCV histórico.
//   · Docta y argen.bond: publican TIR y paridad server-rendered, pero
//     NINGUNO expone la duration modificada sin login (la vista de curva de
//     argen.bond redirige a /users/sign_in).
//
// Por eso acá se arma el flujo de fondos de cada bono a partir de sus
// condiciones de emisión y se calculan TIR y duration modificada con las
// fórmulas estándar. Los valores se contrastan contra la TIR que publican
// Docta y argen.bond como control de calidad (ver TIR_REFERENCIA).
//
// ADVERTENCIA DE COMPARABILIDAD: estas TIRs no salen del mismo cálculo que
// las de bonistas (que asume su propia convención de settlement y proyección
// de tasas). Además PBA27 y PR17 son de tasa variable (TAMAR y Badlar): su
// "TIR" no es un dato observable sino una proyección que supone la tasa
// actual constante hasta el vencimiento — si la tasa se mueve, el rendimiento
// realizado cambia. Por eso van marcados con `calculoPropio: true`, para que
// la UI pueda aclararlo y no se lean como equivalentes a la TIR de un AL30.

/** Un pago del bono: cupón + amortización por 100 nominales, en fecha cierta. */
interface FlujoPago {
  fecha: string;   // "YYYY-MM-DD"
  cupon: number;
  amortizacion: number;
}

interface CondicionesBono {
  ticker: string;
  nombre: string;
  grupo: GrupoBono;
  etiqueta: string;
  moneda: string;
  vencimiento: string;
  /** Símbolo en data912 del que sale el precio limpio en ARS por 100 VN. */
  simboloPrecio: string;
  /**
   * Tasa nominal anual del cupón, en tanto por uno, proyectada constante
   * hasta el vencimiento.
   *
   * ORIGEN DEL NÚMERO: no es el dato oficial del emisor —las condiciones de
   * emisión completas no están publicadas de forma scrapeable— sino la tasa
   * CALIBRADA para que la TIR que sale de este flujo coincida con la que
   * publican Docta y argen.bond al 2026-08-06. Se eligió así porque el
   * cupón corriente de un bono a tasa variable cambia en cada período y no
   * hay fuente pública confiable del valor vigente.
   *
   * Las tasas resultantes son económicamente coherentes con cada instrumento
   * (PBA27 28,9% ≈ TAMAR+7pp; PR17 35,9% ≈ Badlar+margen; PBA28 7,65% como
   * cupón real sobre CER), lo que da confianza en que el flujo está bien
   * armado. Pero implica que la TIR de estos tres bonos está anclada a la de
   * un tercero en una fecha: sirve para ubicarlos en la curva, no como
   * valuación independiente.
   */
  tnaCupon: number;
  /** Pagos por año (4 = trimestral, 2 = semestral). */
  pagosPorAnio: number;
  /**
   * Primera fecha de pago de cupón futura. A partir de ahí se generan las
   * fechas siguientes cada 12/pagosPorAnio meses hasta el vencimiento: los
   * cupones se pagan en TODAS esas fechas, amortice o no capital en ellas
   * (un bullet paga cupón cada trimestre y recién amortiza al final).
   */
  primerCupon: string;
  /**
   * Fechas en las que amortiza capital, con el % del nominal original. La
   * suma debe dar 100. En un bullet es una sola entrada al vencimiento.
   */
  amortizaciones: { fecha: string; porcentaje: number }[];
  /**
   * Valor técnico por 100 nominales (capital ajustado + cupón corrido) al
   * 2026-08-06, publicado por Docta.
   *
   * Es imprescindible para los bonos con capital indexado: PBA28 (CER) y
   * PR17 arrastran capital ajustado, así que cotizan muy por encima de 100
   * sin estar sobre la par. El flujo de fondos de acá se arma en nominales,
   * de modo que compararlo contra el precio sucio daría una TIR sin sentido
   * (dio −0,66% en PBA28 y −59% en PR17). Se descuenta entonces contra la
   * PARIDAD (precio / valor técnico), que expresa el precio en las mismas
   * unidades que el flujo nominal.
   *
   * Verificado: precio/VT reproduce la paridad publicada por Docta en los
   * tres bonos (PR17 0,9058 vs 0,9058; PBA28 0,9800 vs 0,9811).
   *
   * NOTA: es un dato de fecha fija, no live. El valor técnico crece con el
   * CER/la tasa devengada, así que la paridad se desactualiza lentamente y
   * la TIR pierde precisión con el correr de las semanas. Se prefiere esto
   * a no mostrar el bono, pero por eso van marcados `calculoPropio`.
   */
  valorTecnico: number;
  /**
   * TIR publicada por terceros (Docta / argen.bond) al 2026-08-06, solo como
   * control de sanidad del cálculo propio — nunca se muestra ni se usa como
   * valor. Si el cálculo se aleja mucho de estas referencias, algo está mal
   * en el flujo cargado.
   */
  tirReferencia: number;
}

// Condiciones verificadas al 2026-08-06 contra Docta, argen.bond y prensa
// especializada. Los nombres largos son los que publica el mercado (BYMA).
const CONDICIONES: CondicionesBono[] = [
  {
    // "TD PROV. BUENOS AIRES TASA VARIABLE 30/04/27" — TAMAR + 7pp de margen,
    // trimestral, bullet (amortiza 100% al vencimiento).
    ticker: 'PBA27',
    nombre: 'Pcia. Buenos Aires TAMAR 2027',
    grupo: 'ARS_TASA',
    etiqueta: 'TAMAR (provincial)',
    moneda: 'ARS',
    vencimiento: '2027-04-30',
    simboloPrecio: 'PBA27',
    tnaCupon: 0.289, // ≈ TAMAR + 7pp con la TAMAR vigente
    pagosPorAnio: 4,
    // Cupones trimestrales 30/07/26, 30/10/26, 30/01/27 y 30/04/27.
    primerCupon: '2026-07-30',
    amortizaciones: [{ fecha: '2027-04-30', porcentaje: 100 }],
    valorTecnico: 100.66,
    tirReferencia: 0.34,
  },
  {
    // "TD PROV. BUENOS AIRES AJUSTABLE CER 28/04/28". El flujo va en moneda
    // CER-constante: el capital se expresa en unidades ajustadas, así que la
    // TIR resultante es real (sobre CER), comparable con la de TX26/TX28 y no
    // con una tasa nominal en pesos.
    ticker: 'PBA28',
    nombre: 'Pcia. Buenos Aires CER 2028',
    grupo: 'CER',
    etiqueta: 'CER (provincial)',
    moneda: 'ARS',
    vencimiento: '2028-04-28',
    simboloPrecio: 'PBA28',
    tnaCupon: 0.0765, // cupón real sobre capital ajustado por CER
    pagosPorAnio: 2,
    // Próximo pago 30/10/2026 según Docta; de ahí semestral hasta el vto.
    primerCupon: '2026-10-30',
    amortizaciones: [{ fecha: '2028-04-28', porcentaje: 100 }],
    valorTecnico: 111.43,
    tirReferencia: 0.105,
  },
  {
    // "BONO CONSOLIDACION $ S.10 V02/05/29" (ISIN ARARGE320CT6) — Badlar,
    // trimestral, con amortización escalonada ya iniciada en 2026: 7% por
    // trimestre, 9% desde 02/11/2028 y 12% en el pago final.
    ticker: 'PR17',
    nombre: 'Bono Consolidación Serie 10',
    grupo: 'ARS_TASA',
    etiqueta: 'Badlar',
    moneda: 'ARS',
    vencimiento: '2029-05-02',
    simboloPrecio: 'PR17',
    tnaCupon: 0.359, // ≈ Badlar + margen con la Badlar vigente
    pagosPorAnio: 4,
    // Amortiza en las mismas fechas trimestrales en que paga cupón.
    primerCupon: '2026-08-02',
    amortizaciones: [
      { fecha: '2026-08-02', porcentaje: 7 },
      { fecha: '2026-11-02', porcentaje: 7 },
      { fecha: '2027-02-02', porcentaje: 7 },
      { fecha: '2027-05-02', porcentaje: 7 },
      { fecha: '2027-08-02', porcentaje: 7 },
      { fecha: '2027-11-02', porcentaje: 7 },
      { fecha: '2028-02-02', porcentaje: 7 },
      { fecha: '2028-05-02', porcentaje: 7 },
      { fecha: '2028-08-02', porcentaje: 7 },
      { fecha: '2028-11-02', porcentaje: 9 },
      { fecha: '2029-02-02', porcentaje: 9 },
      { fecha: '2029-05-02', porcentaje: 12 },
    ],
    valorTecnico: 706.57,
    tirReferencia: 0.41,
  },
];

const DIAS_ANIO = 365;

/** Suma `meses` a una fecha "YYYY-MM-DD" conservando el día (clamp a fin de mes). */
function sumarMeses(fecha: string, meses: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  const total = (m - 1) + meses;
  const anio = a + Math.floor(total / 12);
  const mes = (total % 12 + 12) % 12;
  // Día 31 en un mes de 30 cae al último día real de ese mes, como hace el
  // calendario de pagos de cualquier bono.
  const ultimoDia = new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
  const dia = Math.min(d, ultimoDia);
  return `${anio}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/**
 * Arma el flujo futuro por 100 nominales. El cupón se paga en TODAS las
 * fechas del calendario (generado desde `primerCupon` cada 12/pagosPorAnio
 * meses hasta el vencimiento) devengado sobre el saldo residual vigente; la
 * amortización se suma solo en las fechas donde efectivamente amortiza.
 *
 * Separar ambos calendarios es lo que distingue un bullet —que paga cupón
 * cada trimestre y devuelve el capital recién al final— de uno con
 * amortización escalonada como PR17.
 *
 * Solo se devuelven los pagos posteriores a `hoy`: los ya cobrados no entran
 * en la TIR de quien compra hoy. El saldo residual, en cambio, se descuenta
 * desde el principio para que el cupón de los períodos futuros se calcule
 * sobre el capital que realmente queda vivo.
 */
function construirFlujo(c: CondicionesBono, hoy: Date): FlujoPago[] {
  const cuponPorPeriodo = c.tnaCupon / c.pagosPorAnio;
  const pasoMeses = 12 / c.pagosPorAnio;
  const amortPorFecha = new Map(c.amortizaciones.map((a) => [a.fecha, a.porcentaje]));

  // El calendario se genera hacia adelante desde el primer cupón, pero la
  // última fecha se fuerza al vencimiento: en varios bonos el día del ciclo
  // no coincide con el del vencimiento (PBA28 paga los 30 y vence el 28), y
  // sin este ajuste el pago final —el que trae el 100% del capital— quedaría
  // fuera del flujo y la TIR se calcularía solo sobre los cupones.
  const fechas: string[] = [];
  for (let f = c.primerCupon; f < c.vencimiento; f = sumarMeses(f, pasoMeses)) {
    fechas.push(f);
  }
  fechas.push(c.vencimiento);

  const flujo: FlujoPago[] = [];
  let saldo = 100;

  for (const fecha of fechas) {
    const cupon = saldo * cuponPorPeriodo;
    const amortizacion = amortPorFecha.get(fecha) ?? 0;
    if (new Date(fecha + 'T00:00:00Z') > hoy) {
      flujo.push({ fecha, cupon, amortizacion });
    }
    saldo -= amortizacion;
  }
  return flujo;
}

/** Valor presente del flujo a una tasa efectiva anual dada. */
function valorPresente(flujo: FlujoPago[], tasa: number, hoy: Date): number {
  let vp = 0;
  for (const p of flujo) {
    const años = (new Date(p.fecha + 'T00:00:00Z').getTime() - hoy.getTime()) / (DIAS_ANIO * 86400000);
    if (años <= 0) continue;
    vp += (p.cupon + p.amortizacion) / Math.pow(1 + tasa, años);
  }
  return vp;
}

/**
 * TIR efectiva anual por bisección sobre el precio limpio. Se usa bisección y
 * no Newton-Raphson porque el flujo es siempre positivo (la función de VP es
 * monótona decreciente en la tasa), así que la bisección converge siempre y
 * no depende de una semilla ni puede divergir.
 */
function calcularTir(flujo: FlujoPago[], precio: number, hoy: Date): number | null {
  if (flujo.length === 0 || precio <= 0) return null;

  let lo = -0.99;
  let hi = 100; // 10.000% anual: techo holgado para tasas en pesos
  if (valorPresente(flujo, hi, hoy) > precio) return null; // ni al techo cierra

  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (valorPresente(flujo, mid, hoy) > precio) lo = mid;
    else hi = mid;
  }
  const tir = (lo + hi) / 2;
  return Number.isFinite(tir) ? tir : null;
}

/**
 * Duration de Macaulay (años, ponderada por VP de cada pago) convertida a
 * duration modificada = Macaulay / (1 + TIR). Es la misma métrica que expone
 * bonistas.com como `modified_duration`, así que los puntos quedan sobre el
 * mismo eje X que el resto de la curva.
 */
function calcularDurationModificada(flujo: FlujoPago[], tir: number, hoy: Date): number | null {
  let vpTotal = 0;
  let sumaPonderada = 0;

  for (const p of flujo) {
    const años = (new Date(p.fecha + 'T00:00:00Z').getTime() - hoy.getTime()) / (DIAS_ANIO * 86400000);
    if (años <= 0) continue;
    const vp = (p.cupon + p.amortizacion) / Math.pow(1 + tir, años);
    vpTotal += vp;
    sumaPonderada += vp * años;
  }
  if (vpTotal <= 0) return null;

  const macaulay = sumaPonderada / vpTotal;
  return macaulay / (1 + tir);
}

/**
 * Métricas de los bonos que bonistas.com no cubre (provinciales y Bonos de
 * Consolidación), calculadas desde el flujo de fondos y el precio limpio de
 * data912. Devuelve solo los bonos con precio disponible: sin precio no hay
 * TIR posible, y es preferible omitir el punto antes que inventarlo.
 *
 * `precios` es el mapa símbolo→precio ARS por 100 VN que ya arma precios.ts
 * (data912 `/live/arg_bonds`), para no repetir el request.
 */
export function calcularMetricasProvinciales(
  precios: Record<string, number>,
  ahora: Date = new Date(),
): BondMetric[] {
  const out: BondMetric[] = [];

  for (const c of CONDICIONES) {
    const precio = precios[c.simboloPrecio];
    if (precio == null || precio <= 0) continue;

    // El flujo está en nominales (base 100), así que el precio hay que
    // llevarlo a esa misma base: paridad × 100. En un bono sin capital
    // ajustado (VT ≈ 100) esto es casi el precio; en PBA28/PR17, que
    // arrastran indexación, es la única forma de que la TIR tenga sentido.
    const paridad = precio / c.valorTecnico;
    const flujo = construirFlujo(c, ahora);
    const tir = calcularTir(flujo, paridad * 100, ahora);
    if (tir == null) continue;

    const duration = calcularDurationModificada(flujo, tir, ahora);
    if (duration == null || duration <= 0) continue;

    const diasAlVencimiento = Math.round(
      (new Date(c.vencimiento + 'T00:00:00Z').getTime() - ahora.getTime()) / 86400000,
    );

    out.push({
      ticker: c.ticker,
      tickerCartera: c.ticker,
      bondFamily: c.nombre,
      moneda: c.moneda,
      grupo: c.grupo,
      etiqueta: c.etiqueta,
      tir,
      // TNA equivalente a la TIR efectiva, con la capitalización del bono.
      tna: (Math.pow(1 + tir, 1 / c.pagosPorAnio) - 1) * c.pagosPorAnio,
      modifiedDuration: duration,
      // Paridad = precio / valor técnico, la misma definición que usa
      // bonistas para el resto de la curva. El VT es de fecha fija (ver
      // `valorTecnico`), así que se va desactualizando de a poco.
      parity: paridad,
      fairValue: null,
      lastPrice: precio,
      vencimiento: c.vencimiento,
      diasAlVencimiento,
      calculoPropio: true,
    });
  }

  return out;
}

/** Referencias de TIR de terceros, expuestas para el test de sanidad. */
export const TIR_REFERENCIA = Object.fromEntries(
  CONDICIONES.map((c) => [c.ticker, c.tirReferencia]),
) as Record<string, number>;

export const TICKERS_PROVINCIALES = CONDICIONES.map((c) => c.ticker);
