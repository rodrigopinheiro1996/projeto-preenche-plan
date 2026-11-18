// Nomes: normalização e tokens (spec §5, §6.6). Módulo puro, sem DOM.

/** NFKD + minúsculas, sem acento/emoji/símbolo/dígito; espaços colapsados. Letras decoradas viram ASCII. */
export function normalizarNome(txt) {
  if (txt === null || txt === undefined) return '';
  return String(txt)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}]+/gu, ' ')
    .trim();
}

/** Tokens só de letras, já normalizados. */
export function tokens(txt) {
  const n = normalizarNome(txt);
  return n ? n.split(' ') : [];
}

/** Menos de 2 letras úteis no total = sem nome utilizável. */
export function semNomeUtilizavel(txt) {
  return normalizarNome(txt).replace(/ /g, '').length < 2;
}

/** Remove trechos entre parênteses (apelidos). Não colapsa espaços. */
export function semParenteses(txt) {
  return String(txt ?? '').replace(/\([^)]*\)/g, '');
}

/** Todos os tokens do Blip estão contidos no nome da planilha? (lista vazia = false) */
export function tokensContidos(tokensBlip, nomePlanilha) {
  if (!tokensBlip || tokensBlip.length === 0) return false;
  const conjunto = new Set(tokens(nomePlanilha));
  return tokensBlip.every((t) => conjunto.has(t));
}
