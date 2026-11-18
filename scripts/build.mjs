// Gera dist/bm.js (IIFE minificado) e dist/instalar.html (link javascript: para arrastar aos favoritos).
// O link é SEMPRE gerado daqui; nunca editar o código dentro do javascript: codificado.
import { build } from 'esbuild';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIMITE_BYTES = 400 * 1024;

const r = await build({
  entryPoints: [join(raiz, 'src/main.js')], bundle: true, minify: true, format: 'iife', platform: 'browser',
  target: 'es2022', write: false, legalComments: 'none',
});
const codigo = r.outputFiles[0].text.trim();
if (Buffer.byteLength(codigo) > LIMITE_BYTES) {
  console.error(`ERRO: dist/bm.js tem ${Buffer.byteLength(codigo)} bytes (limite ${LIMITE_BYTES}).`);
  process.exit(1);
}
const dist = join(raiz, 'dist');
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'bm.js'), `${codigo}\n`);

const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const href = `javascript:${encodeURIComponent(codigo)}`;
const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Instalar o Preenche Plan</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 720px; margin: 24px auto; padding: 0 16px; color: #1b1b1b; }
  a.bm { display: inline-block; padding: 10px 16px; background: #1f6feb; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 700; }
  textarea { width: 100%; height: 110px; font: 12px ui-monospace, monospace; }
  .aviso { background: #fff8e6; border: 1px solid #d29922; border-radius: 8px; padding: 8px 12px; }
</style>
</head>
<body>
<h1>Preenche Plan</h1>
<p>Preenche a sua planilha .xlsx com o status (<b>Lida / Enviada / Entregue / Falha</b>) que o Blip mostra em
<b>Mensagens ativas</b>. Só lê o Blip: nunca envia nada. Grava numa <b>cópia</b> da planilha.</p>
<h2>Instalar</h2>
<ol>
  <li>Mostre a barra de favoritos (Ctrl+Shift+B).</li>
  <li><b>Arraste</b> o botão abaixo para a barra de favoritos:<br><br>
    <a class="bm" href="${href}">Preenche Plan</a></li>
  <li>Se não for possível arrastar: crie um favorito novo e cole o texto da caixa abaixo no campo <i>URL</i>.</li>
</ol>
<textarea readonly onclick="this.select()">${escHtml(href)}</textarea>
<h2>Usar</h2>
<ol>
  <li>Abra o Blip Desk na tela <b>Mensagens ativas</b>.</li>
  <li>Clique no favorito <b>Preenche Plan</b>: o painel abre no canto da tela.</li>
  <li>Escolha a planilha, confira as colunas, a campanha e o "últimos N" e clique em <b>Iniciar</b>.</li>
  <li>Confirme as contagens. No fim, a cópia <code>&lt;nome&gt;_retorno.xlsx</code> é baixada e o relatório aparece no painel.</li>
</ol>
<p class="aviso"><b>Primeira vez?</b> Teste com <b>N = 2 ou 3</b> e confira as linhas à mão contra o Blip antes de rodar um lote.</p>
</body>
</html>
`;
writeFileSync(join(dist, 'instalar.html'), html);
console.log(`dist/bm.js ${statSync(join(dist, 'bm.js')).size} bytes; dist/instalar.html gerado.`);
