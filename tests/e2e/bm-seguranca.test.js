import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  abrirBm, escolherPlanilha, iniciarEConfirmar, salvarDownload, relatorioTexto, coluna, COL_H, configurarSuite, selecoes, BM_JS,
} from '../helpers/e2e.js';
import { cenarioFeliz, comAtraso } from '../fixtures/cenarios.js';

const ctx = configurarSuite({ before, after, afterEach }, assert);
const hosts = (p) => p.evaluate(() => document.querySelectorAll('#preenche-plan-host').length);

test('idempotente: injetar o bm 2× deixa exatamente 1 painel', async () => {
  const p = ctx.pagina = await abrirBm(ctx.navegador, cenarioFeliz());
  await p.addScriptTag({ content: BM_JS() });
  await p.addScriptTag({ content: BM_JS() });
  assert.equal(await hosts(p), 1);
});

test('re-clicar no favorito no meio da execução não inicia uma 2ª execução nem duplica cliques', async () => {
  const p = ctx.pagina = await abrirBm(ctx.navegador, comAtraso(cenarioFeliz(), 800));
  await escolherPlanilha(p, 'modelo.xlsx');
  const dl = p.waitForEvent('download');
  await iniciarEConfirmar(p);
  await p.locator('#pp-status').filter({ hasText: 'Verificando 2/4' }).waitFor({ timeout: 30_000 });
  await p.addScriptTag({ content: BM_JS() }); // "clicou o favorito de novo"
  assert.equal(await hosts(p), 1);
  const saida = await salvarDownload(await dl);
  assert.deepEqual(coluna(saida.abas, COL_H), ['Lida', 'Falha', 'Enviada', 'Entregue']);
  assert.deepEqual(await selecoes(p), [0, 1, 2, 3]); // sem repetidos
});

test('o botão × fica desabilitado durante a execução (o Parar nunca some); depois da execução fecha e o favorito reabre o mesmo painel', async () => {
  const p = ctx.pagina = await abrirBm(ctx.navegador, comAtraso(cenarioFeliz(), 800));
  await escolherPlanilha(p, 'modelo.xlsx');
  const dl = p.waitForEvent('download');
  await iniciarEConfirmar(p);
  await p.locator('#pp-status').filter({ hasText: 'Verificando' }).waitFor({ timeout: 30_000 });
  assert.equal(await p.locator('#pp-fechar').isDisabled(), true);
  await salvarDownload(await dl);
  await p.locator('#pp-fechar:not([disabled])').waitFor();
  await p.locator('#pp-fechar').click();
  assert.equal(await p.locator('#pp-iniciar').isVisible(), false);
  await p.addScriptTag({ content: BM_JS() });
  assert.equal(await hosts(p), 1);
  assert.equal(await p.locator('#pp-iniciar').isVisible(), true);
});

test('Baixar parcial no meio da execução baixa só o já resolvido; depois Parar encerra; relatório copiável', async () => {
  const p = ctx.pagina = await abrirBm(ctx.navegador, comAtraso(cenarioFeliz(), 1500));
  await escolherPlanilha(p, 'modelo.xlsx');
  await iniciarEConfirmar(p);
  await p.locator('#pp-status').filter({ hasText: 'Verificando 2/4' }).waitFor({ timeout: 30_000 });
  const dlParcial = p.waitForEvent('download');
  await p.locator('#pp-parcial').click();
  const parcial = await salvarDownload(await dlParcial);
  assert.equal(coluna(parcial.abas, COL_H)[0], 'Lida');
  assert.deepEqual(coluna(parcial.abas, COL_H).slice(2), [null, null]);
  const dlFinal = p.waitForEvent('download');
  await p.locator('#pp-parar').click();
  await salvarDownload(await dlFinal);
  assert.match(await relatorioTexto(p), /Resultado: parado/);
  await p.locator('#pp-copiar').click();
  await p.locator('#pp-copiar').filter({ hasText: 'Copiado!' }).waitFor({ timeout: 5000 });
});
