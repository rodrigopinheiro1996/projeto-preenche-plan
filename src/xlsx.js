// Leitura (e, na Tarefa 5, escrita) de planilhas .xlsx por regex sobre o XML — sem DOM, roda em Node e no navegador.
import { lerZip, gravarZip } from './zip.js';

const dec = new TextDecoder();

export function decodificarXml(s) {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function atributos(tag) {
  const a = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*"([^"]*)"/g)) a[m[1]] = decodificarXml(m[2]);
  return a;
}

/** 'A'→1, 'Z'→26, 'AA'→27 */
export function colunaParaNumero(letras) {
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}
export function numeroParaColuna(n) {
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

const textosDe = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t\s*\/>/g)].map((m) => decodificarXml(m[1] ?? '')).join('');

function lerCompartilhadas(xml) {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>|<si\s*\/>/g)].map((m) =>
    textosDe((m[1] ?? '').replace(/<rPh[\s\S]*?<\/rPh>/g, '')));
}

/** Valor numérico do <v>: inteiro como texto de inteiro (o Excel grava 7.1900000001E10). */
function numeroComoTexto(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v).trim();
  return Number.isInteger(n) ? String(Math.round(n)) : String(n);
}

function valorDaCelula(attrs, corpo, compartilhadas) {
  const v = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(corpo);
  const t = attrs.t;
  if (t === 'inlineStr') return textosDe((/<is>([\s\S]*?)<\/is>/.exec(corpo) ?? [, ''])[1]);
  if (!v) return '';
  const bruto = decodificarXml(v[1]);
  if (t === 's') return compartilhadas[Number(bruto)] ?? '';
  if (t === 'str') return bruto;
  if (t === 'b') return bruto === '1' ? 'VERDADEIRO' : 'FALSO';
  if (t === 'e') return '';
  return bruto.trim() === '' ? '' : numeroComoTexto(bruto);
}

const ERRO_XLSX = 'Arquivo inválido: não parece uma planilha .xlsx do Excel.';

function caminhoDaAba(entradas, aba) {
  const wb = entradas.get('xl/workbook.xml');
  const rels = entradas.get('xl/_rels/workbook.xml.rels');
  if (!wb || !rels) throw new Error(ERRO_XLSX);
  const abas = [...dec.decode(wb.dados).matchAll(/<sheet\s[^>]*\/?>/g)].map((m) => atributos(m[0]));
  const nomes = abas.map((a) => a.name);
  const alvo = abas.find((a) => a.name?.normalize('NFC') === aba.normalize('NFC'));
  if (!alvo) throw new Error(`A aba "${aba}" não existe nesta planilha. Abas encontradas: ${nomes.map((n) => `"${n}"`).join(', ')}.`);
  const id = alvo['r:id'];
  const rel = [...dec.decode(rels.dados).matchAll(/<Relationship\s[^>]*\/?>/g)].map((m) => atributos(m[0])).find((r) => r.Id === id);
  if (!rel) throw new Error(ERRO_XLSX);
  const t = rel.Target;
  const caminho = t.startsWith('/') ? t.slice(1) : `xl/${t}`;
  if (!entradas.has(caminho)) throw new Error(ERRO_XLSX);
  return caminho;
}

const normalizarCabecalho = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

/** Colunas por cabeçalho (sem acento/maiúscula). Ausente → null (o painel deixa o BM escolher). */
export function detectarColunas(cabecalhos) {
  const achar = (...nomes) => cabecalhos.find((c) => nomes.includes(normalizarCabecalho(c.texto)))?.coluna ?? null;
  return { nome: achar('nome'), telefones: achar('telefones', 'telefone'), destino: achar('retorno') };
}

/**
 * @returns {Promise<{entradas, caminhoAba, cabecalhos:{coluna,texto}[], linhas:{linha:number,celulas:Object}[]}>}
 * `linhas` só tem linhas de dados (Nome ou Telefones não vazio); a linha 1 são os cabeçalhos.
 */
export async function abrirXlsx(uint8, { aba = 'AÇÃO' } = {}) {
  const entradas = await lerZip(uint8);
  const caminhoAba = caminhoDaAba(entradas, aba);
  const ss = entradas.get('xl/sharedStrings.xml');
  const compartilhadas = lerCompartilhadas(ss ? dec.decode(ss.dados) : '');
  const xml = dec.decode(entradas.get(caminhoAba).dados);

  const todas = []; // {linha, celulas}
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const linha = Number(atributos(rm[1]).r);
    if (!linha) continue;
    const celulas = {};
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const a = atributos(cm[1]);
      const coluna = /^([A-Z]+)/.exec(a.r ?? '')?.[1];
      if (!coluna) continue;
      const valor = valorDaCelula(a, cm[2] ?? '', compartilhadas);
      if (valor !== '') celulas[coluna] = valor;
    }
    todas.push({ linha, celulas });
  }

  const cab = todas.find((l) => l.linha === 1)?.celulas ?? {};
  const cabecalhos = Object.entries(cab)
    .map(([coluna, texto]) => ({ coluna, texto }))
    .sort((x, y) => colunaParaNumero(x.coluna) - colunaParaNumero(y.coluna));
  const { nome, telefones } = detectarColunas(cabecalhos);
  const chaves = [nome, telefones].filter(Boolean);
  const ehDado = (c) => (chaves.length ? chaves.some((k) => c[k] !== undefined) : Object.keys(c).length > 0);
  const linhas = todas.filter((l) => l.linha > 1 && ehDado(l.celulas)).sort((a, b) => a.linha - b.linha);

  return { entradas, caminhoAba, cabecalhos, linhas };
}

