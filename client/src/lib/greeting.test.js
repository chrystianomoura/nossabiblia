import { test } from 'node:test';
import assert from 'node:assert/strict';
import { greetingFor } from './greeting.js';

const at = (h, m = 0) => new Date(2026, 9, 16, h, m, 0);

test('saudação: bom dia das 5h às 11:59, boa tarde das 12h às 17:59, boa noite das 18h às 4:59', () => {
  assert.equal(greetingFor(at(5, 0)), 'Bom dia');
  assert.equal(greetingFor(at(8, 30)), 'Bom dia');
  assert.equal(greetingFor(at(11, 59)), 'Bom dia');
  assert.equal(greetingFor(at(12, 0)), 'Boa tarde');
  assert.equal(greetingFor(at(15, 0)), 'Boa tarde');
  assert.equal(greetingFor(at(17, 59)), 'Boa tarde');
  assert.equal(greetingFor(at(18, 0)), 'Boa noite');
  assert.equal(greetingFor(at(23, 59)), 'Boa noite');
  assert.equal(greetingFor(at(0, 0)), 'Boa noite');
  assert.equal(greetingFor(at(4, 59)), 'Boa noite');
});

test('saudação: as 24 horas do dia dão sempre uma das três saudações', () => {
  const ok = new Set(['Bom dia', 'Boa tarde', 'Boa noite']);
  for (let h = 0; h < 24; h++) assert.ok(ok.has(greetingFor(at(h))), `hora ${h}`);
});
