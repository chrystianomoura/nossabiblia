import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRegister } from './validation.js';

const ok = { first_name: ' Maria  Laura ', last_name: 'Santos', email: ' Maria@Exemplo.com ', email_confirm: 'maria@exemplo.com', password: 'senha-segura', password_confirm: 'senha-segura' };

test('cadastro válido: normaliza nomes e e-mail', () => {
  const r = validateRegister(ok);
  assert.deepEqual(r.value, { first_name: 'Maria Laura', last_name: 'Santos', email: 'maria@exemplo.com', password: 'senha-segura' });
});

test('nomes vazios ou só números são recusados', () => {
  assert.ok(validateRegister({ ...ok, first_name: '  ' }).fields.first_name);
  assert.ok(validateRegister({ ...ok, last_name: '123 45' }).fields.last_name);
  assert.ok(validateRegister({ ...ok, first_name: 'a'.repeat(101) }).fields.first_name);
});

test('e-mails e senhas precisam ser iguais; senha com tamanho limitado', () => {
  assert.ok(validateRegister({ ...ok, email_confirm: 'outro@exemplo.com' }).fields.email_confirm);
  assert.ok(validateRegister({ ...ok, email: 'sem-arroba' }).fields.email);
  assert.ok(validateRegister({ ...ok, password_confirm: 'diferente!' }).fields.password_confirm);
  assert.ok(validateRegister({ ...ok, password: 'curta', password_confirm: 'curta' }).fields.password);
  const longa = 'a'.repeat(129);
  assert.ok(validateRegister({ ...ok, password: longa, password_confirm: longa }).fields.password);
});

test('corpo ausente ou com tipos errados não lança', () => {
  for (const body of [undefined, null, 'x', 5, { first_name: {}, email: [], password: 1 }]) {
    assert.ok(validateRegister(body).fields);
  }
});
