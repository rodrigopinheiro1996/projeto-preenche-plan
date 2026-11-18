# Plano — preenche-plan (bookmarklet Blip → planilha xlsx)

> Fonte: `docs/plano/spec.md` (manda em caso de dúvida). Este plano é a **única** entrada da fase de execução.
> Formato escrito à mão (o comando `/superpowers:writing-plans` não carregou nesta sessão). Sem código de produção
> aqui: cada tarefa traz arquivos, **interface**, **tabela de testes (entrada → esperado)**, comandos e commit.
> Dados sempre **fictícios** (`71900000001` etc.). Idioma: pt-BR (código, UI, commits).

## Decisão de revisão (rodada de planejamento — substitui `Respondido`)

O BM simplificou: **grava-se só o que o Blip mostra**. Primeiro todo cliente com selo claro (`Lida`/`Enviada`/
`Falha`/`Entregue`); o resto fica **em branco**.
- **`Respondido` deixa de existir** (nada de gravar em linha sem card, nada de pergunta "K cards sem identificar").
  Isso torna inúteis a regra "com N não grava" e a premissa de 24 h (ficam só como aviso opcional no painel).
- Card **sem telefone e sem nome utilizável** → **pulado**, sem pausa, nada gravado (só contagem no relatório).
- **`N. localizado` dispensado**: não vai à planilha nem ao relatório.
- Já registrado em `docs/plano/spec.md` (§6.10, §6.16, P1) e `CLAUDE.md`. Em conflito, a spec manda.

## Arquitetura

- ES modules puros em `src/`, **sem dependência de runtime**. Só `src/blip.js` conhece DOM/seletores do Blip.
- Núcleo **puro e testável sem navegador**: `telefone`, `nome`, `zip`, `xlsx`, `casar`, `execucao` (máquina de
  estados com portas injetadas: `blip`, `relogio`, `ui`).
- `painel` = UI (shadow DOM próprio, para não herdar CSS do Blip). `main` liga tudo.
- `scripts/build.mjs` (esbuild, IIFE minificada) → `dist/instalar.html` com o link `javascript:` e instruções.
  **Nunca** editar o `javascript:` codificado.
- Fluxo de dados: foto da fila → (por card) clique + aba Contato + leitura → `casar` → gravações em memória →
  `xlsx.definirCelulas` → `zip.gravarZip` → download da cópia.

## Comandos (ferramentas sondadas em 2026-11-18; os scripts só serão validados na Tarefa 0)

| Ação | Comando |
|---|---|
| Instalar | `npm install` (só `esbuild` como devDependency) |
| Testes unitários | `npm test` → `node --test "tests/unit/*.test.js"` |
| Testes e2e (Playwright) | `npm run e2e` → `node --test "tests/e2e/*.test.js"` |
| Tudo | `npm run check` → unit + build + e2e |
| Build | `npm run build` → `dist/instalar.html` e `dist/bm.js` |
| Regerar fixtures | `python3 scripts/gerar-fixtures.py` (openpyxl 3.1.5 disponível) |

Fatos de ambiente (não "consertar"):
- **`node --test <diretório>` FALHA no Node 22** (testado: `# fail 1`). Usar **glob entre aspas** (`"tests/unit/*.test.js"`), que funciona.
- Node v22; `CompressionStream`/`DecompressionStream` nativos (também em `node`).
- **`import 'playwright'` em ESM falha** (vive em `/opt/node-tools`). Usar
  `createRequire(import.meta.url)('playwright')` — centralizado em `tests/helpers/playwright.js`.
- **`@playwright/test` não resolve**: usar `node:test` + `playwright` puro. Não instalar outro Playwright
  (não acharia o Chromium). `chromium.launch()` sem opções; passar `--no-sandbox` só se falhar.
- `esbuild` instala via `npm i -D esbuild` (testado). `unzip -t` e `openpyxl` existem → validadores
  **independentes** do nosso zip/xlsx.

## Estrutura final

```
package.json  .gitignore (dist/, node_modules/)
src/{telefone,nome,zip,xlsx,casar,execucao,blip,painel,main}.js
scripts/{build.mjs,gerar-fixtures.py}
tests/helpers/{playwright.js,xlsx-externo.py}
tests/unit/*.test.js      tests/e2e/*.test.js
tests/fixtures/{*.xlsx, blip-falso.html, cenarios.js}
dist/ (gerado)
```

## Convenções de teste

- Unitários: `node:test` + `node:assert/strict`. Um arquivo por módulo, tabela de casos `[entrada, esperado]`.
- Escrever o teste **primeiro**, rodar e ver **falhar** pelo motivo certo, implementar, ver passar, commitar.
- Commit por tarefa, mensagem em pt-BR no imperativo curto (ex.: `telefone: normaliza e compara números`),
  terminando com as linhas de atribuição pedidas pelo ambiente.

---

### Tarefa 0 — Setup

