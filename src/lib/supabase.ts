import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState } from 'react-native';

// Used only for the anonymous session that authorizes beautify calls. The publishable key is
// public by design; the AI key lives only in the Edge Function's secrets.
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY;

// SecureStore values are capped at ~2 KB and a session is larger, so values are split into chunks.
const CHUNK = 1800;
const chunkedSecureStore = {
  async getItem(key: string) {
    const n = Number(await SecureStore.getItemAsync(`${key}.n`));
    if (!n) return null;
    const parts = await Promise.all(Array.from({ length: n }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return parts.some((p) => p == null) ? null : parts.join('');
  },
  async setItem(key: string, value: string) {
    const old = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p)));
    await SecureStore.setItemAsync(`${key}.n`, String(parts.length));
    for (let i = parts.length; i < old; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
  },
  async removeItem(key: string) {
    const n = Number(await SecureStore.getItemAsync(`${key}.n`)) || 0;
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${key}.${i}`);
    await SecureStore.deleteItemAsync(`${key}.n`);
  },
};

export const supabaseConfigured = !!(URL && KEY);
export const functionsUrl = `${URL}/functions/v1`;
export const publishableKey = KEY ?? '';

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(URL!, KEY!, { auth: { storage: chunkedSecureStore, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } })
  : null;

// Refresh tokens only while the app is in the foreground.
if (supabase) {
  AppState.addEventListener('change', (s) => (s === 'active' ? supabase.auth.startAutoRefresh() : supabase.auth.stopAutoRefresh()));
}

/** Existing session, or an anonymous sign-in on first use. Returns the access token. */
export async function ensureSession(): Promise<string> {
  if (!supabase) throw new Error('not configured');
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.access_token;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error || !signed.session) throw error ?? new Error('anonymous sign-in failed');
  return signed.session.access_token;
}
