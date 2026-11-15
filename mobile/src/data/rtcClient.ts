/**
 * Live video over WebRTC (browser standard). The camera page publishes its stream straight to each watching surgeon
 * (peer to peer, up to 1280x720 at 30 fps); the server only relays the handshake over a WebSocket (server/src/rtc.js).
 */
import { API_URL } from '@/api';
import { getIce } from './ice';


/** ws(s) URL of the signaling endpoint on the API host. */
export function rtcUrl(query: string): string {
  const o = API_URL && /^https?:/.test(API_URL) ? new URL(API_URL) : new URL(location.origin);
  return `${o.protocol === 'https:' ? 'wss' : 'ws'}://${o.host}/rtc?${query}`;
}
/** Query for the camera side: base is `/api/station/<id>` or `/api/cam/<token>`. */
export const pubQuery = (base: string) => {
  const m = /\/api\/(station|cam)\/([^/]+)/.exec(base);
  return m ? `role=pub&${m[1] === 'station' ? 'station' : 'token'}=${encodeURIComponent(m[2])}` : 'role=pub';
};
export const rtcSupported = () => typeof RTCPeerConnection !== 'undefined' && typeof WebSocket !== 'undefined';

/** Best capture settings: HD at 30 fps (the browser falls back to what the camera can do). */
export const HD_VIDEO = (face: 'environment' | 'user'): MediaTrackConstraints => ({ facingMode: { ideal: face }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } });

/** Publish `getStream()` to every surgeon who joins. Returns a stop function. */
/** Quality ladder: when the network gets tight the camera steps down (bitrate, resolution, frame rate) instead of freezing, and steps back up when it recovers. */
const LADDER = [
  { bps: 3_000_000, scale: 1, fps: 30 }, { bps: 1_500_000, scale: 1.5, fps: 24 }, { bps: 700_000, scale: 2, fps: 15 }, { bps: 300_000, scale: 3, fps: 10 },
];
export type Quality = { label: 'excellent' | 'fair' | 'poor'; level: number; rttMs: number | null; lossPct: number | null };

export function publish(query: string, getStream: () => MediaStream | null, onViewers: (n: number) => void, onQuality?: (q: Quality) => void): () => void {
  let ws: WebSocket | null = null, closed = false, retry: any = null;
  const peers = new Map<string, RTCPeerConnection>();
  const levels = new Map<string, { level: number; good: number }>();
  const drop = (id: string) => { peers.get(id)?.close(); peers.delete(id); levels.delete(id); onViewers(peers.size); };
  const applyLevel = (pc: RTCPeerConnection, level: number) => {
    const L = LADDER[level];
    for (const snd of pc.getSenders()) if (snd.track?.kind === 'video') {
      const p = snd.getParameters(); p.encodings = p.encodings?.length ? p.encodings : [{}];
      p.encodings[0].maxBitrate = L.bps; p.encodings[0].maxFramerate = L.fps; (p.encodings[0] as any).scaleResolutionDownBy = L.scale;
      snd.setParameters(p).catch(() => {});
    }
  };
  // every 4 s: measure round trip and packet loss to the doctor and adapt
  const adapt = setInterval(async () => {
    let worst: Quality | null = null;
    for (const [id, pc] of peers) {
      if (pc.connectionState !== 'connected') continue;
      let rtt: number | null = null, loss: number | null = null;
      const rep = await pc.getStats().catch(() => null); if (!rep) continue;
      rep.forEach((r: any) => {
        if (r.type === 'candidate-pair' && r.state === 'succeeded' && r.nominated && typeof r.currentRoundTripTime === 'number') rtt = r.currentRoundTripTime * 1000;
        if (r.type === 'remote-inbound-rtp' && r.kind === 'video') { if (typeof r.fractionLost === 'number') loss = r.fractionLost * 100; if (rtt == null && typeof r.roundTripTime === 'number') rtt = r.roundTripTime * 1000; }
      });
      const st = levels.get(id) ?? { level: 0, good: 0 };
      const poor = (loss ?? 0) > 10 || (rtt ?? 0) > 800, fair = (loss ?? 0) > 3 || (rtt ?? 0) > 350;
      if (poor) { st.level = Math.min(LADDER.length - 1, st.level + 1); st.good = 0; }
      else if (fair) { st.good = 0; if (st.level === 0) st.level = 1; }
      else if (++st.good >= 3 && st.level > 0) { st.level--; st.good = 0; }
      levels.set(id, st); applyLevel(pc, st.level);
      const q: Quality = { label: poor ? 'poor' : fair || st.level > 0 ? 'fair' : 'excellent', level: st.level, rttMs: rtt == null ? null : Math.round(rtt), lossPct: loss == null ? null : Math.round(loss * 10) / 10 };
      if (!worst || q.level > worst.level) worst = q;
    }
    if (worst) onQuality?.(worst);
  }, 4000);

  const connect = () => {
    ws = new WebSocket(rtcUrl(query));
    const send = (m: object) => { try { ws?.readyState === 1 && ws.send(JSON.stringify(m)); } catch { /* closing */ } };
    ws.onmessage = async ev => {
      let m: any; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'viewer-joined') {
        const s = getStream(); if (!s) return;
        drop(m.id);
        const pc = new RTCPeerConnection(await getIce()); peers.set(m.id, pc);
        s.getTracks().forEach(t => { if (t.kind === 'video') (t as any).contentHint = 'motion'; pc.addTrack(t, s); });
        pc.onicecandidate = e => { if (e.candidate) send({ type: 'ice', to: m.id, candidate: e.candidate }); };
        let restarts = 0;
        const restartIce = async () => { // a broken connection is repaired in place (new network path), not dropped
          if (restarts++ >= 3 || pc.signalingState === 'closed') return drop(m.id);
          try { pc.restartIce(); const o = await pc.createOffer({ iceRestart: true }); await pc.setLocalDescription(o); send({ type: 'offer', to: m.id, sdp: pc.localDescription }); } catch { drop(m.id); }
        };
        pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed') restartIce(); else if (pc.connectionState === 'disconnected') setTimeout(() => { if (pc.connectionState === 'disconnected') restartIce(); }, 4000); else if (pc.connectionState === 'closed') drop(m.id); else onViewers([...peers.values()].filter(p => p.connectionState === 'connected').length); };
        // high quality, steady frame rate: ~3 Mbps, keep resolution when the network is tight
        for (const snd of pc.getSenders()) if (snd.track?.kind === 'video') {
          const p = snd.getParameters(); p.encodings = p.encodings?.length ? p.encodings : [{}];
          p.encodings[0].maxBitrate = 3_000_000; p.encodings[0].maxFramerate = 30; (p as any).degradationPreference = 'maintain-resolution';
          snd.setParameters(p).catch(() => {});
        }
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
        send({ type: 'offer', to: m.id, sdp: pc.localDescription });
      } else if (m.type === 'answer') { await peers.get(m.from)?.setRemoteDescription(m.sdp).catch(() => {}); }
      else if (m.type === 'ice') { await peers.get(m.from)?.addIceCandidate(m.candidate).catch(() => {}); }
      else if (m.type === 'viewer-left') drop(m.id);
      else if (m.type === 'replaced') { closed = true; }
    };
    ws.onclose = () => { [...peers.keys()].forEach(drop); if (!closed) retry = setTimeout(connect, 2000); };
  };
  connect();
  return () => { closed = true; clearTimeout(retry); clearInterval(adapt); [...peers.keys()].forEach(drop); try { ws?.close(); } catch { /* ignore */ } };
}

