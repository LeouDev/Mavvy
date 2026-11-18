# Beautify: deploy and secrets

The Beautify button sends one photo to a Supabase Edge Function (`supabase/functions/beautify`), which
asks Google's Gemini image model to enhance it and returns the result. Photos are never stored in
Supabase and the Gemini key never leaves the server.

Project: `ewbtaavxertckuulydsm` · Function: `beautify` · Secret: `GEMINI_API_KEY`

## One-time setup

Run these from the project folder (`/Volumes/Mac Storage/Mavvy`).

1. **Enable anonymous sign-ins** (each app install gets an invisible anonymous account, which is what
   the daily limit counts against).
   Dashboard → Authentication → Sign In / Providers → **Allow anonymous sign-ins** → on.
   Recommended: also turn on CAPTCHA for sign-ups and keep the default per-IP limit on anonymous sign-ins,
   see "Abuse limits" below.

2. **Link the CLI to the project** (asks for your database password; nothing is changed yet):

   ```bash
   supabase link --project-ref ewbtaavxertckuulydsm
   ```

3. **Create the rate-limit table** (`supabase/migrations/20261118000000_beautify_usage.sql`):

   ```bash
   supabase db push
   ```

4. **Set the Gemini key** (skip if already set in Dashboard → Edge Functions → Secrets).
   Type it in your own terminal; never paste it into chat, an issue, or a file in this repo:

   ```bash
   supabase secrets set GEMINI_API_KEY=your-key-here
   ```

   Optional overrides: `GEMINI_MODEL` (default `gemini-nano-banana-2.1`).

5. **Deploy the function** (JWT verification stays on, from `supabase/config.toml`):

   ```bash
   supabase functions deploy beautify
   ```

6. **Point the app at the project.** `.env.local` (git-ignored) must contain:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://ewbtaavxertckuulydsm.supabase.co
   EXPO_PUBLIC_SUPABASE_KEY=<publishable key, sb_publishable_…>
   ```

## Check it works

Open a photo in the app and tap **Beautify**. Expected: a progress overlay, then a before/after slider.
If it fails, Dashboard → Edge Functions → beautify → Logs shows the reason:

| Log line | Meaning |
|---|---|
| `GEMINI_API_KEY is not set` | Step 4 missing; the app shows "Couldn't beautify, try again." |
| `gemini error 400/403 …` | Key invalid, or the model name changed; set `GEMINI_MODEL` |
| `gemini returned no image` | Gemini answered without an image (refused or new response format) |
| `beautify_reserve failed` | Step 3 missing |

The app shows "Couldn't beautify, try again." until anonymous sign-ins (step 1) are on.

## Abuse limits (what protects the Gemini bill)

- Every call needs a signed-in session (anonymous is fine). JWT verification is on at the gateway.
- **10 beautifies per user per day** (Philippine time), counted in `beautify_usage`. Failed calls are
  refunded. Clients can't read or change the table or call its functions (RLS on, execute revoked).
- Uploads: JPEG/PNG only (checked by file signature, not just the declared type), max 6 MB.
- **Known gap:** a determined person can script new anonymous accounts to get more daily allowances.
  Supabase limits anonymous sign-ins per IP (default 30/hour). Turning on CAPTCHA for sign-ups closes
  most of the rest. If it ever matters, add a global daily cap in the function.

## Local testing (no real Gemini calls)

```bash
supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,logflare,vector,supavisor
supabase functions serve beautify --env-file <file with GEMINI_API_KEY + GEMINI_URL pointing at a stub>
```

The local stack uses ports 55321–55329 (see `supabase/config.toml`) so it doesn't clash with other
local Supabase projects. Run the app against it by temporarily moving `.env.local` aside and starting
Metro with `EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55321` and the local publishable key.
