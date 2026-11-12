/**
 * Apple Health export reader (web). The Health app's export.xml can be hundreds of MB, so it is read in chunks IN THE BROWSER and
 * only the few record types Astra uses, for the last N days, are kept and sent to the server. The rest never leaves the device.
 * (The server re-validates and aggregates everything: server/src/applehealth.ts logic is the source of truth.)
 */
const WANTED = new Set([
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierOxygenSaturation',
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyTemperature',
  'HKQuantityTypeIdentifierAppleExerciseTime',
  'HKQuantityTypeIdentifierStepCount',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierBloodPressureSystolic',
  'HKQuantityTypeIdentifierBloodPressureDiastolic',
  'HKCategoryTypeIdentifierSleepAnalysis',
]);

export type AppleSample = { type: string; unit?: string; start?: string; end?: string; value?: string; source?: string };

const attr = (tag: string, name: string) => { const m = new RegExp(`${name}="([^"]*)"`).exec(tag); return m ? m[1] : undefined; };
const toMs = (s?: string) => {
  const m = s ? /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})\s*([+-]\d{2}):?(\d{2})?$/.exec(s.trim()) : null;
  return m ? Date.parse(`${m[1]}T${m[2]}${m[3]}:${m[4] ?? '00'}`) : NaN;
};

export function pickFile(accept = '.xml,text/xml'): Promise<File | null> {
  return new Promise(resolve => {
    if (typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function extractFromFile(file: File, days: number, onProgress?: (fraction: number) => void): Promise<AppleSample[]> {
  const since = Date.now() - days * 864e5;
  const out: AppleSample[] = [];
  const reader = (file as any).stream().getReader() as ReadableStreamDefaultReader<Uint8Array>;
  const dec = new TextDecoder();
  let buf = '', read = 0;
  const flush = (text: string) => {
    const re = /<Record\s[^>]*?\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const tag = m[0];
      const type = attr(tag, 'type');
      if (!type || !WANTED.has(type)) continue;
      const end = attr(tag, 'endDate'), start = attr(tag, 'startDate');
      if (toMs(end ?? start) < since) continue;
      out.push({ type, unit: attr(tag, 'unit'), start, end, value: attr(tag, 'value'), source: attr(tag, 'sourceName') });
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.length;
    buf += dec.decode(value, { stream: true });
    const cut = buf.lastIndexOf('>');
    if (cut > 0) { flush(buf.slice(0, cut + 1)); buf = buf.slice(cut + 1); }
    onProgress?.(Math.min(1, read / file.size));
  }
  flush(buf);
  return out;
}
