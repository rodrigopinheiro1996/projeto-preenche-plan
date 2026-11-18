import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { abrirXlsx, detectarColunas } from '../../src/xlsx.js';

const fixture = (nome) => new Uint8Array(readFileSync(new URL(`../fixtures/${nome}`, import.meta.url)));
const abrir = (nome, opcoes) => abrirXlsx(fixture(nome), opcoes);

test('modelo.xlsx: cabeçalhos A–H e 4 linhas de dados', async () => {
  const x = await abrir('modelo.xlsx');
  assert.deepEqual(x.cabecalhos.map((c) => [c.coluna, c.texto]), [
    ['A', 'Id Origem'], ['B', 'Nome'], ['C', 'CPF/CNPJ'], ['D', 'Motivo Mãe'],
    ['E', 'Telefones'], ['F', 'Lote'], ['G', 'Status'], ['H', 'Retorno'],
  ]);
  assert.deepEqual(x.linhas.map((l) => l.linha), [2, 3, 4, 5]);
  assert.equal(x.linhas[0].celulas.B, 'Ana Maria Souza');
  assert.equal(x.linhas[0].celulas.E, '71900000001'); // número lido como texto de inteiro
  assert.equal(x.linhas[1].celulas.G, 'Respondido');
  assert.equal(x.caminhoAba, 'xl/worksheets/sheet1.xml');
});

test('célula vazia não aparece em celulas', async () => {
  const x = await abrir('modelo.xlsx');
  assert.equal('H' in x.linhas[0].celulas, false);
});

test('notação científica do Excel: <v>7.1900000001E10</v> → "71900000001"', async () => {
  const x = await abrir('celulas-esparsas.xlsx');
  assert.equal(x.linhas[0].celulas.E, '71900000001');
});

test('sharedStrings (t="s") e células faltando', async () => {
  const x = await abrir('celulas-esparsas.xlsx');
  const l3 = x.linhas.find((l) => l.linha === 3);
  assert.equal(l3.celulas.B, 'Bruno Lima'); // veio de sharedStrings
  assert.equal('D' in l3.celulas, false);
  assert.equal('G' in l3.celulas, false);
});

test('célula com 2 números e telefone como texto', async () => {
  const x = await abrir('celulas-esparsas.xlsx');
  assert.equal(x.linhas.find((l) => l.linha === 3).celulas.E, '71900000002 / 71900000003');
  assert.equal(x.linhas.find((l) => l.linha === 4).celulas.E, '71900000004');
});

test('entidades XML decodificadas (&amp; &lt; &gt;)', async () => {
  const x = await abrir('celulas-esparsas.xlsx');
  assert.equal(x.linhas.find((l) => l.linha === 5).celulas.B, 'Daniel & Filhos <ME>');
});

test('linhas só com estilo/vazias não são linhas de dados', async () => {
  const x = await abrir('linhas-vazias-estilizadas.xlsx');
  assert.deepEqual(x.linhas.map((l) => l.linha), [2, 3]);
});

test('aba-segunda.xlsx: acha AÇÃO pelo rels, não por sheet1.xml', async () => {
  const x = await abrir('aba-segunda.xlsx');
  assert.equal(x.caminhoAba, 'xl/worksheets/sheet2.xml');
  assert.equal(x.cabecalhos[1].texto, 'Nome');
  assert.equal(x.linhas.length, 4);
});

test('aba escolhida por parâmetro', async () => {
  const x = await abrir('aba-segunda.xlsx', { aba: 'Resumo' });
  assert.equal(x.cabecalhos[0].texto, 'Resumo');
});

test('aba inexistente → erro em pt-BR listando as abas', async () => {
  await assert.rejects(abrir('modelo.xlsx', { aba: 'XYZ' }), (e) => /XYZ/.test(e.message) && /AÇÃO/.test(e.message) && /aba/i.test(e.message));
});

test('detectarColunas: modelo.xlsx', async () => {
  const x = await abrir('modelo.xlsx');
  assert.deepEqual(detectarColunas(x.cabecalhos), { nome: 'B', telefones: 'E', destino: 'H' });
});

test('detectarColunas: sem-retorno.xlsx → destino null', async () => {
  const x = await abrir('sem-retorno.xlsx');
  assert.deepEqual(detectarColunas(x.cabecalhos), { nome: 'B', telefones: 'E', destino: null });
});

test('detectarColunas ignora acento e maiúsculas; ausente → null', () => {
  assert.deepEqual(
    detectarColunas([{ coluna: 'A', texto: 'NOME' }, { coluna: 'B', texto: 'Telefone' }, { coluna: 'C', texto: 'RETORNO ' }]),
    { nome: 'A', telefones: 'B', destino: 'C' });
  assert.deepEqual(detectarColunas([{ coluna: 'A', texto: 'Outro' }]), { nome: null, telefones: null, destino: null });
});

test('arquivo que não é xlsx → erro em pt-BR', async () => {
  await assert.rejects(abrirXlsx(new TextEncoder().encode('lixo lixo lixo lixo lixo lixo')), /arquivo|zip/i);
});
