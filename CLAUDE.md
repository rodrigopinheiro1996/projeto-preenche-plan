# projeto-preenche-plan — contexto do projeto

Idioma de código, UI, commits e conversa: **português (pt-BR)**. Autor: Rodrigo Facilidades.

> **Status: em definição.** Objetivo, stack e comandos serão preenchidos após a sessão de `/grill-me`.
> Ao fim de cada fase, atualize este arquivo com o que foi decidido (curto: ele é lido em toda sessão).

## Objetivo
_A definir no grill._ (o que preenche, a partir de onde, onde roda, quem usa)

## Stack e comandos
_A definir._ Registrar aqui os comandos **exatos**: instalar, rodar, testar, lint, build.

## Estrutura
_A definir._ Uma linha por pasta/arquivo importante.

## Fluxo de trabalho (economia de token)
1. `/grill-me` → decisões gravadas em `docs/plano/spec.md`.
2. Nova sessão: `/superpowers:writing-plans` a partir da spec → `docs/plano/plano.md`.
3. Nova sessão: `/superpowers:subagent-driven-development` (ou `executing-plans` se o plano for pequeno, < ~5 tarefas).
- Uma sessão por fase; cada fase lê só o arquivo da anterior.
- Não reler arquivos grandes inteiros: usar `grep -n` e ler só o trecho.

## Regras
1. **Segurança operacional primeiro**: nunca enviar/gravar nada sem confirmação; erro ambíguo = parar, não adivinhar; não duplicar ações.
2. **Código-fonte em arquivos pequenos** (`src/`). Se o produto for bookmarklet, o HTML de instalação é **gerado por script de build** — nunca editar código dentro de `javascript:` codificado (lição do rodbot).
3. Dependeu de site externo (Blip, HugMe…)? Pedir ao usuário o **outerHTML** do trecho em vez de supor seletor.
4. Testes desde o início; páginas externas são simuladas com Playwright (já instalado no ambiente). Dizer claramente o que **não** foi testado no site real.
5. Nunca colocar dados de clientes, telefones, tokens ou planilhas reais no repositório (fixtures fictícias em `tests/fixtures/`).
