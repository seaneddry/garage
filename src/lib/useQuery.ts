import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A tiny data layer. Every query re-runs when `bump()` is called, which happens
 * after any save, delete or import, so screens never show stale numbers.
 */
interface DataContextValue {
  version: number;
  bump: () => void;
}

const DataContext = createContext<DataContextValue>({ version: 0, bump: () => {} });

export function DataProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ version, bump }), [version, bump]);
  return createElement(DataContext.Provider, { value }, children);
}

export function useBump(): () => void {
  return useContext(DataContext).bump;
}

export interface QueryState<T> {
  data: T | undefined;
  error: string | undefined;
  loading: boolean;
  reload: () => void;
}

export function useQuery<T>(fn: () => Promise<T>, deps: readonly unknown[]): QueryState<T> {
  const { version } = useContext(DataContext);
  const [state, setState] = useState<{ data: T | undefined; error: string | undefined; loading: boolean }>({
    data: undefined,
    error: undefined,
    loading: true,
  });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ data: s.data, error: undefined, loading: true }));
    fn()
      .then((data) => {
        if (alive) setState({ data, error: undefined, loading: false });
      })
      .catch((e: unknown) => {
        if (alive) setState((s) => ({ data: s.data, error: errorMessage(e), loading: false }));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}
