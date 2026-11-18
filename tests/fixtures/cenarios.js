// Cenários da página falsa do Blip (dados FICTÍCIOS). Cada cenário é um objeto JSON passado em window.__cenario.
// card = {titulo, horario, campanha, selo, bot, cliente:{id, nome, telefone}, atrasoPainel?}
export const CAMPANHA_A = 'acao_reclameaqui';
export const CAMPANHA_B = 'camapanha_ativo_ra'; // (sic) como no Blip real

export const CLIENTE_TERCEIRO = { id: '5571999999999@wa.gw.msging.net', nome: 'Terceiro Selecionado', telefone: '+55 (71) 99999-9999' };

const wa = (n11) => `55${n11}@wa.gw.msging.net`;
const tel = (n11) => `+55 (${n11.slice(0, 2)}) ${n11.slice(2, 7)}-${n11.slice(7)}`;
const tunnel = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}@tunnel.msging.net`;
const cliente = (n11, nome) => ({ id: wa(n11), nome, telefone: tel(n11) });
const semTelefone = (n, nome) => ({ id: tunnel(n), nome, telefone: '' });

/** 8 cards cobrindo os formatos de título vistos no Blip real (§4). Topo = mais recente. */
export function cenarioBase() {
  const ana = cliente('71900000001', 'Ana Maria Souza');
  const c = (titulo, horario, campanha, selo, cl) => ({ titulo, horario, campanha, selo, bot: 'Bot Fictício', cliente: cl });
  return {
    atrasoPainel: 0,
    painelNuncaAtualiza: false,
    painelInicial: null,
    paginacao: null,
    cards: [
      c('Ana Maria Souza', '12:36 PM', CAMPANHA_A, 'Lida', ana),
      c('+55 (71) 90000-0002', '19 hours', CAMPANHA_A, 'Falha', cliente('71900000002', 'Bruno Lima')),
      c('😀', '2 days', CAMPANHA_A, 'Enviada', semTelefone(3, '😀')),
      c('ℜ𝔬𝔰𝔢𝔞𝔫𝔢 ', '2 days', CAMPANHA_A, 'Entregue', semTelefone(4, 'ℜ𝔬𝔰𝔢𝔞𝔫𝔢')),
      c('Ana (Aninha) Souza', '2 days', CAMPANHA_A, 'Lida', semTelefone(5, 'Ana (Aninha) Souza')),
      c('Lima', '2 days', CAMPANHA_A, 'Enviada', semTelefone(6, 'Lima')),
      c('Carla Dias', '1 day', CAMPANHA_B, 'Lida', cliente('71900000003', 'Carla Dias')),
      c('Ana Maria Souza', '2 days', CAMPANHA_A, 'Enviada', ana), // mesmo cliente, envio mais antigo (duplicado)
    ],
  };
}

/** 60 cards (como no Blip real), todos com telefone próprio; os últimos 10 são da outra campanha. */
export function cenarioSessenta() {
  const selos = ['Lida', 'Falha', 'Enviada', 'Entregue'];
  const cards = Array.from({ length: 60 }, (_, i) => {
    const n11 = `719${String(i + 1).padStart(8, '0')}`;
    return {
      titulo: `Cliente Teste ${i}`, horario: `${i + 1} hours`, campanha: i >= 50 ? CAMPANHA_B : CAMPANHA_A,
      selo: selos[i % 4], bot: 'Bot Fictício', cliente: cliente(n11, `Cliente Teste ${i}`),
    };
  });
  return { ...cenarioBase(), cards };
}

export const comAtraso = (c, ms) => ({ ...c, atrasoPainel: ms });
export const comPainelNuncaAtualiza = (c) => ({ ...c, painelNuncaAtualiza: true });
export const comPainelInicial = (c, cl) => ({ ...c, painelInicial: cl });
export const comPaginacao = (c, { inicial, passo }) => ({ ...c, paginacao: { inicial, passo } });
