import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Camera, ChevronLeft, Plus, Search, Trash2 } from 'lucide-react-native';
import { api } from '@/api';
import { A, F } from '@/theme';
import { Loading, T } from '@/ui';
import { shadowSoft } from '@/astra';

type Item = { id: number; meal: string; name: string; grams: number | null; kcal: number; protein: number; carbs: number; fat: number; source: string };
type Profile = { height_cm: number; weight_kg: number; sex: string; activity: string; aim: string; age: number; bmr: number; tdee: number; kcal: number; protein: number };
type Summary = {
  profile: Profile | null; activity: { burned: number | null; steps: number | null; net: number | null };
  day: string; goal: { kcal: number; protein: number; custom: boolean; from: string };
  totals: { kcal: number; protein: number; carbs: number; fat: number }; remaining: number;
  items: Item[]; week: { day: string; kcal: number }[]; notes: { level: string; basis: string; text: string }[];
};
type Food = { name: string; per100: { kcal: number; protein: number; carbs: number; fat: number }; source: string };

type Est = { items: { name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number }[]; confidence: string; note: string };

/** Pick/take a photo (web; on an iPhone this opens the camera), shrink it to <=1024 px JPEG so the upload stays small. */
function pickPhoto(): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.setAttribute('capture', 'environment');
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, 1024 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.8).split(',')[1]);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    };
    input.click();
  });
}

const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
const today = () => new Date().toISOString().slice(0, 10);
const r1 = (n: number) => Math.round(n * 10) / 10;

const Bar = ({ value, goal, color }: { value: number; goal: number; color: string }) => (
  <View style={{ height: 8, borderRadius: 4, backgroundColor: A.line, overflow: 'hidden' }}>
    <View style={{ height: 8, width: `${Math.min(100, goal ? (value / goal) * 100 : 0)}%`, backgroundColor: color, borderRadius: 4 }} />
  </View>
);

