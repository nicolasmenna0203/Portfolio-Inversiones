'use client';

import { useMemo, useState } from 'react';
import type { DashboardData, EventoTipo, EventoCalendario } from '@/types';
import { useCalendario } from '@/lib/useCalendario';
import { TIPOS_VALIDOS, TICKERS_INCLUIR, TICKERS_EXCLUIR } from '@/lib/tickersElegibles';
import { MAPEO_BONOS_ARG } from '@/lib/bonosArg';

interface Props {
  data: DashboardData;
}

const TIPO_EVENTO_META: Record<EventoTipo, { label: string; color: string }> = {
  dividendo:      { label: 'Dividendo',        color: '#19d3f3' },
  'dividendo-fut':{ label: 'Div. confirmado',  color: '#00b3e6' },
  earnings:       { label: 'Balance',          color: '#ef553b' },
  renta:          { label: 'Renta',            color: '#00cc96' },
  amortizacion:   { label: 'Amortización',     color: '#ffa15a' },
};

// Tipos agrupados para los filtros (dividendo histórico + futuro se filtran juntos).
const FILTROS_TIPO: { label: string; tipos: EventoTipo[] }[] = [
  { label: 'Balances',      tipos: ['earnings'] },
  { label: 'Dividendos',    tipos: ['dividendo', 'dividendo-fut'] },
  { label: 'Renta',         tipos: ['renta'] },
  { label: 'Amortización',  tipos: ['amortizacion'] },
];

const MESES_LABEL = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function fmtFechaEvento(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00Z');
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Formatea el cobro estimado, ej. "≈ US$ 4,23" o "≈ $ 1.240". */
function fmtMonto(monto: number, moneda?: string): string {
  const simbolo = moneda === 'ARS' ? '$' : 'US$';
  const dec = monto >= 100 ? 0 : 2;
  return `≈ ${simbolo} ${monto.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
}

function Pill({ label, active, color, onClick }: {
  label: string; active: boolean; color?: string; onClick: () => void;
}) {
  const c = color ?? 'var(--primary)';
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
        cursor: 'pointer', border: '1px solid',
        borderColor: active ? c : 'var(--border)',
        background: active ? `${c}22` : 'transparent',
        color: active ? c : 'var(--muted)',
        transition: 'all 0.12s',
      }}
    >{label}</button>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)',
      borderRadius: 12, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {children}
    </div>
  );
}

/** Genera las celdas (con padding de días de otros meses) para una grilla de semanas lunes-domingo. */
function celdasDelMes(year: number, mesIdx: number): (number | null)[] {
  const primerDia = new Date(Date.UTC(year, mesIdx, 1));
  const diasEnMes = new Date(Date.UTC(year, mesIdx + 1, 0)).getUTCDate();
  const offset = (primerDia.getUTCDay() + 6) % 7; // lunes=0..domingo=6

  const celdas: (number | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= diasEnMes; d++) celdas.push(d);
  while (celdas.length % 7 !== 0) celdas.push(null);
  return celdas;
}

// Logos de acciones/ETF vía Financial Modeling Prep (URL pública directa por ticker,
// sin API key). Los bonos ARG no tienen logo: caen al fallback de inicial.
function logoUrlDe(ticker: string): string {
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png`;
}

function LogoTicker({ ticker, conLogo, size }: { ticker: string; conLogo: boolean; size: number }) {
  const [error, setError] = useState(false);
  if (!conLogo || error) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%', background: 'var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.4, fontWeight: 700, color: 'var(--muted)', flexShrink: 0,
      }}>
        {ticker[0]}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrlDe(ticker)}
      alt={ticker}
      width={size}
      height={size}
      onError={() => setError(true)}
      style={{ borderRadius: '50%', flexShrink: 0, objectFit: 'contain', background: '#fff' }}
    />
  );
}

// Los bonos ARG (renta/amortización) no tienen logo de empresa; el resto sí.
function tickerConLogo(tipo: EventoTipo): boolean {
  return tipo !== 'renta' && tipo !== 'amortizacion';
}

