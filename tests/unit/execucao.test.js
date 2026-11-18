import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarExecucao } from '../../src/execucao.js';

// ------------------------------------------------------------------------------------------- portas falsas

/** Relógio simulado: `esperar` avança o tempo na hora; `limite` só dispara quando o teste chama `avancar`. */
function criarRelogio() {
  const r = { t: 0, esperas: [], limites: [] };
  r.agora = () => r.t;
  r.avancar = (ms) => {
    r.t += ms;
    for (const l of r.limites) if (!l.feito && r.t >= l.ate) { l.feito = true; l.resolver(); }
  };
  r.esperar = (ms) => { r.esperas.push(ms); r.avancar(ms); return Promise.resolve(); };
  r.limite = (ms) => new Promise((resolver) => r.limites.push({ ate: r.t + ms, resolver, feito: false }));
  return r;
}

const card = (titulo, extra = {}) => ({ titulo, campanha: 'acao_reclameaqui', horario: '12:36 PM', selo: 'Lida', ...extra });

/**
 * Blip falso: só as 5 portas do plano. O painel só mostra o cliente clicado depois de `atraso[titulo]` ms
 * (Infinity = nunca muda); antes disso continua mostrando o painel anterior (o "painel velho").
 */
function criarBlip({ cards, paineis = {}, atraso = {}, inicial = null, sumidos = [], falhaLer = null }, relogio) {
  const chamadas = { cliques: [], contatos: 0, leituras: 0 };
  let selecionado = null;
  let tClique = 0;
  let atual = inicial;
  return {
    chamadas,
    async fotografarFila() { return cards.map((c) => ({ ...c })); },
    async reencontrarCard(item) { return sumidos.includes(item.titulo) ? null : { titulo: item.titulo }; },
    async clicarCard(el) { chamadas.cliques.push(el.titulo); selecionado = el.titulo; tClique = relogio.agora(); },
    async abrirContato() { chamadas.contatos++; },
    async lerPainel() {
      chamadas.leituras++;
      if (falhaLer && chamadas.cliques.length >= falhaLer) throw new Error('painel quebrou');
      if (selecionado && relogio.agora() - tClique >= (atraso[selecionado] ?? 0)) atual = paineis[selecionado] ?? null;
      return atual ? { ...atual } : null;
    },
  };
}

function criarUi({ confirmar = true, decisoes = [] } = {}) {
  const ui = { confirmacoes: [], decisoesPedidas: [], parciais: [], finais: [], finalizados: [], progressos: [] };
  ui.confirmar = async (info) => { ui.confirmacoes.push(info); return confirmar; };
  ui.pedirDecisaoNome = (candidatos) => { ui.decisoesPedidas.push(candidatos); return Promise.resolve(decisoes.shift() ?? { acao: 'pular' }); };
  ui.progresso = (info) => { ui.progressos.push(info); };
  ui.baixarParcial = (bytes, nome) => { ui.parciais.push({ bytes, nome }); };
  ui.baixarFinal = (bytes, nome) => { ui.finais.push({ bytes, nome }); };
  ui.finalizado = (info) => { ui.finalizados.push(info); };
  return ui;
}

function criarPlanilha() {
  const l = (linha, nome, tel, retorno) => ({ linha, celulas: { B: nome, ...(tel && { E: tel }), ...(retorno && { H: retorno }) } });
  const p = {
    linhas: [l(2, 'Ana Maria Souza', '71900000001'), l(3, 'Bruno Lima', '71900000002'), l(4, 'Carla Dias', '71900000003'),
      l(5, 'Daniel Rocha', '71900000005'), l(7, 'Eva Nunes', ''), l(8, 'Fabio Lima', '71900000008')],
    colNome: 'B', colTelefones: 'E', colDestino: 'H', nomeSaida: 'teste_retorno.xlsx', gravacoes: [],
  };
  p.gravar = async (g) => { p.gravacoes.push(new Map(g)); return new Uint8Array([1, 2, 3]); };
  return p;
}