**Spec:** §7. **Arquivos:** `package.json` (`"type":"module"`, scripts da tabela acima, devDep `esbuild`),
`.gitignore` (`dist/`, `node_modules/`), `tests/helpers/playwright.js` (exporta `chromium` via `createRequire`).
**Teste:** `tests/unit/setup.test.js` — `assert.equal(typeof DecompressionStream, 'function')` e o helper
importa `chromium` e lança/fecha o navegador (esse último em `tests/e2e/smoke.test.js`).
**Rodar:** `npm install && npm test && npm run e2e`. **Commit:** `setup: package.json, scripts e helper do Playwright`.

### Tarefa 1 — `src/telefone.js` (§5, §6.3)

**Interface:**
- `normalizarTelefone(texto) → string|null`: só dígitos; se sobrar 12–13 dígitos começando com `55`, remove o `55`;
  devolve 11 dígitos, ou 10 (fixo/antigo) se for o caso; senão `null`.
- `extrairTelefones(celula) → string[]`: separa por `;` `/` espaço/vírgula; número ou texto; normaliza cada um.
- `telefonesIguais(a, b) → boolean`: igualdade de 11 dígitos; **2ª tentativa** se algum lado tem 10 dígitos:
  DDD + últimos 8.
- `telefoneDoId(id) → string|null`: só para `…@wa.gw.msging.net` (tira `55` e `@…`); `…@tunnel.msging.net` → `null`.
- `pareceTelefone(titulo) → boolean` (título do card tipo `+55 (21) 90000-0000`).

**Tabela:**
| Entrada | Esperado |
|---|---|
| `normalizarTelefone('+55 (71) 90000-0001')` | `'71900000001'` |
| `normalizarTelefone(71900000001)` (número) | `'71900000001'` |
| `normalizarTelefone('5571900000001')` | `'71900000001'` |
| `normalizarTelefone('abc')`, `''`, `'123'` | `null` |
| `extrairTelefones('71900000001 / 71900000002')` | `['71900000001','71900000002']` |
| `extrairTelefones('71900000001;7133330001')` | `['71900000001','7133330001']` |
| `telefonesIguais('71900000001','71900000001')` | `true` |
| `telefonesIguais('7190000001','71990000001')` (10 vs 11, mesmo DDD, últimos 8 iguais `90000001`) | `true` |
| `telefonesIguais('7190000001','71900000001')` (últimos 8 `90000001` ≠ `00000001`) | `false` |
| `telefonesIguais('7190000001','71990000002')` | `false` |
| `telefoneDoId('5571900000001@wa.gw.msging.net')` | `'71900000001'` |
| `telefoneDoId('0b5f…-uuid@tunnel.msging.net')` | `null` |
| `pareceTelefone('+55 (21) 90000-0000')` / `'Maria'` | `true` / `false` |

**Rodar:** `node --test tests/unit/telefone.test.js`. **Commit:** `telefone: normalização, extração e comparação`.

### Tarefa 2 — `src/nome.js` (§5, §6.6)

**Interface:** `normalizarNome(txt) → string` (NFKD, minúsculas, sem acento/emoji/símbolo, espaços colapsados);
`tokens(txt) → string[]` (só letras); `semNomeUtilizavel(txt) → boolean` (< 2 letras úteis no total);
`semParenteses(txt) → string` (remove `(...)`); `tokensContidos(tokensBlip, nomePlanilha) → boolean`.

**Tabela:**
| Entrada | Esperado |
|---|---|
| `normalizarNome('ℜ𝔬𝔰𝔢𝔞𝔫𝔢 ')` (Fraktur + espaço no fim) | `'roseane'` |
| `normalizarNome('José  da Silva 😀')` | `'jose da silva'` |
| `tokens('Ana (Aninha) Souza')` | `['ana','aninha','souza']` |
| `semParenteses('Ana (Aninha) Souza')` | `'Ana  Souza'` (colapsar na normalização) |
| `semNomeUtilizavel('😀😀')`, `'+55 (21) 90000-0000'`, `'A'` | `true` |
| `semNomeUtilizavel('Ana')` | `false` |
| `tokensContidos(['ana','souza'], 'Ana Maria Souza')` | `true` |
| `tokensContidos(['ana','lima'], 'Ana Maria Souza')` | `false` |

**Rodar:** `node --test tests/unit/nome.test.js`. **Commit:** `nome: normalização e tokens (letras decoradas, emoji)`.

### Tarefa 3 — `src/zip.js` (§3)

**Interface:** `async lerZip(uint8) → Map<string,{nome, dados:Uint8Array(descomprimido), bruto:Uint8Array,
metodo, crc, tamBruto, tamOriginal}>` (lê diretório central; método 0 e 8 via `DecompressionStream('deflate-raw')`);
`async gravarZip(entradas) → Uint8Array` (entrada **não alterada** reutiliza `bruto`/`crc` **byte a byte**;
alterada → `CompressionStream('deflate-raw')` + CRC32); `crc32(uint8) → number`.
**Sem dependências.** Suportar o que o Excel/openpyxl produzem (sem ZIP64, sem criptografia; ZIP64 → erro claro).