export type ViewStats = { fps: number; width: number; height: number; kbps: number };

/** Surgeon side: connect to the astronaut's camera. Calls onStream with the live MediaStream. Returns a stop function. */
export function watch(userId: string | number, onStream: (s: MediaStream | null) => void, onState: (s: 'connecting' | 'live' | 'waiting' | 'failed') => void, onStats: (s: ViewStats) => void): () => void {
  let ws: WebSocket | null = null, pc: RTCPeerConnection | null = null, closed = false, retry: any = null, lastBytes = 0, lastT = 0;
  const statsTimer = setInterval(async () => {
    const rep = pc ? await pc.getStats().catch(() => null) : null; if (!rep) return;
    rep.forEach((r: any) => {
      if (r.type === 'inbound-rtp' && r.kind === 'video') {
        const kbps = lastT ? Math.round(((r.bytesReceived - lastBytes) * 8) / Math.max(1, r.timestamp - lastT)) : 0;
        lastBytes = r.bytesReceived; lastT = r.timestamp;
        onStats({ fps: Math.round(r.framesPerSecond ?? 0), width: r.frameWidth ?? 0, height: r.frameHeight ?? 0, kbps });
      }
    });
  }, 1000);
  const reset = () => { pc?.close(); pc = null; onStream(null); };
  const connect = () => {
    onState('connecting');
    ws = new WebSocket(rtcUrl(`role=view&user=${userId}`));
    ws.onmessage = async ev => {
      let m: any; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'no-publisher' || m.type === 'publisher-left') { reset(); onState('waiting'); }
      else if (m.type === 'offer') {
        if (pc && pc.signalingState !== 'closed' && pc.remoteDescription) { // the camera repaired its connection (ICE restart): answer on the same connection
          await pc.setRemoteDescription(m.sdp); const again = await pc.createAnswer(); await pc.setLocalDescription(again);
          ws?.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription })); return;
        }
        pc?.close(); pc = new RTCPeerConnection(await getIce()); const mine = pc;
        mine.ontrack = e => { onStream(e.streams[0]); onState('live'); };
        mine.onicecandidate = e => { if (e.candidate && ws?.readyState === 1) ws.send(JSON.stringify({ type: 'ice', candidate: e.candidate })); };
        mine.onconnectionstatechange = () => { if (mine.connectionState === 'failed') { onState('failed'); } };
        await mine.setRemoteDescription(m.sdp); const ans = await mine.createAnswer(); await mine.setLocalDescription(ans);
        ws?.send(JSON.stringify({ type: 'answer', sdp: mine.localDescription }));
      } else if (m.type === 'ice') { await pc?.addIceCandidate(m.candidate).catch(() => {}); }
    };
    ws.onclose = () => { reset(); if (!closed) { onState('waiting'); retry = setTimeout(connect, 2000); } };
  };
  connect();
  return () => { closed = true; clearInterval(statsTimer); clearTimeout(retry); reset(); try { ws?.close(); } catch { /* ignore */ } };
}

