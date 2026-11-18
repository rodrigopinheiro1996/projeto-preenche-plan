import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  abrirBm, escolherPlanilha, configurar, iniciarEConfirmar, salvarDownload, relatorioTexto, coluna, COL_H, configurarSuite,
} from '../helpers/e2e.js';
import { cenarioFeliz, comAtraso, comPainelInicial, comPainelNuncaAtualiza, cliente } from '../fixtures/cenarios.js';

const ctx = configurarSuite({ before, after, afterEach }, assert);
const BRUNO = cliente('71900000002', 'Bruno Lima'); // cliente que já estava selecionado (linha 3 do modelo.xlsx)

test('4a. painel velho (troca atrasa 2 s): nunca grava o selo no cliente errado', async () => {
  const p = ctx.pagina = await abrirBm(ctx.navegador, comAtraso(comPainelInicial(cenarioFeliz(), BRUNO), 2000));
  await escolherPlanilha(p, 'modelo.xlsx');
  await configurar(p, { n: 2 });
  const dl = p.waitForEvent('download');
  await iniciarEConfirmar(p);
  const saida = await salvarDownload(await dl);
  // Ana (card 0) = Lida na linha 2; Bruno (card 1) = Falha na linha 3. Se o painel velho (Bruno) fosse aceito
  // no 1º card, Ana teria gravado "Lida" na linha de Bruno.
  assert.deepEqual(coluna(saida.abas, COL_H), ['Lida', 'Falha', null, null]);
  assert.match(await relatorioTexto(p), /Gravadas: 2/);
});

test('4b. painel que NUNCA atualiza: espera 6 s, ignora o painel velho e cai no nome do card', async () => {
  const p = ctx.pagina = await abrirBm(ctx.navegador, comPainelNuncaAtualiza(comPainelInicial(cenarioFeliz(), BRUNO)));
  await escolherPlanilha(p, 'modelo.xlsx');
  await configurar(p, { n: 1 });
  const dl = p.waitForEvent('download');
  const t0 = Date.now();
  await iniciarEConfirmar(p);
  const saida = await salvarDownload(await dl);
  assert.ok(Date.now() - t0 >= 6000, 'deveria ter esperado os 6 s');
  // Card "Ana Maria Souza" resolvido pelo NOME; o telefone do painel velho (Bruno, linha 3) nunca é usado.
  assert.deepEqual(coluna(saida.abas, COL_H), ['Lida', null, null, null]);
});
