'use client';

import { useEffect, useState } from 'react';
import type { NoticiaItem, EventoCalendario } from '@/types';

interface UseCalendarioResult {
  noticias: NoticiaItem[];
  eventos: EventoCalendario[];
  finnhubConfigured: boolean;
  loadingNoticias: boolean;
  loadingEventos: boolean;
  errorNoticias: string | null;
  errorEventos: string | null;
}

/** Trae noticias y eventos de calendario (earnings/dividendos) para una lista de tickers USA. */
export function useCalendario(tickers: string[]): UseCalendarioResult {
  const [noticias, setNoticias] = useState<NoticiaItem[]>([]);
  const [loadingNoticias, setLoadingNoticias] = useState(true);
  const [errorNoticias, setErrorNoticias] = useState<string | null>(null);

  const [eventos, setEventos] = useState<EventoCalendario[]>([]);
  const [finnhubConfigured, setFinnhubConfigured] = useState(true);
  const [loadingEventos, setLoadingEventos] = useState(true);
  const [errorEventos, setErrorEventos] = useState<string | null>(null);

  const tickersKey = tickers.join(',');

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
    if (!tickersKey) { setLoadingEventos(false); return; }
    setLoadingEventos(true);
    setErrorEventos(null);
    fetch(`/api/calendario-financiero?tickers=${tickersKey}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setEventos(json.eventos ?? []);
        setFinnhubConfigured(json.finnhubConfigured ?? false);
      })
      .catch((e) => setErrorEventos(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingEventos(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  return { noticias, eventos, finnhubConfigured, loadingNoticias, loadingEventos, errorNoticias, errorEventos };
}
