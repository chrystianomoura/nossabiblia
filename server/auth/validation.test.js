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

test('e-mail: até 64 caracteres antes do @ e 254 no total (RFC 5321); acima disso é recusado', () => {
  const com = (local, dominio = 'exemplo.com') => ({ ...ok, email: `${local}@${dominio}`, email_confirm: `${local}@${dominio}` });
  assert.ok(validateRegister(com('a'.repeat(64))).value, '64 antes do @ vale');
  assert.ok(validateRegister(com('a'.repeat(65))).fields.email, '65 antes do @ não vale');
  const dominioLongo = `${'d'.repeat(60)}.${'e'.repeat(60)}.${'f'.repeat(60)}.${'g'.repeat(60)}.com`; // 247 + 30 + 1 = 278
  assert.ok(validateRegister(com('a'.repeat(30), dominioLongo)).fields.email, 'passa de 254 no total');
  assert.ok(validateRegister(com('a', 'b.cc')).value, 'o menor e-mail válido (a@b.cc)');
});

test('nome de exatamente 100 caracteres vale; 101 não; a senha vale de 8 a 128', () => {
  assert.ok(validateRegister({ ...ok, first_name: 'a'.repeat(100) }).value);
  assert.ok(validateRegister({ ...ok, first_name: 'a'.repeat(101) }).fields.first_name);
  const senha = (n) => ({ ...ok, password: 'x'.repeat(n), password_confirm: 'x'.repeat(n) });
  assert.ok(validateRegister(senha(8)).value && validateRegister(senha(128)).value);
  assert.ok(validateRegister(senha(7)).fields.password && validateRegister(senha(129)).fields.password);
});
