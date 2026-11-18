// Regras de casamento cliente do Blip × linha da planilha, consolidação e relatório (spec §5, §6.3–6.10, §6.16).
// Módulo PURO: sem DOM, sem relógio, sem rede.
import { extrairTelefones, telefonesIguais, telefoneDoId, normalizarTelefone, pareceTelefone } from './telefone.js';
import { normalizarNome, tokens, semNomeUtilizavel, semParenteses, tokensContidos } from './nome.js';

export const ROTULO_PAINEL_REPETIDO = 'possível painel repetido (título igual ao anterior; leitura reaproveitada)';

export const SELOS_CONHECIDOS = ['Falha', 'Enviada', 'Entregue', 'Lida'];

/** @param linhas [{linha, celulas}] (de abrirXlsx)  @param {{colNome:string, colTelefones:string}} cols */
export function criarIndice(linhas, { colNome, colTelefones }) {
  return {
    linhas: linhas.map((l) => {
      const nome = String(l.celulas[colNome] ?? '');
      return { linha: l.linha, nome, nomeNorm: normalizarNome(nome), telefones: extrairTelefones(l.celulas[colTelefones]) };
    }),
  };
}

const candidato = ({ linha, nome, telefones }) => ({ linha, nome, telefones });

function buscarPorNome(indice, nome) {
  const norm = normalizarNome(nome);
  const iguais = indice.linhas.filter((l) => l.nomeNorm === norm);
  if (iguais.length) return { por: 'nome', achados: iguais };
  const tk = tokens(nome);
  const parciais = indice.linhas.filter((l) => tokensContidos(tk, l.nome));
  if (parciais.length) return { por: 'nome-parcial', achados: parciais };
  return null;
}

/**
 * @param leitura {titulo, nomePainel, telefonePainel, idPainel}
 * @returns {tipo:'casou', linha, por, avisos} | {tipo:'ambiguo', candidatos, avisos}
 *        | {tipo:'telefone-repetido-na-planilha', telefone, linhas, avisos}
 *        | {tipo:'nao_identificado', motivo:'sem-dados'|'sem-linha', avisos}
 */
export function resolverCliente(indice, leitura) {
  const { titulo = '', nomePainel = '', telefonePainel = '', idPainel = '' } = leitura;
  const avisos = [];

  // 1) telefone: painel → Id → título (se parece telefone)
  const doPainel = normalizarTelefone(telefonePainel);
  const doId = telefoneDoId(idPainel);
  const doTitulo = pareceTelefone(titulo) ? normalizarTelefone(titulo) : null;
  if (doPainel && doId && !telefonesIguais(doPainel, doId)) avisos.push('divergencia-telefone-id');
  const telefone = doPainel ?? doId ?? doTitulo;

  // nome do Blip: Nome do painel; se vazio/inutilizável, o título
  const nome = [nomePainel, titulo].find((n) => n && !semNomeUtilizavel(n)) ?? '';

  // 2) com telefone: NÃO cai no nome (nome só quando não há telefone)
  if (telefone) {
    const achados = indice.linhas.filter((l) => l.telefones.some((t) => telefonesIguais(t, telefone)));
    if (achados.length === 1) {
      const [{ linha }] = achados;
      if (nome) {
        const norm = normalizarNome(nome);
        if (indice.linhas.some((l) => l.linha !== linha && l.nomeNorm === norm)) avisos.push('divergencia-telefone-nome');
      }
      return { tipo: 'casou', linha, por: 'telefone', avisos };
    }
    if (achados.length > 1) {
      return { tipo: 'telefone-repetido-na-planilha', telefone, linhas: achados.map((l) => l.linha), avisos };
    }
    return { tipo: 'nao_identificado', motivo: 'sem-linha', avisos };
  }

  // 3) sem telefone → nome
  if (!nome) return { tipo: 'nao_identificado', motivo: 'sem-dados', avisos };
  for (const tentativa of [nome, semParenteses(nome)]) {
    if (!tentativa.trim() || semNomeUtilizavel(tentativa)) continue;
    const r = buscarPorNome(indice, tentativa);
    if (!r) continue;
    if (r.achados.length === 1) return { tipo: 'casou', linha: r.achados[0].linha, por: r.por, avisos };
    return { tipo: 'ambiguo', candidatos: r.achados.map(candidato), avisos };
  }
  return { tipo: 'nao_identificado', motivo: 'sem-linha', avisos };
}

