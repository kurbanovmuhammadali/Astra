import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Switch, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Send, ShieldCheck } from 'lucide-react-native';
import { api } from '@/api';
import { useApi } from '@/useApi';
import { A, F, statusColor } from '@/theme';
import type { Dashboard } from '@/types';
import { Loading, T } from '@/ui';
import { AstraLogo, shadowSoft } from '@/astra';
import { useReplay, withAsOf } from '@/replay';
import { clearFlag, getFlag, setFlag } from '@/storage';

type Catalog = { metrics: Record<string, { space: string; evidence?: { basis: string; note: string; refs: string[] } }>; references: Record<string, { cite: string }> };
type Msg = { role: 'user' | 'assistant'; content: string; mode?: 'claude' | 'gemini' | 'offline'; degraded?: boolean };
type Reply = { answer: string; mode: 'claude' | 'offline'; degraded?: boolean; aiAvailable: boolean; references: Record<string, string> };

const CHIPS = ['Why am I flagged?', 'What should I do today?', 'Draft a message to the flight surgeon'];

/**
 * Ask Astra — grounded in the astronaut's own numbers and the cited rules. Works offline (deterministic, computed on our server);
 * if the server has an Anthropic key AND the user opts in, Claude phrases the answer from the same data (no name / email sent).
 */
