import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DAILY_LIMIT, GLOBAL_DAILY_LIMIT, MAX_BYTES, PROMPT, extractImage, geminiRequest, globalLimit, manilaDay, reserveOutcome, sniffImageType, validateUpload } from './logic.ts';

test('upload validation: JPEG/PNG only, 1 byte to 6 MB', () => {
  assert.deepEqual(validateUpload({ type: 'image/jpeg', size: 1000 }), { ok: true });
  assert.deepEqual(validateUpload({ type: 'image/png', size: MAX_BYTES }), { ok: true });
  assert.equal((validateUpload({ type: 'image/heic', size: 1000 }) as { status: number }).status, 415);
  assert.equal((validateUpload({ type: 'image/gif', size: 1000 }) as { status: number }).status, 415);
  assert.equal((validateUpload({ type: 'image/jpeg', size: MAX_BYTES + 1 }) as { status: number }).status, 413);
  assert.equal((validateUpload({ type: 'image/jpeg', size: 0 }) as { status: number }).status, 400);
});

test('magic-byte sniffing rejects files that only claim to be images', () => {
  assert.equal(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(sniffImageType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(sniffImageType(new TextEncoder().encode('<html>not an image</html>')), null);
  assert.equal(sniffImageType(new Uint8Array([])), null);
});

test('rate-limit day is Manila time and the limit is 10', () => {
  assert.equal(DAILY_LIMIT, 10);
  assert.equal(manilaDay(new Date('2026-11-18T15:59:59Z')), '2026-11-18'); // 23:59:59 PHT
  assert.equal(manilaDay(new Date('2026-11-18T16:00:00Z')), '2026-11-19'); // midnight PHT
});

test('gemini request carries the exact prompt and the photo', () => {
  const r = geminiRequest('m', 'QUJD', 'image/png');
  assert.equal(r.input[0].text, PROMPT);
  assert.match(PROMPT, /Keep the same car, color, plate, wheels and mods unchanged\.$/);
  assert.deepEqual(r.input[1], { type: 'image', mime_type: 'image/png', data: 'QUJD' });
});

test('extractImage finds the image in every documented response shape', () => {
  assert.deepEqual(extractImage({ output_image: { data: 'AAA', mime_type: 'image/png' } }), { data: 'AAA', mime: 'image/png' });
  assert.deepEqual(extractImage({ steps: [{ type: 'thought' }, { type: 'model_output', content: [{ type: 'text', text: 'hi' }, { type: 'image', data: 'BBB' }] }] }),
    { data: 'BBB', mime: 'image/jpeg' });
  assert.deepEqual(extractImage({ candidates: [{ content: { parts: [{ text: 'x' }, { inlineData: { mimeType: 'image/png', data: 'CCC' } }] } }] }),
    { data: 'CCC', mime: 'image/png' });
  assert.equal(extractImage({ steps: [{ content: [{ type: 'text', text: 'I cannot edit this' }] }] }), null);
  assert.equal(extractImage(null), null);
  assert.equal(extractImage({ output_image: { data: '' } }), null);
});

test('reserve outcomes: per-user and global caps are distinct 429s', () => {
  assert.deepEqual(reserveOutcome('ok'), { ok: true });
  assert.deepEqual(reserveOutcome('user_limit'), { ok: false, status: 429, error: "You've used today's 10 beautifies. Try again tomorrow." });
  assert.deepEqual(reserveOutcome('global_limit'), { ok: false, status: 429, error: 'Beautify is busy today. Try again tomorrow.' });
  assert.equal((reserveOutcome(true) as { status: number }).status, 500); // old boolean shape = misdeployed migration
});

test('global limit defaults to 20 and accepts a positive integer override', () => {
  assert.equal(GLOBAL_DAILY_LIMIT, 20);
  assert.equal(globalLimit(undefined), 20);
  assert.equal(globalLimit('50'), 50);
  assert.equal(globalLimit('0'), 20);
  assert.equal(globalLimit('abc'), 20);
});
