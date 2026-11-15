/** A relative's device remembers the private credential after the family code was entered once (web only). */
const KEY = 'celeste.relative';
export const getRelativeToken = (): string | null => { try { return typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null; } catch { return null; } };
export const setRelativeToken = (t: string) => { try { localStorage.setItem(KEY, t); } catch { /* private mode */ } };
export const clearRelativeToken = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } };
