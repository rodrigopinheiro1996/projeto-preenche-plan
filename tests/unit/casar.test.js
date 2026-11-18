import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarIndice, resolverCliente, aplicarEscolha, consolidar } from '../../src/casar.js';

/** Planilha fictícia (formato de abrirXlsx): B = Nome, E = Telefones, H = Retorno. */
function linhasFicticias() {
  const l = (linha, nome, tel, retorno) => ({
    linha,
    celulas: { B: nome, ...(tel !== undefined && { E: tel }), ...(retorno && { H: retorno }) },
  });
  return [
    l(2, 'Ana Maria Souza', '71900000001'),
    l(3, 'Bruno Lima', '71900000002 / 71900000009'), // 2 números na mesma célula
    l(4, 'Carla Dias', '7190000004'),                 // 10 dígitos na planilha
    l(5, 'Daniel Rocha', '71900000005'),
    l(6, 'Ana Souza', '71900000006'),
    l(7, 'Eva Nunes', undefined, 'Lida'),             // sem telefone; Retorno já preenchido
    l(8, 'Fabio Lima', '71900000008'),
    l(9, 'Gil Repetido', '71900000010'),
    l(10, 'Hugo Repetido', '71900000010'),            // mesmo telefone da linha 9
  ];
}
const COLS = { colNome: 'B', colTelefones: 'E' };
const indice = () => criarIndice(linhasFicticias(), COLS);
const leitura = (o = {}) => ({ titulo: '', nomePainel: '', telefonePainel: '', idPainel: '', ...o });
const resolver = (o) => resolverCliente(indice(), leitura(o));
const card = (titulo, selo, extra = {}) => ({ titulo, campanha: 'acao_reclameaqui', horario: '12:36 PM', selo, ...extra });
const casou = (linha, por = 'telefone') => ({ tipo: 'casou', linha, por, avisos: [] });

// ------------------------------------------------------------------------------------------ resolverCliente

test('telefone do painel casa a linha', () => {
  const r = resolver({ titulo: 'Ana', nomePainel: 'Ana Maria Souza', telefonePainel: '+55 (71) 90000-0001' });
  assert.equal(r.tipo, 'casou'); assert.equal(r.linha, 2); assert.equal(r.por, 'telefone');
});

test('painel só com Id @wa.gw.msging.net casa pelo Id', () => {
  const r = resolver({ idPainel: '5571900000005@wa.gw.msging.net' });
  assert.equal(r.tipo, 'casou'); assert.equal(r.linha, 5); assert.equal(r.por, 'telefone');
});

test('Id @tunnel sem telefone: nome completo igual com 1 linha → por nome', () => {
  const r = resolver({ idPainel: 'abc-uuid@tunnel.msging.net', nomePainel: 'Eva Nunes', titulo: 'Eva Nunes' });
  assert.equal(r.tipo, 'casou'); assert.equal(r.linha, 7); assert.equal(r.por, 'nome');
});

test('título parece telefone e painel vazio → casa pelo título', () => {
  const r = resolver({ titulo: '+55 (71) 90000-0001' });
  assert.equal(r.tipo, 'casou'); assert.equal(r.linha, 2); assert.equal(r.por, 'telefone');
});

test('Telefone do painel ≠ telefone do Id → vale o painel + aviso', () => {
  const r = resolver({ telefonePainel: '71900000001', idPainel: '5571900000005@wa.gw.msging.net' });
  assert.equal(r.linha, 2);
  assert.ok(r.avisos.includes('divergencia-telefone-id'));
});

test('telefone lido sem linha: NÃO cai no nome (mesmo com nome igual a uma linha)', () => {
  const r = resolver({ telefonePainel: '71911111111', nomePainel: 'Eva Nunes', titulo: 'Eva Nunes' });
  assert.equal(r.tipo, 'nao_identificado');
  assert.equal(r.motivo, 'sem-linha');
});

test('mesmo telefone em 2 linhas da planilha → telefone-repetido-na-planilha, sem pausa', () => {
  const r = resolver({ telefonePainel: '71900000010' });
  assert.equal(r.tipo, 'telefone-repetido-na-planilha');
  assert.deepEqual(r.linhas, [9, 10]);
});

test('10 dígitos na planilha × 11 no Blip (DDD + últimos 8) casa', () => {
  const r = resolver({ telefonePainel: '71990000004' });
  assert.equal(r.tipo, 'casou'); assert.equal(r.linha, 4);
});

test('célula com 2 números: o 2º igual ao do Blip casa', () => {
  const r = resolver({ telefonePainel: '71900000009' });
  assert.equal(r.tipo, 'casou'); assert.equal(r.linha, 3);
});

test('nome parcial com 1 candidato → casou por nome-parcial', () => {
  const r = resolver({ nomePainel: 'Daniel' });
  assert.equal(r.tipo, 'casou'); assert.equal(r.linha, 5); assert.equal(r.por, 'nome-parcial');
});

