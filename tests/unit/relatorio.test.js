import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatarRelatorio } from '../../src/relatorio.js';
import { consolidar, ROTULO_PAINEL_REPETIDO } from '../../src/casar.js';

const vazio = () => consolidar({ fotoCards: [], resolucoes: [], linhas: [], opcoes: {} }).relatorio;

test('relatório vazio: estado e contagens essenciais, sem seções vazias', () => {
  const t = formatarRelatorio({ estado: 'concluido', motivo: '', relatorio: vazio() });
  assert.match(t, /Resultado: concluído/);
  assert.match(t, /Gravadas: 0/);
  assert.match(t, /Linhas em branco: 0/);
  assert.doesNotMatch(t, /Duplicados|Divergências|nome parcial|Respondido|localizado/i);
});

test('estados parado/erro mostram o motivo', () => {
  assert.match(formatarRelatorio({ estado: 'parado', motivo: 'Parado pelo usuário.', relatorio: vazio() }), /Resultado: parado[\s\S]*Parado pelo usuário\./);
  assert.match(formatarRelatorio({ estado: 'erro', motivo: 'painel quebrou', relatorio: vazio() }), /Resultado: erro[\s\S]*painel quebrou/);
});

test('seções aparecem quando há dados; nada de Respondido/N. localizado', () => {
  const r = vazio();
  Object.assign(r, {
    gravadas: { total: 3, porSelo: { Lida: 2, Falha: 1 } }, emBranco: 5,
    pulados: { semTelefoneNome: 1, semLinha: 2, sumiu: 1, decisaoBm: 1, campanha: 4 }, naoVerificados: 6,
    nomeParcial: [{ linha: 5, card: 1, titulo: 'Daniel' }],
    divergencias: [{ tipo: 'telefone-id', linha: 2, card: 0, titulo: 'Ana' }],
    painelRepetido: [{ card: 3, titulo: 'X', rotulo: ROTULO_PAINEL_REPETIDO }],
    duplicados: [{ linha: 2, cardVencedor: 0, cardDescartado: 7 }],
    naoSobrescritas: [{ linha: 7, atual: 'Lida', novo: 'Entregue' }],
    selosDesconhecidos: [{ selo: 'Pendente', linha: 9 }],
    telefonesRepetidos: [{ card: 2, telefone: '71900000010', linhas: [9, 10] }],
  });
  const t = formatarRelatorio({ estado: 'concluido', motivo: '', relatorio: r });
  assert.match(t, /Gravadas: 3 \(Lida: 2, Falha: 1\)/);
  assert.match(t, /Linhas em branco: 5/);
  assert.match(t, /sem telefone\/nome: 1/);
  assert.match(t, /sem linha na planilha: 2/);
  assert.match(t, /sumiu antes do clique: 1/);
  assert.match(t, /outra campanha: 4/);
  assert.match(t, /Não verificados.*: 6/);
  assert.match(t, /linha 5/);
  assert.match(t, /possível painel repetido \(título igual ao anterior; leitura reaproveitada\)/);
  assert.match(t, /linha 2.*card 8.*descartado|linha 2/);
  assert.match(t, /linha 7.*Lida.*Entregue/);
  assert.match(t, /Pendente.*linha 9/);
  assert.match(t, /9, 10/);
  assert.doesNotMatch(t, /Respondido|N\. localizado/);
  assert.doesNotMatch(t, /71900000010/); // sem telefones de clientes no texto
});
