'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { PerformanceVariableResponse } from '@/types';

interface UsePerformanceVariableResult {
  data: PerformanceVariableResponse | null;
  loading: boolean;
  error: string | null;
}

/** Trae precio, fundamentals (P/E, market cap, 52w) y variaciones del universo de acciones/CEDEARs/ETF de la cartera. */
export function usePerformanceVariable(tickersUsa: string[], tenencias: Record<string, number>): UsePerformanceVariableResult {
  const [data, setData] = useState<PerformanceVariableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();
  const apiBase = pathname?.startsWith('/demo') ? '/api/demo' : '/api';

  const tickersKey = JSON.stringify(tickersUsa);
  const tenenciasKey = JSON.stringify(tenencias);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${apiBase}/performance-variable`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickersUsa: JSON.parse(tickersKey), tenencias: JSON.parse(tenenciasKey) }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setData(json as PerformanceVariableResponse);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [tickersKey, tenenciasKey, apiBase]);

  return { data, loading, error };
}
