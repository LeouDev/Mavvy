import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { isNetworkError, mapFailure, TIMEOUT_MS, type Failure } from '@/lib/beautifyErrors';
import { File } from 'expo-file-system';
import { saveBase64, uriFor } from '@/lib/photoFiles';
import { ensureSession, functionsUrl, publishableKey, supabaseConfigured } from '@/lib/supabase';

const LONG_EDGE = 1536;

/** Downscale to a 1536 px long edge, JPEG 0.85: smaller upload, under the 6 MB server limit. */
async function prepare(uri: string): Promise<string> {
  const probe = await ImageManipulator.manipulate(uri).renderAsync();
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(probe.width, probe.height) > LONG_EDGE) ctx.resize(probe.width >= probe.height ? { width: LONG_EDGE } : { height: LONG_EDGE });
  const saved = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return saved.uri;
}

export type BeautifyOutcome = { ok: true; rel: string } | { ok: false; failure: Failure };

/**
 * Send one photo to the beautify function. Resolves (never rejects) with the saved relative path of the
 * result, or a plain-language failure. The original file is never modified. Call cancel() to abort.
 */
export function startBeautify(originalRel: string): { done: Promise<BeautifyOutcome>; cancel: () => void } {
  const ctrl = new AbortController();
  let aborted: 'timeout' | 'cancel' | undefined;
  const timer = setTimeout(() => { aborted = 'timeout'; ctrl.abort(); }, TIMEOUT_MS);
  const fail = (a: Parameters<typeof mapFailure>[0]): BeautifyOutcome => ({ ok: false, failure: mapFailure({ ...a, aborted: aborted ?? a.aborted }) });

  const done = (async (): Promise<BeautifyOutcome> => {
    if (!supabaseConfigured) return { ok: false, failure: { kind: 'other', message: "Beautify isn't set up in this build." } };
    let uploadUri: string;
    let token: string;
    try {
      uploadUri = await prepare(uriFor(originalRel));
    } catch (err) {
      console.warn('beautify: resize failed', err);
      return fail({});
    }
    try {
      token = await ensureSession();
    } catch (err) {
      console.warn('beautify: sign-in failed', err);
      // Only a failed fetch means offline; e.g. anonymous sign-ins disabled on the project is a generic failure.
      return fail(isAuthRetryableFetchError(err) ? { networkError: true } : {});
    }
    if (aborted) return fail({});

    let res: Response;
    try {
      const body = new FormData();
      // expo-file-system's File is a Blob, which Expo's fetch can stream as a multipart part.
      body.append('image', new File(uploadUri), 'photo.jpg');
      res = await fetch(`${functionsUrl}/beautify`, {
        method: 'POST', body, signal: ctrl.signal,
        headers: { Authorization: `Bearer ${token}`, apikey: publishableKey },
      });
    } catch (err) {
      if (!aborted) console.warn('beautify: request failed', err);
      return fail({ networkError: isNetworkError(err) });
    }
    let json: { image?: string; mime?: string; error?: string } = {};
    try {
      json = await res.json();
    } catch {
      /* non-JSON error page */
    }
    if (!res.ok || !json.image) return fail({ status: res.ok ? 502 : res.status, serverMessage: json.error });
    try {
      return { ok: true, rel: saveBase64(json.image, json.mime ?? 'image/jpeg') };
    } catch {
      return fail({});
    }
  })().finally(() => clearTimeout(timer));

  return { done, cancel: () => { aborted = 'cancel'; ctrl.abort(); } };
}