export default function Insights() {
  const insets = useSafeAreaInsets();
  const { asOf } = useReplay();
  const { data: d } = useApi<Dashboard>('/api/dashboard');
  const { data: cat } = useApi<Catalog>('/api/catalog');
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiOn, setAiOn] = useState(false);          // user's consent to send their numbers to Claude
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiName, setAiName] = useState('an AI service');
  const scroller = useRef<ScrollView>(null);
  const convY = useRef(0);

  useEffect(() => { getFlag('aiConsent').then(setAiOn); api<{ ai?: boolean; aiProvider?: string | null }>('/api/health').then(h => { setAiAvailable(!!h.ai); if (h.aiProvider) setAiName(h.aiProvider); }).catch(() => {}); }, []);
  useEffect(() => { if (msgs.length) setTimeout(() => scroller.current?.scrollTo({ y: Math.max(0, convY.current - 12), animated: true }), 60); }, [msgs.length]);

  const toggleAi = (v: boolean) => { setAiOn(v); (v ? setFlag : clearFlag)('aiConsent'); };
  const send = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const history = msgs.slice(-6).map(m => ({ role: m.role, content: m.content }));
    setMsgs(m => [...m, { role: 'user', content: question }]); setText(''); setBusy(true);
    try {
      const r = await api<Reply>(withAsOf('/api/assistant', asOf), { body: { question, history, aiConsent: aiOn } });
      setMsgs(m => [...m, { role: 'assistant', content: r.answer, mode: r.mode, degraded: r.degraded }]);
    } catch (e: any) {
      setMsgs(m => [...m, { role: 'assistant', content: e.message || 'Something went wrong.', mode: 'offline' }]);
    } finally { setBusy(false); }
  };

  if (!d || !cat) return <View style={{ flex: 1, backgroundColor: A.sand, justifyContent: 'center' }}><Loading /></View>;
  const flagged = Object.values(d.metrics).filter(m => m.status === 'amber' || m.status === 'red').sort((a, b) => (a.status === b.status ? 0 : a.status === 'red' ? -1 : 1));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: A.sand }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView ref={scroller} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 150, paddingHorizontal: 20, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
        <AstraLogo size={16} />
        <T size={28} weight="sb" color={A.ink} style={{ marginTop: 18, letterSpacing: -0.7 }}>Ask Astra</T>
        <T size={14} color={A.ink2} style={{ marginTop: 6, lineHeight: 20 }}>Answers use only your own numbers.</T>

        {/* conversation */}
        <View style={{ marginTop: 16, gap: 10 }} onLayout={e => { convY.current = e.nativeEvent.layout.y; }}>
          {msgs.map((m, i) => (
            <View key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '92%' }}>
              <View style={[{ backgroundColor: m.role === 'user' ? A.copper : '#fff', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 11 }, m.role === 'assistant' ? shadowSoft : null]}>
                <T size={14} color={m.role === 'user' ? '#fff' : A.ink} style={{ lineHeight: 20 }}>{m.content}</T>
              </View>
              {m.role === 'assistant' ? (
                <T size={10.5} color={A.ink3} style={{ marginTop: 3, marginLeft: 6 }}>
                  {m.mode === 'claude' ? 'Claude, from your data' : m.mode === 'gemini' ? 'Gemini, from your data' : m.degraded ? 'Offline rules (AI was unavailable)' : 'Offline rules, from your data'}
                </T>
              ) : null}
            </View>
          ))}
          {busy ? <T size={12} color={A.ink3} style={{ marginLeft: 6 }}>Thinking…</T> : null}
        </View>

        {!msgs.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
            {CHIPS.map(c => (
              <Pressable key={c} accessibilityRole="button" onPress={() => send(c)} style={{ backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: A.line }}>
                <T size={13} weight="m" color={A.copperDeep}>{c}</T>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* AI consent — only offered when the server actually has a key */}
        {aiAvailable ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 18, padding: 12 }}>
            <ShieldCheck size={18} color={A.copper} />
            <View style={{ flex: 1 }}>
              <T size={13} weight="m" color={A.ink}>Let AI phrase answers</T>
              <T size={11.5} color={A.ink3} style={{ lineHeight: 16 }}>Sends your readings, not your name or email, to {aiName}.</T>
            </View>
            <Switch value={aiOn} onValueChange={toggleAi} trackColor={{ true: A.copper, false: A.line }} />
          </View>
        ) : null}

        {/* what is flagged, with the evidence */}
        <T size={18} weight="sb" color={A.ink} style={{ marginTop: 26 }}>Flagged right now</T>
        {flagged.length === 0 ? (
          <View style={[{ backgroundColor: '#fff', borderRadius: 22, padding: 18, marginTop: 10 }, shadowSoft]}>
            <T size={15} weight="sb" color={A.ink}>Nothing flagged.</T>
          </View>
        ) : flagged.map(m => {
          const info = cat.metrics[m.key];
          const refs = (info?.evidence?.refs ?? []).map(id => `[${id}] ${cat.references[id]?.cite ?? ''}`);
          return (
            <Pressable key={m.key} accessibilityRole="button" onPress={() => router.push(`/metric/${m.key}`)} style={[{ backgroundColor: '#fff', borderRadius: 22, padding: 16, marginTop: 10 }, shadowSoft]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: statusColor(m.status) }} />
                <T size={15} weight="sb" color={A.ink} style={{ flex: 1 }}>{m.label}{m.early ? ' · early warning' : ''}</T>
                <ChevronRight size={18} color={A.ink3} />
              </View>
              <T size={13} color={A.ink2} style={{ marginTop: 6, lineHeight: 19 }}>
                {m.driftNote ?? `Latest ${m.value}${m.value2 != null ? '/' + m.value2 : ''} ${m.unit}${m.deviation != null ? `, ${m.deviation > 0 ? '+' : ''}${m.deviation}% vs your baseline` : ''}.`}
              </T>
              {refs.length ? <T size={11} color={A.ink3} style={{ marginTop: 6, lineHeight: 15 }}>{refs.join('\n')}</T> : null}
            </Pressable>
          );
        })}
        <T size={11.5} color={A.ink3} center style={{ marginTop: 22, lineHeight: 16 }}>Not a medical device. It does not diagnose.</T>
      </ScrollView>

      {/* composer */}
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 92, paddingHorizontal: 16, alignItems: 'center' }}>
        <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 999, paddingLeft: 18, paddingRight: 6, height: 52, width: '100%', maxWidth: 560 }, shadowSoft]}>
          <TextInput value={text} onChangeText={setText} onSubmitEditing={() => send(text)} returnKeyType="send" placeholder="Ask about your body or your plan…" placeholderTextColor={A.ink3}
            maxLength={600} style={{ flex: 1, fontFamily: F.r, fontSize: 15, color: A.ink, outlineStyle: 'none' as any }} accessibilityLabel="Ask Astra a question" />
          <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={busy || text.trim().length < 2} onPress={() => send(text)}
            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: busy || text.trim().length < 2 ? A.line : A.copper, alignItems: 'center', justifyContent: 'center' }}>
            <Send size={17} color="#fff" />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