// ---------------------------------------------------------------------------------------------------------
// Escrita: altera SÓ o XML da aba (células `inlineStr`); sharedStrings, estilos e demais partes ficam intactos.

const escaparXml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function celulaTexto(ref, estilo, valor) {
  const preservar = valor !== valor.trim() || /\s{2,}|[\r\n]/.test(valor);
  const s = estilo ? ` s="${estilo}"` : '';
  const t = preservar ? '<t xml:space="preserve">' : '<t>';
  return `<c r="${ref}"${s} t="inlineStr"><is>${t}${escaparXml(valor)}</t></is></c>`;
}

/** Grava/insere a célula `col` no miolo da linha, na ordem de colunas. Substitui no lugar (mantém `s`). */
function pôrCelulaNaLinha(inner, linha, col, valor) {
  const ref = `${col}${linha}`;
  const alvo = colunaParaNumero(col);
  for (const cm of inner.matchAll(/<c\b([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g)) {
    const a = atributos(cm[1]);
    const c = /^([A-Z]+)/.exec(a.r ?? '')?.[1];
    if (!c) continue;
    const n = colunaParaNumero(c);
    if (n === alvo) {
      return inner.slice(0, cm.index) + celulaTexto(ref, a.s, valor) + inner.slice(cm.index + cm[0].length);
    }
    if (n > alvo) return inner.slice(0, cm.index) + celulaTexto(ref, undefined, valor) + inner.slice(cm.index);
  }
  return inner + celulaTexto(ref, undefined, valor);
}

function ajustarSpans(abertura, alvo) {
  return abertura.replace(/\bspans="(\d+):(\d+)"/, (m, a, b) =>
    (alvo > Number(b) ? `spans="${a}:${alvo}"` : m));
}

function aplicarNaLinha(linhaXml, linha, col, valor) {
  const m = /^<row\b([^>]*?)(\/?)>/.exec(linhaXml);
  const alvo = colunaParaNumero(col);
  const abertura = ajustarSpans(m[1], alvo);
  const inner = m[2] === '/' ? '' : linhaXml.slice(m[0].length, linhaXml.length - '</row>'.length);
  return `<row${abertura}>${pôrCelulaNaLinha(inner, linha, col, valor)}</row>`;
}

function atualizarDimensao(xml, maxLinha, maxColuna) {
  return xml.replace(/<dimension\s+ref="([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?"\s*\/>/, (_, c1, r1, c2, r2) => {
    const col = Math.max(colunaParaNumero(c2 ?? c1), maxColuna);
    const lin = Math.max(Number(r2 ?? r1), maxLinha);
    return `<dimension ref="${c1}${r1}:${numeroParaColuna(col)}${lin}"/>`;
  });
}

/**
 * @param xlsx  resultado de abrirXlsx
 * @param opcoes {colunaDestino:'H', criarCabecalho?:'Retorno', gravacoes: Map<linha,string>}
 * @returns {Promise<Uint8Array>} novo .xlsx (a entrada não é mutada)
 */
export async function gravarCelulas(xlsx, { colunaDestino, criarCabecalho, gravacoes }) {
  const edicoes = new Map([...gravacoes].map(([l, v]) => [Number(l), String(v)]));
  if (criarCabecalho && !xlsx.cabecalhos.some((c) => c.coluna === colunaDestino && c.texto !== '')) {
    edicoes.set(1, criarCabecalho);
  }
  const entrada = xlsx.entradas.get(xlsx.caminhoAba);
  let xml = dec.decode(entrada.dados);
  const sd = /<sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/sheetData>)/.exec(xml);
  if (!sd) throw new Error(ERRO_XLSX);

  const existentes = [...(sd[1] ?? '').matchAll(/<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)].map((m) => ({
    linha: Number(atributos(m[0].slice(0, m[0].indexOf('>') + 1)).r), xml: m[0],
  }));
  const pendentes = [...edicoes.keys()].sort((a, b) => a - b);
  const saida = [];
  const emitirNovas = (ate) => {
    while (pendentes.length && pendentes[0] < ate) {
      const l = pendentes.shift();
      saida.push(`<row r="${l}">${celulaTexto(`${colunaDestino}${l}`, undefined, edicoes.get(l))}</row>`);
    }
  };
  for (const r of existentes) {
    emitirNovas(r.linha);
    if (pendentes[0] === r.linha) {
      pendentes.shift();
      saida.push(aplicarNaLinha(r.xml, r.linha, colunaDestino, edicoes.get(r.linha)));
    } else saida.push(r.xml);
  }
  emitirNovas(Infinity);

  const novoSd = `<sheetData>${saida.join('')}</sheetData>`;
  xml = xml.slice(0, sd.index) + novoSd + xml.slice(sd.index + sd[0].length);
  const maxLinha = Math.max(0, ...edicoes.keys());
  xml = atualizarDimensao(xml, maxLinha, colunaParaNumero(colunaDestino));

  const entradas = new Map(xlsx.entradas);
  entradas.set(xlsx.caminhoAba, { ...entrada, dados: new TextEncoder().encode(xml), alterado: true });
  return gravarZip(entradas);
}