function DiaCelda({
  dia, eventosDia, esHoy,
}: {
  dia: number | null;
  eventosDia?: EventoCalendario[];
  esHoy: boolean;
}) {
  if (dia === null) {
    return <div style={{ minHeight: 88, borderRadius: 8 }} />;
  }

  return (
    <div style={{
      minHeight: 88, borderRadius: 8, padding: '6px 6px',
      border: esHoy ? '1px solid var(--primary)' : '1px solid var(--border)',
      background: esHoy ? 'color-mix(in srgb, var(--primary) 10%, var(--card))' : 'var(--card)',
      display: 'flex', flexDirection: 'column', gap: 4,
    }}>
      <span style={{
        fontSize: 11, fontWeight: esHoy ? 800 : 600,
        color: esHoy ? 'var(--primary)' : 'var(--muted)',
      }}>
        {dia}
      </span>
      {eventosDia && eventosDia.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {eventosDia.map((e, i) => {
            const meta = TIPO_EVENTO_META[e.tipo];
            const montoTxt = e.montoEstimado != null && e.montoEstimado > 0 ? ` ${fmtMonto(e.montoEstimado, e.monedaMonto)}` : '';
            const tip = `${e.ticker}: ${meta.label}${e.detalle ? ` (${e.detalle})` : ''}${montoTxt}`;
            return (
              <div key={i} title={tip} style={{ position: 'relative' }}>
                <LogoTicker ticker={e.ticker} conLogo={tickerConLogo(e.tipo)} size={30} />
                <span style={{
                  position: 'absolute', bottom: -1, right: -1, width: 9, height: 9,
                  borderRadius: '50%', background: meta.color, border: '1.5px solid var(--card)',
                }} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function CalendarioTab({ data }: Props) {
  const { tenenciasPorMes } = data;

  const hoy = useMemo(() => new Date(), []);
  const [year, setYear] = useState(hoy.getUTCFullYear());
  const [mesIdx, setMesIdx] = useState(hoy.getUTCMonth());

  const irMesAnterior = () => {
    if (mesIdx === 0) { setMesIdx(11); setYear((y) => y - 1); }
    else setMesIdx((m) => m - 1);
  };
  const irMesSiguiente = () => {
    if (mesIdx === 11) { setMesIdx(0); setYear((y) => y + 1); }
    else setMesIdx((m) => m + 1);
  };
  const irHoy = () => { setYear(hoy.getUTCFullYear()); setMesIdx(hoy.getUTCMonth()); };
  const esMesActual = year === hoy.getUTCFullYear() && mesIdx === hoy.getUTCMonth();

  const tickersActivos = useMemo(() => {
    const meses = Object.keys(tenenciasPorMes).sort();
    const ultimoMes = meses[meses.length - 1];
    const items = tenenciasPorMes[ultimoMes] ?? [];
    const set = new Set(
      items
        .filter((t) => {
          const ticker = t.ticker.toUpperCase();
          if (TICKERS_EXCLUIR.has(ticker)) return false;
          if (TICKERS_INCLUIR.has(ticker)) return true;
          return TIPOS_VALIDOS.has(t.TIPO?.toUpperCase()) && t.SECTOR_GEO !== 'ARG';
        })
        .map((t) => t.ticker.toUpperCase()),
    );
    return [...set].sort();
  }, [tenenciasPorMes]);

  // Bonos/ONs ARG de la cartera que tengan cronograma de pagos mapeado (bonistas).
  const tickersArg = useMemo(() => {
    const meses = Object.keys(tenenciasPorMes).sort();
    const ultimoMes = meses[meses.length - 1];
    const items = tenenciasPorMes[ultimoMes] ?? [];
    const set = new Set(
      items
        .map((t) => t.ticker.toUpperCase())
        .filter((ticker) => ticker in MAPEO_BONOS_ARG),
    );
    return [...set].sort();
  }, [tenenciasPorMes]);

  // Valor de mercado (USD) de cada posición del último mes, para estimar el cobro real.
  const tenencias = useMemo(() => {
    const meses = Object.keys(tenenciasPorMes).sort();
    const ultimoMes = meses[meses.length - 1];
    const items = tenenciasPorMes[ultimoMes] ?? [];
    const map: Record<string, number> = {};
    for (const t of items) {
      if (t.tenencia_usd > 0) map[t.ticker.toUpperCase()] = t.tenencia_usd;
    }
    return map;
  }, [tenenciasPorMes]);

  const { eventos, loadingEventos, errorEventos } = useCalendario(tickersActivos, year, tickersArg, tenencias);

  const [filtroTicker, setFiltroTicker] = useState<string | null>(null);
  const [filtroTipos, setFiltroTipos] = useState<EventoTipo[] | null>(null);

  const tickersDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const e of eventos) set.add(e.ticker);
    return [...set].sort();
  }, [eventos]);

  const eventosFiltrados = useMemo(
    () => eventos.filter((e) =>
      (!filtroTicker || e.ticker === filtroTicker) &&
      (!filtroTipos || filtroTipos.includes(e.tipo)),
    ),
    [eventos, filtroTicker, filtroTipos],
  );

  const eventosPorDia = useMemo(() => {
    const map = new Map<string, EventoCalendario[]>();
    for (const e of eventosFiltrados) {
      const arr = map.get(e.fecha) ?? [];
      arr.push(e);
      map.set(e.fecha, arr);
    }
    return map;
  }, [eventosFiltrados]);

  const hoyKey = useMemo(() => hoy.toISOString().slice(0, 10), [hoy]);

  const celdas = useMemo(() => celdasDelMes(year, mesIdx), [year, mesIdx]);

  const eventosDelMes = useMemo(
    () => eventosFiltrados
      .filter((e) => e.fecha.startsWith(`${year}-${String(mesIdx + 1).padStart(2, '0')}`))
      .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [eventosFiltrados, year, mesIdx],
  );

  // Total estimado a cobrar en el mes, agrupado por moneda (los balances no suman).
  const totalMesPorMoneda = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const e of eventosDelMes) {
      if (e.montoEstimado != null && e.montoEstimado > 0) {
        const m = e.monedaMonto || 'USD';
        acc[m] = (acc[m] ?? 0) + e.montoEstimado;
      }
    }
    return acc;
  }, [eventosDelMes]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0, overflowY: 'auto' }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={irMesAnterior}
            style={{
              border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)',
              borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 13,
            }}
          >‹</button>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 700, minWidth: 150, textAlign: 'center' }}>
            {MESES_LABEL[mesIdx]} {year}
          </p>
          <button
            onClick={irMesSiguiente}
            style={{
              border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)',
              borderRadius: 8, padding: '4px 10px', cursor: 'pointer', fontSize: 13,
            }}
          >›</button>
          {!esMesActual && (
            <Pill label="Hoy" active={false} onClick={irHoy} />
          )}
        </div>

        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <Pill label="Todos" active={filtroTipos === null} onClick={() => setFiltroTipos(null)} />
          {FILTROS_TIPO.map((f) => {
            const activo = filtroTipos !== null && f.tipos.every((t) => filtroTipos.includes(t)) && filtroTipos.length === f.tipos.length;
            return (
              <Pill
                key={f.label}
                label={f.label}
                active={activo}
                color={TIPO_EVENTO_META[f.tipos[0]].color}
                onClick={() => setFiltroTipos((prev) =>
                  prev !== null && prev.length === f.tipos.length && f.tipos.every((t) => prev.includes(t)) ? null : f.tipos,
                )}
              />
            );
          })}
        </div>
      </div>

      {tickersDisponibles.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
          <Pill label="Todos" active={filtroTicker === null} onClick={() => setFiltroTicker(null)} />
          {tickersDisponibles.map((t) => (
            <Pill key={t} label={t} active={filtroTicker === t} onClick={() => setFiltroTicker((prev) => prev === t ? null : t)} />
          ))}
        </div>
      )}

      {loadingEventos ? (
        <Card>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Cargando eventos de {year}…</p>
        </Card>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {DIAS_SEMANA.map((d) => (
                <div key={d} style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textAlign: 'center' }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
              {celdas.map((dia, i) => {
                const key = dia !== null ? `${year}-${String(mesIdx + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}` : '';
                return (
                  <DiaCelda
                    key={i}
                    dia={dia}
                    eventosDia={dia !== null ? eventosPorDia.get(key) : undefined}
                    esHoy={key === hoyKey}
                  />
                );
              })}
            </div>
          </div>

          <Card>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--primary)' }}>
                Eventos de {MESES_LABEL[mesIdx]}
              </p>
              {Object.keys(totalMesPorMoneda).length > 0 && (
                <p
                  title="Total estimado a cobrar este mes (dividendos + renta + amortización) según tu tenencia y precios actuales"
                  style={{ margin: 0, fontSize: 12, fontWeight: 700, color: 'var(--text)' }}
                >
                  A cobrar:{' '}
                  {Object.entries(totalMesPorMoneda)
                    .map(([moneda, total]) => fmtMonto(total, moneda))
                    .join('  ·  ')}
                </p>
              )}
            </div>
            {eventosDelMes.length === 0 ? (
              <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>Sin eventos este mes para los tickers actuales.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {eventosDelMes.map((e, i) => {
                  const meta = TIPO_EVENTO_META[e.tipo];
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '4px 0' }}>
                      <LogoTicker ticker={e.ticker} conLogo={tickerConLogo(e.tipo)} size={20} />
                      <span style={{ color: 'var(--muted)', minWidth: 80, flexShrink: 0 }}>{fmtFechaEvento(e.fecha)}</span>
                      <span style={{ fontWeight: 700, color: 'var(--text)', minWidth: 56 }}>{e.ticker}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 700, color: meta.color, background: `${meta.color}22`,
                        padding: '2px 8px', borderRadius: 10,
                      }}>{meta.label}</span>
                      {e.detalle && <span style={{ color: 'var(--muted)' }}>{e.detalle}</span>}
                      {e.montoEstimado != null && e.montoEstimado > 0 && (
                        <span
                          title="Cobro estimado según tu tenencia y el precio de mercado actual"
                          style={{ marginLeft: 'auto', fontWeight: 700, color: meta.color, whiteSpace: 'nowrap' }}
                        >
                          {fmtMonto(e.montoEstimado, e.monedaMonto)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}

      {errorEventos && (
        <p style={{ margin: 0, fontSize: 11, color: '#ef553b' }}>Algunos eventos no pudieron cargarse: {errorEventos}</p>
      )}
    </div>
  );
}
