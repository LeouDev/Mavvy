// Pure: turn a failed beautify attempt into a plain-language message. No runtime imports (node --test).

export type FailureKind = 'offline' | 'timeout' | 'cancelled' | 'limit' | 'rejected' | 'other';
export type Failure = { kind: FailureKind; message: string };

export type Attempt = {
  aborted?: 'timeout' | 'cancel'; // we aborted the request ourselves
  networkError?: boolean; // fetch threw before any response (offline, DNS, refused)
  status?: number; // HTTP status from the function
  serverMessage?: string; // { error } from the function
};

export const TIMEOUT_MS = 90_000;

/** Did fetch fail because of the connection (vs. a bug or a bad request)? Only these read "offline". */
export function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /network|offline|internet|not connected|connection|could not connect|timed out|unreachable/i.test(msg);
}

export function mapFailure(a: Attempt): Failure {
  if (a.aborted === 'cancel') return { kind: 'cancelled', message: 'Beautify cancelled.' };
  if (a.aborted === 'timeout' || a.status === 504) return { kind: 'timeout', message: 'Beautify took too long. Check your connection and try again.' };
  if (a.networkError) return { kind: 'offline', message: "You're offline. Connect to the internet and try again." };
  if (a.status === 429) return { kind: 'limit', message: a.serverMessage || "You've used today's 10 beautifies. Try again tomorrow." };
  // 413/415 carry a specific, user-safe reason from the function (too large / wrong type).
  if ((a.status === 413 || a.status === 415) && a.serverMessage) return { kind: 'rejected', message: a.serverMessage };
  return { kind: 'other', message: "Couldn't beautify, try again." };
}
