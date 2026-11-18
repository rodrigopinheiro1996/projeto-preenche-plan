import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizarNome, tokens, semNomeUtilizavel, semParenteses, tokensContidos,
} from '../../src/nome.js';

const tabela = (nome, fn, casos) => test(nome, () => {
  for (const [entrada, esperado] of casos) assert.deepEqual(fn(...entrada), esperado, JSON.stringify(entrada));
});

tabela('normalizarNome', normalizarNome, [
  [['ℜ𝔬𝔰𝔢𝔞𝔫𝔢 '], 'roseane'],
  [['José  da Silva 😀'], 'jose da silva'],
  [['  ÁÉÍ  Ñandú '], 'aei nandu'],
  [['😀'], ''], [[''], ''], [[null], ''],
]);

tabela('tokens', tokens, [
  [['Ana (Aninha) Souza'], ['ana', 'aninha', 'souza']],
  [['😀'], []], [[null], []],
]);

tabela('semParenteses', semParenteses, [
  [['Ana (Aninha) Souza'], 'Ana  Souza'],
  [['Maria'], 'Maria'],
]);

tabela('semNomeUtilizavel', semNomeUtilizavel, [
  [['😀😀'], true], [['+55 (21) 90000-0000'], true], [['A'], true], [[''], true], [[null], true],
  [['Ana'], false], [['A B'], false],
]);

tabela('tokensContidos', tokensContidos, [
  [[['ana', 'souza'], 'Ana Maria Souza'], true],
  [[['ana', 'lima'], 'Ana Maria Souza'], false],
  [[[], 'Ana Maria Souza'], false],
]);