**Testes (`tests/unit/zip.test.js`):**
- `crc32('123456789')` = `0xCBF43926`.
- Ler `tests/fixtures/modelo.xlsx` (gerada pelo openpyxl): lista contém `xl/workbook.xml`, `[Content_Types].xml`.
- **Round-trip sem alteração**: `gravarZip(lerZip(x))`: cada entrada tem **bytes comprimidos idênticos** à original.
- Alterar 1 entrada → as demais idênticas byte a byte; a alterada descomprime para o novo texto.
- **Validação independente** (não circular): gravar em `os.tmpdir()` e rodar `unzip -t` (exit 0) e
  `python3 tests/helpers/xlsx-externo.py <arquivo>` (abre com openpyxl, imprime JSON). O teste falha se qualquer
  um dos dois falhar.
- **Quirks do Excel (openpyxl não gera):** zip montado à mão com *data descriptor* (bit 3 dos flags; tamanhos/CRC
  zerados no cabeçalho local) e com comentário/EOCD no fim — a leitura deve usar o **diretório central** (tamanhos
  válidos), nunca o cabeçalho local.
- Zip truncado/inválido → lança erro com mensagem em pt-BR (não devolve lixo).

**Rodar:** `node --test tests/unit/zip.test.js`. **Commit:** `zip: leitura/gravação nativa com CRC32 e cópia byte a byte`.

### Tarefa 4 — `src/xlsx.js` leitura (§3)

**Interface:** `async abrirXlsx(uint8, {aba='AÇÃO'}) → {entradas, caminhoAba, cabecalhos:[{coluna:'A', texto}],
linhas:[{linha:n, celulas:{A:valor,...}}]}`.
- Achar a aba por **`xl/workbook.xml` + `xl/_rels/workbook.xml.rels`** (nunca supor `sheet1.xml`). Aba inexistente →
  erro pt-BR listando as abas existentes.
- Valores: `sharedStrings` (só leitura), `t="inlineStr"`, `t="str"`, números (`71900000001` como **número**), vazio.
  **Célula numérica (`<v>` sem `t` ou `t="n"`): `Number(v)` → inteiro (`String(Math.round(n))`), nunca "só dígitos" do
  texto** — o Excel grava `7.1900000001E10`. Vetor: `<v>7.1900000001E10</v>` → `'71900000001'`.
- **Linha de dados** = Nome **ou** Telefones não vazio. Linhas só com estilo/vazias são ignoradas (nunca recebem
  qualquer coisa). Fixture `linhas-vazias-estilizadas.xlsx`.
- Decodificar entidades XML. Linha 1 = cabeçalhos.
- `detectarColunas(cabecalhos) → {nome, telefones, destino}` por cabeçalho (`Nome`, `Telefones`, `Retorno`; sem
  acento/maiúscula). Ausente → `null` (o painel deixa o BM escolher).
- Fixtures (gerar com `scripts/gerar-fixtures.py`, openpyxl, dados fictícios): `modelo.xlsx` (A–H com `Status` e
  `Retorno` vazia), `sem-retorno.xlsx` (só até `Lote`), `aba-segunda.xlsx` (`AÇÃO` não é a 1ª aba), `celulas-esparsas.xlsx`
  (linhas com células faltando, linha de telefone múltiplo `71900000001 / 71900000002`, telefone como número e como texto).

**Fixtures com XML cru:** `gerar-fixtures.py` gera com openpyxl e depois **edita o XML da aba dentro do zip**
(notação científica no `<v>`, `<c r="H5" s="7"/>` vazia estilizada, linhas vazias estilizadas) — openpyxl sozinho
não reproduz as manias do Excel.
**Testes:** cabeçalhos de `modelo.xlsx`; `<v>7.1900000001E10</v>` → `71900000001`; linhas vazias estilizadas não
aparecem em `linhas` (não são linhas de dados); `aba-segunda.xlsx` acha `AÇÃO` pelo rels; telefone numérico lido como
`71900000001`; célula com 2 números; aba inexistente → erro; `detectarColunas` em `sem-retorno.xlsx` → `destino: null`.
**Rodar:** `node --test tests/unit/xlsx-leitura.test.js`. **Commit:** `xlsx: leitura de abas, cabeçalhos e linhas`.

### Tarefa 5 — `src/xlsx.js` escrita (§3, §6.1–6.2)

**Interface:** `async gravarCelulas(xlsx, {colunaDestino, criarCabecalho, gravacoes: Map<linha,string>}) → Uint8Array`.
Altera **só** o XML da aba e cria no máximo a coluna de destino:
- célula gravada como `t="inlineStr"` (`<is><t>…</t></is>`), **sem tocar `sharedStrings`**; texto com `& < > "` escapado;
  `xml:space="preserve"` se houver espaços nas pontas.
- Inserir `<c>` **na ordem de colunas** dentro da `<row>` (linha com células faltando; destino antes/depois de
  outras); linha inexistente → criar `<row r>` na posição certa.
- Coluna de destino inexistente (`sem-retorno.xlsx`): cria cabeçalho `Retorno` na **próxima coluna vazia** e
  atualiza `<dimension ref>`. Estilos/`cols`/formatação/demais abas/`sharedStrings`: **bytes idênticos**.
- Se já existe `<c r="H5" s="7"/>` (vazia, estilizada): **substituir no lugar mantendo `s`**; nunca inserir 2ª `<c>`
  com o mesmo `r`. Teste: contar `<c r="H5"` = 1 e `s="7"` preservado.
