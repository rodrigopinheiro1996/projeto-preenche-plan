// Adaptador do DOM do Blip Desk (spec §4). ÚNICO arquivo que conhece seletores do Blip.
// Só LÊ a tela e só faz 2 tipos de clique: no card da lista e na aba Contato.
// Seletores: apenas âncoras estáveis (article da lista, bds-*, rótulos). Nunca classes com hash nem posição de filho.
// Seletor sem resultado = erro explícito pedindo o outerHTML (nunca valor inventado).

const SEL_CARDS = '.contact-list-wrapper article';
const SEL_LISTA = '.contact-list-wrapper';
const SEL_ROLAGEM = '.thin-scrollbar';
const SEL_ABAS = 'bds-tab-group.contact-info-header-wrapper';
const SEL_ABA_ITEM = 'div.tab_group__header__itens__item';
const INDICE_ABA_CONTATO = 1; // 0 = Envios, 1 = Contato
const ESTABILIZAR_ROUNDS = 3;
const MAX_ROUNDS_ROLAGEM = 200;

const semAcento = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const pedirHtml = (o) => `${o} Envie o outerHTML do trecho (botão direito → Inspecionar → Copy → Copy outerHTML) para ajustar o seletor.`;

/**
 * Texto do card → {titulo, horario, campanha, selo}. Linhas: [título, horário, campanha, "Chatbot:", bot, selo].
 * `seloChip` (texto do bds-chip-tag, se houver) tem prioridade sobre a última linha.
 */
export function parsearCard(texto, seloChip = '') {
  const linhas = String(texto ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (linhas.length < 4) {
    throw new Error(pedirHtml(`Card da lista com formato inesperado (${linhas.length} linha(s) de texto).`));
  }
  const selo = String(seloChip ?? '').trim() || linhas[linhas.length - 1];
  return { titulo: linhas[0], horario: linhas[1], campanha: linhas[2], selo };
}

const chave = (c) => `${c.titulo}\u0000${c.campanha}\u0000${c.horario}`;

/** @param {{doc?: Document, esperar?: (ms:number)=>Promise<void>}} deps */
export function criarBlip({ doc = document, esperar = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const lerCards = () => [...doc.querySelectorAll(SEL_CARDS)].map((el) => ({
    el, ...parsearCard(el.innerText, el.querySelector('bds-chip-tag')?.textContent),
  }));

  /** Rola até a contagem de cards estabilizar, volta ao topo e tira a foto (título, horário, campanha, selo). */
  async function fotografarFila() {
    const rolagem = doc.querySelector(SEL_LISTA)?.closest(SEL_ROLAGEM) ?? doc.querySelector(SEL_ROLAGEM);
    if (!rolagem) throw new Error(pedirHtml('Não achei o container rolável da lista de cards.'));
    let ultimo = -1;
    let iguais = 0;
    for (let i = 0; i < MAX_ROUNDS_ROLAGEM && iguais < ESTABILIZAR_ROUNDS; i++) {
      rolagem.scrollTop = rolagem.scrollHeight;
      await esperar(300);
      const n = doc.querySelectorAll(SEL_CARDS).length;
      iguais = n === ultimo ? iguais + 1 : 0;
      ultimo = n;
    }
    if (iguais < ESTABILIZAR_ROUNDS) throw new Error('A lista não parou de crescer; a contagem de cards não estabilizou.');
    rolagem.scrollTop = 0;
    await esperar(300);
    const vistos = new Map();
    const cards = lerCards().map(({ el, ...c }, indice) => {
      const k = chave(c);
      const ocorrencia = vistos.get(k) ?? 0;
      vistos.set(k, ocorrencia + 1);
      return { indice, ...c, ocorrencia };
    });
    if (cards.length === 0) throw new Error(pedirHtml('Nenhum card encontrado na lista de Mensagens ativas.'));
    return cards;
  }

  /** Acha o card de novo por título+campanha+horário (a n-ésima ocorrência, se repetido). null = sumiu/mudou. */
  async function reencontrarCard(item) {
    const k = chave(item);
    const iguais = lerCards().filter((c) => chave(c) === k);
    return iguais[item.ocorrencia ?? 0]?.el ?? null;
  }

  async function clicarCard(el) {
    el.click();
  }

  async function abrirContato() {
    const host = doc.querySelector(SEL_ABAS);
    if (!host) throw new Error(pedirHtml('Não achei o grupo de abas do cliente.'));
    if (!host.shadowRoot) throw new Error(pedirHtml('O grupo de abas não expõe shadowRoot.'));
    const aba = host.shadowRoot.querySelectorAll(SEL_ABA_ITEM)[INDICE_ABA_CONTATO];
    if (!aba) throw new Error(pedirHtml('Não achei a aba Contato (índice 1).'));
    const rotulo = semAcento(aba.textContent);
    if (rotulo && !rotulo.includes('contat')) {
      throw new Error(pedirHtml(`A aba de índice 1 se chama "${aba.textContent.trim()}", não Contato.`));
    }
    aba.click();
  }

  /** {id, nome, telefone} do painel Informações; null se o painel ainda não está na tela. */
  async function lerPainel() {
    const titulo = [...doc.querySelectorAll('bds-typo')].find((t) => semAcento(t.textContent) === 'informacoes');
    if (!titulo) return null;
    const campos = { id: '', nome: '', telefone: '' };
    let achou = false;
    for (let bloco = titulo.parentElement; bloco && !achou; bloco = bloco.parentElement) {
      for (const rotulo of bloco.querySelectorAll('bds-typo[variant="fs-12"]')) {
        const campo = semAcento(rotulo.textContent);
        if (!(campo in campos)) continue; // ignora "Copiar" e outros rótulos
        const irmao = rotulo.nextElementSibling;
        const valor = irmao?.matches('bds-typo') ? irmao : irmao?.querySelector('bds-typo');
        campos[campo] = (valor?.textContent ?? '').trim();
        achou = true;
      }
    }
    if (!achou) throw new Error(pedirHtml('Achei o título Informações, mas nenhum campo Id/Nome/Telefone.'));
    return campos;
  }

  return { fotografarFila, reencontrarCard, clicarCard, abrirContato, lerPainel };
}
