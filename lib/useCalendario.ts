'use client';

import { useEffect, useState } from 'react';
import type { NoticiaItem, EventoCalendario, YieldTicker } from '@/types';

interface UseCalendarioResult {
  noticias: NoticiaItem[];
  eventos: EventoCalendario[];
  yields: YieldTicker[];
  loadingNoticias: boolean;
  loadingEventos: boolean;
  errorNoticias: string | null;
  errorEventos: string | null;
}

/** Trae noticias y eventos de calendario para tickers USA (dividendos/balances) y ARG (renta/amortización). */
export function useCalendario(
  tickers: string[],
  year: number = new Date().getUTCFullYear(),
  tickersArg: string[] = [],
  tenencias: Record<string, number> = {},
): UseCalendarioResult {
  const [noticias, setNoticias] = useState<NoticiaItem[]>([]);
  const [loadingNoticias, setLoadingNoticias] = useState(true);
  const [errorNoticias, setErrorNoticias] = useState<string | null>(null);

  const [eventos, setEventos] = useState<EventoCalendario[]>([]);
  const [yields, setYields] = useState<YieldTicker[]>([]);
  const [loadingEventos, setLoadingEventos] = useState(true);
  const [errorEventos, setErrorEventos] = useState<string | null>(null);

  const tickersKey = tickers.join(',');
  const tickersArgKey = tickersArg.join(',');
  const tenenciasKey = JSON.stringify(tenencias);

  useEffect(() => {
    setLoadingNoticias(true);
    setErrorNoticias(null);
    fetch(`/api/noticias?tickers=${tickersKey}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setNoticias(json.noticias ?? []);
      })
      .catch((e) => setErrorNoticias(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingNoticias(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  useEffect(() => {
    if (!tickersKey && !tickersArgKey) { setLoadingEventos(false); return; }
    setLoadingEventos(true);
    setErrorEventos(null);
    fetch('/api/calendario-financiero', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers: tickersKey ? tickersKey.split(',') : [],
        tickersArg: tickersArgKey ? tickersArgKey.split(',') : [],
        tenencias: JSON.parse(tenenciasKey),
        year,
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setEventos(json.eventos ?? []);
        setYields(json.yields ?? []);
      })
      .catch((e) => setErrorEventos(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingEventos(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey, tickersArgKey, tenenciasKey, year]);

  return { noticias, eventos, yields, loadingNoticias, loadingEventos, errorNoticias, errorEventos };
}
