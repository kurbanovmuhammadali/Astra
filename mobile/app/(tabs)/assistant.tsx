import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import { Keyboard, Paperclip, ArrowUp, X, FileText, FlaskConical, Image as ImageIcon, Volume2, VolumeX, Mic, ChevronLeft, History, Plus } from 'lucide-react-native';
import { useAuth } from '@/auth';
import { ELEV, K, native, web } from '@/kit/tokens';
import { FocusReplay, Kicker, Pressy, Rise, Txt, haptic, useLayout } from '@/kit/core';
import { ListRow, ListGroup, Sheet, Tag } from '@/kit/ui';
import { Backdrop } from '@/kit/page';
import { MicBadge, OrbState } from '@/kit/orb';
import { AiAvatar, AiIntro } from '@/AiAvatar';
import { getFlag, setFlag } from '@/storage';
import { usePageMotion } from '@/kit/pageMotion';
import { leaveTab } from '@/kit/transition';
import { SUGGESTIONS, ask, titleFor } from '@/data/assistant';
import { useCrew } from '@/data/crew';
import { ChatMsg, getStore, setStore, uid, useStore } from '@/data/store';

const TITLE: Record<OrbState, string> = { ready: 'Hello', listening: 'I’m listening', thinking: 'Thinking…', speaking: 'Celeste is speaking' };

function Bubble({ m, streaming }: { m: ChatMsg; streaming?: boolean }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.spring(a, { toValue: 1, useNativeDriver: native, speed: 16, bounciness: 6 }).start(); }, []);
  const me = m.role === 'user';
  return (
    <Animated.View style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '86%', marginTop: 10, opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }, { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }}>
      {m.files?.map(f => (
        <View key={f} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', backgroundColor: K.cardSolid, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 4, borderWidth: 1, borderColor: K.hair2 }}>
          <FileText size={14} color={K.copper} /><Txt v="caption">{f}</Txt>
        </View>
      ))}
      <View style={[{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderBottomRightRadius: me ? 6 : 20, borderBottomLeftRadius: me ? 20 : 6, backgroundColor: me ? K.copper : K.cardSolid, borderWidth: me ? 0 : 1, borderColor: K.hair }, !me && ELEV.card]}>
        <Txt v="body" color={me ? '#fff' : K.ink}>{m.text}{streaming ? ' ▍' : ''}</Txt>
      </View>
    </Animated.View>
  );
}

function Typing() {
  const dots = [0, 1, 2].map(() => useRef(new Animated.Value(0)).current);
  useEffect(() => {
    const l = Animated.loop(Animated.stagger(140, dots.map(d => Animated.sequence([Animated.timing(d, { toValue: 1, duration: 280, useNativeDriver: native }), Animated.timing(d, { toValue: 0, duration: 280, useNativeDriver: native })]))));
    l.start(); return () => l.stop();
  }, []);
  return (
    <View style={{ flexDirection: 'row', gap: 4, alignSelf: 'flex-start', backgroundColor: K.cardSolid, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 13, marginTop: 10, borderWidth: 1, borderColor: K.hair }}>
      {dots.map((d, i) => <Animated.View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: K.copper, opacity: d.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }), transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }} />)}
    </View>
  );
}

