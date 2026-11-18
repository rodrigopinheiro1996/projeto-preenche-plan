// Leitura/gravação de ZIP (xlsx) sem dependências (spec §3).
// Entrada não alterada é regravada byte a byte (bruto + crc); alterada é recomprimida (deflate-raw + CRC32).
// Sem ZIP64 e sem criptografia (erro claro).

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_FIM = 0x06054b50;

const TABELA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(uint8) {
  let c = 0xffffffff;
  for (let i = 0; i < uint8.length; i++) c = TABELA_CRC[(c ^ uint8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function lerFluxo(fluxo) {
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}
const descomprimir = (u8) => lerFluxo(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw')));
const comprimir = (u8) => lerFluxo(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw')));

const ERRO_ZIP = 'Arquivo inválido: não é um zip (.xlsx) íntegro ou está truncado.';

/** @returns {Promise<Map<string, object>>} nome → {nome, dados, bruto, metodo, crc, tamBruto, tamOriginal, ...} */
export async function lerZip(u8) {
  if (!(u8 instanceof Uint8Array) || u8.length < 22) throw new Error(ERRO_ZIP);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

  let fim = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) {
    if (dv.getUint32(i, true) === SIG_FIM) { fim = i; break; }
  }
  if (fim < 0) throw new Error(ERRO_ZIP);

  const total = dv.getUint16(fim + 10, true);
  const tamCentral = dv.getUint32(fim + 12, true);
  const offCentral = dv.getUint32(fim + 16, true);
  if (total === 0xffff || tamCentral === 0xffffffff || offCentral === 0xffffffff) {
    throw new Error('Zip64 não é suportado por esta ferramenta.');
  }
  if (offCentral + tamCentral > u8.length) throw new Error(ERRO_ZIP);

  const entradas = new Map();
  const decoder = new TextDecoder();
  let p = offCentral;
  for (let n = 0; n < total; n++) {
    if (p + 46 > u8.length || dv.getUint32(p, true) !== SIG_CENTRAL) throw new Error(ERRO_ZIP);
    const flags = dv.getUint16(p + 8, true);
    const metodo = dv.getUint16(p + 10, true);
    const hora = dv.getUint16(p + 12, true);
    const data = dv.getUint16(p + 14, true);
    const crc = dv.getUint32(p + 16, true);
    const tamBruto = dv.getUint32(p + 20, true);
    const tamOriginal = dv.getUint32(p + 24, true);
    const nNome = dv.getUint16(p + 28, true);
    const nExtra = dv.getUint16(p + 30, true);
    const nCom = dv.getUint16(p + 32, true);
    const offLocal = dv.getUint32(p + 42, true);
    const versao = dv.getUint16(p + 6, true);
    if (tamBruto === 0xffffffff || tamOriginal === 0xffffffff || offLocal === 0xffffffff) {
      throw new Error('Zip64 não é suportado por esta ferramenta.');
    }
    if (flags & 1) throw new Error('Zip criptografado não é suportado.');
    const nome = decoder.decode(u8.subarray(p + 46, p + 46 + nNome));
    p += 46 + nNome + nExtra + nCom;

    if (offLocal + 30 > u8.length || dv.getUint32(offLocal, true) !== SIG_LOCAL) throw new Error(ERRO_ZIP);
    const ini = offLocal + 30 + dv.getUint16(offLocal + 26, true) + dv.getUint16(offLocal + 28, true);
    if (ini + tamBruto > u8.length) throw new Error(ERRO_ZIP);
    const bruto = u8.slice(ini, ini + tamBruto);

    let dados;
    if (metodo === 0) dados = bruto;
    else if (metodo === 8) {
      try { dados = await descomprimir(bruto); } catch { throw new Error(ERRO_ZIP); }
    } else throw new Error(`Método de compressão ${metodo} não é suportado.`);
    if (dados.length !== tamOriginal || crc32(dados) !== crc) throw new Error(ERRO_ZIP);

    entradas.set(nome, { nome, dados, bruto, metodo, crc, tamBruto, tamOriginal, flags, hora, data, versao });
  }
  return entradas;
}

/** Grava o zip. `entrada.alterado === true` (ou sem `bruto`) → recomprime a partir de `dados`. */
export async function gravarZip(entradas) {
  const encoder = new TextEncoder();
  const partes = [];
  const central = [];
  let offset = 0;

  for (const [chave, e] of entradas) {
    const nome = encoder.encode(e.nome ?? chave);
    let bruto, crc, metodo, tamOriginal;
    if (e.alterado || !e.bruto) {
      bruto = await comprimir(e.dados);
      crc = crc32(e.dados);
      metodo = 8;
      tamOriginal = e.dados.length;
    } else {
      ({ bruto, crc, metodo, tamOriginal } = e);
    }
    const flags = (e.flags ?? 0x0800) & ~0x0008; // sem data descriptor: tamanhos vão no cabeçalho
    const hora = e.hora ?? 0;
    const data = e.data ?? 0x21; // 1980-01-01

    const local = new Uint8Array(30 + nome.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, SIG_LOCAL, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, flags, true);
    l.setUint16(8, metodo, true);
    l.setUint16(10, hora, true);
    l.setUint16(12, data, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, bruto.length, true);
    l.setUint32(22, tamOriginal, true);
    l.setUint16(26, nome.length, true);
    local.set(nome, 30);

    const cd = new Uint8Array(46 + nome.length);
    const c = new DataView(cd.buffer);
    c.setUint32(0, SIG_CENTRAL, true);
    c.setUint16(4, 20, true);
    c.setUint16(6, 20, true);
    c.setUint16(8, flags, true);
    c.setUint16(10, metodo, true);
    c.setUint16(12, hora, true);
    c.setUint16(14, data, true);
    c.setUint32(16, crc, true);
    c.setUint32(20, bruto.length, true);
    c.setUint32(24, tamOriginal, true);
    c.setUint16(28, nome.length, true);
    c.setUint32(42, offset, true);
    cd.set(nome, 46);

    partes.push(local, bruto);
    central.push(cd);
    offset += local.length + bruto.length;
  }

  const tamCentral = central.reduce((s, x) => s + x.length, 0);
  const fim = new Uint8Array(22);
  const f = new DataView(fim.buffer);
  f.setUint32(0, SIG_FIM, true);
  f.setUint16(8, central.length, true);
  f.setUint16(10, central.length, true);
  f.setUint32(12, tamCentral, true);
  f.setUint32(16, offset, true);

  const saida = new Uint8Array(offset + tamCentral + 22);
  let p = 0;
  for (const x of [...partes, ...central, fim]) { saida.set(x, p); p += x.length; }
  return saida;
}