const painel = (nome, telefone, id) => ({ nome, telefone, id });
const ultima = (p) => p.gravacoes.at(-1);
const tick = () => new Promise((r) => setImmediate(r));
async function ate(cond) { for (let i = 0; i < 200 && !cond(); i++) await tick(); assert.ok(cond(), 'condição não atingida'); }

function montar({ cards, paineis, atraso, inicial, sumidos, falhaLer, ui: uiOpc, opcoes = {} }) {
  const relogio = criarRelogio();
  const blip = criarBlip({ cards, paineis, atraso, inicial, sumidos, falhaLer }, relogio);
  const ui = criarUi(uiOpc);
  const planilha = criarPlanilha();
  const exec = criarExecucao({ blip, relogio, ui, planilha, opcoes });
  return { relogio, blip, ui, planilha, exec };
}

// -------------------------------------------------------------------------------------------------- testes

test('caminho feliz: casa por telefone, grava o selo, baixa na hora e finaliza', async () => {
  const t = montar({
    cards: [card('Ana', { selo: 'Lida' }), card('Bruno', { selo: 'Falha' })],
    paineis: { Ana: painel('Ana', '71900000001', '5571900000001@wa.gw.msging.net'), Bruno: painel('Bruno', '71900000002', '5571900000002@wa.gw.msging.net') },
  });
  const r = await t.exec.iniciar();
  assert.equal(r.estado, 'concluido');
  assert.deepEqual([...ultima(t.planilha)], [[2, 'Lida'], [3, 'Falha']]);
  assert.equal(t.ui.finais.length, 1);
  assert.equal(t.ui.parciais.length, 0);
  assert.equal(t.ui.finais[0].nome, 'teste_retorno.xlsx');
  assert.equal(t.ui.finalizados[0].estado, 'concluido');
  assert.deepEqual(t.blip.chamadas.cliques, ['Ana', 'Bruno']);
  assert.equal(t.blip.chamadas.contatos, 2); // sempre abre a aba Contato
});

test('confirmar() devolve false: zero cliques, nada gravado', async () => {
  const t = montar({ cards: [card('Ana')], paineis: { Ana: painel('Ana', '71900000001', 'a') }, ui: { confirmar: false } });
  const r = await t.exec.iniciar();
  assert.equal(r.estado, 'cancelado');
  assert.equal(t.blip.chamadas.cliques.length, 0);
  assert.equal(t.planilha.gravacoes.length, 0);
  assert.equal(t.ui.finais.length + t.ui.parciais.length, 0);
});

test('painel velho: só muda após 2 s ⇒ lê o novo, não o velho (1º cliente com outro já selecionado)', async () => {
  const t = montar({
    cards: [card('Ana Maria Souza')],
    inicial: painel('Daniel Rocha', '71900000005', '5571900000005@wa.gw.msging.net'), // outro cliente já selecionado
    paineis: { 'Ana Maria Souza': painel('Ana Maria Souza', '71900000001', '5571900000001@wa.gw.msging.net') },
    atraso: { 'Ana Maria Souza': 2000 },
  });
  await t.exec.iniciar();
  assert.deepEqual([...ultima(t.planilha)], [[2, 'Lida']]); // linha de Ana; nunca a de Daniel (5)
  assert.ok(t.relogio.t >= 2000 && t.relogio.t < 6000);
});

test('painel nunca muda: espera 6 s, não usa o painel velho e tenta pelo nome do card', async () => {
  const t = montar({
    cards: [card('Eva Nunes')],
    inicial: painel('Ana Maria Souza', '71900000001', '5571900000001@wa.gw.msging.net'),
    paineis: { 'Eva Nunes': painel('Eva Nunes', '', 'x@tunnel.msging.net') },
    atraso: { 'Eva Nunes': Infinity },
  });
  await t.exec.iniciar();
  assert.ok(t.relogio.t >= 6000);
  assert.deepEqual([...ultima(t.planilha)], [[7, 'Lida']]); // por nome (Eva Nunes), NÃO pelo telefone velho da Ana (linha 2)
});

