'use client';

import { useEffect, useState } from 'react';
import type { NoticiaItem, EventoCalendario } from '@/types';

interface UseCalendarioResult {
  noticias: NoticiaItem[];
  eventos: EventoCalendario[];
  finnhubConfigured: boolean;
  logos: Record<string, string>;
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
): UseCalendarioResult {
  const [noticias, setNoticias] = useState<NoticiaItem[]>([]);
  const [loadingNoticias, setLoadingNoticias] = useState(true);
  const [errorNoticias, setErrorNoticias] = useState<string | null>(null);

  const [eventos, setEventos] = useState<EventoCalendario[]>([]);
  const [finnhubConfigured, setFinnhubConfigured] = useState(true);
  const [logos, setLogos] = useState<Record<string, string>>({});
  const [loadingEventos, setLoadingEventos] = useState(true);
  const [errorEventos, setErrorEventos] = useState<string | null>(null);

  const tickersKey = tickers.join(',');
  const tickersArgKey = tickersArg.join(',');

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
    fetch(`/api/calendario-financiero?tickers=${tickersKey}&tickersArg=${tickersArgKey}&year=${year}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setEventos(json.eventos ?? []);
        setFinnhubConfigured(json.finnhubConfigured ?? false);
        setLogos(json.logos ?? {});
      })
      .catch((e) => setErrorEventos(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingEventos(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey, tickersArgKey, year]);

  return { noticias, eventos, finnhubConfigured, logos, loadingNoticias, loadingEventos, errorNoticias, errorEventos };
}
