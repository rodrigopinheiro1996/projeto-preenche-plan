import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  abrirBm, escolherPlanilha, configurar, iniciarEConfirmar, salvarDownload, relatorioTexto, coluna, COL_H, COL_G,
  configurarSuite, hashArquivo, fixture, selecoes,
} from '../helpers/e2e.js';
import { cenarioFeliz, comAtraso } from '../fixtures/cenarios.js';

const ctx = configurarSuite({ before, after, afterEach }, assert);

test('1. caminho feliz: 4 selos gravados, Status (G) intacta, original inalterado, relatório no painel', async () => {
  const antes = await hashArquivo(fixture('modelo.xlsx'));
  const p = ctx.pagina = await abrirBm(ctx.navegador, cenarioFeliz());
  await escolherPlanilha(p, 'modelo.xlsx');
  const dl = p.waitForEvent('download');
  await iniciarEConfirmar(p);
  const saida = await salvarDownload(await dl);
  assert.equal(saida.nome, 'modelo_retorno.xlsx');
  assert.deepEqual(coluna(saida.abas, COL_H), ['Lida', 'Falha', 'Enviada', 'Entregue']);
  assert.deepEqual(coluna(saida.abas, COL_G), ['Novo', 'Respondido', 'Fechado', '#N/A']);
  assert.equal(await hashArquivo(fixture('modelo.xlsx')), antes);
  const rel = await relatorioTexto(p);
  assert.match(rel, /Resultado: concluído/);
  assert.match(rel, /Gravadas: 4/);
  assert.deepEqual(await selecoes(p), [0, 1, 2, 3]); // cada card clicado 1× (nunca duplica)
});

test('11. N = 2: só as 2 linhas dos cards do topo recebem selo; o resto em branco', async () => {
  const p = ctx.pagina = await abrirBm(ctx.navegador, cenarioFeliz());
  await escolherPlanilha(p, 'modelo.xlsx');
  await configurar(p, { n: 2 });
  const dl = p.waitForEvent('download');
  await iniciarEConfirmar(p);
  const saida = await salvarDownload(await dl);
  assert.deepEqual(coluna(saida.abas, COL_H), ['Lida', 'Falha', null, null]);
  assert.match(await relatorioTexto(p), /Linhas em branco: 2/);
  assert.deepEqual(await selecoes(p), [0, 1]);
});

test('12. planilha sem Retorno: cria a coluna na próxima vazia (G) — validado no openpyxl', async () => {
  const p = ctx.pagina = await abrirBm(ctx.navegador, cenarioFeliz());
  await escolherPlanilha(p, 'sem-retorno.xlsx');
  const dl = p.waitForEvent('download');
  await iniciarEConfirmar(p);
  const saida = await salvarDownload(await dl);
  assert.equal(saida.abas['AÇÃO'][0][6], 'Retorno');
  assert.deepEqual(coluna(saida.abas, 6), ['Lida', 'Falha', 'Enviada', 'Entregue']);
  assert.equal(saida.abas['AÇÃO'][0][5], 'Lote'); // colunas existentes intactas
});

test('13. cancelar na confirmação: zero cliques de card, nada baixado', async () => {
  const p = ctx.pagina = await abrirBm(ctx.navegador, cenarioFeliz());
  await escolherPlanilha(p, 'modelo.xlsx');
  let baixou = false;
  p.on('download', () => { baixou = true; });
  await p.locator('#pp-iniciar').click();
  await p.locator('#pp-confirmar-nao').click();
  await p.locator('#pp-status').filter({ hasText: 'Cancelado' }).waitFor();
  assert.deepEqual(await selecoes(p), []);
  assert.equal(baixou, false);
});

test('10. Parar no meio: parcial baixada, linhas não visitadas em branco, sem novos cliques de card', async () => {
  const p = ctx.pagina = await abrirBm(ctx.navegador, comAtraso(cenarioFeliz(), 1500));
  await escolherPlanilha(p, 'modelo.xlsx');
  const dl = p.waitForEvent('download');
  await iniciarEConfirmar(p);
  await p.locator('#pp-status').filter({ hasText: 'Verificando 2/4' }).waitFor({ timeout: 30_000 });
  await p.locator('#pp-parar').click();
  const saida = await salvarDownload(await dl);
  const h = coluna(saida.abas, COL_H);
  assert.equal(h[0], 'Lida');
  assert.deepEqual(h.slice(2), [null, null]);
  assert.ok((await selecoes(p)).length <= 2);
  assert.match(await relatorioTexto(p), /Resultado: parado/);
});
