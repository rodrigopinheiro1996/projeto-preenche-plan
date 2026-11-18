import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  abrirBm, escolherPlanilha, configurar, iniciarEConfirmar, salvarDownload, relatorioTexto, coluna, COL_H, configurarSuite, selecoes,
} from '../helpers/e2e.js';
import { cenarioBase, criarCard, cliente, CAMPANHA_A, CAMPANHA_B } from '../fixtures/cenarios.js';

const ctx = configurarSuite({ before, after, afterEach }, assert);

// e2e-base.xlsx (linhas): 2 Ana Maria Souza · 3 Bruno Lima · 4 Carla Dias · 5 Roseane Alves · 6 Ana Souza · 7 Fabio Lima
//                         · 8 Daniel Rocha (sem card) · 9 Eva Nunes (Retorno já "Lida")
// cenarioBase (topo→base): 0 Ana · 1 título-telefone (Bruno) · 2 emoji/tunnel · 3 Fraktur/tunnel · 4 "Ana (Aninha) Souza"/tunnel
//                          · 5 "Lima"/tunnel (ambíguo: linhas 3 e 7) · 6 Carla (outra campanha) · 7 Ana duplicada (mais antiga)
async function rodar(acaoDialogo) {
  const p = ctx.pagina = await abrirBm(ctx.navegador, cenarioBase());
  await escolherPlanilha(p, 'e2e-base.xlsx');
  const dl = p.waitForEvent('download');
  await iniciarEConfirmar(p);
  await p.locator('#pp-dialogo .cand').first().waitFor({ timeout: 60_000 }); // pausa de nome (card "Lima")
  await acaoDialogo(p);
  return { p, saida: await salvarDownload(await dl) };
}

test('2/3/5/6a. títulos esquisitos, tunnel→nome, nome parcial, duplicado e ESCOLHER no diálogo', async () => {
  const { p, saida } = await rodar(async (pg) => {
    const cands = await pg.locator('#pp-dialogo .cand').allInnerTexts();
    assert.equal(cands.length, 2);
    assert.match(cands[0], /Linha 3: Bruno Lima/);
    assert.match(cands[1], /Linha 7: Fabio Lima/);
    await pg.locator('.escolher[data-linha="7"]').click();
  });
  // linhas 2..9 (índice 0..7)
  assert.deepEqual(coluna(saida.abas, COL_H), ['Lida', 'Falha', null, 'Entregue', 'Lida', 'Enviada', null, 'Lida']);
  const rel = await relatorioTexto(p);
  assert.match(rel, /Resultado: concluído/);
  assert.match(rel, /nome parcial[\s\S]*linha 5/i);        // Roseane (Fraktur) casou por nome parcial
  assert.match(rel, /Duplicados[\s\S]*linha 2/);           // Ana repetida: valeu o card do topo
  assert.match(rel, /sem telefone\/nome: 1/);              // emoji: pulado, sem diálogo
  assert.match(rel, /outra campanha: 1/);                  // Carla (campanha B) ignorada pelo filtro padrão
  assert.doesNotMatch(rel, /Respondido|N\. localizado/);
  assert.deepEqual(await selecoes(p), [0, 1, 2, 3, 4, 5, 7]); // card 6 (outra campanha) nunca clicado
});

test('6b. PULAR no diálogo: nada gravado para o cliente ambíguo; relatório anota', async () => {
  const { p, saida } = await rodar((pg) => pg.locator('#pp-pular').click());
  assert.deepEqual(coluna(saida.abas, COL_H), ['Lida', 'Falha', null, 'Entregue', 'Lida', null, null, 'Lida']);
  assert.match(await relatorioTexto(p), /decisão do BM: 1/);
});

test('6c. PARAR TUDO no diálogo: baixa parcial; o que não foi visitado fica em branco', async () => {
  const { p, saida } = await rodar((pg) => pg.locator('#pp-parar-tudo').click());
  assert.deepEqual(coluna(saida.abas, COL_H), ['Lida', 'Falha', null, 'Entregue', 'Lida', null, null, 'Lida']);
  const rel = await relatorioTexto(p);
  assert.match(rel, /Resultado: parado/);
  assert.deepEqual(await selecoes(p), [0, 1, 2, 3, 4, 5]); // o duplicado (card 7) nem foi clicado
});

async function duasCampanhas(campanha) {
  const cenario = {
    ...cenarioBase(),
    cards: [
      criarCard('Ana Maria Souza', '12:36 PM', CAMPANHA_A, 'Lida', cliente('71900000001', 'Ana Maria Souza')),
      criarCard('Carla Dias', '11:00 AM', CAMPANHA_B, 'Entregue', cliente('71900000003', 'Carla Dias')),
    ],
  };
  const p = ctx.pagina = await abrirBm(ctx.navegador, cenario);
  await escolherPlanilha(p, 'e2e-base.xlsx');
  if (campanha !== undefined) await configurar(p, { campanha });
  const dl = p.waitForEvent('download');
  await iniciarEConfirmar(p);
  return { p, saida: await salvarDownload(await dl) };
}

test('9a. duas campanhas: o filtro padrão ignora a outra (contada no relatório)', async () => {
  const { p, saida } = await duasCampanhas();
  assert.deepEqual(coluna(saida.abas, COL_H).slice(0, 3), ['Lida', null, null]);
  assert.match(await relatorioTexto(p), /outra campanha: 1/);
  assert.deepEqual(await selecoes(p), [0]);
});

test('9b. filtro de campanha vazio inclui as duas', async () => {
  const { p, saida } = await duasCampanhas('');
  assert.deepEqual(coluna(saida.abas, COL_H).slice(0, 3), ['Lida', null, 'Entregue']);
  assert.deepEqual(await selecoes(p), [0, 1]);
});