test('título repetido: espera o tempo cheio e marca possível painel repetido', async () => {
  const igual = painel('Daniel Rocha', '71900000005', '5571900000005@wa.gw.msging.net');
  const t = montar({
    cards: [card('Daniel Rocha', { horario: '12:36 PM' }), card('Daniel Rocha', { horario: '2 days', selo: 'Enviada' })],
    paineis: { 'Daniel Rocha': igual },
  });
  await t.exec.iniciar();
  const rel = t.ui.finalizados[0].relatorio;
  assert.equal(rel.painelRepetido.length, 1);
  assert.ok(t.relogio.t >= 6000);
  assert.equal(rel.duplicados.length, 1); // mesma linha 5 duas vezes: vale a de cima
  assert.deepEqual([...ultima(t.planilha)], [[5, 'Lida']]);
});

test('pausa de 400 ms entre clientes (e não depois do último)', async () => {
  const t = montar({
    cards: [card('Ana'), card('Bruno'), card('Carla')],
    paineis: { Ana: painel('Ana', '71900000001', 'a@wa.gw.msging.net'), Bruno: painel('Bruno', '71900000002', 'b@wa.gw.msging.net'), Carla: painel('Carla', '71900000003', 'c@wa.gw.msging.net') },
  });
  await t.exec.iniciar();
  assert.deepEqual(t.relogio.esperas.filter((e) => e === 400), [400, 400]);
  assert.equal(t.relogio.t, 800);
});

test('N=2 com campanhas misturadas: só os 2 do topo DEPOIS do filtro; nada fora dos N', async () => {
  const outra = { campanha: 'camapanha_ativo_ra' };
  const t = montar({
    cards: [card('Ana'), card('Bruno', outra), card('Carla'), card('Daniel Rocha', outra), card('Eva Nunes')],
    paineis: {
      Ana: painel('Ana', '71900000001', 'a@wa.gw.msging.net'), Carla: painel('Carla', '71900000003', 'c@wa.gw.msging.net'),
      'Eva Nunes': painel('Eva Nunes', '', 'e@tunnel.msging.net'),
    },
    opcoes: { campanha: 'acao_reclameaqui', n: 2 },
  });
  await t.exec.iniciar();
  assert.deepEqual(t.blip.chamadas.cliques, ['Ana', 'Carla']);
  assert.deepEqual([...ultima(t.planilha).keys()], [2, 4]);
  assert.equal(t.ui.confirmacoes[0].cards, 2);
  assert.equal(t.ui.finalizados[0].relatorio.pulados.campanha, 2);
});

test('campanha vazia = todas as campanhas', async () => {
  const t = montar({
    cards: [card('Ana'), card('Bruno', { campanha: 'outra' })],
    paineis: { Ana: painel('Ana', '71900000001', 'a@wa.gw.msging.net'), Bruno: painel('Bruno', '71900000002', 'b@wa.gw.msging.net') },
    opcoes: { campanha: '' },
  });
  await t.exec.iniciar();
  assert.deepEqual(t.blip.chamadas.cliques, ['Ana', 'Bruno']);
});

test('card some entre a foto e o clique: pula, anota e segue', async () => {
  const t = montar({
    cards: [card('Ana'), card('Bruno')], sumidos: ['Ana'],
    paineis: { Bruno: painel('Bruno', '71900000002', 'b@wa.gw.msging.net') },
  });
  const r = await t.exec.iniciar();
  assert.equal(r.estado, 'concluido');
  assert.deepEqual(t.blip.chamadas.cliques, ['Bruno']);
  assert.equal(t.ui.finalizados[0].relatorio.pulados.sumiu, 1);
  assert.deepEqual([...ultima(t.planilha)], [[3, 'Lida']]);
});

