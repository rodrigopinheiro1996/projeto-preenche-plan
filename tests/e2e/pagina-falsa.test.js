import { test, before, after, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { chromium } from '../helpers/playwright.js';
import { empacotar } from '../helpers/bundle.js';
import {
  cenarioBase, cenarioSessenta, comAtraso, comPainelNuncaAtualiza, comPaginacao, comPainelInicial, CLIENTE_TERCEIRO,
} from '../fixtures/cenarios.js';

const PAGINA = pathToFileURL(new URL('../fixtures/blip-falso.html', import.meta.url).pathname).href;
let navegador;
let blipJs;
let pagina;

before(async () => {
  navegador = await chromium.launch();
  blipJs = await empacotar(new URL('../../src/blip.js', import.meta.url).pathname, '__Blip');
});
after(async () => { await navegador.close(); });
beforeEach(() => { pagina = null; });
afterEach(async () => {
  if (!pagina) return;
  assert.equal(await pagina.evaluate(() => window.__cliquesProibidos), 0, 'um botão proibido foi clicado');
  await pagina.close();
});

async function abrir(cenario) {
  pagina = await navegador.newPage();
  await pagina.addInitScript((c) => { window.__cenario = c; }, cenario);
  await pagina.goto(PAGINA);
  await pagina.addScriptTag({ content: blipJs });
  await pagina.evaluate(() => { window.__blip = window.__Blip.criarBlip(); });
  return pagina;
}
const foto = (p) => p.evaluate(() => window.__blip.fotografarFila());
const selecionar = (p, i) => p.evaluate(async (i) => {
  const cards = await window.__blip.fotografarFila();
  const el = await window.__blip.reencontrarCard(cards[i]);
  await window.__blip.clicarCard(el);
  await window.__blip.abrirContato();
}, i);
const painel = (p) => p.evaluate(() => window.__blip.lerPainel());
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

test('fotografa 60 cards na ordem (mais recente no topo) com título, horário, campanha e selo', async () => {
  const p = await abrir(cenarioSessenta());
  const cards = await foto(p);
  assert.equal(cards.length, 60);
  assert.deepEqual(Object.keys(cards[0]).sort(), ['campanha', 'horario', 'indice', 'ocorrencia', 'selo', 'titulo']);
  assert.equal(cards[0].titulo, 'Cliente Teste 0');
  assert.equal(cards[59].titulo, 'Cliente Teste 59');
  assert.ok(['Lida', 'Falha', 'Enviada', 'Entregue'].includes(cards[0].selo));
});

test('títulos esquisitos: telefone, emoji, Fraktur (espaço no fim some), apelido', async () => {
  const p = await abrir(cenarioBase());
  const t = (await foto(p)).map((c) => c.titulo);
  assert.ok(t.includes('+55 (71) 90000-0002'));
  assert.ok(t.includes('😀'));
  assert.ok(t.includes('ℜ𝔬𝔰𝔢𝔞𝔫𝔢'));
  assert.ok(t.includes('Ana (Aninha) Souza'));
});

test('lista paginada (carrega mais ao rolar): espera a contagem estabilizar e pega todos', async () => {
  const p = await abrir(comPaginacao(cenarioSessenta(), { inicial: 15, passo: 15 }));
  assert.equal((await foto(p)).length, 60);
});

test('selos vêm do chip: Lida/Falha/Enviada/Entregue', async () => {
  const p = await abrir(cenarioBase());
  const selos = new Set((await foto(p)).map((c) => c.selo));
  for (const s of ['Lida', 'Falha', 'Enviada', 'Entregue']) assert.ok(selos.has(s), s);
});

test('painel Informações só aparece depois de abrir Contato; lê Id, Nome e Telefone (ignora Copiar)', async () => {
  const p = await abrir(cenarioBase());
  await p.evaluate(async () => {
    const [primeiro] = await window.__blip.fotografarFila();
    await window.__blip.clicarCard(await window.__blip.reencontrarCard(primeiro));
  });
  await dormir(150);
  assert.equal(await painel(p), null); // voltou para a aba Envios ao selecionar um cliente
  await p.evaluate(() => window.__blip.abrirContato());
  assert.deepEqual(await painel(p), { id: '5571900000001@wa.gw.msging.net', nome: 'Ana Maria Souza', telefone: '+55 (71) 90000-0001' });
});

test('Id tunnel: painel sem telefone', async () => {
  const p = await abrir(cenarioBase());
  await selecionar(p, 2); // card do emoji
  await dormir(150);
  const r = await painel(p);
  assert.match(r.id, /@tunnel\.msging\.net$/);
  assert.equal(r.telefone, '');
});

test('troca de cliente com atraso: logo após o clique ainda é o painel velho; depois o novo', async () => {
  const p = await abrir(comAtraso(comPainelInicial(cenarioBase(), CLIENTE_TERCEIRO), 700));
  await selecionar(p, 0);
  const velho = await painel(p);
  assert.equal(velho.id, CLIENTE_TERCEIRO.id); // painel do cliente que já estava selecionado
  await dormir(900);
  assert.equal((await painel(p)).nome, 'Ana Maria Souza');
});

test('modo "painel nunca atualiza": continua no painel velho', async () => {
  const p = await abrir(comPainelNuncaAtualiza(comPainelInicial(cenarioBase(), CLIENTE_TERCEIRO)));
  await selecionar(p, 0);
  await dormir(500);
  assert.equal((await painel(p)).id, CLIENTE_TERCEIRO.id);
});

test('reencontrarCard: acha pela tupla; duplicado usa a n-ésima ocorrência; mudou/sumiu → null', async () => {
  const base = cenarioBase();
  base.cards.push({ ...base.cards[0] }); // 2º card com título+campanha+horário IGUAIS ao do topo
  const p = await abrir(base);
  const r = await p.evaluate(async () => {
    const cards = await window.__blip.fotografarFila();
    const dup = cards.filter((c) => c.titulo === 'Ana Maria Souza' && c.horario === '12:36 PM');
    const els = [];
    for (const d of dup) els.push(await window.__blip.reencontrarCard(d));
    const sumido = await window.__blip.reencontrarCard({ ...cards[0], horario: '99 hours' });
    return { dups: dup.map((d) => d.ocorrencia), distintos: els[0] !== els[1] && els.every(Boolean), sumido };
  });
  assert.deepEqual(r.dups, [0, 1]);
  assert.equal(r.distintos, true);
  assert.equal(r.sumido, null);
});

test('só cliques em card e aba Contato: nenhum botão proibido é tocado num ciclo completo', async () => {
  const p = await abrir(cenarioBase());
  for (let i = 0; i < 4; i++) { await selecionar(p, i); await dormir(100); await painel(p); }
  assert.deepEqual(await p.evaluate(() => window.__selecoes), [0, 1, 2, 3]); // afterEach exige __cliquesProibidos === 0
});

test('página sem os seletores: erro explícito pedindo o outerHTML', async () => {
  pagina = await navegador.newPage();
  await pagina.setContent('<div>nada aqui</div>');
  await pagina.addScriptTag({ content: blipJs });
  await pagina.evaluate(() => { window.__cliquesProibidos = 0; });
  const msg = await pagina.evaluate(() => window.__Blip.criarBlip().fotografarFila().then(() => 'sem erro', (e) => e.message));
  assert.match(msg, /outerHTML/);
  const msg2 = await pagina.evaluate(() => window.__Blip.criarBlip().abrirContato().then(() => 'sem erro', (e) => e.message));
  assert.match(msg2, /outerHTML/);
});
