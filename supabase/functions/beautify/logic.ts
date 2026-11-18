// Pure helpers for the beautify function. No imports: unit-tested with node --test from the app repo
// and imported by index.ts under Deno.

export const PROMPT =
  'Enhance this exact car photo into a clean, professional showroom-quality shot: better lighting, color and reflections, ' +
  'a tidy background. Keep the same car, color, plate, wheels and mods unchanged.';

export const MAX_BYTES = 6 * 1024 * 1024;
export const DAILY_LIMIT = 10;
export const GLOBAL_DAILY_LIMIT = 20; // across all users (cost cap: ~$20/month at most); override with the BEAUTIFY_GLOBAL_LIMIT secret

/** Global cap from the env value, falling back to the default for missing/invalid values. */
export const globalLimit = (env: string | undefined) => {
  const n = Number(env);
  return Number.isInteger(n) && n > 0 ? n : GLOBAL_DAILY_LIMIT;
};

/** What to do with beautify_reserve()'s result. */
export function reserveOutcome(r: unknown): { ok: true } | { ok: false; status: number; error: string } {
  if (r === 'ok') return { ok: true };
  if (r === 'user_limit') return { ok: false, status: 429, error: `You've used today's ${DAILY_LIMIT} beautifies. Try again tomorrow.` };
  if (r === 'global_limit') return { ok: false, status: 429, error: 'Beautify is busy today. Try again tomorrow.' };
  return { ok: false, status: 500, error: 'Something went wrong. Try again.' };
}
export const ALLOWED_TYPES = ['image/jpeg', 'image/png'] as const;
export type ImageType = (typeof ALLOWED_TYPES)[number];

type Fail = { ok: false; status: number; error: string };

/** Declared type + size check (before reading bytes). */
export function validateUpload(f: { type: string; size: number }): { ok: true } | Fail {
  if (!ALLOWED_TYPES.includes(f.type as ImageType)) return { ok: false, status: 415, error: 'Only JPEG or PNG photos can be beautified.' };
  if (f.size <= 0) return { ok: false, status: 400, error: 'The photo is empty.' };
  if (f.size > MAX_BYTES) return { ok: false, status: 413, error: 'The photo is too large (max 6 MB).' };
  return { ok: true };
}

/** Real type from magic bytes; never trust the declared type alone. */
export function sniffImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  return null;
}

/** Rate-limit "day" in Philippine time (UTC+8, no DST), so the limit resets at local midnight. */
export function manilaDay(now: Date): string {
  return new Date(now.getTime() + 8 * 3600_000).toISOString().slice(0, 10);
}

/** Gemini Interactions API request (text prompt + the input photo → one edited image). */
export function geminiRequest(model: string, imageB64: string, mime: ImageType) {
  return {
    model,
    input: [
      { type: 'text', text: PROMPT },
      { type: 'image', mime_type: mime, data: imageB64 },
    ],
    response_format: { type: 'image', mime_type: 'image/jpeg' },
  };
}

type Img = { data: string; mime: string };
const isImg = (x: unknown): x is { data: string; mime_type?: string; mimeType?: string } =>
  !!x && typeof x === 'object' && typeof (x as { data?: unknown }).data === 'string' && (x as { data: string }).data.length > 0;
const asImg = (x: { data: string; mime_type?: string; mimeType?: string }): Img => ({ data: x.data, mime: x.mime_type ?? x.mimeType ?? 'image/jpeg' });

/**
 * Find the edited image in a Gemini response. Tolerant on purpose: the docs show `output_image`
 * and `steps[].content[]` image blocks for the Interactions API; the older generateContent shape
 * (`candidates[].content.parts[].inlineData`) is accepted too.
 */
export function extractImage(json: unknown): Img | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, any>;
  if (isImg(j.output_image)) return asImg(j.output_image);
  for (const step of Array.isArray(j.steps) ? j.steps : []) {
    for (const block of Array.isArray(step?.content) ? step.content : []) {
      if (block?.type === 'image' && isImg(block)) return asImg(block);
    }
  }
  for (const out of Array.isArray(j.outputs) ? j.outputs : []) {
    if (out?.type === 'image' && isImg(out)) return asImg(out);
  }
  for (const c of Array.isArray(j.candidates) ? j.candidates : []) {
    for (const part of c?.content?.parts ?? []) {
      const inline = part?.inlineData ?? part?.inline_data;
      if (isImg(inline)) return asImg(inline);
    }
  }
  return null;
}
