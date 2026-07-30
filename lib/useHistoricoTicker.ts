'use client';

import { useEffect, useState } from 'react';
import type { HistoricoResponse, RangoHistorico } from '@/types';

interface UseHistoricoTickerResult {
  data: HistoricoResponse | null;
  loading: boolean;
  error: string | null;
}

/** Histórico de precio de cierre de un ticker en el rango pedido, para el gráfico de Renta Variable. */
export function useHistoricoTicker(ticker: string | null, rango: RangoHistorico): UseHistoricoTickerResult {
  const [data, setData] = useState<HistoricoResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) { setData(null); return; }
    setLoading(true);
    setError(null);
    fetch(`/api/performance-historico?ticker=${encodeURIComponent(ticker)}&rango=${rango}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json as HistoricoResponse);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [ticker, rango]);

  return { data, loading, error };
}