- **Não sobrescreve** célula não vazia a menos que `sobrescrever` (a decisão é do chamador; esta função recebe só
  as gravações finais).

**Testes (`tests/unit/xlsx-escrita.test.js`):**
- Gravar `Lida`/`Falha` em linhas de `modelo.xlsx` → reabrir com `abrirXlsx` **e** com openpyxl
  (`xlsx-externo.py`; **a validação decisiva é a independente**) → valores certos, coluna `Status` (G) intacta.
- `sem-retorno.xlsx`: cria `Retorno` em `G1`, `dimension` passa a incluir `G`; ordem das células correta.
- `celulas-esparsas.xlsx`: linha sem a célula do destino ganha a `<c>` na posição certa.
- `&` e `<` no texto gravado sobrevivem ao round-trip.
- Entradas não alteradas do zip têm bytes comprimidos idênticos aos da original; `unzip -t` ok.
- O arquivo original (Uint8Array de entrada) **não é mutado**.

**Commit:** `xlsx: gravação de células inlineStr preservando o resto do arquivo`.

### Tarefa 6 — `src/casar.js` (puro; §5, §6.3–6.10)

Cérebro das regras, **sem DOM nem relógio**.

**Interface:**
- `criarIndice(linhas, {colNome, colTelefones}) → indice` (telefones por linha; nomes normalizados).
- `resolverCliente(indice, leitura) → Resultado`, com `leitura = {titulo, nomePainel, telefonePainel, idPainel}`:
  1. telefone: `telefonePainel` → `telefoneDoId(idPainel)` → `titulo` se `pareceTelefone`; divergência
     Telefone × Id ⇒ vale o Telefone e `avisos:['divergencia-telefone-id']`;
  2. com telefone: casa por `telefonesIguais` com **qualquer** telefone da linha; achou 1 → `{tipo:'casou', linha,
     por:'telefone'}`; achou 2+ linhas com o mesmo telefone → `{tipo:'ambiguo', candidatos}` (pausa);
     **telefone lido mas sem linha → `{tipo:'nao_identificado', telefone, nome}` — NÃO cai no nome** (§6.6: nome só
     quando **não há** telefone; §6.10: card sem linha é anomalia → relatório com nome e telefone lidos, nada
     gravado; evita gravar selo em homônimo). Telefone que casa **2+ linhas** (mesmo número repetido na planilha):
     **vai ao relatório como `telefone-repetido-na-planilha`, sem pausa** (a pausa é só para nome repetido, §6.10);
  3. sem telefone → nome (`nomePainel` ou, se vazio, `titulo`): nome completo igual e **1** linha → `casou`
     `por:'nome'`; todos os tokens contidos: **1** candidato → `casou` `por:'nome-parcial'` (vai ao relatório);
     **2+** → `{tipo:'ambiguo', candidatos:[{linha,nome,telefones}]}`; nada → 2ª tentativa **sem parênteses**; ainda
     nada → `nao_identificado`; "sem nome utilizável" → `nao_identificado` **sem pausa**;
  4. telefone × nome divergentes (telefone casou a linha X, nome do Blip aponta outra linha): vale X + aviso
     `divergencia-telefone-nome`.
- `aplicarEscolha(resultadoAmbiguo, {acao:'escolher', linha} | {acao:'pular'}) → {tipo:'casou'|'pulado'}`.
- `consolidar({fotoCards, resolucoes, linhas, opcoes:{sobrescrever}}) → {gravacoes: Map<linha,string>, relatorio}`:
  - linha casada → **selo exato** do card (da foto) (§6.5);
  - **duplicado** (2 cards na mesma linha): vale o **mais recente** (menor índice, topo); o outro → relatório (§6.8);
  - célula já preenchida e `!sobrescrever` → não grava, entra no relatório;
  - **linha sem card = em branco** (nada é gravado); card `nao_identificado` (sem telefone/nome) ou sem linha →
    **só contagem** no relatório, nada gravado, **sem `N. localizado`**;
  - relatório (§6.16): contagens por selo gravado e linhas em branco; pulados (sem telefone/nome, campanha,
    sumiu); por nome parcial; divergências; "possível painel repetido"; duplicados; preenchidas não sobrescritas;
    selo desconhecido gravado como está (§6.5).

