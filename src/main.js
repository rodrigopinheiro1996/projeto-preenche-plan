// Liga tudo: painel + adaptador do Blip + execução + planilha. Idempotente: clicar no favorito 2× não abre 2 painéis.
import { criarPainel, CRIAR_COLUNA } from './painel.js';
import { criarBlip } from './blip.js';
import { criarExecucao } from './execucao.js';
import { abrirXlsx, detectarColunas, gravarCelulas, colunaParaNumero, numeroParaColuna } from './xlsx.js';

export const MARCADOR = 'preenche-plan-bm';

/** Relógio real: `limite(ms)` é um setTimeout paralelo — não trava a execução. */
export const relogioReal = {
  agora: () => Date.now(),
  esperar: (ms) => new Promise((r) => setTimeout(r, ms)),
  limite: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export function iniciarBm(janela = window) {
  if (janela.__preenchePlan?.painel?.host?.isConnected) { janela.__preenchePlan.painel.mostrar(); return janela.__preenchePlan; }

  let xlsx = null;
  let nomeBase = 'planilha';
  let exec = null;

  const painel = criarPainel({
    doc: janela.document,
    async aoArquivo(arquivo) {
      xlsx = await abrirXlsx(new Uint8Array(await arquivo.arrayBuffer()));
      nomeBase = arquivo.name.replace(/\.xlsx$/i, '');
      const padrao = detectarColunas(xlsx.cabecalhos);
      if (!xlsx.cabecalhos.length) throw new Error('A aba AÇÃO não tem cabeçalhos na linha 1.');
      painel.definirPlanilha({ cabecalhos: xlsx.cabecalhos, padrao });
    },
    async aoIniciar(cfg) {
      if (!xlsx) throw new Error('Escolha a planilha primeiro.');
      if (!cfg.colNome && !cfg.colTelefones) throw new Error('Escolha ao menos a coluna de nome ou a de telefones.');
      let colDestino = cfg.colDestino;
      let criarCabecalho;
      if (colDestino === CRIAR_COLUNA) {
        const ultima = Math.max(0, ...xlsx.cabecalhos.map((c) => colunaParaNumero(c.coluna)));
        colDestino = numeroParaColuna(ultima + 1);
        criarCabecalho = 'Retorno';
      }
      const planilha = {
        linhas: xlsx.linhas, colNome: cfg.colNome, colTelefones: cfg.colTelefones, colDestino,
        nomeSaida: `${nomeBase}_retorno.xlsx`,
        gravar: (gravacoes) => gravarCelulas(xlsx, { colunaDestino: colDestino, criarCabecalho, gravacoes }),
      };
      exec = criarExecucao({
        blip: criarBlip({ doc: janela.document }), relogio: relogioReal, ui: painel.ui, planilha,
        opcoes: { campanha: cfg.campanha, n: cfg.n, sobrescrever: cfg.sobrescrever },
      });
      const r = await exec.iniciar();
      if (r.estado === 'cancelado') painel.status('Cancelado. Nada foi clicado nem gravado.');
    },
    aoParar() { exec?.parar(); },
    aoBaixarParcial() { return exec?.baixarParcial(); },
  });

  janela.__preenchePlan = { marcador: MARCADOR, painel };
  return janela.__preenchePlan;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') iniciarBm();
