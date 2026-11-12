/**
 * Web-only iPhone preview.
 * On a wide desktop browser the app is shown inside an iPhone-sized frame (an iframe of the app itself), so every
 * screen lays out at a real iPhone viewport — exactly what the Xcode / native build will get.
 * Inside the frame the app gets iPhone safe-area insets (status bar + home indicator).
 * Native builds and real phone browsers never use any of this.
 */
import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const web = Platform.OS === 'web' && typeof window !== 'undefined';

/** iPhone viewports in points, with their portrait safe-area insets. */
export const DEVICES = {
  'iphone-16-pro': { label: 'iPhone 16 Pro', w: 402, h: 874, top: 62, bottom: 34, island: true },
  'iphone-16': { label: 'iPhone 16 / 15', w: 393, h: 852, top: 59, bottom: 34, island: true },
  'iphone-16-pro-max': { label: 'iPhone 16 Pro Max', w: 440, h: 956, top: 62, bottom: 34, island: true },
  'iphone-se': { label: 'iPhone SE', w: 375, h: 667, top: 20, bottom: 0, island: false },
} as const;
type DeviceKey = keyof typeof DEVICES;

const param = (k: string) => (web ? new URLSearchParams(window.location.search).get(k) : null);
const embedded = web && window.self !== window.top && param('device') != null;

/** True on a desktop-width browser tab (not inside the frame): render <DeviceFrame/> instead of the app. */
/** Set to true to bring the iPhone preview frame back on desktop (off while the web app and the native app are separate versions). */
const FRAME_ENABLED = false;
export const shouldFrame = FRAME_ENABLED && web && !embedded && window.innerWidth >= 700 && param('frame') !== '0';

/** Inside the frame: give the app the device's safe-area insets. Elsewhere: pass through. */
export function DeviceInsets({ children }: { children: React.ReactNode }) {
  if (!embedded) return <>{children}</>;
  const d = DEVICES[(param('device') as DeviceKey)] ?? DEVICES['iphone-16'];
  return <SafeAreaInsetsContext.Provider value={{ top: d.top, bottom: d.bottom, left: 0, right: 0 }}>{children}</SafeAreaInsetsContext.Provider>;
}

const pick = (): DeviceKey => {
  try { const v = localStorage.getItem('astra.device'); if (v && v in DEVICES) return v as DeviceKey; } catch {}
  return 'iphone-16';
};

export function DeviceFrame() {
  const [key, setKey] = useState<DeviceKey>(pick);
  const [vh, setVh] = useState(window.innerHeight);
  useEffect(() => { const on = () => setVh(window.innerHeight); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  const d = DEVICES[key];
  const bezel = 14;
  const scale = Math.min(1, (vh - 90) / (d.h + bezel * 2));
  const src = (() => {
    const u = new URL(window.location.href);
    u.searchParams.set('device', key);
    return u.pathname + u.search + u.hash;
  })();
  const choose = (k: DeviceKey) => { setKey(k); try { localStorage.setItem('astra.device', k); } catch {} };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(circle at 50% 30%, #F8EEE8, #E9D9CF)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: d.w + bezel * 2, height: d.h + bezel * 2, transform: `scale(${scale})`, transformOrigin: 'center', margin: `${((scale - 1) * (d.h + bezel * 2)) / 2}px 0`, flex: 'none' }}>
        <div style={{ position: 'relative', boxSizing: 'border-box', width: '100%', height: '100%', borderRadius: d.island ? 68 : 46, background: '#1a1411', padding: bezel, boxShadow: '0 40px 90px -30px rgba(70,35,15,.55), inset 0 0 0 2px #4a3a31' }}>
          <iframe key={key} title="Astra on iPhone" allow="camera" src={src} style={{ width: d.w, height: d.h, border: 0, borderRadius: d.island ? 55 : 0, display: 'block', background: '#F8EEE8' }} />
          {d.island ? <div style={{ position: 'absolute', left: '50%', top: bezel + 11, width: 124, height: 36, marginLeft: -62, borderRadius: 18, background: '#000', pointerEvents: 'none' }} /> : null}
          {d.island ? <div style={{ position: 'absolute', left: '50%', bottom: bezel + 8, width: 140, height: 5, marginLeft: -70, borderRadius: 3, background: 'rgba(0,0,0,.35)', pointerEvents: 'none' }} /> : null}
        </div>
      </div>
      <div role="radiogroup" aria-label="Device size" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {(Object.keys(DEVICES) as DeviceKey[]).map(k => (
          <button key={k} role="radio" aria-checked={k === key} onClick={() => choose(k)}
            style={{ cursor: 'pointer', border: '1px solid ' + (k === key ? '#B8693F' : '#E3CFC3'), background: k === key ? '#B8693F' : '#fff', color: k === key ? '#fff' : '#2B1E18', borderRadius: 999, padding: '6px 12px', fontSize: 12 }}>
            {DEVICES[k].label} · {DEVICES[k].w}×{DEVICES[k].h}
          </button>
        ))}
      </div>
    </div>
  );
}
