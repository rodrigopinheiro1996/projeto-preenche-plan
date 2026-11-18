import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarTelefone, extrairTelefones, telefonesIguais, telefoneDoId, pareceTelefone,
} from '../../src/telefone.js';

const tabela = (nome, fn, casos) => test(nome, () => {
  for (const [entrada, esperado] of casos) assert.deepEqual(fn(...entrada), esperado, JSON.stringify(entrada));
});

tabela('normalizarTelefone', normalizarTelefone, [
  [['+55 (71) 90000-0001'], '71900000001'],
  [[71900000001], '71900000001'],
  [['5571900000001'], '71900000001'],
  [['557133330001'], '7133330001'],
  [['7133330001'], '7133330001'],
  [['abc'], null], [[''], null], [['123'], null], [[null], null], [[undefined], null],
]);

tabela('extrairTelefones', extrairTelefones, [
  [['71900000001 / 71900000002'], ['71900000001', '71900000002']],
  [['71900000001;7133330001'], ['71900000001', '7133330001']],
  [[71900000001], ['71900000001']],
  [['71900000001, 71900000002'], ['71900000001', '71900000002']],
  [['sem número'], []], [[''], []], [[null], []],
]);

tabela('telefonesIguais', telefonesIguais, [
  [['71900000001', '71900000001'], true],
  // 10 dígitos (sem o 9 extra) × 11 dígitos: mesmo DDD + últimos 8 (regra da spec §5)
  [['7190000001', '71990000001'], true],
  [['7190000001', '71900000001'], false], // últimos 8 diferem (90000001 ≠ 00000001)
  [['7190000001', '71990000002'], false],
  [['7190000001', '71900000002'], false],
  [['7190000001', '21990000001'], false], // DDD diferente
  [['71900000001', '71900000002'], false],
  [[null, '71900000001'], false],
]);

tabela('telefoneDoId', telefoneDoId, [
  [['5571900000001@wa.gw.msging.net'], '71900000001'],
  [['0b5f1c2e-uuid@tunnel.msging.net'], null],
  [[''], null], [[null], null],
]);

tabela('pareceTelefone', pareceTelefone, [
  [['+55 (21) 90000-0000'], true], [['Maria'], false], [['😀'], false],
]);