/** Food & calories: search a food (built-in, USDA if the server has a key, Open Food Facts), set grams, log it to a meal. */
export default function Food() {
  const insets = useSafeAreaInsets();
  const [day] = useState(today());
  const [s, setS] = useState<Summary | null>(null);
  const [meal, setMeal] = useState<(typeof MEALS)[number]>('breakfast');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [picked, setPicked] = useState<Food | null>(null);
  const [grams, setGrams] = useState('100');
  const [manual, setManual] = useState(false);
  const [m, setM] = useState({ name: '', kcal: '', protein: '' });
  const [err, setErr] = useState('');
  const [photoOk, setPhotoOk] = useState(false);
  const [agree, setAgree] = useState(false);
  const [est, setEst] = useState<Est | null>(null);
  const [reading, setReading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pf, setPf] = useState({ height: '', weight: '', sex: 'male', activity: 'moderate', aim: 'maintain' });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(() => api<Summary>(`/api/food?day=${day}`).then(setS).catch(e => setErr(e.message)), [day]);
  useEffect(() => { load(); api<{ available: boolean }>('/api/food/photo/status').then(r => setPhotoOk(r.available)).catch(() => {}); }, [load]);
  const takePhoto = async () => {
    setErr(''); setEst(null);
    const image = await pickPhoto();
    if (!image) return;
    setReading(true);
    try { setEst(await api<Est>('/api/food/photo', { body: { image, mediaType: 'image/jpeg', consent: true } })); }
    catch (e: any) { setErr(e.message); } finally { setReading(false); }
  };
  const addEstimated = async () => {
    if (!est) return;
    let last: Summary | null = null;
    for (const i of est.items) last = await api<Summary>('/api/food', { body: { day, meal, ...i, source: 'photo-estimate' } });
    if (last) setS(last); setEst(null); setAgree(false);
  };
  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try { setResults((await api<{ results: Food[] }>(`/api/food/search?q=${encodeURIComponent(q.trim())}`)).results); } catch { setResults([]); } finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(timer.current);
  }, [q]);

  const add = async (body: object) => {
    setErr('');
    try { setS(await api<Summary>('/api/food', { body: { day, meal, ...body } })); setPicked(null); setQ(''); setResults([]); setManual(false); setM({ name: '', kcal: '', protein: '' }); }
    catch (e: any) { setErr(e.message); }
  };
  const g = Math.max(0, Number(grams) || 0);
  const saveProfile = async () => {
    setErr('');
    try {
      await api('/api/profile/body', { method: 'PUT', body: { height_cm: Number(pf.height), weight_kg: Number(pf.weight), sex: pf.sex, activity: pf.activity, aim: pf.aim } });
      setEditing(false); await load();
    } catch (e: any) { setErr(e.message); }
  };
  const addPicked = () => picked && add({ name: picked.name, grams: g, kcal: (picked.per100.kcal * g) / 100, protein: (picked.per100.protein * g) / 100, carbs: (picked.per100.carbs * g) / 100, fat: (picked.per100.fat * g) / 100, source: picked.source });
  const remove = async (id: number) => setS(await api<Summary>(`/api/food/${id}?day=${day}`, { method: 'DELETE' }));

  if (!s) return <View style={{ flex: 1, backgroundColor: A.sand, justifyContent: 'center' }}><Loading /></View>;
  const over = s.remaining < 0;
  const showForm = editing || !s.profile;
  const Pills = ({ opts, value, onPick }: { opts: [string, string][]; value: string; onPick: (v: string) => void }) => (
    <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {opts.map(([k, l]) => (
        <Pressable key={k} accessibilityRole="button" onPress={() => onPick(k)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: value === k ? A.copper : A.sand }}>
          <T size={12.5} weight="m" color={value === k ? '#fff' : A.ink}>{l}</T>
        </Pressable>
      ))}
    </View>
  );
  const maxWeek = Math.max(s.goal.kcal, ...s.week.map(w => w.kcal));
  const card = [{ backgroundColor: '#fff', borderRadius: 22, padding: 16, marginTop: 12 }, shadowSoft] as any;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ backgroundColor: A.sand }} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 60, paddingHorizontal: 20, width: '100%', maxWidth: 560, alignSelf: 'center' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <ChevronLeft size={20} color={A.ink} /><T size={14} color={A.ink2}>Back</T>
      </Pressable>
      <T size={28} weight="sb" color={A.ink} style={{ marginTop: 14, letterSpacing: -0.7 }}>Food</T>
      <T size={14} color={A.ink2} style={{ marginTop: 4 }}>Fuel is part of countering muscle and bone loss. Log what you eat; Astra compares it with your goal.</T>

      {/* today */}
      <View style={card}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <T size={34} weight="sb" color={A.ink}>{s.totals.kcal}<T size={14} color={A.ink3}> / {s.goal.kcal} kcal</T></T>
          <T size={13} weight="m" color={over ? '#D9583F' : A.copperDeep}>{over ? `${-s.remaining} over` : `${s.remaining} left`}</T>
        </View>
        <View style={{ marginTop: 10 }}><Bar value={s.totals.kcal} goal={s.goal.kcal} color={over ? '#D9583F' : A.copper} /></View>
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 14 }}>
          {[['Protein', s.totals.protein, `/ ${s.goal.protein} g`], ['Carbs', s.totals.carbs, 'g'], ['Fat', s.totals.fat, 'g']].map(([l, v, u]) => (
            <View key={String(l)} style={{ flex: 1 }}><T size={11.5} color={A.ink3}>{l}</T><T size={16} weight="sb" color={A.ink}>{v as number} <T size={11} color={A.ink3}>{u}</T></T></View>
          ))}
        </View>
        {!s.goal.custom ? <T size={11} color={A.ink3} style={{ marginTop: 10, lineHeight: 15 }}>Default goal ({s.goal.kcal} kcal). Ask the flight surgeon or nutritionist for your own target.</T> : null}
      </View>

      {/* body profile: drives the calorie goal */}
      <View style={card}>
        {showForm ? (
          <>
            <T size={15} weight="sb" color={A.ink}>Your body</T>
            <T size={12} color={A.ink3} style={{ marginTop: 3, lineHeight: 17 }}>Height, weight, sex and activity set how many calories you need. A 180 cm, 90 kg man needs far more than a 165 cm, 50 kg woman.</T>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TextInput value={pf.height} onChangeText={v => setPf({ ...pf, height: v })} placeholder="Height cm" keyboardType="numeric" placeholderTextColor={A.ink3} accessibilityLabel="Height in centimetres" style={{ flex: 1, height: 42, borderRadius: 14, backgroundColor: A.sand, paddingHorizontal: 12, fontFamily: F.r, fontSize: 15, color: A.ink }} />
              <TextInput value={pf.weight} onChangeText={v => setPf({ ...pf, weight: v })} placeholder="Weight kg" keyboardType="numeric" placeholderTextColor={A.ink3} accessibilityLabel="Weight in kilograms" style={{ flex: 1, height: 42, borderRadius: 14, backgroundColor: A.sand, paddingHorizontal: 12, fontFamily: F.r, fontSize: 15, color: A.ink }} />
            </View>
            <Pills opts={[['male', 'Male'], ['female', 'Female'], ['other', 'Other']]} value={pf.sex} onPick={v => setPf({ ...pf, sex: v })} />
            <Pills opts={[['sedentary', 'Mostly sitting'], ['light', 'Light'], ['moderate', 'Moderate'], ['high', 'Very active']]} value={pf.activity} onPick={v => setPf({ ...pf, activity: v })} />
            <Pills opts={[['lose', 'Lose weight'], ['maintain', 'Maintain'], ['gain', 'Gain']]} value={pf.aim} onPick={v => setPf({ ...pf, aim: v })} />
            <Pressable accessibilityRole="button" onPress={saveProfile} style={{ marginTop: 12, height: 42, borderRadius: 999, backgroundColor: A.copper, alignItems: 'center', justifyContent: 'center' }}>
              <T size={14} weight="m" color="#fff">Save and set my calorie goal</T>
            </Pressable>
          </>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T size={15} weight="sb" color={A.ink}>Your body</T>
              <Pressable accessibilityRole="button" onPress={() => { const p = s.profile!; setPf({ height: String(p.height_cm), weight: String(p.weight_kg), sex: p.sex, activity: p.activity, aim: p.aim }); setEditing(true); }}><T size={13} weight="m" color={A.copperDeep}>Edit</T></Pressable>
            </View>
            <T size={13} color={A.ink2} style={{ marginTop: 4, lineHeight: 19 }}>{s.profile!.height_cm} cm · {s.profile!.weight_kg} kg · {s.profile!.age} y · resting burn ≈ {s.profile!.bmr} kcal, with activity ≈ {s.profile!.tdee} kcal/day.</T>
            <T size={11.5} color={A.ink3} style={{ marginTop: 4 }}>Goal {s.goal.kcal} kcal ({s.goal.from === 'custom' ? 'set by you' : s.profile!.aim}). Estimates, about ±10–15%.</T>
          </>
        )}
      </View>

      {s.activity.burned != null || s.activity.steps != null ? (
        <View style={[card, { flexDirection: 'row', gap: 16 }]}>
          <View style={{ flex: 1 }}><T size={11.5} color={A.ink3}>Steps today</T><T size={18} weight="sb" color={A.ink}>{s.activity.steps?.toLocaleString() ?? '—'}</T></View>
          <View style={{ flex: 1 }}><T size={11.5} color={A.ink3}>Burned (active)</T><T size={18} weight="sb" color={A.ink}>{s.activity.burned ?? '—'} <T size={11} color={A.ink3}>kcal</T></T></View>
          <View style={{ flex: 1 }}><T size={11.5} color={A.ink3}>Eaten − burned</T><T size={18} weight="sb" color={A.ink}>{s.activity.net ?? '—'}</T></View>
        </View>
      ) : (
        <T size={11.5} color={A.ink3} style={{ marginTop: 10, marginLeft: 6, lineHeight: 16 }}>Steps and calories burned appear here after you import your Apple Watch data (Data sources).</T>
      )}

      {s.notes.map((n, i) => (
        <View key={i} style={[card, { backgroundColor: n.level === 'amber' ? '#FFF3DD' : '#fff' }]}>
          <T size={13} color={A.ink} style={{ lineHeight: 19 }}>{n.text}</T>
          <T size={10.5} color={A.ink3} style={{ marginTop: 4 }}>Rule of thumb, not a diagnosis.</T>
        </View>
      ))}

      {/* add */}
      <T size={18} weight="sb" color={A.ink} style={{ marginTop: 24 }}>Add food</T>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
        {MEALS.map(x => (
          <Pressable key={x} accessibilityRole="button" onPress={() => setMeal(x)} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: meal === x ? A.copper : '#fff' }}>
            <T size={13} weight="m" color={meal === x ? '#fff' : A.ink}>{x[0].toUpperCase() + x.slice(1)}</T>
          </Pressable>
        ))}
      </View>
      <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 16, height: 48, marginTop: 12 }, shadowSoft]}>
        <Search size={17} color={A.ink3} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search a food (e.g. plov, banana, chicken)" placeholderTextColor={A.ink3} accessibilityLabel="Search food"
          style={{ flex: 1, fontFamily: F.r, fontSize: 15, color: A.ink, outlineStyle: 'none' as any }} />
      </View>
      {searching ? <T size={12} color={A.ink3} style={{ marginTop: 8, marginLeft: 8 }}>Searching…</T> : null}
      {results.map((f, i) => (
        <Pressable key={i} accessibilityRole="button" onPress={() => { setPicked(f); setGrams('100'); }} style={[card, { marginTop: 8, padding: 12, borderWidth: picked === f ? 1.5 : 0, borderColor: A.copper }]}>
          <T size={14} weight="m" color={A.ink}>{f.name}</T>
          <T size={11.5} color={A.ink3}>{Math.round(f.per100.kcal)} kcal · P {r1(f.per100.protein)} · C {r1(f.per100.carbs)} · F {r1(f.per100.fat)} per 100 g · {f.source}</T>
        </Pressable>
      ))}
      {q.trim().length >= 2 && !searching && !results.length ? <T size={12.5} color={A.ink3} style={{ marginTop: 8, marginLeft: 8 }}>Nothing found. Add it by hand below.</T> : null}

      {picked ? (
        <View style={card}>
          <T size={14} weight="sb" color={A.ink}>{picked.name}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
            <TextInput value={grams} onChangeText={setGrams} keyboardType="numeric" accessibilityLabel="Grams" style={{ width: 90, height: 42, borderRadius: 14, backgroundColor: A.sand, paddingHorizontal: 12, fontFamily: F.r, fontSize: 15, color: A.ink }} />
            <T size={13} color={A.ink2} style={{ flex: 1 }}>g = {Math.round((picked.per100.kcal * g) / 100)} kcal</T>
            <Pressable accessibilityRole="button" accessibilityLabel={`Add to ${meal}`} onPress={addPicked} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: A.copper, borderRadius: 999, paddingHorizontal: 16, height: 42 }}>
              <Plus size={16} color="#fff" /><T size={14} weight="m" color="#fff">Add</T>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Camera size={17} color={A.copper} /><T size={14} weight="sb" color={A.ink}>Estimate from a photo</T></View>
        {Platform.OS !== 'web' ? (
          <T size={12} color={A.ink3} style={{ marginTop: 6, lineHeight: 17 }}>Open Astra in your iPhone's browser to use the camera. In-app camera needs the native build.</T>
        ) : !photoOk ? (
          <T size={12} color={A.ink3} style={{ marginTop: 6, lineHeight: 17 }}>Not available: this server has no Anthropic API key. Search or enter calories by hand instead.</T>
        ) : (
          <>
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: agree }} onPress={() => setAgree(v => !v)} style={{ flexDirection: 'row', gap: 10, marginTop: 10, alignItems: 'flex-start' }}>
              <View style={{ width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: A.copper, backgroundColor: agree ? A.copper : 'transparent' }} />
              <T size={12} color={A.ink2} style={{ flex: 1, lineHeight: 17 }}>I agree to send this photo to Anthropic's Claude to estimate calories. It is not stored by Astra, and no name or email is sent.</T>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Take or choose a food photo" disabled={!agree || reading} onPress={takePhoto}
              style={{ marginTop: 10, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: agree && !reading ? A.copper : A.line }}>
              <T size={14} weight="m" color="#fff">{reading ? 'Estimating…' : 'Take or choose photo'}</T>
            </Pressable>
          </>
        )}
        {est ? (
          <View style={{ marginTop: 12 }}>
            {est.items.length ? est.items.map((i, k) => (
              <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <View style={{ flex: 1 }}><T size={14} color={A.ink}>{i.name}</T><T size={11.5} color={A.ink3}>≈{i.grams} g · P {i.protein} · C {i.carbs} · F {i.fat}</T></View>
                <T size={14} weight="m" color={A.ink}>≈{i.kcal}</T>
                <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${i.name}`} hitSlop={10} onPress={() => setEst({ ...est, items: est.items.filter((_, j) => j !== k) })}><Trash2 size={16} color={A.ink3} /></Pressable>
              </View>
            )) : <T size={13} color={A.ink2}>No food recognised.</T>}
            <T size={11.5} color={A.ink3} style={{ marginTop: 8, lineHeight: 16 }}>Confidence: {est.confidence}. This is an estimate, often off by 20–30% (hidden oil, portion size). {est.note}</T>
            {est.items.length ? <Pressable accessibilityRole="button" onPress={addEstimated} style={{ marginTop: 10, height: 42, borderRadius: 999, backgroundColor: A.copper, alignItems: 'center', justifyContent: 'center' }}><T size={14} weight="m" color="#fff">Add to {meal}</T></Pressable> : null}
          </View>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" onPress={() => setManual(v => !v)} style={{ marginTop: 14 }}>
        <T size={13} weight="m" color={A.copperDeep}>{manual ? 'Hide manual entry' : 'Enter calories by hand'}</T>
      </Pressable>
      {manual ? (
        <View style={card}>
          <TextInput value={m.name} onChangeText={v => setM({ ...m, name: v })} placeholder="Food name" placeholderTextColor={A.ink3} accessibilityLabel="Food name" style={{ height: 42, borderRadius: 14, backgroundColor: A.sand, paddingHorizontal: 12, fontFamily: F.r, fontSize: 15, color: A.ink }} />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TextInput value={m.kcal} onChangeText={v => setM({ ...m, kcal: v })} placeholder="kcal" keyboardType="numeric" placeholderTextColor={A.ink3} accessibilityLabel="Calories" style={{ flex: 1, height: 42, borderRadius: 14, backgroundColor: A.sand, paddingHorizontal: 12, fontFamily: F.r, fontSize: 15, color: A.ink }} />
            <TextInput value={m.protein} onChangeText={v => setM({ ...m, protein: v })} placeholder="protein g" keyboardType="numeric" placeholderTextColor={A.ink3} accessibilityLabel="Protein grams" style={{ flex: 1, height: 42, borderRadius: 14, backgroundColor: A.sand, paddingHorizontal: 12, fontFamily: F.r, fontSize: 15, color: A.ink }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Add manual food" onPress={() => add({ name: m.name, kcal: Number(m.kcal), protein: Number(m.protein) || 0, source: 'manual' })} style={{ backgroundColor: A.copper, borderRadius: 999, paddingHorizontal: 16, justifyContent: 'center' }}>
              <T size={14} weight="m" color="#fff">Add</T>
            </Pressable>
          </View>
        </View>
      ) : null}
      {err ? <T size={12.5} color="#D9583F" style={{ marginTop: 10 }}>{err}</T> : null}

      {/* log */}
      <T size={18} weight="sb" color={A.ink} style={{ marginTop: 26 }}>Today's log</T>
      {!s.items.length ? <T size={13} color={A.ink3} style={{ marginTop: 8 }}>Nothing logged yet.</T> : MEALS.filter(x => s.items.some(i => i.meal === x)).map(x => (
        <View key={x} style={card}>
          <T size={12} weight="m" color={A.ink3} style={{ textTransform: 'uppercase', letterSpacing: 0.6 }}>{x} · {Math.round(s.items.filter(i => i.meal === x).reduce((a, i) => a + i.kcal, 0))} kcal</T>
          {s.items.filter(i => i.meal === x).map(i => (
            <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
              <View style={{ flex: 1 }}><T size={14} color={A.ink}>{i.name}</T><T size={11.5} color={A.ink3}>{i.grams ? `${Math.round(i.grams)} g · ` : ''}P {r1(i.protein)} · C {r1(i.carbs)} · F {r1(i.fat)}</T></View>
              <T size={14} weight="m" color={A.ink}>{i.kcal}</T>
              <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${i.name}`} onPress={() => remove(i.id)} hitSlop={10}><Trash2 size={16} color={A.ink3} /></Pressable>
            </View>
          ))}
        </View>
      ))}

      {/* week */}
      <T size={18} weight="sb" color={A.ink} style={{ marginTop: 26 }}>Last 7 days</T>
      <View style={[card, { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 120 }]}>
        {s.week.map(w => (
          <View key={w.day} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <View style={{ width: '100%', height: Math.max(3, (w.kcal / maxWeek) * 80), borderRadius: 6, backgroundColor: w.day === s.day ? A.copper : A.line }} />
            <T size={10} color={A.ink3} style={{ marginTop: 4 }}>{w.day.slice(8)}</T>
          </View>
        ))}
      </View>
      <T size={11.5} color={A.ink3} center style={{ marginTop: 20, lineHeight: 16 }}>Calorie values come from public food databases and are estimates. Astra supports self-monitoring and does not replace a nutritionist or flight surgeon.</T>
    </ScrollView>
  );
}
