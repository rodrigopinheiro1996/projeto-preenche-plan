# projeto-preenche-plan — contexto do projeto

Idioma de código, UI, commits e conversa: **português (pt-BR)**. Autor: Rodrigo Facilidades.

> **Status: spec (`docs/plano/spec.md`) e plano (`docs/plano/plano.md`, tarefas 0–13) prontos.** Próximo passo:
> nova sessão executando o plano (`/superpowers:subagent-driven-development`; se o plugin não carregar, tarefa a
> tarefa: teste → implementa → commit). Nada foi construído ainda.
> Ao fim de cada fase, atualize este arquivo com o que foi decidido (curto: ele é lido em toda sessão).

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
JavaScript puro (ES modules, sem dependência de runtime) + build `esbuild` + testes `node --test` + Playwright.
Comandos (definidos no plano; só existirão após a Tarefa 0): `npm install` · `npm test` (unit) · `npm run e2e` ·
`npm run build` (→ `dist/instalar.html`) · `npm run check` (tudo) · `python3 scripts/gerar-fixtures.py`.
Ambiente: `import 'playwright'` em ESM falha → usar `createRequire` (`tests/helpers/playwright.js`);
`@playwright/test` não resolve → `node:test` + `playwright` puro; validar xlsx/zip com `unzip -t` e openpyxl.

## Estrutura
- `docs/plano/spec.md` — spec do grill (fonte para o plano).
- `docs/plano/plano.md` — plano de tarefas 0–13 com testes e tabela de rastreabilidade.
- `src/` — (a criar) módulos pequenos; só `src/blip.js` conhece o DOM/seletores do Blip.
- `tests/fixtures/` — (a criar) planilhas e páginas Blip **fictícias**.
- `dist/` — gerado pelo build (ignorado no git).

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
