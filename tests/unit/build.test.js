import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { MARCADOR } from '../../src/main.js';

const raiz = new URL('../../', import.meta.url).pathname;
const rodar = () => execFileSync('node', ['scripts/build.mjs'], { cwd: raiz, encoding: 'utf8' });

test('build gera dist/bm.js e dist/instalar.html', () => {
  rodar();
  assert.ok(existsSync(`${raiz}dist/bm.js`));
  assert.ok(existsSync(`${raiz}dist/instalar.html`));
  assert.ok(statSync(`${raiz}dist/bm.js`).size < 400 * 1024);
});

test('o href começa com javascript: e, decodificado, contém o marcador do main e é igual ao bm.js', () => {
  rodar();
  const html = readFileSync(`${raiz}dist/instalar.html`, 'utf8');
  const href = /<a [^>]*href="(javascript:[^"]+)"/.exec(html)?.[1];
  assert.ok(href, 'link javascript: não encontrado');
  const codigo = decodeURIComponent(href.slice('javascript:'.length));
  assert.ok(codigo.includes(MARCADOR));
  assert.equal(codigo, readFileSync(`${raiz}dist/bm.js`, 'utf8').trim()); // gerado, nunca editado à mão
});

test('bm.js é um script clássico: sem import/export', () => {
  rodar();
  const js = readFileSync(`${raiz}dist/bm.js`, 'utf8');
  assert.equal((js.match(/\bimport /g) ?? []).length, 0);
  assert.equal((js.match(/\bexport /g) ?? []).length, 0);
});

test('instalar.html traz as instruções em pt-BR', () => {
  rodar();
  const html = readFileSync(`${raiz}dist/instalar.html`, 'utf8');
  assert.match(html, /favoritos/i);
  assert.match(html, /Mensagens ativas/);
});