**Tabela de testes (`tests/unit/casar.test.js`, linhas fictícias; usar helper `linhasFicticias()`):**
| Cenário | Esperado |
|---|---|
| Telefone do painel casa a linha 3 | `casou` linha 3, `por:'telefone'` |
| Painel só com Id `55719…@wa.gw.msging.net` | casa pelo Id |
| Id `…@tunnel` sem telefone, nome completo igual, 1 linha | `casou` `por:'nome'` |
| Título `+55 (71) 90000-0001`, painel vazio | casa pelo título |
| Telefone do painel ≠ telefone do Id | usa o painel + aviso |
| Telefone lido sem linha, nome do painel igual a uma linha existente | `nao_identificado` (NÃO casa por nome), nada gravado, só contagem |
| Mesmo telefone em 2 linhas da planilha | relatório `telefone-repetido-na-planilha`, sem pausa, nada gravado |
| Telefone de 10 dígitos na planilha, 11 no Blip (últimos 8) | casa |
| Célula de planilha com 2 números, 2º igual ao do Blip | casa |
| Nome parcial, 1 candidato | `casou` + `por:'nome-parcial'` |
| Nome parcial, 2 candidatos | `ambiguo` com `{linha,nome,telefones}` |
| `Ana (Aninha) Souza` casa só sem parênteses | `casou` na 2ª tentativa |
| Título só emoji, sem telefone | `nao_identificado`, sem pausa |
| `aplicarEscolha` pular | `pulado`, nada gravado, anotado |
| 2 cards da mesma linha | grava o de cima; o outro no relatório |
| Célula com valor, `sobrescrever=false` | não grava, relatório; `true` → grava |
| Run completo, linhas da planilha sem card | ficam **em branco** (nenhuma gravação nelas) |
| Card sem telefone e sem nome utilizável | `nao_identificado`: pulado, sem pausa, contado no relatório |
| Run interrompido / `n` preenchido | grava só os cards já resolvidos; o resto em branco |
| Linha casada com `Falha` | grava `Falha` |
| Selo `Pendente` (desconhecido) | grava `Pendente` e lista no relatório |

**Commit:** `casar: regras de casamento, consolidação e relatório`.

### Tarefa 7 — `src/execucao.js` (máquina de estados; §2, §6.4, §6.12–6.15)

Orquestra com **portas injetadas** (nada de DOM/`setTimeout` direto), para testar tudo sem navegador.

**Portas:** `blip` = `{fotografarFila(), reencontrarCard(item), clicarCard(el), abrirContato(), lerPainel()}`;
`relogio` = `{agora(), esperar(ms), limite(ms)}` (`limite(ms)` = promessa que resolve após `ms` **sem travar** a execução; usada só no prazo de 120 s da decisão de nome); `ui` = `{confirmar(info), pedirDecisaoNome(candidatos), progresso(info), baixarParcial(bytes,nome), baixarFinal(bytes,nome), finalizado({estado, motivo, relatorio})}`; `planilha` = `{linhas, colNome, colTelefones, colDestino, gravar(gravacoes)}`.

**Comportamento (cada item vira teste):**
1. `fotografarFila` → filtra por campanha (vazio = todas; outras só contadas) → corta nos **N primeiros do topo**
   (§6.12) → `ui.confirmar({cards, campanhas, n})`. Sem confirmação = nada acontece.
2. Para cada item: `reencontrarCard` por **título+campanha+horário**; sumiu/mudou → **pula e anota** (não para).
   Clicar **sempre** o card e **sempre** abrir Contato (mesmo título parecendo telefone). Só essas duas ações existem
   na porta `blip` — por construção o orquestrador não consegue clicar em Enviar/Atualizar.
3. **Proteção contra painel velho (§6.4, a regra mais importante):** **antes do 1º clique, ler o `Id` do painel
   atual (se houver) como linha de base** — sem isso o 1º cliente passaria no teste "Id mudou" lendo o painel de
   quem já estava selecionado. Após o clique, só aceitar a leitura quando
   `Nome do painel == título` **ou** `Id` mudou vs. cliente anterior. Título igual ao do anterior → esperar o
   **tempo cheio** e marcar "possível painel repetido".
   **Decisão do BM (timeout com título repetido):** passados os 6 s, **reaproveita a leitura atual**, marca "possível painel
   repetido (título igual ao anterior; leitura reaproveitada)" no relatório e **NÃO cai no nome** (pior caso = linha em
   branco/duplicado visível, nunca selo na linha errada; título como nome poderia casar homônimo). Mesma pessoa → o card de
   cima grava, o de baixo vira duplicado (§6.8); pessoa diferente com o mesmo título → duplicado + linha dela em branco. Espera máx. **6000 ms**, polling curto; **400 ms** de pausa
   entre clientes. Estourou → "informação não apareceu" → tenta pelo nome. Painel com Id `tunnel` e sem Telefone → nome.
4. `resolverCliente`; `ambiguo` → `ui.pedirDecisaoNome` (**pausa**; botões *escolher*/*pular*/*parar tudo*); depois segue.
5. **Pausa longa (suposição desta rodada, §6.15 não fixa o número): decisão de nome sem resposta por 120 s ⇒
   baixa a parcial automaticamente** (a execução continua pausada, sem gravar nada além do já resolvido).
   Teste com relógio simulado: 119 s ⇒ nada; 120 s ⇒ `baixarParcial` 1×.
6. **Parar** (botão ou erro ambíguo): encerra, **baixa parcial automaticamente**, linhas não visitadas **em branco**,
   nada além do já resolvido. Qualquer exceção inesperada = parar e mostrar o motivo (nada de adivinhar).
7. Fim da lista: `consolidar` → `planilha.gravar` → baixar na hora (**sem pergunta final**). Card que sumiu entre a
   foto e o clique vira "pulado (sumiu)" no relatório. **Nunca duplicar ação** (cada card visitado no máx. 1×;
   reentrada bloqueada por flag de execução).
8. `baixarParcial` disponível a qualquer momento (planilha só com o que já foi resolvido; o resto em branco).