/** Decisão do BM numa pausa de nome. */
export function aplicarEscolha(ambiguo, escolha) {
  if (escolha.acao === 'pular') return { tipo: 'pulado', motivo: 'decisao-bm', candidatos: ambiguo.candidatos, avisos: ambiguo.avisos ?? [] };
  if (escolha.acao === 'escolher') {
    if (!ambiguo.candidatos.some((c) => c.linha === escolha.linha)) {
      throw new Error(`A linha ${escolha.linha} não está entre os candidatos.`);
    }
    return { tipo: 'casou', linha: escolha.linha, por: 'escolha-bm', avisos: ambiguo.avisos ?? [] };
  }
  throw new Error(`Ação desconhecida: ${escolha.acao}`);
}

/**
 * @param fotoCards  [{titulo, campanha, horario, selo}] — ordem da fila (índice 0 = topo = mais recente)
 * @param resolucoes [{card:índice, resultado?, sumiu?, painelRepetido?}] — só os cards já visitados
 * @param linhas     [{linha, celulas}] (de abrirXlsx)
 * @param opcoes     {sobrescrever?, colDestino?, ignoradosCampanha?}
 * @returns {gravacoes: Map<linha, selo>, relatorio}
 */
export function consolidar({ fotoCards, resolucoes, linhas, opcoes = {} }) {
  const { sobrescrever = false, colDestino, ignoradosCampanha = 0 } = opcoes;
  const gravacoes = new Map();
  const rel = {
    gravadas: { total: 0, porSelo: {} },
    emBranco: 0,
    pulados: { semTelefoneNome: 0, semLinha: 0, sumiu: 0, decisaoBm: 0, campanha: ignoradosCampanha },
    naoVerificados: Math.max(0, fotoCards.length - new Set(resolucoes.map((r) => r.card)).size),
    nomeParcial: [], divergencias: [], painelRepetido: [], duplicados: [],
    naoSobrescritas: [], selosDesconhecidos: [], telefonesRepetidos: [],
  };
  const atual = (n) => (colDestino ? linhas.find((l) => l.linha === n)?.celulas[colDestino] ?? '' : '');
  const vencedor = new Map(); // linha → índice do card que venceu (o mais recente = menor índice)

  for (const r of [...resolucoes].sort((a, b) => a.card - b.card)) {
    const c = fotoCards[r.card];
    if (r.painelRepetido) rel.painelRepetido.push({ card: r.card, titulo: c.titulo, rotulo: ROTULO_PAINEL_REPETIDO });
    if (r.sumiu || !r.resultado) { rel.pulados.sumiu++; continue; }
    const res = r.resultado;
    for (const av of res.avisos ?? []) {
      rel.divergencias.push({ tipo: av.replace('divergencia-', ''), linha: res.linha ?? null, card: r.card, titulo: c.titulo });
    }
    switch (res.tipo) {
      case 'pulado': rel.pulados.decisaoBm++; break;
      case 'telefone-repetido-na-planilha': rel.telefonesRepetidos.push({ card: r.card, telefone: res.telefone, linhas: res.linhas }); break;
      case 'nao_identificado':
        if (res.motivo === 'sem-dados') rel.pulados.semTelefoneNome++; else rel.pulados.semLinha++;
        break;
      case 'casou': {
        if (vencedor.has(res.linha)) { rel.duplicados.push({ linha: res.linha, cardVencedor: vencedor.get(res.linha), cardDescartado: r.card }); break; }
        vencedor.set(res.linha, r.card);
        if (res.por === 'nome-parcial') rel.nomeParcial.push({ linha: res.linha, card: r.card, titulo: c.titulo });
        const selo = String(c.selo ?? '').trim();
        if (!selo) break;
        const existente = atual(res.linha);
        if (existente !== '' && !sobrescrever) { rel.naoSobrescritas.push({ linha: res.linha, atual: existente, novo: selo }); break; }
        gravacoes.set(res.linha, selo);
        rel.gravadas.total++;
        rel.gravadas.porSelo[selo] = (rel.gravadas.porSelo[selo] ?? 0) + 1;
        if (!SELOS_CONHECIDOS.includes(selo)) rel.selosDesconhecidos.push({ selo, linha: res.linha });
        break;
      }
      default: throw new Error(`Resultado desconhecido: ${res.tipo}`);
    }
  }
  rel.emBranco = linhas.filter((l) => !gravacoes.has(l.linha) && atual(l.linha) === '').length;
  return { gravacoes, relatorio: rel };
}