test('nome parcial com 2 candidatos → ambíguo com {linha,nome,telefones}', () => {
  const r = resolver({ nomePainel: 'Lima' });
  assert.equal(r.tipo, 'ambiguo');
  assert.deepEqual(r.candidatos, [
    { linha: 3, nome: 'Bruno Lima', telefones: ['71900000002', '71900000009'] },
    { linha: 8, nome: 'Fabio Lima', telefones: ['71900000008'] },
  ]);
});

test('nome completo igual em 2 linhas → ambíguo', () => {
  const lin = [...linhasFicticias(), { linha: 11, celulas: { B: 'Ana Souza', E: '71900000011' } }];
  const r = resolverCliente(criarIndice(lin, COLS), leitura({ nomePainel: 'Ana Souza' }));
  assert.equal(r.tipo, 'ambiguo'); assert.deepEqual(r.candidatos.map((c) => c.linha), [6, 11]);
});

test('"Ana (Aninha) Souza" só casa na 2ª tentativa, sem parênteses', () => {
  const r = resolver({ nomePainel: 'Ana (Aninha) Souza' });
  assert.equal(r.tipo, 'casou'); assert.equal(r.linha, 6); assert.equal(r.por, 'nome');
});

test('nome sem nenhuma linha → nao_identificado (sem-linha)', () => {
  const r = resolver({ nomePainel: 'Zeca Inexistente' });
  assert.equal(r.tipo, 'nao_identificado'); assert.equal(r.motivo, 'sem-linha');
});

test('título só emoji, sem telefone → nao_identificado (sem-dados), sem pausa', () => {
  const r = resolver({ titulo: '😀😀' });
  assert.equal(r.tipo, 'nao_identificado'); assert.equal(r.motivo, 'sem-dados');
});

test('nome do painel vazio usa o título; nome do painel inutilizável também recorre ao título', () => {
  assert.equal(resolver({ titulo: 'Eva Nunes' }).linha, 7);
  assert.equal(resolver({ nomePainel: '😀', titulo: 'Eva Nunes' }).linha, 7);
});

test('telefone casou a linha X e o nome do Blip é igual ao de OUTRA linha → vale X + aviso', () => {
  const r = resolver({ telefonePainel: '71900000001', nomePainel: 'Bruno Lima' });
  assert.equal(r.linha, 2);
  assert.ok(r.avisos.includes('divergencia-telefone-nome'));
});

test('telefone casou e nome é apelido sem linha → sem aviso', () => {
  const r = resolver({ telefonePainel: '71900000001', nomePainel: 'Aninha 💖' });
  assert.deepEqual(r.avisos, []);
});

// -------------------------------------------------------------------------------------------- aplicarEscolha

test('aplicarEscolha escolher → casou por escolha-bm; linha fora dos candidatos → erro', () => {
  const amb = resolver({ nomePainel: 'Lima' });
  const r = aplicarEscolha(amb, { acao: 'escolher', linha: 8 });
  assert.deepEqual([r.tipo, r.linha, r.por], ['casou', 8, 'escolha-bm']);
  assert.throws(() => aplicarEscolha(amb, { acao: 'escolher', linha: 5 }), /candidat/i);
});

test('aplicarEscolha pular → pulado, nada gravado, anotado no relatório', () => {
  const amb = resolver({ nomePainel: 'Lima' });
  const r = aplicarEscolha(amb, { acao: 'pular' });
  assert.equal(r.tipo, 'pulado');
  const { gravacoes, relatorio } = consolidar({
    fotoCards: [card('Lima', 'Lida')], resolucoes: [{ card: 0, resultado: r }], linhas: linhasFicticias(), opcoes: {},
  });
  assert.equal(gravacoes.size, 0);
  assert.equal(relatorio.pulados.decisaoBm, 1);
});

// ------------------------------------------------------------------------------------------------ consolidar

const consolidarCom = (fotoCards, resolucoes, opcoes = {}) =>
  consolidar({ fotoCards, resolucoes, linhas: linhasFicticias(), opcoes: { colDestino: 'H', ...opcoes } });

test('linha casada recebe o selo exato do card; Falha grava Falha', () => {
  const { gravacoes, relatorio } = consolidarCom(
    [card('A', 'Lida'), card('B', 'Falha')],
    [{ card: 0, resultado: casou(2) }, { card: 1, resultado: casou(5) }]);
  assert.deepEqual([...gravacoes], [[2, 'Lida'], [5, 'Falha']]);
  assert.deepEqual(relatorio.gravadas.porSelo, { Lida: 1, Falha: 1 });
  assert.equal(relatorio.gravadas.total, 2);
});

test('2 cards da mesma linha: vale o de cima (mais recente); o outro vai ao relatório', () => {
  const { gravacoes, relatorio } = consolidarCom(
    [card('A', 'Lida'), card('A', 'Enviada', { horario: '2 days' })],
    [{ card: 0, resultado: casou(2) }, { card: 1, resultado: casou(2) }]);
  assert.deepEqual([...gravacoes], [[2, 'Lida']]);
  assert.equal(relatorio.duplicados.length, 1);
  assert.equal(relatorio.duplicados[0].linha, 2);
});