**Testes (`tests/unit/execucao.test.js`, portas falsas + relógio simulado que acumula `esperar`):**
- espera de painel velho: painel só muda após 2 s ⇒ lê o novo, não o velho; painel nunca muda ⇒ 6 s e vai ao nome;
- **1º cliente com outro já selecionado**: painel inicial = Id de terceiro, painel do 1º card atrasa 2 s ⇒ a leitura
  antiga (Id da linha de base) é **rejeitada**; só a nova é aceita;
- título repetido ⇒ espera cheia + `possivelPainelRepetido`; pausa de 400 ms entre clientes (soma do relógio);
- N=2 com 3 campanhas misturadas ⇒ só 2 do topo **depois** do filtro; nada gravado fora dos N;
- card some entre foto e clique ⇒ pula, anota, segue; `ui.confirmar` retorna `false` ⇒ zero chamadas a `clicarCard`;
- card sem telefone e sem nome utilizável ⇒ **não pausa**, não grava, segue para o próximo;
- ambíguo ⇒ `pedirDecisaoNome` chamada 1×; *parar tudo* ⇒ `baixarParcial` automática; *pular* ⇒ não grava;
- exceção em `lerPainel` ⇒ parada + parcial + motivo; execução interrompida ⇒ **linhas em branco**;
- dupla chamada de `iniciar()` ⇒ segunda rejeitada.

**Commit:** `execucao: máquina de estados com proteção contra painel velho`.

### Tarefa 8 — `src/blip.js` (§4) — único arquivo que conhece o DOM

**Interface (implementa a porta `blip`):** `fotografarFila()` (rola `.thin-scrollbar` até a contagem de
`.contact-list-wrapper article` **estabilizar**, volta ao topo; para cada card: `innerText.split('\n')` →
título = linha 0, horário = linha 1, campanha = linha 2, **selo = última linha** (confirmar com `bds-chip-tag`);
→ `[{indice, titulo, horario, campanha, selo}]`); `reencontrarCard(item)`; `clicarCard(el)` (`el.click()`);
`abrirContato()` (aba índice 1 em `document.querySelector('bds-tab-group.contact-info-header-wrapper').shadowRoot
.querySelectorAll('div.tab_group__header__itens__item')`); `lerPainel()` → `{id, nome, telefone}` (acha `bds-typo`
com texto `Informações`; rótulos `bds-typo[variant="fs-12"]`; valor = `nextElementSibling.querySelector('bds-typo')`;
ignora o rótulo `Copiar`).
- **Proibido** selecionar por classe com hash (`Yv6Nb-…==`, `sc-…`) ou `nth-child`; proibido referenciar botões
  `Enviar`/`Enviar nova mensagem`/`Atualizar`. Teste de lint em `tests/unit/blip-lint.test.js`: regex sobre
  `src/blip.js` falha se achar `sc-`, `nth-child`, `Yv6Nb`, `Enviar`, `Atualizar`.
- Seletor sem resultado = **erro explícito** (pede o `outerHTML` ao BM, regra 3), nunca valor inventado.
- Não validar pelo `.contact-thread-message-header-wrapper bds-typo` (não confiável, §4).
- Teste real da troca de painel e da lista com 100–200 cards **não é possível** aqui (§7): ficam na lista de
  "não testado" da Tarefa 13.

**Commit:** `blip: adaptador do DOM (fila, cliente, aba Contato, painel)`.

### Tarefa 9 — Página falsa do Blip (`tests/fixtures/blip-falso.html` + `cenarios.js`)

Montada **só** a partir dos fatos do §4 (dados fictícios), configurável por `window.__cenario`:
- lista `.contact-list-wrapper article` dentro de `.thin-scrollbar`, cada `article` com `innerText` em linhas
  `[título, horário, campanha, "Chatbot:", nome do chatbot, selo]` + `bds-chip-tag`; mais recente no topo;
- `bds-tab-group.contact-info-header-wrapper` com **shadowRoot aberto** e `div.tab_group__header__itens__item`
  (0 Envios, 1 Contato); a cada novo cliente **volta para Envios**;
- painel Informações em light DOM (`bds-typo` `Informações`, rótulos `variant="fs-12"`, `nextElementSibling`) com
  `Id`, `Nome`, `Telefone` e rótulo `Copiar`;
- **atraso configurável** na troca do painel (para exercitar §6.4) e modo "painel nunca atualiza";
- botões `Enviar`, `Enviar nova mensagem`, `Atualizar` presentes, **com contador de cliques** em `window.__cliquesProibidos`
  (os testes exigem `0`);
- `cenarios.js` exporta cenários: títulos telefone/emoji/Fraktur/apelido/espaço no fim, Id `tunnel`, painel velho,
  cliente duplicado, nome ambíguo, 2 campanhas, selos `Lida/Falha/Enviada/Entregue`, 60 cards.

**Teste:** `tests/e2e/pagina-falsa.test.js` — a página carrega no Chromium e o `blip.js`, **empacotado direto
com esbuild na hora do teste** (helper `tests/helpers/bundle.js`, não depende da Tarefa 11), fotografa 60 cards,
abre Contato, lê o painel. **Commit:** `testes: página falsa do Blip a partir dos fatos do DOM`.