test('card sem telefone e sem nome utilizável: NÃO pausa, não grava, segue', async () => {
  const t = montar({
    cards: [card('😀'), card('Ana')],
    paineis: { '😀': painel('', '', 'x@tunnel.msging.net'), Ana: painel('Ana', '71900000001', 'a@wa.gw.msging.net') },
  });
  await t.exec.iniciar();
  assert.equal(t.ui.decisoesPedidas.length, 0);
  assert.deepEqual([...ultima(t.planilha)], [[2, 'Lida']]);
  assert.equal(t.ui.finalizados[0].relatorio.pulados.semTelefoneNome, 1);
});

test('ambíguo: pedirDecisaoNome 1×; escolher grava a linha escolhida', async () => {
  const t = montar({
    cards: [card('Lima')], paineis: { Lima: painel('Lima', '', 'x@tunnel.msging.net') },
    ui: { decisoes: [{ acao: 'escolher', linha: 8 }] },
  });
  await t.exec.iniciar();
  assert.equal(t.ui.decisoesPedidas.length, 1);
  assert.deepEqual(t.ui.decisoesPedidas[0].map((c) => c.linha), [3, 8]);
  assert.deepEqual([...ultima(t.planilha)], [[8, 'Lida']]);
});

test('ambíguo: pular não grava e segue', async () => {
  const t = montar({
    cards: [card('Lima'), card('Ana')],
    paineis: { Lima: painel('Lima', '', 'x@tunnel.msging.net'), Ana: painel('Ana', '71900000001', 'a@wa.gw.msging.net') },
    ui: { decisoes: [{ acao: 'pular' }] },
  });
  const r = await t.exec.iniciar();
  assert.equal(r.estado, 'concluido');
  assert.deepEqual([...ultima(t.planilha)], [[2, 'Lida']]);
  assert.equal(t.ui.finalizados[0].relatorio.pulados.decisaoBm, 1);
});

test('ambíguo: parar tudo ⇒ baixa a parcial, linhas não visitadas em branco', async () => {
  const t = montar({
    cards: [card('Ana'), card('Lima'), card('Carla')],
    paineis: { Ana: painel('Ana', '71900000001', 'a@wa.gw.msging.net'), Lima: painel('Lima', '', 'x@tunnel.msging.net'), Carla: painel('Carla', '71900000003', 'c@wa.gw.msging.net') },
    ui: { decisoes: [{ acao: 'parar' }] },
  });
  const r = await t.exec.iniciar();
  assert.equal(r.estado, 'parado');
  assert.equal(t.ui.parciais.length, 1);
  assert.equal(t.ui.finais.length, 0);
  assert.deepEqual([...ultima(t.planilha)], [[2, 'Lida']]);
  assert.deepEqual(t.blip.chamadas.cliques, ['Ana', 'Lima']); // Carla nunca foi clicada
});

test('pausa longa: decisão sem resposta — 119 s nada, 120 s baixa a parcial 1× e continua pausada', async () => {
  const relogio = criarRelogio();
  const blip = criarBlip({ cards: [card('Ana'), card('Lima')], paineis: { Ana: painel('Ana', '71900000001', 'a@wa.gw.msging.net'), Lima: painel('Lima', '', 'x@tunnel.msging.net') } }, relogio);
  const ui = criarUi();
  let responder;
  ui.pedirDecisaoNome = (c) => { ui.decisoesPedidas.push(c); return new Promise((r) => { responder = r; }); };
  const planilha = criarPlanilha();
  const exec = criarExecucao({ blip, relogio, ui, planilha });
  const fim = exec.iniciar();
  await ate(() => ui.decisoesPedidas.length === 1);
  relogio.avancar(119_000); await tick(); await tick();
  assert.equal(ui.parciais.length, 0);
  relogio.avancar(1_000); await ate(() => ui.parciais.length === 1);
  assert.deepEqual([...ultima(planilha)], [[2, 'Lida']]);
  relogio.avancar(60_000); await tick();
  assert.equal(ui.parciais.length, 1);              // não repete
  assert.equal(ui.finalizados.length, 0);           // continua pausada
  responder({ acao: 'pular' });
  const r = await fim;
  assert.equal(r.estado, 'concluido');
});

