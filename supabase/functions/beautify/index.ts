// POST multipart/form-data { image: JPEG|PNG ≤ 6 MB } with a user session JWT.
// → 200 { image: base64, mime } | 4xx/5xx { error }.
// The photo is passed through to Gemini and returned in the response. Nothing is stored and no image
// data is logged. Secrets: GEMINI_API_KEY (required), GEMINI_MODEL / GEMINI_URL / BEAUTIFY_GLOBAL_LIMIT (optional).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
import { DAILY_LIMIT, MAX_BYTES, geminiRequest, extractImage, globalLimit, manilaDay, reserveOutcome, sniffImageType, validateUpload } from './logic.ts';

const GEMINI_URL = Deno.env.get('GEMINI_URL') ?? 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-nano-banana-2.1';
const UPSTREAM_TIMEOUT_MS = 80_000; // below the app's 90 s timeout so the app gets a clear 504 first

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function secretKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}');
    const k = keys.default ?? Object.values(keys)[0];
    if (typeof k === 'string' && k) return k;
  } catch { /* fall through to the legacy key */ }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // verify_jwt (on) already rejected missing/invalid tokens at the gateway; resolve the user for rate limiting.
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !auth?.user) return json(401, { error: 'Please sign in again.' });
  const userId = auth.user.id;

  // Cheap size guard before buffering the body (multipart adds a little overhead).
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES + 64 * 1024) return json(413, { error: 'The photo is too large (max 6 MB).' });

  let file: File;
  try {
    const f = (await req.formData()).get('image');
    if (!(f instanceof File)) return json(400, { error: 'No photo was sent.' });
    file = f;
  } catch {
    return json(400, { error: 'No photo was sent.' });
  }
  const v = validateUpload({ type: file.type, size: file.size });
  if (!v.ok) return json(v.status, { error: v.error });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImageType(bytes);
  if (!mime) return json(415, { error: 'Only JPEG or PNG photos can be beautified.' });

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('GEMINI_API_KEY is not set');
    return json(500, { error: 'Beautify is not set up yet.' });
  }

  const day = manilaDay(new Date());
  const { data: reserved, error: rlErr } = await admin.rpc('beautify_reserve', {
    p_user: userId, p_day: day, p_limit: DAILY_LIMIT, p_global_limit: globalLimit(Deno.env.get('BEAUTIFY_GLOBAL_LIMIT')),
  });
  if (rlErr) {
    console.error('beautify_reserve failed', rlErr.message);
    return json(500, { error: 'Something went wrong. Try again.' });
  }
  const outcome = reserveOutcome(reserved);
  if (!outcome.ok) {
    if (reserved === 'global_limit') console.warn('global daily beautify cap reached');
    return json(outcome.status, { error: outcome.error });
  }

  const refund = () => admin.rpc('beautify_refund', { p_user: userId, p_day: day }).then(({ error }) => error && console.error('refund failed', error.message));

  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey, 'Api-Revision': '2026-05-20' },
      body: JSON.stringify(geminiRequest(GEMINI_MODEL, encodeBase64(bytes), mime)),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error('gemini error', res.status, (await res.text()).slice(0, 300)); // error text only, never image data
      await refund();
      return json(502, { error: "Couldn't beautify this photo. Try again." });
    }
    const out = extractImage(await res.json());
    if (!out) {
      console.error('gemini returned no image');
      await refund();
      return json(502, { error: "Couldn't beautify this photo. Try again." });
    }
    return json(200, { image: out.data, mime: out.mime });
  } catch (err) {
    await refund();
    const timedOut = err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError');
    console.error('gemini request failed', timedOut ? 'timeout' : String(err));
    return json(timedOut ? 504 : 502, { error: timedOut ? 'Beautify took too long. Try again.' : "Couldn't beautify this photo. Try again." });
  }
});
