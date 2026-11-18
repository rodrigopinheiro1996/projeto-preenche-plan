// Painel do bookmarklet em shadow DOM próprio (não herda CSS do Blip). Só UI: NUNCA toca no DOM do Blip.
// Implementa as portas `ui` da execução: confirmar, pedirDecisaoNome, progresso, baixarParcial, baixarFinal, finalizado.
import { formatarRelatorio } from './relatorio.js';

const ID_HOST = 'preenche-plan-host';
export const CRIAR_COLUNA = '__criar__';

const CSS = `
  :host { all: initial; }
  .caixa { position: fixed; top: 12px; right: 12px; width: 380px; max-height: 92vh; overflow: auto; z-index: 2147483647;
    background: #fff; color: #1b1b1b; border: 2px solid #1f6feb; border-radius: 10px; box-shadow: 0 6px 24px rgba(0,0,0,.3);
    font: 13px/1.4 system-ui, sans-serif; padding: 12px; box-sizing: border-box; }
  h1 { font-size: 15px; margin: 0 0 4px; display: flex; justify-content: space-between; align-items: center; }
  .aviso { background: #eef5ff; border-radius: 6px; padding: 6px 8px; margin-bottom: 8px; }
  label { display: block; margin: 6px 0 2px; font-weight: 600; }
  select, input[type=text], input[type=number] { width: 100%; box-sizing: border-box; padding: 4px; }
  .linha { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  button { cursor: pointer; padding: 6px 10px; border: 1px solid #888; border-radius: 6px; background: #f4f4f4; }
  button.principal { background: #1f6feb; color: #fff; border-color: #1f6feb; font-weight: 600; }
  button.perigo { background: #b42318; color: #fff; border-color: #b42318; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  #pp-status { margin-top: 8px; font-weight: 600; }
  #pp-erro { color: #b42318; margin-top: 6px; white-space: pre-wrap; }
  #pp-dialogo { margin-top: 8px; border: 2px solid #d29922; border-radius: 8px; padding: 8px; background: #fff8e6; }
  #pp-dialogo[hidden], #pp-relatorio-area[hidden], #pp-erro[hidden] { display: none; }
  .cand { display: flex; justify-content: space-between; gap: 6px; padding: 4px 0; border-bottom: 1px solid #eee; }
  textarea { width: 100%; height: 190px; box-sizing: border-box; font: 12px/1.35 ui-monospace, monospace; }
`;

const HTML = `
<div class="caixa" role="dialog" aria-label="Preenche Plan">
  <h1><span>Preenche Plan</span><button id="pp-fechar" title="Fechar o painel">×</button></h1>
  <div class="aviso">Só leio o Blip (nunca envio mensagem). A planilha original não é alterada: você baixa uma cópia.</div>
  <label for="pp-arquivo">Planilha (.xlsx)</label>
  <input id="pp-arquivo" type="file" accept=".xlsx">
  <label for="pp-col-nome">Coluna do nome</label><select id="pp-col-nome" disabled></select>
  <label for="pp-col-tel">Coluna dos telefones</label><select id="pp-col-tel" disabled></select>
  <label for="pp-col-destino">Coluna de destino (onde gravar o status)</label><select id="pp-col-destino" disabled></select>
  <label for="pp-campanha">Campanha (vazio = todas)</label><input id="pp-campanha" type="text" value="acao_reclameaqui">
  <label for="pp-n">Verificar os últimos N clientes (vazio = todos)</label><input id="pp-n" type="number" min="1" step="1">
  <label><input id="pp-sobrescrever" type="checkbox"> Sobrescrever células já preenchidas</label>
  <div class="linha">
    <button id="pp-iniciar" class="principal" disabled>Iniciar</button>
    <button id="pp-parar" class="perigo" disabled>Parar</button>
    <button id="pp-parcial" disabled>Baixar parcial</button>
  </div>
  <div id="pp-status" role="status"></div>
  <div id="pp-erro" role="alert" hidden></div>
  <div id="pp-dialogo" hidden></div>
  <div id="pp-relatorio-area" hidden>
    <label for="pp-relatorio">Relatório</label>
    <textarea id="pp-relatorio" readonly></textarea>
    <div class="linha"><button id="pp-copiar">Copiar relatório</button></div>
  </div>
</div>`;

