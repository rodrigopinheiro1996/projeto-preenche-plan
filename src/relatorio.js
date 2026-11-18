// Texto do relatório final (copiável) a partir do resultado da execução. Puro.
// Nunca inclui telefones de clientes; títulos de cards só nas listas de conferência.
const ESTADOS = { concluido: 'concluído', parado: 'parado', erro: 'erro', cancelado: 'cancelado' };

export function formatarRelatorio({ estado, motivo, relatorio: r }) {
  const L = [];
  L.push(`Resultado: ${ESTADOS[estado] ?? estado}`);
  if (motivo) L.push(`Motivo: ${motivo}`);
  if (!r) return L.join('\n');

  const selos = Object.entries(r.gravadas.porSelo).map(([s, n]) => `${s}: ${n}`).join(', ');
  L.push(`Gravadas: ${r.gravadas.total}${selos ? ` (${selos})` : ''}`);
  L.push(`Linhas em branco: ${r.emBranco}`);

  const p = r.pulados;
  const pulados = [
    ['sem telefone/nome', p.semTelefoneNome], ['sem linha na planilha', p.semLinha],
    ['sumiu antes do clique', p.sumiu], ['decisão do BM', p.decisaoBm], ['outra campanha', p.campanha],
  ].filter(([, n]) => n > 0);
  if (pulados.length) L.push(`Cards pulados: ${pulados.map(([k, n]) => `${k}: ${n}`).join('; ')}`);
  if (r.naoVerificados > 0) L.push(`Não verificados (execução interrompida): ${r.naoVerificados}`);

  const secao = (titulo, itens, f) => { if (itens.length) L.push('', `${titulo}:`, ...itens.map((i) => `  - ${f(i)}`)); };
  secao('Casados por nome parcial (conferir)', r.nomeParcial, (x) => `linha ${x.linha} (card "${x.titulo}")`);
  secao('Divergências', r.divergencias, (x) => `${x.tipo === 'telefone-id' ? 'telefone × Id' : 'telefone × nome'}: linha ${x.linha ?? '?'} (card "${x.titulo}")`);
  secao('Possível painel repetido', r.painelRepetido, (x) => `${x.rotulo ?? ''} — card "${x.titulo}"`);
  secao('Duplicados (vale o card mais recente)', r.duplicados, (x) => `linha ${x.linha}: card ${x.cardVencedor + 1} valeu; card ${x.cardDescartado + 1} descartado`);
  secao('Células já preenchidas, não sobrescritas', r.naoSobrescritas, (x) => `linha ${x.linha}: atual "${x.atual}", Blip mostra "${x.novo}"`);
  secao('Selos desconhecidos gravados como estão', r.selosDesconhecidos, (x) => `"${x.selo}" na linha ${x.linha}`);
  secao('Telefone repetido na planilha (nada gravado)', r.telefonesRepetidos, (x) => `linhas ${x.linhas.join(', ')} (card ${x.card + 1})`);
  return L.join('\n');
}
