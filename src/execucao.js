// Máquina de estados da execução (spec §2, §6.4, §6.12–6.15). Sem DOM nem timers diretos: tudo entra por portas.
//   blip     = {fotografarFila, reencontrarCard, clicarCard, abrirContato, lerPainel}   (só LEITURA + 2 cliques)
//   relogio  = {agora, esperar(ms), limite(ms)}   (limite: promessa que resolve após ms, sem travar a execução)
//   ui       = {confirmar, pedirDecisaoNome, progresso, baixarParcial, baixarFinal, finalizado}
//   planilha = {linhas, colNome, colTelefones, colDestino, nomeSaida?, gravar(gravacoes) → bytes}
import { criarIndice, resolverCliente, aplicarEscolha, consolidar } from './casar.js';
import { normalizarNome } from './nome.js';

export const ESPERA_PAINEL_MS = 6000;
export const POLL_MS = 200;
export const PAUSA_ENTRE_MS = 400;
export const ESPERA_BASE_MS = 300; // tempo para o painel Contato aparecer ao ler a linha de base
export const LIMITE_DECISAO_MS = 120_000;

const mesmaCampanha = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

export function criarExecucao({ blip, relogio, ui, planilha, opcoes = {} }) {
  const { campanha = '', n = 0, sobrescrever = false } = opcoes;
  let iniciou = false;
  let parou = false;
  let cards = [];
  let ignoradosCampanha = 0;
  const resolucoes = [];

  const consolidado = () => consolidar({
    fotoCards: cards, resolucoes, linhas: planilha.linhas,
    opcoes: { sobrescrever, colDestino: planilha.colDestino, ignoradosCampanha },
  });
  const nomeSaida = () => planilha.nomeSaida ?? 'planilha_retorno.xlsx';

  /** Planilha só com o que já foi resolvido; o resto fica em branco. */
  async function baixarParcial() {
    const { gravacoes } = consolidado();
    const bytes = await planilha.gravar(gravacoes);
    await ui.baixarParcial(bytes, nomeSaida());
    return bytes;
  }

  /** Lê o painel só quando for do cliente clicado (§6.4). Devolve {leitura, repetido, apareceu}. */
  async function lerPainelDoCliente(card, tituloAnterior, idBase) {
    const tituloNorm = normalizarNome(card.titulo);
    const repetidoTitulo = tituloNorm !== '' && tituloNorm === tituloAnterior;
    const t0 = relogio.agora();
    let ultimo = null;
    for (;;) {
      if (parou) return { parado: true };
      const p = await blip.lerPainel();
      ultimo = p;
      if (p) {
        const nomeBate = tituloNorm !== '' && normalizarNome(p.nome) === tituloNorm && !repetidoTitulo;
        const idMudou = Boolean(p.id) && p.id !== idBase;
        if (nomeBate || idMudou) return { leitura: p, repetido: false, apareceu: true };
      }
      if (relogio.agora() - t0 >= ESPERA_PAINEL_MS) break;
      await relogio.esperar(POLL_MS);
    }
    // Estourou o tempo. DECISÃO (BM): título igual ao do anterior ⇒ reaproveita a leitura atual e marca "possível painel
    // repetido"; NÃO cai no nome. Pior caso = linha em branco / duplicado no relatório, nunca selo na linha errada
    // (título usado como nome poderia casar um homônimo).
    if (repetidoTitulo && ultimo) return { leitura: ultimo, repetido: true, apareceu: true };
    return { leitura: null, repetido: false, apareceu: false }; // "informação não apareceu" → só o título/nome do card
  }

  async function decidirNome(candidatos) {
    const decisao = ui.pedirDecisaoNome(candidatos);
    const limite = relogio.limite(LIMITE_DECISAO_MS).then(() => 'limite');
    const primeiro = await Promise.race([Promise.resolve(decisao).then(() => 'decisao'), limite]);
    if (primeiro === 'limite') await baixarParcial(); // pausa longa: salva o já resolvido e segue esperando o BM
    return decisao;
  }

  async function encerrar(estado, motivo) {
    const { gravacoes, relatorio } = consolidado();
    const bytes = await planilha.gravar(gravacoes);
    if (estado === 'concluido') await ui.baixarFinal(bytes, nomeSaida());
    else await ui.baixarParcial(bytes, nomeSaida());
    const resultado = { estado, motivo, relatorio };
    await ui.finalizado(resultado);
    return resultado;
  }

  async function iniciar() {
    if (iniciou) throw new Error('A execução já foi iniciada; não é possível iniciar de novo (evita ações duplicadas).');
    iniciou = true;
    let estado = 'concluido';
    let motivo = '';
    try {
      const foto = await blip.fotografarFila();
      const filtrados = campanha ? foto.filter((c) => mesmaCampanha(c.campanha, campanha)) : foto;
      ignoradosCampanha = foto.length - filtrados.length;
      cards = n > 0 ? filtrados.slice(0, n) : filtrados;
      const campanhas = {};
      for (const c of foto) campanhas[c.campanha] = (campanhas[c.campanha] ?? 0) + 1;
      const ok = await ui.confirmar({ total: foto.length, cards: cards.length, campanhas, n, campanha, ignoradosCampanha });
      if (!ok) return { estado: 'cancelado' };

      const indice = criarIndice(planilha.linhas, { colNome: planilha.colNome, colTelefones: planilha.colTelefones });
      // Linha de base (§6.4): Id do painel de quem JÁ está selecionado. O painel Informações só aparece na aba Contato,
      // então abre-se a aba (clique permitido) antes de ler; sem cliente selecionado a aba pode não existir → base vazia.
      let idBase = '';
      try {
        await blip.abrirContato();
        await relogio.esperar(ESPERA_BASE_MS);
        idBase = (await blip.lerPainel())?.id ?? '';
      } catch { idBase = ''; }
      let tituloAnterior = '';

      for (let i = 0; i < cards.length; i++) {
        if (parou) { estado = 'parado'; motivo = 'Parado pelo usuário.'; break; }
        const card = cards[i];
        await ui.progresso({ atual: i + 1, total: cards.length, titulo: card.titulo });
        if (parou) { estado = 'parado'; motivo = 'Parado pelo usuário.'; break; }

        const el = await blip.reencontrarCard(card);
        if (!el) { resolucoes.push({ card: i, sumiu: true }); continue; }

        await blip.clicarCard(el);
        await blip.abrirContato();
        const lido = await lerPainelDoCliente(card, tituloAnterior, idBase);
        if (lido.parado) { estado = 'parado'; motivo = 'Parado pelo usuário.'; break; }

        const p = lido.leitura;
        if (p?.id) idBase = p.id;
        tituloAnterior = normalizarNome(card.titulo);
        const leitura = {
          titulo: card.titulo, nomePainel: p?.nome ?? '', telefonePainel: p?.telefone ?? '', idPainel: p?.id ?? '',
        };
        let resultado = resolverCliente(indice, leitura);
        if (resultado.tipo === 'ambiguo') {
          const decisao = await decidirNome(resultado.candidatos);
          if (decisao.acao === 'parar') { estado = 'parado'; motivo = 'Parado pelo usuário numa decisão de nome.'; break; }
          resultado = aplicarEscolha(resultado, decisao);
        }
        resolucoes.push({ card: i, resultado, painelRepetido: lido.repetido });
        if (i < cards.length - 1) await relogio.esperar(PAUSA_ENTRE_MS);
      }
    } catch (e) {
      estado = 'erro';
      motivo = e?.message ?? String(e);
    }
    try {
      return await encerrar(estado, motivo);
    } catch (e) {
      const resultado = { estado: 'erro', motivo: `${motivo ? `${motivo} — ` : ''}falha ao gravar a planilha: ${e?.message ?? e}` };
      await ui.finalizado(resultado);
      return resultado;
    }
  }

  return { iniciar, parar: () => { parou = true; }, baixarParcial };
}