export function criarPainel({ doc = document, aoArquivo, aoIniciar, aoParar, aoBaixarParcial }) {
  let host = doc.getElementById(ID_HOST);
  if (host) host.remove();
  host = doc.createElement('div');
  host.id = ID_HOST;
  const raiz = host.attachShadow({ mode: 'open' });
  raiz.innerHTML = `<style>${CSS}</style>${HTML}`;
  doc.body.appendChild(host);
  const $ = (id) => raiz.getElementById(id);

  const estado = { arquivoPronto: false, emExecucao: false };
  const atualizarBotoes = () => {
    $('pp-iniciar').disabled = !estado.arquivoPronto || estado.emExecucao;
    $('pp-parar').disabled = !estado.emExecucao;
    $('pp-parcial').disabled = !estado.emExecucao;
    for (const id of ['pp-arquivo', 'pp-col-nome', 'pp-col-tel', 'pp-col-destino', 'pp-campanha', 'pp-n', 'pp-sobrescrever']) {
      $(id).disabled = estado.emExecucao || (id.startsWith('pp-col') && !estado.arquivoPronto);
    }
  };
  const status = (t) => { $('pp-status').textContent = t; };
  const erro = (t) => { const e = $('pp-erro'); e.textContent = t ?? ''; e.hidden = !t; };
  const fecharDialogo = () => { const d = $('pp-dialogo'); d.hidden = true; d.replaceChildren(); };
  const el = (tag, props = {}, ...filhos) => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) { if (k === 'texto') e.textContent = v; else e.setAttribute(k, v); }
    e.append(...filhos);
    return e;
  };

  function baixar(bytes, nome) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = doc.createElement('a');
    a.href = url; a.download = nome; a.style.display = 'none';
    doc.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  $('pp-fechar').addEventListener('click', () => host.remove());
  $('pp-arquivo').addEventListener('change', async (ev) => {
    const f = ev.target.files?.[0];
    estado.arquivoPronto = false; atualizarBotoes(); erro('');
    if (!f) return;
    try { await aoArquivo(f); } catch (e) { erro(e?.message ?? String(e)); }
  });
  $('pp-iniciar').addEventListener('click', async () => {
    erro(''); $('pp-relatorio-area').hidden = true;
    const n = Number($('pp-n').value);
    const cfg = {
      colNome: $('pp-col-nome').value, colTelefones: $('pp-col-tel').value, colDestino: $('pp-col-destino').value,
      campanha: $('pp-campanha').value.trim(), n: Number.isInteger(n) && n > 0 ? n : 0, sobrescrever: $('pp-sobrescrever').checked,
    };
    estado.emExecucao = true; atualizarBotoes();
    try { await aoIniciar(cfg); } catch (e) { erro(e?.message ?? String(e)); }
    estado.emExecucao = false; atualizarBotoes();
  });
  $('pp-parar').addEventListener('click', () => { status('Parando…'); aoParar(); });
  $('pp-parcial').addEventListener('click', async () => { try { await aoBaixarParcial(); } catch (e) { erro(e?.message ?? String(e)); } });
  $('pp-copiar').addEventListener('click', async () => {
    const t = $('pp-relatorio');
    try { await navigator.clipboard.writeText(t.value); }
    catch { t.select(); doc.execCommand('copy'); }
    $('pp-copiar').textContent = 'Copiado!';
    setTimeout(() => { $('pp-copiar').textContent = 'Copiar relatório'; }, 1500);
  });

  const ui = {
    /** Diálogo de confirmação com contagens. Sem "Confirmar" nada acontece. */
    confirmar(info) {
      return new Promise((resolver) => {
        const d = $('pp-dialogo');
        d.replaceChildren(
          el('strong', { texto: 'Confirmar antes de começar' }),
          el('p', { texto: `Cards na fila: ${info.total}. Vou verificar ${info.cards}`
            + `${info.n ? ` (últimos ${info.n})` : ''}`
            + `${info.campanha ? ` da campanha "${info.campanha}"` : ' de todas as campanhas'}`
            + `${info.ignoradosCampanha ? `; ${info.ignoradosCampanha} de outras campanhas serão ignorados` : ''}.` }),
          el('p', { texto: 'Vou clicar apenas em cada card e na aba Contato. Nada é enviado no Blip.' }),
        );
        const fim = (ok) => { fecharDialogo(); resolver(ok); };
        const sim = el('button', { id: 'pp-confirmar-sim', class: 'principal', texto: 'Confirmar e iniciar' });
        const nao = el('button', { id: 'pp-confirmar-nao', texto: 'Cancelar' });
        sim.addEventListener('click', () => fim(true));
        nao.addEventListener('click', () => fim(false));
        d.append(el('div', { class: 'linha' }, sim, nao));
        d.hidden = false;
      });
    },
    /** Pausa para decidir nome ambíguo: escolher uma linha / pular / parar tudo. */
    pedirDecisaoNome(candidatos) {
      return new Promise((resolver) => {
        const d = $('pp-dialogo');
        d.replaceChildren(
          el('strong', { texto: 'Nome ambíguo — qual é a linha certa?' }),
          el('p', { texto: 'Mais de uma linha combina com este cliente. Escolha uma, pule (nada é gravado) ou pare tudo.' }),
        );
        const fim = (r) => { fecharDialogo(); resolver(r); };
        for (const c of candidatos) {
          const b = el('button', { class: 'escolher', 'data-linha': String(c.linha), texto: 'Escolher' });
          b.addEventListener('click', () => fim({ acao: 'escolher', linha: c.linha }));
          d.append(el('div', { class: 'cand' }, el('span', { texto: `Linha ${c.linha}: ${c.nome} — ${c.telefones.join(' / ') || 'sem telefone'}` }), b));
        }
        const pular = el('button', { id: 'pp-pular', texto: 'Pular (não grava)' });
        const parar = el('button', { id: 'pp-parar-tudo', class: 'perigo', texto: 'Parar tudo' });
        pular.addEventListener('click', () => fim({ acao: 'pular' }));
        parar.addEventListener('click', () => fim({ acao: 'parar' }));
        d.append(el('div', { class: 'linha' }, pular, parar));
        d.hidden = false;
      });
    },
    progresso({ atual, total, titulo }) { status(`Verificando ${atual}/${total}: ${titulo}`); },
    baixarParcial(bytes, nome) { baixar(bytes, nome); status(`Parcial baixada: ${nome}`); },
    baixarFinal(bytes, nome) { baixar(bytes, nome); },
    finalizado(info) {
      status(info.estado === 'concluido' ? 'Concluído. A planilha foi baixada.' : `Encerrado (${info.estado}).`);
      if (info.estado === 'erro' && info.motivo) erro(info.motivo);
      $('pp-relatorio').value = formatarRelatorio(info);
      $('pp-relatorio-area').hidden = false;
    },
  };

  return {
    host, ui,
    mostrar() { host.style.display = ''; },
    remover() { host.remove(); },
    /** Preenche os selects depois de ler a planilha. padrao = {nome, telefones, destino} (letras ou null). */
    definirPlanilha({ cabecalhos, padrao }) {
      const opcoes = (sel, extra = []) => {
        $(sel).replaceChildren(...cabecalhos.map((c) => el('option', { value: c.coluna, texto: `${c.coluna} — ${c.texto}` })), ...extra);
      };
      opcoes('pp-col-nome'); opcoes('pp-col-tel');
      opcoes('pp-col-destino', [el('option', { value: CRIAR_COLUNA, texto: 'Criar coluna "Retorno" na próxima vazia' })]);
      if (padrao.nome) $('pp-col-nome').value = padrao.nome;
      if (padrao.telefones) $('pp-col-tel').value = padrao.telefones;
      $('pp-col-destino').value = padrao.destino ?? CRIAR_COLUNA;
      estado.arquivoPronto = true;
      atualizarBotoes();
      status('Planilha carregada. Confira as colunas e clique em Iniciar.');
    },
    erro,
    status,
  };
}