### Tarefa 10 — `src/painel.js` (§2, §6.14–6.16)

Painel em shadow root próprio (ids/estilos isolados): seletor de arquivo `.xlsx`; selects de coluna **Nome**,
**Telefones** e **destino** (padrão `Retorno`); campo campanha (padrão `acao_reclameaqui`, vazio = todas); campo
"últimos N" (vazio = todos); caixa "sobrescrever existentes" (desmarcada); diálogo de confirmação com contagens;
diálogo de decisão de nome (candidatos com nome, telefone, nº da linha; *escolher* / *pular* / *parar tudo*);
botões **Parar** e **Baixar parcial**; progresso; área do
**relatório** com botão *Copiar*. Textos em pt-BR. O painel **nunca** chama o DOM do Blip (só `main`/`execucao` via portas).
**Portas do `ui` que o painel implementa:** além de `confirmar`/`pedirDecisaoNome`/`progresso`/`baixarParcial`, também
`baixarFinal(bytes,nome)` (dispara o download) e `finalizado({estado, motivo, relatorio})` (mostra estado, motivo e o
relatório **copiável**, incluindo o rótulo de "possível painel repetido").
**No `main`:** `relogio` real — `agora=Date.now`, `esperar=ms=>new Promise(r=>setTimeout(r,ms))` e `limite(ms)` com
`setTimeout`/`clearTimeout` (não pode manter a execução travada; a espera de 120 s corre em paralelo à decisão).
**Nota de implementação (Tarefa 7, linha de base):** como o painel Informações só aparece na aba **Contato**, o orquestrador
abre essa aba (clique permitido) e espera `ESPERA_BASE_MS` (300 ms) **antes** do 1º card para ler o Id de quem já estava
selecionado; sem cliente selecionado, a base fica vazia. Sem isso o painel velho do cliente anterior passaria como "Id mudou".
**Teste:** coberto pelos e2e da Tarefa 12 (preencher campos, ver diálogos, copiar relatório).
**Commit:** `painel: interface do bookmarklet em shadow DOM`.

### Tarefa 11 — Build (`scripts/build.mjs`) (§7)

`esbuild` empacota `src/main.js` (IIFE, minificada) → `dist/bm.js`; gera `dist/instalar.html` com
`<a href="javascript:…">` (código codificado com `encodeURIComponent`, **sem edição manual**) + instruções
(arrastar aos favoritos; abrir **Mensagens ativas**; clicar). Falha se `dist/bm.js` passar de um limite (avisar,
ex. > 400 KB). `main.js` é idempotente: clicar 2× não abre 2 painéis.
**Testes (`tests/unit/build.test.js`):** rodar o build ⇒ arquivos existem, o `href` começa com `javascript:` e
decodificado contém o marcador do `main`; `bm.js` tem `0` ocorrências de `import `/`export `.
**Commit:** `build: gera dist/instalar.html a partir de src/`.

### Tarefa 12 — Testes e2e (Playwright + página falsa) (§7)

Regras: **injetar o bundle `dist/bm.js`** (`page.addScriptTag`), nunca `src/`; arquivo via
`page.locator('input[type=file]').setInputFiles(...)`; download via `page.waitForEvent('download')` e **reabrir o
arquivo baixado com openpyxl** (`xlsx-externo.py`) — não com o nosso leitor. `afterEach`: `__cliquesProibidos === 0`.

Cenários (um arquivo cada, fixtures fictícias):
1. **Caminho feliz**: 4 clientes, 4 selos, todos casam por telefone; planilha baixada tem `Lida/Falha/Enviada/Entregue`,
   `Status` (G) intacta, original inalterado.
2. Título telefone (clica no card e abre Contato mesmo assim), emoji, Fraktur, apelido entre parênteses, espaço no fim.
3. **Id `tunnel`** sem telefone → casa por nome; **nome parcial** vai ao relatório.
4. **Painel velho** (atraso 2 s; e um cenário "nunca atualiza"): nunca grava o selo no cliente errado.
5. **Cliente duplicado**: vale o de cima; o outro no relatório.
6. **Nome ambíguo**: pausa, diálogo com candidatos; *escolher* grava; *pular* não grava; *parar tudo* baixa parcial.
7. **Célula já preenchida**: preservada; com "sobrescrever" marcada, regravada.
8. **Telefone 10 dígitos** na planilha casa pelos últimos 8.
9. **Duas campanhas**: filtro padrão ignora a outra (contada no relatório); filtro vazio inclui as duas.
10. **Execução interrompida** (botão Parar no meio): linhas não visitadas **em branco**, parcial baixada; nada gravado além do já resolvido.
11. **Matriz §6.10 (revisada)**:
    - fila completa, linhas da planilha sem card ⇒ **células em branco** (nenhum `Respondido` em lugar nenhum;
      o arquivo baixado não contém a palavra `Respondido` nas células da coluna de destino);
    - card sem telefone e sem nome utilizável (emoji; Id `tunnel` sem nome) ⇒ **pulado, sem pausa, sem diálogo**,
      nada gravado, contado no relatório; os demais cards seguem normalmente;
    - card com telefone mas sem linha na planilha ⇒ nada gravado e **sem** `N. localizado` no relatório;
    - interrompida ⇒ em branco; sobrescrever desmarcado ⇒ células preenchidas intactas;
    - **N preenchido (=2)** ⇒ só as 2 linhas dos cards recebem selo; o resto em branco.