test('duplicado: vale o de cima mesmo se as resoluções chegarem fora de ordem', () => {
  const { gravacoes } = consolidarCom(
    [card('A', 'Lida'), card('A', 'Enviada')],
    [{ card: 1, resultado: casou(2) }, { card: 0, resultado: casou(2) }]);
  assert.equal(gravacoes.get(2), 'Lida');
});

test('célula preenchida: sem sobrescrever não grava (relatório); com sobrescrever grava', () => {
  const rs = [{ card: 0, resultado: casou(7, 'nome') }];
  const fc = [card('Eva Nunes', 'Entregue')];
  const a = consolidarCom(fc, rs);
  assert.equal(a.gravacoes.size, 0);
  assert.equal(a.relatorio.naoSobrescritas.length, 1);
  assert.equal(a.relatorio.naoSobrescritas[0].linha, 7);
  const b = consolidarCom(fc, rs, { sobrescrever: true });
  assert.equal(b.gravacoes.get(7), 'Entregue');
  assert.equal(b.relatorio.naoSobrescritas.length, 0);
});

test('run completo: linhas sem card ficam em branco (nada gravado nelas)', () => {
  const { gravacoes, relatorio } = consolidarCom([card('A', 'Lida')], [{ card: 0, resultado: casou(2) }]);
  assert.deepEqual([...gravacoes.keys()], [2]);
  // 9 linhas, 1 gravada, a linha 7 já tinha 'Lida' (não está em branco) → 7 em branco
  assert.equal(relatorio.emBranco, 7);
  assert.ok(![...gravacoes.values()].includes('Respondido'));
});

test('card sem telefone e sem nome utilizável: pulado, só contagem, nada gravado', () => {
  const r = resolver({ titulo: '😀' });
  const { gravacoes, relatorio } = consolidarCom([card('😀', 'Lida')], [{ card: 0, resultado: r }]);
  assert.equal(gravacoes.size, 0);
  assert.equal(relatorio.pulados.semTelefoneNome, 1);
});

test('card com telefone/nome mas sem linha: só contagem, sem seção própria (sem dados do cliente)', () => {
  const r = resolver({ telefonePainel: '71911111111', nomePainel: 'Zé Fulano' });
  const { gravacoes, relatorio } = consolidarCom([card('Zé Fulano', 'Lida')], [{ card: 0, resultado: r }]);
  assert.equal(gravacoes.size, 0);
  assert.equal(relatorio.pulados.semLinha, 1);
  assert.ok(!JSON.stringify(relatorio).includes('Fulano'));
  assert.ok(!JSON.stringify(relatorio).includes('71911111111'));
  assert.ok(!('naoLocalizados' in relatorio));
});

test('telefone repetido na planilha: nada gravado, vai ao relatório', () => {
  const r = resolver({ telefonePainel: '71900000010' });
  const { gravacoes, relatorio } = consolidarCom([card('X', 'Lida')], [{ card: 0, resultado: r }]);
  assert.equal(gravacoes.size, 0);
  assert.deepEqual(relatorio.telefonesRepetidos.map((t) => t.linhas), [[9, 10]]);
});

test('run interrompido: grava só os cards resolvidos; o resto fica em branco e é contado', () => {
  const fc = [card('A', 'Lida'), card('B', 'Enviada'), card('C', 'Falha'), card('D', 'Lida')];
  const { gravacoes, relatorio } = consolidarCom(fc, [{ card: 0, resultado: casou(2) }, { card: 1, resultado: casou(5) }]);
  assert.deepEqual([...gravacoes.keys()], [2, 5]);
  assert.equal(relatorio.naoVerificados, 2);
});

test('selo desconhecido (Pendente) grava como está e é listado', () => {
  const { gravacoes, relatorio } = consolidarCom([card('A', 'Pendente')], [{ card: 0, resultado: casou(2) }]);
  assert.equal(gravacoes.get(2), 'Pendente');
  assert.deepEqual(relatorio.selosDesconhecidos, [{ selo: 'Pendente', linha: 2 }]);
});

test('relatório: nome parcial, divergências, painel repetido, sumiu, campanha', () => {
  const fc = [card('Daniel', 'Lida'), card('Ana', 'Enviada'), card('Sumido', 'Lida')];
  const rs = [
    { card: 0, resultado: resolver({ nomePainel: 'Daniel' }) },
    { card: 1, resultado: resolver({ telefonePainel: '71900000001', idPainel: '5571900000005@wa.gw.msging.net' }), painelRepetido: true },
    { card: 2, sumiu: true },
  ];
  const { gravacoes, relatorio } = consolidarCom(fc, rs, { ignoradosCampanha: 4 });
  assert.deepEqual([...gravacoes], [[5, 'Lida'], [2, 'Enviada']]);
  assert.deepEqual(relatorio.nomeParcial.map((x) => x.linha), [5]);
  assert.deepEqual(relatorio.divergencias.map((x) => [x.tipo, x.linha]), [['telefone-id', 2]]);
  assert.equal(relatorio.painelRepetido.length, 1);
  assert.equal(relatorio.pulados.sumiu, 1);
  assert.equal(relatorio.pulados.campanha, 4);
});
