# projeto-preenche-plan

Bookmarklet que roda na tela **Mensagens ativas** do Blip Desk e preenche uma planilha `.xlsx` (aba `AÇÃO`) com o
status que o Blip mostra para cada cliente: **`Lida` / `Enviada` / `Entregue` / `Falha`**.

- **Só lê o Blip.** Clica apenas em cada card da lista e na aba **Contato**. Nunca em Enviar / Enviar nova mensagem / Atualizar.
- **Nunca altera o original.** Baixa uma cópia `<nome>_retorno.xlsx`; o resto do arquivo (estilos, outras abas, colunas) fica intacto.
- **Só grava o que o Blip mostra.** Linha sem card fica em branco (não existe `Respondido`); card sem telefone/nome utilizável é pulado.
- Cruza cliente × linha pelo **telefone** (aba Contato) e, sem telefone, pelo **nome**; nome ambíguo **pausa** e pergunta.

Detalhes das regras: [`docs/plano/spec.md`](docs/plano/spec.md). Plano de implementação: [`docs/plano/plano.md`](docs/plano/plano.md).

## Instalar

```bash
npm install
npm run build
```

Abra `dist/instalar.html` no navegador e **arraste** o botão "Preenche Plan" para a barra de favoritos
(ou cole o texto da caixa no campo URL de um favorito novo). `dist/` é gerado; **nunca edite o `javascript:` à mão**.

## Usar

1. Abra o Blip Desk em **Mensagens ativas** e clique no favorito: o painel abre no canto da tela.
2. Escolha a planilha, confira as colunas (Nome, Telefones, destino — padrão `Retorno`; se não existir, é criada),
   a campanha (padrão `acao_reclameaqui`, vazio = todas) e "últimos N" (vazio = todos).
3. **Iniciar** → confirme as contagens. Em dúvida de nome o painel pausa: *Escolher* / *Pular* / *Parar tudo*.
4. No fim a cópia é baixada e o relatório aparece no painel (botão *Copiar*). **Parar** e **Baixar parcial**
   estão sempre disponíveis; parar por erro ou pausa longa (120 s) baixa a parcial sozinho.

> **Primeira vez no Blip real:** rode com **N = 2 ou 3** e confira as linhas à mão contra o Blip antes de qualquer lote.

## Testar

```bash
npm test          # unitários (node --test)
npm run e2e       # Playwright contra uma página falsa do Blip (usa dist/bm.js)
npm run check     # unitários + build + e2e
python3 scripts/gerar-fixtures.py   # regera as planilhas fictícias de tests/fixtures/
```

## O que NÃO foi testado no site real do Blip

Tudo foi testado contra uma **página falsa** montada a partir dos fatos do DOM coletados no Blip. Não foi possível validar:

1. **Troca real do painel entre clientes diferentes** (tempo e comportamento; só o mesmo cliente foi medido). A proteção
   contra painel velho (6 s, 400 ms, linha de base) foi testada só com atrasos simulados.
2. **CSP do Blip** para `javascript:` (bookmarklet pode ser bloqueado).
3. **`Blob`/download e seletor de arquivo** dentro da página do Blip.
4. **Lista com 100–200 cards** (medido: 60 cards, sem paginação por rolagem; a rolagem até estabilizar foi testada só em página falsa).
5. **Seletor do selo** (`bds-chip-tag`) e a leitura do texto do card (`innerText`) no site real.
6. **Planilhas reais do Excel** além das geradas pelo openpyxl + XML cru editado (data descriptor, comentário no EOCD,
   notação científica, `sharedStrings`). Fórmulas, mesclagens, tabelas e `ZIP64` não foram exercitados.

Se algum seletor falhar no site real, o bm para com erro e pede o **outerHTML** do trecho (nunca inventa valor).