12. **Planilha sem `Retorno`** ⇒ coluna criada na próxima vazia, validada no openpyxl.
13. **Segurança**: nenhum clique em `Enviar`/`Enviar nova mensagem`/`Atualizar`; `Parar` impede novos cliques de card;
    cancelar na confirmação ⇒ zero cliques.

**Rodar:** `npm run build && npm run e2e`. **Commit:** `e2e: cenários do bookmarklet contra a página falsa`.

### Tarefa 13 — Documentação e entrega

- `docs/plano/spec.md`: já reflete a revisão (sem `Respondido`/`N. localizado`); conferir que nada ficou contraditório.
- `CLAUDE.md`: status "implementado/testado em página falsa", **comandos reais** (tabela acima), estrutura final,
  limitações.
- `README.md`: como instalar (`dist/instalar.html`), como usar, como testar.
- Lista **"NÃO testado no site real"** (obrigatória na entrega, §7): troca real de painel entre clientes diferentes
  (P2), CSP do Blip para `javascript:`, `Blob`/download e seletor de arquivo dentro do Blip, lista com 100–200
  cards, seletor do selo (`bds-chip-tag`) no site real. Pedir ao BM o **teste real com N = 2 ou 3**, conferindo as
  linhas à mão contra o Blip antes de qualquer lote.
- Se algum seletor falhar no site real: pedir o **outerHTML** do trecho (regra 3), não supor.
**Commit:** `docs: spec, CLAUDE.md e README atualizados; limites do que não foi testado`.

---

## Rastreabilidade (spec → tarefa)

| Spec | Tarefa(s) |
|---|---|
| §1 objetivo, só lê o Blip / grava cópia | 5, 7, 8, 12 (cenários 1, 13) |
| §2 fluxo (painel, confirmação, pausa, relatório) | 7, 10, 12 |
| §3 planilha, aba `AÇÃO`, colunas, zip/XML sem SheetJS | 3, 4, 5, 12 (cenário 12) |
| §4 fatos do DOM, seletores estáveis, botões proibidos | 8, 9, 12 (cenário 13) |
| §5 normalização de telefone e nome | 1, 2 |
| §6.1 arquivo/cópia | 3, 5, 12 |
| §6.2 coluna de destino / cria `Retorno` | 4, 5, 10, 12 (12) |
| §6.3 origem do telefone (clica e abre Contato primeiro) | 6, 7, 8, 12 (2) |
| §6.4 proteção contra painel velho (6 s / 400 ms) | 7, 12 (4) |
| §6.5 selo exato / desconhecido | 6 |
| §6.6 busca por nome, pausa, escolher/pular/parar | 6, 7, 10, 12 (3, 6) |
| §6.7 telefone × nome divergentes | 6 |
| §6.8 cliente repetido | 6, 12 (5) |
| §6.9 célula preenchida / sobrescrever | 6, 12 (7) |
| §6.10 só grava o que o Blip mostra; linha sem card em branco; card sem telefone/nome pulado; sem `N. localizado` | 6, 7, 12 (11) |
| §6.11 filtro de campanha | 7, 10, 12 (9) |
| §6.12 últimos N (depois do filtro) | 7, 10, 12 (11) |
| §6.13 foto da fila, reencontrar card | 7, 8 |
| §6.14 segurança: parar, confirmar, não duplicar | 7, 10, 12 (10, 13) |
| §6.15 baixar parcial / automática | 7, 10, 12 (6, 10) |
| §6.16 relatório | 6, 10, 12 |
| §7 stack/build/`javascript:` gerado | 0, 11 |
| §7 casos: título telefone / emoji / decorado / apelido | 1, 2, 6, 12 (2) |
| §7 Id `tunnel` | 6, 12 (3) |
| §7 painel velho | 7, 12 (4) |
| §7 duplicado | 6, 12 (5) |
| §7 nome ambíguo | 6, 7, 12 (6) |
| §7 célula preenchida | 6, 12 (7) |
| §7 10 dígitos | 1, 6, 12 (8) |
| §7 2 campanhas | 7, 12 (9) |
| §7 execução interrompida | 7, 12 (10) |
| §7 "não testado no site real" | 13 |
| §8 P2/P3 (teste real do BM com N=2–3) | 13 |

## Ordem e dependências

`0 → 1, 2, 3 (paralelas) → 4 → 5 → 6 → 7 → 8 → 9 (usa o helper de bundle, não o build) → 10 → 11 → 12 → 13`. Tarefas 1–3 são independentes; 6 depende de
1, 2, 4; 7 de 6; 12 de 9, 10, 11. Mais de 5 tarefas ⇒ usar `/superpowers:subagent-driven-development`
(se o plugin não carregar na próxima sessão, executar tarefa a tarefa com o mesmo ciclo teste→implementa→commit).
