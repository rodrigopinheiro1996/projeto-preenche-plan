import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  abrirBm, escolherPlanilha, configurar, iniciarEConfirmar, salvarDownload, relatorioTexto, coluna, COL_H, configurarSuite, selecoes,
} from '../helpers/e2e.js';
import { cenarioBase, criarCard, cliente, semTelefone, CAMPANHA_A } from '../fixtures/cenarios.js';

const ctx = configurarSuite({ before, after, afterEach }, assert);
const eva = () => criarCard('Eva Nunes', '12:00 PM', CAMPANHA_A, 'Entregue', cliente('71990000008', 'Eva Nunes')); // 11 dígitos no Blip; 10 na planilha

async function rodar(cards, opcoes = {}) {
  const p = ctx.pagina = await abrirBm(ctx.navegador, { ...cenarioBase(), cards });
  await escolherPlanilha(p, 'e2e-base.xlsx');
  await configurar(p, opcoes);
  const dl = p.waitForEvent('download');
  await iniciarEConfirmar(p);
  return { p, saida: await salvarDownload(await dl) };
}

test('7/8a. célula já preenchida é preservada (e casou pelos últimos 8 dígitos): vai ao relatório', async () => {
  const { p, saida } = await rodar([eva()]);
  assert.equal(coluna(saida.abas, COL_H)[7], 'Lida'); // linha 9 (Eva) intacta
  assert.match(await relatorioTexto(p), /não sobrescritas[\s\S]*linha 9[\s\S]*"Lida"[\s\S]*"Entregue"/);
});

test('7/8b. com "sobrescrever" marcada, regrava a célula (prova o casamento 10 × 11 dígitos)', async () => {
  const { saida } = await rodar([eva()], { sobrescrever: true });
  assert.equal(coluna(saida.abas, COL_H)[7], 'Entregue');
});

test('11. matriz §6.10: linhas sem card em branco; sem telefone/nome → pulado sem diálogo; sem linha → nada', async () => {
  const cards = [
    criarCard('Ana Maria Souza', '12:36 PM', CAMPANHA_A, 'Lida', cliente('71900000001', 'Ana Maria Souza')),
    criarCard('Carlos Sem Linha', '12:00 PM', CAMPANHA_A, 'Enviada', cliente('71977777777', 'Carlos Sem Linha')), // telefone sem linha
    criarCard('😀', '11:00 AM', CAMPANHA_A, 'Lida', semTelefone(9, '😀')),                                         // sem telefone nem nome
    criarCard('Bruno Lima', '10:00 AM', CAMPANHA_A, 'Falha', cliente('71900000002', 'Bruno Lima')),
  ];
  const { p, saida } = await rodar(cards);
  const h = coluna(saida.abas, COL_H);
  assert.deepEqual(h, ['Lida', 'Falha', null, null, null, null, null, 'Lida']); // 4,5,6,7,8: sem card → em branco
  assert.ok(!h.includes('Respondido'));
  const rel = await relatorioTexto(p);
  assert.match(rel, /sem telefone\/nome: 1/);
  assert.match(rel, /sem linha na planilha: 1/);
  assert.doesNotMatch(rel, /Respondido|localizado|Carlos|71977777777/);
  assert.deepEqual(await selecoes(p), [0, 1, 2, 3]); // diálogo de decisão nunca apareceu (a execução seguiu sozinha)
});
