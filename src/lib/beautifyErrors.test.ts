import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNetworkError, mapFailure } from './beautifyErrors.ts';

test('only connection failures count as offline', () => {
  assert.equal(isNetworkError(new TypeError('Network request failed')), true);
  assert.equal(isNetworkError(new Error('The Internet connection appears to be offline.')), true);
  assert.equal(isNetworkError(new Error('Could not connect to the server.')), true);
  assert.equal(isNetworkError(new Error('Unsupported FormDataPart implementation')), false);
  assert.equal(isNetworkError(new SyntaxError('Unexpected token <')), false);
});

test('offline: fetch failed before any response', () => {
  assert.equal(mapFailure({ networkError: true }).kind, 'offline');
  assert.match(mapFailure({ networkError: true }).message, /offline/);
});

test('timeout: our 90 s abort or a 504 from the function', () => {
  assert.equal(mapFailure({ aborted: 'timeout' }).kind, 'timeout');
  assert.equal(mapFailure({ status: 504 }).kind, 'timeout');
  assert.equal(mapFailure({ aborted: 'timeout', networkError: true }).kind, 'timeout'); // abort surfaces as a network error too
});

test('user cancel wins over everything', () => {
  assert.equal(mapFailure({ aborted: 'cancel', networkError: true }).kind, 'cancelled');
});

test('429 daily limit uses the server message, with a fallback', () => {
  assert.equal(mapFailure({ status: 429, serverMessage: "You've used today's 10 beautifies. Try again tomorrow." }).message,
    "You've used today's 10 beautifies. Try again tomorrow.");
  assert.match(mapFailure({ status: 429 }).message, /10 beautifies/);
});

test('429 global cap shows the busy message from the server', () => {
  assert.deepEqual(mapFailure({ status: 429, serverMessage: 'Beautify is busy today. Try again tomorrow.' }),
    { kind: 'limit', message: 'Beautify is busy today. Try again tomorrow.' });
});

test('413/415 show the specific reason; 5xx and anything else are generic', () => {
  assert.equal(mapFailure({ status: 413, serverMessage: 'The photo is too large (max 6 MB).' }).message, 'The photo is too large (max 6 MB).');
  for (const status of [500, 502, 503, 401, 404]) {
    assert.deepEqual(mapFailure({ status, serverMessage: 'internal detail' }), { kind: 'other', message: "Couldn't beautify, try again." });
  }
});
