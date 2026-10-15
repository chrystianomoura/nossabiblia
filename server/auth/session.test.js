import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeSessionCookie, clearSessionCookie, sessionCookieName } from './session.js';

test('cookie em produção: __Host-, Secure, HttpOnly, SameSite=Lax, Path=/ e sem Domain', () => {
  const c = serializeSessionCookie('abc', { secure: true });
  assert.ok(c.startsWith('__Host-nb_session=abc;'));
  for (const parte of ['Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/', `Max-Age=${30 * 86400}`]) assert.ok(c.includes(parte), parte);
  assert.ok(!/domain/i.test(c));
});

test('cookie em desenvolvimento (http): sem Secure e sem prefixo, que o navegador recusaria', () => {
  const c = serializeSessionCookie('abc', { secure: false });
  assert.ok(c.startsWith('nb_session=abc;'));
  assert.ok(!c.includes('Secure'));
  assert.ok(c.includes('HttpOnly'));
  assert.equal(sessionCookieName(false), 'nb_session');
});

test('cookie de saída apaga o valor na hora', () => {
  const c = clearSessionCookie({ secure: true });
  assert.ok(c.startsWith('__Host-nb_session=;'));
  assert.ok(c.includes('Max-Age=0'));
});
