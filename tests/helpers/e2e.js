// Utilitários dos e2e: abre a página falsa com o bundle REAL (dist/bm.js), opera o painel e valida o download.
import { pathToFileURL } from 'node:url';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from './playwright.js';

const raiz = new URL('../../', import.meta.url).pathname;
export const PAGINA = pathToFileURL(`${raiz}tests/fixtures/blip-falso.html`).href;
export const fixture = (nome) => `${raiz}tests/fixtures/${nome}`;
export const BM_JS = () => readFileSync(`${raiz}dist/bm.js`, 'utf8'); // nunca src/: testa o que o BM instala

export const abrirNavegador = () => chromium.launch();

export function lerXlsxExterno(caminho) {
  execFileSync('unzip', ['-t', caminho]);
  return JSON.parse(execFileSync('python3', [`${raiz}tests/helpers/xlsx-externo.py`, caminho]).toString());
}

/** Abre a página falsa, injeta dist/bm.js (que abre o painel sozinho). */
export async function abrirBm(navegador, cenario) {
  const pagina = await navegador.newPage();
  await pagina.addInitScript((c) => { window.__cenario = c; }, cenario);
  await pagina.goto(PAGINA);
  await pagina.addScriptTag({ content: BM_JS() });
  await pagina.locator('#pp-arquivo').waitFor();
  return pagina;
}

export async function escolherPlanilha(pagina, nomeFixture) {
  await pagina.locator('#pp-arquivo').setInputFiles(fixture(nomeFixture));
  await pagina.locator('#pp-iniciar:not([disabled])').waitFor();
}

export async function configurar(pagina, { campanha, n, sobrescrever, colDestino } = {}) {
  if (campanha !== undefined) await pagina.locator('#pp-campanha').fill(campanha);
  if (n !== undefined) await pagina.locator('#pp-n').fill(String(n));
  if (sobrescrever) await pagina.locator('#pp-sobrescrever').check();
  if (colDestino !== undefined) await pagina.locator('#pp-col-destino').selectOption(colDestino);
}

/** Clica Iniciar e confirma. Devolve a promessa do download (criar ANTES de clicar). */
export async function iniciarEConfirmar(pagina) {
  await pagina.locator('#pp-iniciar').click();
  await pagina.locator('#pp-confirmar-sim').click();
}

export async function salvarDownload(download) {
  const caminho = join(mkdtempSync(join(tmpdir(), 'e2e-')), download.suggestedFilename());
  await download.saveAs(caminho);
  return { caminho, nome: download.suggestedFilename(), abas: lerXlsxExterno(caminho) };
}

export const relatorioTexto = async (pagina) => {
  await pagina.locator('#pp-relatorio-area:not([hidden])').waitFor({ timeout: 60_000 });
  return pagina.locator('#pp-relatorio').inputValue();
};

/** Coluna `indice` (0 = A) da aba AÇÃO, sem o cabeçalho. */
export const coluna = (abas, indice) => abas['AÇÃO'].slice(1).map((l) => l[indice]);
export const COL_H = 7;
export const COL_G = 6;

export async function cliquesProibidos(pagina) { return pagina.evaluate(() => window.__cliquesProibidos); }
export async function selecoes(pagina) { return pagina.evaluate(() => window.__selecoes); }

/** Hooks padrão: um navegador por arquivo e, depois de cada teste, `__cliquesProibidos === 0` (segurança). */
export function configurarSuite({ before, after, afterEach }, assert) {
  const ctx = { navegador: null, pagina: null };
  before(async () => { ctx.navegador = await abrirNavegador(); });
  after(async () => { await ctx.navegador.close(); });
  afterEach(async () => {
    if (!ctx.pagina) return;
    const n = await cliquesProibidos(ctx.pagina);
    await ctx.pagina.close();
    ctx.pagina = null;
    assert.equal(n, 0, 'um botão proibido (Enviar/Enviar nova mensagem/Atualizar) foi clicado');
  });
  return ctx;
}

export async function hashArquivo(caminho) {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(readFileSync(caminho)).digest('hex');
}
