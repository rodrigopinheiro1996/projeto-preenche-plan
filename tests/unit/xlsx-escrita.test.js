import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { abrirXlsx, gravarCelulas } from '../../src/xlsx.js';
import { lerZip } from '../../src/zip.js';

const fixture = (nome) => new Uint8Array(readFileSync(new URL(`../fixtures/${nome}`, import.meta.url)));
const texto = (u8) => new TextDecoder().decode(u8);
const mesmos = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const XLSX_EXTERNO = new URL('../helpers/xlsx-externo.py', import.meta.url).pathname;

/** Validação decisiva: unzip -t + openpyxl (independentes do nosso código). */
function externo(bytes) {
  const arq = join(mkdtempSync(join(tmpdir(), 'xlsx-')), 'saida.xlsx');
  writeFileSync(arq, bytes);
  execFileSync('unzip', ['-t', arq]);
  return JSON.parse(execFileSync('python3', [XLSX_EXTERNO, arq]).toString());
}
const gravar = async (nome, opcoes) => {
  const original = fixture(nome);
  const x = await abrirXlsx(original);
  return { original, x, saida: await gravarCelulas(x, opcoes) };
};

test('modelo.xlsx: grava Lida/Falha em H; Status (G) intacta; openpyxl concorda', async () => {
  const { saida } = await gravar('modelo.xlsx', { colunaDestino: 'H', gravacoes: new Map([[2, 'Lida'], [4, 'Falha']]) });
  const aba = externo(saida)['AÇÃO'];
  assert.deepEqual(aba.map((l) => l[7]), ['Retorno', 'Lida', null, 'Falha', null]);
  assert.deepEqual(aba.map((l) => l[6]), ['Status', 'Novo', 'Respondido', 'Fechado', '#N/A']);
  const de = await abrirXlsx(saida);
  assert.equal(de.linhas[0].celulas.H, 'Lida');
  assert.equal(de.linhas[2].celulas.H, 'Falha');
});

test('célula vazia estilizada <c r="H5" s=".."/> é substituída no lugar, mantendo s, sem duplicar', async () => {
  const { x, saida } = await gravar('modelo.xlsx', { colunaDestino: 'H', gravacoes: new Map([[5, 'Enviada']]) });
  const antes = texto((await lerZip(fixture('modelo.xlsx'))).get(x.caminhoAba).dados);
  const s = /<c r="H5" s="(\d+)"\/>/.exec(antes)[1];
  const depois = texto((await lerZip(saida)).get(x.caminhoAba).dados);
  assert.equal(depois.match(/<c r="H5"/g).length, 1);
  assert.match(depois, new RegExp(`<c r="H5" s="${s}" t="inlineStr"><is><t>Enviada</t></is></c>`));
  assert.equal(externo(saida)['AÇÃO'][4][7], 'Enviada');
});

test('sem-retorno.xlsx: cria cabeçalho Retorno em G1 e atualiza dimension', async () => {
  const { saida } = await gravar('sem-retorno.xlsx', { colunaDestino: 'G', criarCabecalho: 'Retorno', gravacoes: new Map([[3, 'Entregue']]) });
  const aba = externo(saida)['AÇÃO'];
  assert.equal(aba[0][6], 'Retorno');
  assert.equal(aba[2][6], 'Entregue');
  const xml = texto((await lerZip(saida)).get('xl/worksheets/sheet1.xml').dados);
  assert.match(xml, /<dimension ref="A1:G5"\/>/);
  // ordem das células dentro da linha: ... F antes de G
  assert.ok(xml.indexOf('<c r="F1"') < xml.indexOf('<c r="G1"'));
});

test('celulas-esparsas.xlsx: linha sem a célula do destino ganha <c> na posição certa', async () => {
  const { saida } = await gravar('celulas-esparsas.xlsx', { colunaDestino: 'H', gravacoes: new Map([[3, 'Lida']]) });
  const xml = texto((await lerZip(saida)).get('xl/worksheets/sheet1.xml').dados);
  const linha3 = /<row r="3"[\s\S]*?<\/row>/.exec(xml)[0];
  assert.ok(linha3.indexOf('<c r="F3"') < linha3.indexOf('<c r="H3"'));
  assert.equal(externo(saida)['AÇÃO'][2][7], 'Lida');
});

