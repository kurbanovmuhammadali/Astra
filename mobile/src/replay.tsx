import React, { createContext, useContext, useMemo, useState } from 'react';

/** Mission replay: when `asOf` is set, dashboard / plan / metric / report requests are answered "as of" that moment. */
type Ctx = { asOf: string | null; setAsOf: (v: string | null) => void };
const ReplayCtx = createContext<Ctx>({ asOf: null, setAsOf: () => {} });

export function ReplayProvider({ children }: { children: React.ReactNode }) {
  const [asOf, setAsOf] = useState<string | null>(null);
  const value = useMemo(() => ({ asOf, setAsOf }), [asOf]);
  return <ReplayCtx.Provider value={value}>{children}</ReplayCtx.Provider>;
}
export const useReplay = () => useContext(ReplayCtx);

const REPLAYABLE = /^\/api\/(dashboard|plan|metrics\/|report|assistant)/;
export const withAsOf = (path: string, asOf: string | null) =>
  asOf && REPLAYABLE.test(path) ? `${path}${path.includes('?') ? '&' : '?'}asOf=${encodeURIComponent(asOf)}` : path;
