import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAttemptLimiter } from './attempt-limiter.js';

test('bloqueia depois do máximo, libera após a janela e zera com reset', () => {
  let t = 0;
  const l = createAttemptLimiter({ max: 3, windowMs: 1000, now: () => t });
  assert.ok([1, 2, 3].every(() => l.hit('a').allowed));
  const r = l.hit('a');
  assert.equal(r.allowed, false);
  assert.equal(r.retryAfter, 1);
  assert.ok(l.hit('b').allowed);
  t = 1001;
  assert.ok(l.hit('a').allowed);
  l.hit('a'); l.hit('a'); l.reset('a');
  assert.ok(l.hit('a').allowed);
});

test('número de chaves limitado', () => {
  const l = createAttemptLimiter({ max: 1, windowMs: 1000, maxKeys: 3, now: () => 0 });
  for (let i = 0; i < 100; i++) l.hit(`k${i}`);
  assert.ok(l.hit('novo').allowed);
});