test('destino ANTES de outras células da linha (coluna D, linha só com A, B e E)', async () => {
  const { saida } = await gravar('celulas-esparsas.xlsx', { colunaDestino: 'D', gravacoes: new Map([[4, 'Falha']]) });
  const xml = texto((await lerZip(saida)).get('xl/worksheets/sheet1.xml').dados);
  const linha4 = /<row r="4"[\s\S]*?<\/row>/.exec(xml)[0];
  assert.ok(linha4.indexOf('<c r="A4"') < linha4.indexOf('<c r="D4"'));
  assert.ok(linha4.indexOf('<c r="D4"') < linha4.indexOf('<c r="E4"'));
  assert.equal(externo(saida)['AÇÃO'][3][3], 'Falha');
});

test('linha inexistente: cria <row r> na posição certa', async () => {
  const { saida } = await gravar('modelo.xlsx', { colunaDestino: 'H', gravacoes: new Map([[8, 'Lida'], [7, 'Falha']]) });
  const xml = texto((await lerZip(saida)).get('xl/worksheets/sheet1.xml').dados);
  assert.ok(xml.indexOf('<row r="5"') < xml.indexOf('<row r="7"'));
  assert.ok(xml.indexOf('<row r="7"') < xml.indexOf('<row r="8"'));
  assert.equal(externo(saida)['AÇÃO'][7][7], 'Lida');
});

test('& < > " no texto gravado sobrevivem ao round-trip', async () => {
  const t = 'A & B <c> "d"';
  const { saida } = await gravar('modelo.xlsx', { colunaDestino: 'H', gravacoes: new Map([[2, t], [3, '  com espaços  ']]) });
  const aba = externo(saida)['AÇÃO'];
  assert.equal(aba[1][7], t);
  assert.equal(aba[2][7], '  com espaços  '); // xml:space="preserve"
  assert.equal((await abrirXlsx(saida)).linhas[0].celulas.H, t);
});

test('entradas não alteradas têm bytes comprimidos idênticos; só a aba muda', async () => {
  const { original, saida } = await gravar('modelo.xlsx', { colunaDestino: 'H', gravacoes: new Map([[2, 'Lida']]) });
  const z0 = await lerZip(original);
  const z1 = await lerZip(saida);
  assert.deepEqual([...z1.keys()], [...z0.keys()]);
  for (const [nome, e] of z0) {
    if (nome === 'xl/worksheets/sheet1.xml') assert.ok(!mesmos(e.bruto, z1.get(nome).bruto));
    else assert.ok(mesmos(e.bruto, z1.get(nome).bruto), nome);
  }
});

test('aba-segunda.xlsx: altera só a aba AÇÃO (a outra aba fica idêntica)', async () => {
  const { original, saida } = await gravar('aba-segunda.xlsx', { colunaDestino: 'H', gravacoes: new Map([[2, 'Lida']]) });
  const z0 = await lerZip(original);
  const z1 = await lerZip(saida);
  assert.ok(mesmos(z0.get('xl/worksheets/sheet1.xml').bruto, z1.get('xl/worksheets/sheet1.xml').bruto));
  assert.equal(externo(saida)['AÇÃO'][1][7], 'Lida');
});

test('o Uint8Array original não é mutado', async () => {
  const original = fixture('modelo.xlsx');
  const copia = original.slice();
  const x = await abrirXlsx(original);
  await gravarCelulas(x, { colunaDestino: 'H', gravacoes: new Map([[2, 'Lida']]) });
  assert.ok(mesmos(original, copia));
});

test('sem gravações: o conteúdo continua válido e igual', async () => {
  const { saida } = await gravar('modelo.xlsx', { colunaDestino: 'H', gravacoes: new Map() });
  assert.equal(externo(saida)['AÇÃO'][1][1], 'Ana Maria Souza');
});

test('criarCabecalho só vale se a coluna de destino não tem cabeçalho; não toca cabeçalho existente', async () => {
  const { saida } = await gravar('modelo.xlsx', { colunaDestino: 'H', criarCabecalho: 'Outro', gravacoes: new Map([[2, 'Lida']]) });
  assert.equal(externo(saida)['AÇÃO'][0][7], 'Retorno');
});
