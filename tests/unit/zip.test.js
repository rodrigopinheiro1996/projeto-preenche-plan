import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { lerZip, gravarZip, crc32 } from '../../src/zip.js';

const modelo = () => new Uint8Array(readFileSync(new URL('../fixtures/modelo.xlsx', import.meta.url)));
const texto = (u8) => new TextDecoder().decode(u8);
const gravarTmp = (bytes) => {
  const arq = join(mkdtempSync(join(tmpdir(), 'zip-')), 'saida.xlsx');
  writeFileSync(arq, bytes);
  return arq;
};
const mesmos = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

test('crc32("123456789") = 0xCBF43926', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('lerZip lista as entradas do xlsx', async () => {
  const z = await lerZip(modelo());
  assert.ok(z.has('xl/workbook.xml'));
  assert.ok(z.has('[Content_Types].xml'));
  assert.match(texto(z.get('xl/workbook.xml').dados), /<workbook/);
});

test('round-trip sem alteração mantém os bytes comprimidos idênticos', async () => {
  const z1 = await lerZip(modelo());
  const z2 = await lerZip(await gravarZip(z1));
  assert.deepEqual([...z2.keys()], [...z1.keys()]);
  for (const [nome, e] of z1) assert.ok(mesmos(e.bruto, z2.get(nome).bruto), nome);
});

test('alterar 1 entrada preserva as demais byte a byte', async () => {
  const z1 = await lerZip(modelo());
  const alvo = 'xl/workbook.xml';
  z1.set(alvo, { ...z1.get(alvo), dados: new TextEncoder().encode(texto(z1.get(alvo).dados) + '<!--x-->'), alterado: true });
  const z2 = await lerZip(await gravarZip(z1));
  assert.match(texto(z2.get(alvo).dados), /<!--x-->$/);
  const z0 = await lerZip(modelo());
  for (const [nome, e] of z0) if (nome !== alvo) assert.ok(mesmos(e.bruto, z2.get(nome).bruto), nome);
});

test('validação independente: unzip -t e openpyxl abrem o arquivo gravado', async () => {
  const z = await lerZip(modelo());
  const alvo = 'docProps/app.xml';
  if (z.has(alvo)) z.set(alvo, { ...z.get(alvo), dados: z.get(alvo).dados, alterado: true });
  const arq = gravarTmp(await gravarZip(z));
  execFileSync('unzip', ['-t', arq]);
  const json = JSON.parse(execFileSync('python3', [new URL('../helpers/xlsx-externo.py', import.meta.url).pathname, arq]).toString());
  assert.equal(json['AÇÃO'][0][1], 'Nome');
  assert.equal(json['AÇÃO'][1][4], 71900000001);
});

test('zip truncado/inválido lança erro em pt-BR', async () => {
  const bom = modelo();
  await assert.rejects(lerZip(bom.slice(0, 40)), /zip|arquivo/i);
  await assert.rejects(lerZip(new TextEncoder().encode('isto não é um zip')), /zip|arquivo/i);
});
