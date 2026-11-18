import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsearCard } from '../../src/blip.js';

const fonte = readFileSync(new URL('../../src/blip.js', import.meta.url), 'utf8');

test('lint: blip.js não usa classes com hash, nth-child nem botões de envio/atualização', () => {
  for (const proibido of [/(^|[^a-z])sc-/i, /nth-child/i, /Yv6Nb/, /Enviar/i, /Atualizar/i]) {
    assert.equal(proibido.test(fonte), false, `blip.js contém ${proibido}`);
  }
});

test('lint: só existem 2 cliques no código — card e aba Contato', () => {
  const cliques = fonte.match(/\.click\(\)/g) ?? [];
  assert.equal(cliques.length, 2);
});

test('parsearCard: [título, horário, campanha, "Chatbot:", bot, selo]', () => {
  const c = parsearCard('Ana Maria Souza\n12:36 PM\nacao_reclameaqui\nChatbot:\nMeu Bot\nLida');
  assert.deepEqual(c, { titulo: 'Ana Maria Souza', horario: '12:36 PM', campanha: 'acao_reclameaqui', selo: 'Lida' });
});

test('parsearCard: linhas vazias e espaços nas pontas são ignorados; selo do chip tem prioridade', () => {
  const c = parsearCard('  ℜ𝔬𝔰𝔢𝔞𝔫𝔢 \n\n2 days\ncamapanha_ativo_ra\nChatbot:\nBot\nEntregue', 'Falha');
  assert.equal(c.titulo, 'ℜ𝔬𝔰𝔢𝔞𝔫𝔢');
  assert.equal(c.selo, 'Falha');
});

test('parsearCard: card com poucas linhas → erro explícito pedindo o outerHTML', () => {
  assert.throws(() => parsearCard('Ana\n12:36 PM'), /outerHTML/);
  assert.throws(() => parsearCard(''), /outerHTML/);
});
