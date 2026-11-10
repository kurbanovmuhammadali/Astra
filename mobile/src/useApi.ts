import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api } from './api';
import { useReplay, withAsOf } from './replay';

export function useApi<T>(path: string | null) {
  const { asOf } = useReplay();
  const url = path ? withAsOf(path, asOf) : null;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!url) return;
    try { setData(await api<T>(url)); setError(null); } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }, [url]);
  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { data, error, loading, reload: load, setData };
}
