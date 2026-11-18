# projeto-preenche-plan — contexto do projeto

Idioma de código, UI, commits e conversa: **português (pt-BR)**. Autor: Rodrigo Facilidades.

> **Status: implementado e testado em página falsa (tarefas 0–13 do plano).** Falta o **teste real no Blip** (N = 2 ou 3,
> conferindo à mão): ver "O que NÃO foi testado" no `README.md`. Ao mudar regras, atualize spec → plano → este arquivo.

## Objetivo
Bookmarklet que roda na tela **Mensagens ativas** do Blip Desk (`*.desk.blip.ai/activeMessage`) e preenche uma
**planilha .xlsx** (aba `AÇÃO`) com o status de cada mensagem ativa (`Falha`/`Enviada`/`Entregue`/`Lida`) na coluna
escolhida (padrão `Retorno`). Cruza cliente do Blip × linha da planilha pelo **telefone** (aba Contato do
cliente: Telefone → Id → título do card) e, sem telefone, pelo **nome**. Só **lê** o Blip (nunca envia nada) e
grava numa **cópia** baixada do .xlsx. Usuário: o BM (operador do Blip). Detalhes e decisões: `docs/plano/spec.md`.

Decisões-chave (resumo; a spec manda):
- Telefone na planilha = `71981825172` (11 dígitos); no Blip vem `+55 (71) 98182-5172` ou Id `55…@wa.gw.msging.net`.
- Nome ambíguo (2+ candidatos) → **pausa** e pede decisão ao BM; depois segue até o fim.
- Só grava o que o Blip mostra (selo exato: `Enviada`, `Lida`, `Entregue`, `Falha`). Linha sem card → **em branco**
  (**não existe `Respondido`**, nem pergunta). Card sem telefone/nome utilizável → **pulado** (sem pausar, só
  contagem no relatório). `N. localizado` dispensado (nem planilha nem relatório).
- Filtro de campanha (padrão `acao_reclameaqui`) e campo "últimos N clientes" (N primeiros do topo, após o filtro).
- Proteção contra painel velho: só lê Informações quando `Nome` bate com o card ou o `Id` mudou.
- Só clica em **card** e **aba Contato**. Nunca em Enviar / Enviar nova mensagem / Atualizar.
- Sem SheetJS: edita o XML do .xlsx (zip nativo) e baixa a cópia; botão Baixar parcial; baixa sozinho ao parar.

## Stack e comandos
JavaScript puro (ES modules, sem dependência de runtime) + build `esbuild` + testes `node --test` + Playwright (página falsa).
- Instalar: `npm install` · Unitários: `npm test` · E2E: `npm run e2e` (usa `dist/bm.js`: rode `npm run build` antes)
- Build: `npm run build` (→ `dist/bm.js` + `dist/instalar.html`) · Tudo: `npm run check` · Fixtures: `python3 scripts/gerar-fixtures.py`
- Ambiente: `node --test <diretório>` falha no Node 22 → usar glob entre aspas (já nos scripts). `import 'playwright'` em ESM
  falha → `tests/helpers/playwright.js` (createRequire). `@playwright/test` não resolve → `node:test` + `playwright` puro.
  Validar xlsx/zip com `unzip -t` e openpyxl (`tests/helpers/xlsx-externo.py`), nunca só com o nosso leitor.

## Estrutura
- `src/telefone.js`, `nome.js` — normalização/comparação (puros) · `zip.js`, `xlsx.js` — zip nativo e leitura/gravação de células
  (edita só o XML da aba; sem SheetJS) · `casar.js` — regras de casamento, consolidação e relatório (puro)
- `src/execucao.js` — máquina de estados (portas injetadas: blip/relogio/ui/planilha; proteção contra painel velho)
- `src/blip.js` — **único** arquivo que conhece o DOM/seletores do Blip (teste de lint proíbe classes com hash e botões de envio)
- `src/painel.js` (UI em shadow DOM), `relatorio.js` (texto do relatório), `main.js` (liga tudo; idempotente)
- `scripts/build.mjs`, `scripts/gerar-fixtures.py` · `tests/unit`, `tests/e2e`, `tests/fixtures` (planilhas e `blip-falso.html` fictícios)
- `docs/plano/spec.md` (manda em conflito) e `plano.md` · `dist/` gerado (ignorado no git)

## Fluxo de trabalho (economia de token)
1. `/grill-me` → decisões gravadas em `docs/plano/spec.md`. ✅ feito
2. `/superpowers:writing-plans` → `docs/plano/plano.md`. ✅ feito (escrito à mão: o comando não carregou)
3. Nova sessão: `/superpowers:subagent-driven-development` (ou `executing-plans` se o plano for pequeno, < ~5 tarefas).
- Uma sessão por fase; cada fase lê só o arquivo da anterior.
- Não reler arquivos grandes inteiros: usar `grep -n` e ler só o trecho.

## Regras
1. **Segurança operacional primeiro**: nunca enviar/gravar nada sem confirmação; erro ambíguo = parar, não adivinhar; não duplicar ações.
2. **Código-fonte em arquivos pequenos** (`src/`). Se o produto for bookmarklet, o HTML de instalação é **gerado por script de build** — nunca editar código dentro de `javascript:` codificado (lição do rodbot).
3. Dependeu de site externo (Blip, HugMe…)? Pedir ao usuário o **outerHTML** do trecho em vez de supor seletor. Seletores do Blip: só âncoras estáveis (`.contact-list-wrapper article`, `bds-*`, `Chatbot:`); **nunca** classes com hash (`Yv6Nb-…==`, `sc-…`) nem `nth-child`.
4. Testes desde o início; páginas externas são simuladas com Playwright (já instalado no ambiente). Dizer claramente o que **não** foi testado no site real.
5. Nunca colocar dados de clientes, telefones, tokens ou planilhas reais no repositório (fixtures fictícias em `tests/fixtures/`).
