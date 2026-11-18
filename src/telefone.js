// Telefones: normalização e comparação (spec §5, §6.3). Módulo puro, sem DOM.

/** Só dígitos; remove o 55 inicial se sobrarem 12–13 dígitos. Devolve 10 ou 11 dígitos, ou null. */
export function normalizarTelefone(texto) {
  if (texto === null || texto === undefined) return null;
  let d = String(texto).replace(/\D/g, '');
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
  return d.length === 10 || d.length === 11 ? d : null;
}

/** Extrai todos os telefones de uma célula (separadores: ; / , espaço). */
export function extrairTelefones(celula) {
  if (celula === null || celula === undefined) return [];
  const saida = [];
  const adicionar = (n) => { if (n && !saida.includes(n)) saida.push(n); };
  for (const parte of String(celula).split(/[;/,]+/)) {
    const inteiro = normalizarTelefone(parte);
    if (inteiro) { adicionar(inteiro); continue; }
    // "71900000001 71900000002": separado só por espaço
    for (const p of parte.split(/\s+/)) adicionar(normalizarTelefone(p));
  }
  return saida;
}

/** Igualdade de 11 dígitos; se algum lado tem 10, 2ª tentativa: mesmo DDD + últimos 8. */
export function telefonesIguais(a, b) {
  const x = normalizarTelefone(a);
  const y = normalizarTelefone(b);
  if (!x || !y) return false;
  if (x === y) return true;
  if (x.length === 10 || y.length === 10) {
    return x.slice(0, 2) === y.slice(0, 2) && x.slice(-8) === y.slice(-8);
  }
  return false;
}

/** Telefone a partir do Id do Blip; só `…@wa.gw.msging.net` carrega número. */
export function telefoneDoId(id) {
  if (!id) return null;
  const m = /^(\d+)@wa\.gw\.msging\.net$/.exec(String(id).trim());
  return m ? normalizarTelefone(m[1]) : null;
}

/** O título do card parece um telefone (ex.: `+55 (21) 90000-0000`)? */
export function pareceTelefone(titulo) {
  if (!titulo) return false;
  const t = String(titulo).trim();
  return /^[+\d()\s.-]+$/.test(t) && normalizarTelefone(t) !== null;
}