test('exceção em lerPainel ⇒ parada + parcial + motivo; o resto em branco', async () => {
  const t = montar({
    cards: [card('Ana'), card('Bruno'), card('Carla')],
    paineis: { Ana: painel('Ana', '71900000001', 'a@wa.gw.msging.net'), Bruno: painel('Bruno', '71900000002', 'b@wa.gw.msging.net') },
    falhaLer: 2,
  });
  const r = await t.exec.iniciar();
  assert.equal(r.estado, 'erro');
  assert.match(r.motivo, /painel quebrou/);
  assert.equal(t.ui.parciais.length, 1);
  assert.deepEqual([...ultima(t.planilha)], [[2, 'Lida']]);
  assert.deepEqual(t.blip.chamadas.cliques, ['Ana', 'Bruno']);
  assert.match(t.ui.finalizados[0].motivo, /painel quebrou/);
});

test('parar() durante a execução: encerra, baixa parcial, não clica nos demais', async () => {
  const t = montar({
    cards: [card('Ana'), card('Bruno'), card('Carla')],
    paineis: { Ana: painel('Ana', '71900000001', 'a@wa.gw.msging.net'), Bruno: painel('Bruno', '71900000002', 'b@wa.gw.msging.net'), Carla: painel('Carla', '71900000003', 'c@wa.gw.msging.net') },
  });
  t.ui.progresso = (info) => { if (info.atual === 2) t.exec.parar(); };
  const r = await t.exec.iniciar();
  assert.equal(r.estado, 'parado');
  assert.equal(t.ui.parciais.length, 1);
  assert.ok(!t.blip.chamadas.cliques.includes('Carla'));
  assert.ok(ultima(t.planilha).has(2));
});

test('baixarParcial() a qualquer momento: só o já resolvido', async () => {
  const t = montar({
    cards: [card('Ana'), card('Lima')],
    paineis: { Ana: painel('Ana', '71900000001', 'a@wa.gw.msging.net'), Lima: painel('Lima', '', 'x@tunnel.msging.net') },
  });
  let manual;
  t.ui.pedirDecisaoNome = (c) => { t.ui.decisoesPedidas.push(c); return new Promise((r) => { manual = r; }); };
  const fim = t.exec.iniciar();
  await ate(() => t.ui.decisoesPedidas.length === 1);
  await t.exec.baixarParcial();
  assert.equal(t.ui.parciais.length, 1);
  assert.deepEqual([...ultima(t.planilha)], [[2, 'Lida']]);
  manual({ acao: 'pular' });
  await fim;
});

test('dupla chamada de iniciar(): a segunda é rejeitada e não duplica cliques', async () => {
  const t = montar({ cards: [card('Ana')], paineis: { Ana: painel('Ana', '71900000001', 'a@wa.gw.msging.net') } });
  const a = t.exec.iniciar();
  await assert.rejects(t.exec.iniciar(), /já/i);
  await a;
  assert.deepEqual(t.blip.chamadas.cliques, ['Ana']);
});

test('a porta blip tem só 5 operações — nada de Enviar/Atualizar ao alcance do orquestrador', async () => {
  const t = montar({ cards: [card('Ana')], paineis: { Ana: painel('Ana', '71900000001', 'a@wa.gw.msging.net') } });
  assert.deepEqual(Object.keys(t.blip).filter((k) => k !== 'chamadas').sort(),
    ['abrirContato', 'clicarCard', 'fotografarFila', 'lerPainel', 'reencontrarCard']);
});
