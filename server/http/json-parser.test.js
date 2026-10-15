import { test } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { parseJsonAllowEmpty } from './json-parser.js';

test('corpo vazio com JSON vira {}; JSON ruim continua 400', async () => {
  const app = Fastify();
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, parseJsonAllowEmpty);
  app.post('/x', async (req) => ({ body: req.body }));
  const h = { 'content-type': 'application/json' };
  assert.deepEqual((await app.inject({ method: 'POST', url: '/x', headers: h })).json(), { body: {} });
  assert.deepEqual((await app.inject({ method: 'POST', url: '/x', headers: h, payload: '{"a":1}' })).json(), { body: { a: 1 } });
  assert.equal((await app.inject({ method: 'POST', url: '/x', headers: h, payload: '{ruim' })).statusCode, 400);
  await app.close();
});