export default function Assistant() {
  const insets = useSafeAreaInsets();
  // tab transition (shared with every page) + the sphere powering up each time you arrive on SI
  const motion = usePageMotion({ tabs: true });
  const pop = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!motion.arrivals) return;
    pop.setValue(0); burst.setValue(0);
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, delay: 180, useNativeDriver: native, speed: 5, bounciness: 9 }),
      Animated.timing(burst, { toValue: 1, duration: 1100, delay: 320, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
    ]).start();
  }, [motion.arrivals]);
  const { sidebar, gutter } = useLayout();
  const { user } = useAuth();
  const crew = useCrew();
  const params = useLocalSearchParams<{ chat?: string; t?: string }>();
  const chats = useStore(s => s.chats);
  const [chatId, setChatId] = useState<string | null>(null);
  const [state, setState] = useState<OrbState>('ready');
  // first meeting: the comet → ring → avatar animation, ending exactly where the avatar sits
  const rootRef = useRef<View>(null), avRef = useRef<View>(null);
  const [rootSize, setRootSize] = useState<{ w: number; h: number } | null>(null);
  const [introPending, setIntroPending] = useState(false);
  const [introBox, setIntroBox] = useState<{ x: number; y: number; size: number } | null>(null);
  useEffect(() => { getFlag('aiIntroSeen').then(seen => { if (!seen) setIntroPending(true); }); }, []);
  const measureIntro = () => {
    if (!introPending || introBox) return;
    setTimeout(() => avRef.current?.measureInWindow((ax, ay, aw) => rootRef.current?.measureInWindow((rx, ry) => setIntroBox({ x: ax - rx, y: ay - ry, size: aw }))), 750);
  };
  useEffect(() => { if (introPending) measureIntro(); }, [introPending]);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<string[]>([]);
  const [heard, setHeard] = useState('');
  const [stream, setStream] = useState<ChatMsg | null>(null);
  const [attach, setAttach] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const [kb, setKb] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const rec = useRef<any>(null);
  const sim = useRef<ReturnType<typeof setTimeout>[]>([]);
  const input = useRef<TextInput>(null);

  useEffect(() => { if (params.chat) { setChatId(params.chat === 'new' ? null : params.chat); setState('ready'); setStream(null); } }, [params.chat, params.t]);
  useEffect(() => () => { Speech.stop(); sim.current.forEach(clearTimeout); rec.current?.abort?.(); }, []);
  const chat = chats.find(c => c.id === chatId) ?? null;
  const msgs = chat?.messages ?? [];
  const convo = msgs.length > 0 || !!stream;
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60); }, [msgs.length, stream?.text]);

  const ctx = () => ({ name: user?.name ?? '', recovery: crew.days[6].recovery, sleep: crew.days[6].sleep, hrv: crew.days[6].hrv != null ? Math.round(crew.days[6].hrv) : null, rhr: crew.days[6].rhr, dose: crew.days[6].dose, doseTotal: crew.doseTotal, missionDay: crew.missionDay, duration: crew.duration });

  const push = (id: string, m: ChatMsg, title?: string) => setStore(s => {
    const exists = s.chats.find(c => c.id === id);
    const chats = exists
      ? s.chats.map(c => (c.id === id ? { ...c, at: m.at, messages: [...c.messages, m] } : c))
      : [{ id, title: title ?? 'New conversation', sub: m.files?.length ? 'Report attached' : 'Voice and chat', at: m.at, messages: [m] }, ...s.chats];
    return { ...s, chats };
  });

  const send = async (text: string, viaVoice = false) => {
    const q = text.trim();
    if (!q && !files.length) return;
    haptic.soft();
    const id = chatId ?? uid();
    if (!chatId) setChatId(id);
    const m: ChatMsg = { id: uid(), role: 'user', text: q || 'Please review this file.', at: Date.now(), files: files.length ? files : undefined };
    push(id, m, titleFor(q || files[0]));
    setDraft(''); setFiles([]); setHeard('');
    setState('thinking'); setTyping(true);
    const history = [...(getStore().chats.find(c => c.id === id)?.messages ?? [])];
    const reply = await ask(history, ctx());
    setTyping(false);
    // stream the reply word by word while the orb "speaks"
    setState('speaking');
    if (voiceOn && viaVoice) Speech.speak(reply, { rate: 1.0, pitch: 1.0, onDone: () => setState('ready'), onStopped: () => setState('ready') });
    const words = reply.split(' ');
    const sm: ChatMsg = { id: uid(), role: 'astra', text: '', at: Date.now() };
    for (let i = 1; i <= words.length; i++) {
      await new Promise(r => setTimeout(r, 34));
      setStream({ ...sm, text: words.slice(0, i).join(' ') });
    }
    setStream(null);
    push(id, { ...sm, text: reply, at: Date.now() });
    haptic.success();
    if (!(voiceOn && viaVoice)) setState('ready');
  };

  const stopListening = (submit: boolean) => {
    sim.current.forEach(clearTimeout); sim.current = [];
    try { rec.current?.stop?.(); } catch {}
    rec.current = null;
    if (submit && heard.trim()) send(heard, true); else setState('ready');
  };
  const listen = () => {
    if (state === 'listening') return stopListening(true);
    Speech.stop();
    haptic.firm();
    setState('listening'); setHeard('');
    const SR = web && typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;
    if (SR) {
      try {
        const r = new SR(); rec.current = r;
        r.lang = 'en-US'; r.interimResults = true; r.continuous = false;
        let final = '';
        r.onresult = (e: any) => { let t = ''; for (const res of e.results) t += res[0].transcript; final = t; setHeard(t); };
        r.onerror = () => { rec.current = null; simulate(); };
        r.onend = () => { if (rec.current) { rec.current = null; if (final.trim()) send(final, true); else setState('ready'); } };
        r.start();
        return;
      } catch { /* fall through to simulation */ }
    }
    simulate();
  };
  // demo transcription: types a suggested question as if spoken, then sends it
  const simulate = () => {
    const q = SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)];
    const words = q.split(' ');
    words.forEach((_, i) => sim.current.push(setTimeout(() => setHeard(words.slice(0, i + 1).join(' ')), 700 + i * 260)));
    sim.current.push(setTimeout(() => { sim.current = []; send(q, true); }, 900 + words.length * 260 + 500));
  };

  const newChat = () => { Speech.stop(); stopListening(false); setChatId(null); setStream(null); setKb(false); setState('ready'); };
  const orbSize = convo ? 96 : sidebar ? 260 : 210;
  const first = user?.name.split(' ')[0] ?? 'crew';

  const controls = (
    <View style={{ paddingHorizontal: gutter, paddingBottom: (sidebar ? 22 : 104) + insets.bottom, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
      {files.length ? (
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
          {files.map(f => (
            <Pressy key={f} label={`Remove ${f}`} onPress={() => setFiles(x => x.filter(y => y !== f))}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: K.cardSolid, borderRadius: 12, paddingHorizontal: 10, height: 32, borderWidth: 1, borderColor: K.hair2 }}>
                <FileText size={14} color={K.copper} /><Txt v="caption">{f}</Txt><X size={13} color={K.ink3} />
              </View>
            </Pressy>
          ))}
        </View>
      ) : null}
      {typing || state === 'thinking' ? null : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 12, justifyContent: 'center', flexGrow: 1 }}>
          {SUGGESTIONS.slice(0, convo ? 4 : 2).map(s => (
            <Pressy key={s} label={s} onPress={() => send(s)}>
              <View style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: 'rgba(255,253,251,0.85)', borderWidth: 1, borderColor: K.hair2, justifyContent: 'center' }}><Txt v="subM">{s}</Txt></View>
            </Pressy>
          ))}
        </ScrollView>
      )}
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: K.cardSolid, borderRadius: 26, padding: 6, paddingLeft: 16, borderWidth: 1, borderColor: K.hair2 }, ELEV.card]}>
        <TextInput ref={input} value={draft} onChangeText={setDraft} placeholder={state === 'listening' ? 'Listening…' : 'Ask Celeste about your health'} placeholderTextColor={K.ink3}
          onSubmitEditing={() => send(draft)} returnKeyType="send" style={[{ flex: 1, fontFamily: 'Geist_400Regular', fontSize: 15, color: K.ink, height: 40 }, web ? ({ outlineStyle: 'none' } as any) : null]} />
        <Pressy label="Attach a file" onPress={() => setAttach(true)}><View style={{ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' }}><Paperclip size={18} color={K.ink2} /></View></Pressy>
        {draft.trim() || files.length ? (
          <Pressy label="Send" onPress={() => send(draft)} to={0.88}><View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: K.copper, alignItems: 'center', justifyContent: 'center' }}><ArrowUp size={19} color="#fff" strokeWidth={2.4} /></View></Pressy>
        ) : (
          <Pressy label={state === 'listening' ? 'Stop' : 'Speak'} onPress={listen} to={0.88}><View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: state === 'listening' ? K.copperDeep : K.copperTint, alignItems: 'center', justifyContent: 'center' }}><Mic size={18} color={state === 'listening' ? '#fff' : K.copper} /></View></Pressy>
        )}
      </View>
    </View>
  );

  const voiceControls = (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', paddingHorizontal: 30, paddingBottom: (sidebar ? 28 : 112) + insets.bottom, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
      {[{ icon: Keyboard, label: 'Keyboard', on: () => { setChatId(chatId ?? null); setTimeout(() => input.current?.focus(), 50); setKb(true); } }].map(b => (
        <Pressy key={b.label} label={b.label} onPress={b.on}><View style={{ alignItems: 'center', gap: 6 }}><View style={[{ width: 50, height: 50, borderRadius: 25, backgroundColor: K.cardSolid, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: K.hair2 }, ELEV.card]}><b.icon size={20} color={K.ink} /></View><Txt v="caption" color={K.ink2}>{b.label}</Txt></View></Pressy>
      ))}
      <View style={{ alignItems: 'center', gap: 6, marginBottom: -4 }}><MicBadge listening={state === 'listening'} onPress={listen} /><Txt v="caption" color={K.ink2}>{state === 'listening' ? 'Tap to send' : 'Microphone'}</Txt></View>
      <Pressy label="Attach file" onPress={() => setAttach(true)}><View style={{ alignItems: 'center', gap: 6 }}><View style={[{ width: 50, height: 50, borderRadius: 25, backgroundColor: K.cardSolid, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: K.hair2 }, ELEV.card]}><Paperclip size={20} color={K.ink} /></View><Txt v="caption" color={K.ink2}>Attach file</Txt></View></Pressy>
    </View>
  );
  const showComposer = convo || kb || files.length > 0;

  return (
    <FocusReplay>
      <Animated.View style={[motion.style, { backgroundColor: K.canvas }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: K.canvas }}>
        <View ref={rootRef} onLayout={e => setRootSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} pointerEvents="none" style={{ position: 'absolute', inset: 0 } as any} />
        <Backdrop />
        <View style={{ paddingTop: insets.top + (sidebar ? 26 : 10), paddingHorizontal: gutter, width: '100%', maxWidth: 1180, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          {sidebar ? <Txt v="headline">Celeste SI</Txt> : (
            <Pressy label="Back to Home" onPress={async () => { await leaveTab('assistant', 'today'); router.navigate('/today'); }} hitSlop={8}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingRight: 8 }}><ChevronLeft size={22} color={K.ink} /><Txt v="headline">Home</Txt></View>
            </Pressy>
          )}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            {convo ? <Tag label="New chat" icon={Plus} onPress={newChat} /> : null}
            <Pressy label="Chat history" onPress={() => router.push('/assistant/history')} hitSlop={6}>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: K.cardSolid, borderWidth: 1, borderColor: K.hair2 }}><History size={16} color={K.ink} /></View>
            </Pressy>
            <Pressy label={voiceOn ? 'Mute spoken replies' : 'Speak replies'} onPress={() => { setVoiceOn(v => !v); Speech.stop(); }} hitSlop={6}>
              <View style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: K.cardSolid, borderWidth: 1, borderColor: K.hair2 }}>{voiceOn ? <Volume2 size={16} color={K.ink} /> : <VolumeX size={16} color={K.ink3} />}</View>
            </Pressy>
          </View>
        </View>

        <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: gutter, paddingBottom: 16, width: '100%', maxWidth: 720, alignSelf: 'center', flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Rise>
            <View style={{ alignItems: 'center', marginTop: convo ? 4 : 22 }}>
              {!convo ? <Kicker>Voice conversation</Kicker> : null}
              <Txt v={convo ? 'headline' : 'display'} center style={{ marginTop: convo ? 0 : 8 }}>{state === 'ready' ? `Hello, ${first}` : TITLE[state]}</Txt>
              {!convo ? <Txt v="sub" color={K.ink2} center style={{ marginTop: 6 }}>{state === 'listening' ? 'Speak naturally — tap the mic when you’re done.' : 'What would you like to check?'}</Txt> : null}
              <View ref={avRef} onLayout={measureIntro} style={{ marginTop: convo ? 0 : 18, marginBottom: convo ? -10 : 0, opacity: introPending ? 0 : 1 }}><Animated.View style={{ opacity: pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1], extrapolate: 'clamp' }), transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }] }}>
                <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: orbSize, height: orbSize, borderRadius: orbSize, borderWidth: 2, borderColor: '#EE8F6A',
                  opacity: burst.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.7, 0] }), transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.7] }) }] }} />
                <AiAvatar size={orbSize} state={state} />
              </Animated.View></View>
              {heard ? <Txt v="bodyM" center color={K.copperInk} style={{ marginTop: 6, maxWidth: 320 }}>“{heard}”</Txt> : null}
              {!convo && !heard && state === 'ready' && !showComposer ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {SUGGESTIONS.slice(0, 2).map(s => (
                    <Pressy key={s} label={s} onPress={() => send(s)}>
                      <View style={{ height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: 'rgba(255,253,251,0.85)', borderWidth: 1, borderColor: K.hair2, justifyContent: 'center' }}><Txt v="caption" style={{ fontFamily: 'Geist_500Medium' }}>{s}</Txt></View>
                    </Pressy>
                  ))}
                </View>
              ) : null}
            </View>
          </Rise>
          {msgs.map(m => <Bubble key={m.id} m={m} />)}
          {typing ? <Typing /> : null}
          {stream ? <Bubble key={stream.id} m={stream} streaming /> : null}
        </ScrollView>

        {showComposer ? controls : voiceControls}

        <Sheet open={attach} onClose={() => setAttach(false)} kicker="Attach" title="Add a file for Celeste">
          <ListGroup>
            {[{ icon: FileText, t: 'Dosimeter report', s: 'PDF · personal dosimeter', f: 'dosimeter-report.pdf' }, { icon: FlaskConical, t: 'Lab results', s: 'Blood and urine markers', f: 'lab-results.pdf' }, { icon: ImageIcon, t: 'Photo', s: 'Skin, eye or injury photo', f: 'photo.jpg' }].map(o => (
              <ListRow key={o.f} icon={o.icon} title={o.t} sub={o.s} onPress={() => { setFiles(x => (x.includes(o.f) ? x : [...x, o.f])); setAttach(false); setKb(true); }} />
            ))}
          </ListGroup>
          <Txt v="caption" color={K.ink3} center style={{ marginTop: 10 }}>Demo · files are not uploaded or parsed yet.</Txt>
        </Sheet>
        {introBox && rootSize ? <AiIntro box={introBox} W={rootSize.w} H={rootSize.h} name={first} onDone={() => { setFlag('aiIntroSeen'); setIntroPending(false); setIntroBox(null); }} /> : null}
      </KeyboardAvoidingView>
      </Animated.View>
    </FocusReplay>
  );
}
