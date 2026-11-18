# Spec — preenche-plan (bookmarklet Blip → planilha xlsx)

Resultado do `/grill-me` (2 rodadas, 2026-11-18). Esta spec é a **única fonte** para a fase seguinte
(`/superpowers:writing-plans`). Não contém dados reais; os exemplos são fictícios.
Termos: **bm** = bookmarklet; **BM** (usuário) = quem opera o Blip.

## 1. Objetivo

Bookmarklet que roda na tela **Mensagens ativas** do Blip Desk (`https://<tenant>.desk.blip.ai/activeMessage`,
Edge/Chrome) e **preenche uma planilha .xlsx** com o status que o Blip mostra para cada cliente que o BM
contactou por mensagem ativa: **`Falha`, `Enviada`, `Entregue`, `Lida`**.

- Para cada card da fila, o bm descobre o telefone (aba **Contato** do cliente), procura a linha na planilha e
  grava o status numa coluna escolhida no painel (padrão: **`Retorno`**).
- O bm **só lê** o Blip. Nunca envia mensagem. Grava somente numa **cópia** da planilha, baixada ao final.

## 2. Fluxo do usuário

1. Abre Mensagens ativas no Blip e clica no favorito (bm) → abre o **painel** do bm.
2. No painel: escolhe o .xlsx (seletor de arquivo), a coluna de destino, a campanha, quantos clientes verificar
   e as opções ("sobrescrever existentes", desmarcada).
3. O bm mostra **quantos cards achou / vai verificar** e pede confirmação. Só então começa.
4. Para cada cliente: clica no card → clica na aba **Contato** → lê Id/Nome/Telefone → cruza com a planilha.
5. Em dúvida de nome (ver §6.6) **pausa** e pede decisão ao BM; depois segue até o fim.
6. No fim: baixa `<nome>_retorno.xlsx` e mostra o **relatório** no painel (copiável).

## 3. Planilha (formato real, sem dados)

- Aba `AÇÃO`. Cabeçalhos: `Id Origem | Nome | CPF/CNPJ | Motivo Mãe | Telefones | Lote` e, na versão já
  trabalhada, `Status` (G: Novo/Respondido/Fechado/#N/A — **não tocar**; é coluna da planilha, não do bm) e `Retorno` (H, vazia).
- `Telefones`: 1 número de 11 dígitos por célula, gravado como **número** (ex.: `71900000001`). Podem existir
  células com mais de um número → casar por qualquer um (separar por `;` `/` espaço).
- Se a coluna de destino não existir (ex.: arquivo só até `Lote`), cria `Retorno` na próxima coluna vazia.
- O painel detecta as colunas **Nome** e **Telefones** pelo cabeçalho e deixa o BM trocá-las por seletor.
- Edição do arquivo: abrir o zip com `DecompressionStream('deflate-raw')`, alterar **só** as células da coluna
  de destino no XML da aba (`t="inlineStr"`, sem mexer em sharedStrings), regravar o zip
  (`CompressionStream` + CRC32) e baixar a cópia. **Sem SheetJS** (pesado e perde formatação). O original não muda.

## 4. Blip — fatos do DOM (coletados no site real; selecionar só por âncoras estáveis)

Classes com hash (`Yv6Nb-…==`, `sc-…`, `nth-child`) **mudam a cada deploy: não usar**.

**Lista (esquerda)**
- Cards: `.contact-list-wrapper article`. Container rolável: `.thin-scrollbar`.
- `article.innerText` em linhas: `[título, horário, campanha, "Chatbot:", nome do chatbot, selo]`
  → título = linha 0, campanha = linha 2, **selo = última linha** (também em `bds-chip-tag`).
- Selos vistos: `Lida`, `Falha`, `Enviada`, `Entregue`. Ordem: **mais recente no topo**.
- Horários: `12:36 PM`, `19 hours`, `2 days`. Mensagens somem após ~72 h.
- Medido: 60 cards antes e depois de rolar até o fim → **sem paginação por rolagem** nessa lista; ainda assim
  confirmar por contagem estável antes de começar.
- Duas campanhas misturadas: `acao_reclameaqui` e `camapanha_ativo_ra` (sic). Os cards de 2 dias têm um
  ícone extra de relógio (`ticket-info-icon`).
- Cliente que **responde** vira ticket e **sai** de Mensagens ativas; mensagem **expirada** também sai.
  (O dashboard "Status geral" soma mais mensagens que os cards da lista por isso.)
- **O título do card nem sempre é nome**: pode ser telefone (`+55 (21) 90000-0000`), só emoji, letras
  decoradas (Unicode matemático, ex. Fraktur), ter apelido entre parênteses ou espaço no fim.

**Seleção do cliente / aba Contato**
- `card.click()` programático **seleciona** o cliente (comprovado).
- Abas: `document.querySelector('bds-tab-group.contact-info-header-wrapper').shadowRoot
  .querySelectorAll('div.tab_group__header__itens__item')` → índice 0 = Envios, **índice 1 = Contato**.
  Voltam para Envios a cada novo cliente (relato do BM) → clicar em Contato **sempre**.
- Painel Informações (luz do DOM, sem shadow): `bds-typo` com texto `Informações`; rótulos =
  `bds-typo[variant="fs-12"]`, valor = `nextElementSibling.querySelector('bds-typo')`.
  Campos: `Id`, `Nome`, `Telefone`. Ignorar o rótulo `Copiar` (botão).
- Formas de Id: `5571900000001@wa.gw.msging.net` (WhatsApp: traz o número com `55`) e
  `<uuid>@tunnel.msging.net` (**sem telefone**; painel só com Id e Nome → cai no fallback por nome).
- Telefone aparece como `+55 (71) 90000-0001` → normalizar para `71900000001`.
- O painel do cliente já estava atualizado ~120 ms após o clique, mas o teste real usou o mesmo cliente já
  selecionado: **a troca entre clientes diferentes NÃO foi medida** (ver Pendências). Por isso a proteção §6.4.
- O seletor `.contact-thread-message-header-wrapper bds-typo` do cabeçalho **não é confiável** (retornou um
  tooltip em vez do nome). Validar pelo `Nome` do painel, não pelo cabeçalho.
- Botões que o bm **nunca** pode clicar: `Enviar`, `Enviar nova mensagem`, `Atualizar` e qualquer outro.
  Só se clica em: **card** e **aba Contato**.

## 5. Normalização e busca

- **Telefone**: só dígitos; remove `55` inicial se sobrar 12–13 dígitos; compara os **11 dígitos**
  (`71981825172`). Segunda tentativa se algum lado tiver 10 dígitos: **DDD + últimos 8**.
- **Nome**: NFKD + minúsculas + sem acento/emoji/símbolo (converte letras decoradas: `ℜ𝔬𝔰𝔢𝔞𝔫𝔢`→`roseane`);
  tokens só de letras. Menos de 2 letras úteis = "sem nome utilizável".

## 6. Decisões

1. **Arquivo**: seletor de arquivo; baixa **cópia** preenchida; edita só o XML das células; sem SheetJS.
2. **Coluna de destino**: seletor com os cabeçalhos; padrão `Retorno`; se não existir, cria na próxima vazia.
3. **Origem do telefone (ordem)**: o bm **sempre clica no card e abre a aba Contato primeiro** (não pula o
   clique, mesmo se o título parecer telefone). Depois: (1) campo **Telefone**; (2) **Id** `…@wa.gw.msging.net`
   (sem `55` e sem `@…`); (3) **título** do card se for telefone; (4) **nome** (Nome do painel; se vazio, o
   título). Telefone × Id divergentes → vale o Telefone e vai aviso ao relatório.
4. **Proteção contra painel velho** (a regra mais importante): só ler o painel quando ele for do cliente
   clicado — `Nome` do painel == título do card, **ou** `Id` mudou em relação ao cliente anterior. Se o título
   for igual ao do cliente anterior, esperar o tempo cheio e sinalizar "possível painel repetido". Espera máx.
   **6 s**, pausa de **400 ms** entre clientes. Estourou o tempo = "informação não apareceu" → tenta o nome.
   Painel com Id sem número (`tunnel`) e sem Telefone = também vai para o nome.
5. **Texto gravado** = o selo exato do Blip (`Falha`/`Enviada`/`Entregue`/`Lida`). Selo desconhecido: grava como
   está, sem adivinhar.
6. **Busca por nome (só quando não há telefone)**:
   - nome completo igual e **1 linha** → aceita;
   - todos os tokens do Blip dentro de um nome da planilha: **1 candidato** → aceita e marca "por nome parcial"
     no relatório; **2+ candidatos** → **PAUSA**: mostra candidatos (nome, telefone, nº da linha) com botões
     *escolher* / *pular (não grava, anota)* / *parar tudo*; depois segue até o fim;
   - texto entre parênteses é ignorado numa 2ª tentativa; nenhum candidato → relatório;
   - "sem nome utilizável" + sem telefone → relatório, **sem pausar**.
7. **Telefone × nome divergentes**: vale o telefone; o caso vira aviso no relatório.
8. **Cliente repetido na fila** (2 envios): vale o **mais recente** (o de cima); o outro vai ao relatório.
9. **Célula já preenchida**: não sobrescreve; caixa "sobrescrever existentes" (padrão desmarcada).
10. **Só se grava o que o Blip mostra** (decisão do BM, revisão do planejamento — **substitui** o antigo
    `Respondido`): preenche primeiro todo cliente com selo claro (`Lida`/`Enviada`/`Falha`/`Entregue`). Todo o
    resto fica **em branco**:
    - linha da planilha **sem card** (saiu da fila, respondeu, expirou, ficou fora do N, execução interrompida):
      **célula em branco**. **Não existe mais `Respondido`**, nem pergunta de confirmação sobre isso;
    - card **sem telefone e sem nome utilizável** (ou com nome só de emoji etc.): é **pulado** — nada gravado,
      **sem pausar**; só entra no relatório como contagem ("pulados: sem telefone/nome");
    - **`N. localizado` foi dispensado**: não vai para a planilha **nem** para o relatório. Card com telefone/nome
      mas sem linha na planilha também não grava nada (e não gera seção própria no relatório);
    - linhas que casaram com card recebem o **selo exato do Blip** (§6.5);
    - a planilha é baixada ao final (ou parcial) só com essas gravações; não acrescenta linhas nem abas.
11. **Filtro de campanha**: campo editável, padrão **`acao_reclameaqui`**; vazio = todas. Cards de outra
    campanha são ignorados e só contados no relatório.
12. **Quantos verificar**: campo "últimos **N** clientes" (vazio = todos). Conta os **N primeiros cards do topo**
    **depois** do filtro de campanha (o topo é o mais recente). Ex.: mandou 50 ontem e 30 hoje → N = 30.
13. **Foto da fila**: antes de começar, rola até a contagem de cards estabilizar e tira uma foto (título,
    campanha, horário, selo). O selo gravado é o da foto. Na hora do clique, reencontra o card por
    título+campanha+horário; se sumiu/mudou, **pula e anota** (não para tudo).
14. **Segurança**: erro ambíguo = parar e mostrar o motivo; confirmação antes de iniciar (mostra contagens);
    botão **Parar**; nunca duplicar ação.
15. **Não perder trabalho**: botão **Baixar parcial** sempre disponível; qualquer parada por erro/pausa longa
    **baixa a parcial automaticamente**. Recarregar a página perde o progresso em memória (o original segue intacto).
16. **Relatório no painel** (copiável): contagens por selo gravado, linhas que ficaram em branco, cards pulados
    (sem telefone/nome, campanha diferente, sumiu), "por nome parcial", divergência Telefone×Id, "possível painel
    repetido", duplicados e células já preenchidas não sobrescritas. **Sem** `Respondido` e **sem** `N. localizado`.

## 7. Stack, estrutura e testes

- JavaScript puro (ES modules), código em arquivos pequenos em `src/`; **build** (`node`) gera
  `dist/instalar.html` com o link `javascript:` para arrastar aos favoritos. **Nunca** editar o `javascript:`
  codificado (lição do rodbot). Sugestão de módulos: `zip` (ler/gravar), `xlsx` (células), `telefone`,
  `nome`, `casar` (regras §6), `blip` (**único** arquivo que conhece o DOM/seletores), `painel` (UI), `main`.
- Testes: unitários das funções puras (telefone, nome, casar, xlsx) + **Playwright** com uma **página falsa do
  Blip** montada a partir dos fatos do §4 (dados fictícios) e planilhas fictícias em `tests/fixtures/`.
  Incluir casos: título telefone/emoji/decorado/apelido, Id `tunnel`, painel velho, duplicado, nome ambíguo,
  célula já preenchida, 10 dígitos, 2 campanhas, execução interrompida (linhas ficam em branco).
- **Não dá para testar sem o site real**: troca real de painel entre clientes, CSP do Blip para `javascript:`,
  `Blob`/download e seletor de arquivo dentro do Blip, lista com 100–200 cards. Dizer isso na entrega e pedir
  ao BM um teste real com 2–3 clientes antes de rodar um lote.

## 8. Pendências (confirmar antes/ao planejar)

- ~~P1~~ **Resolvida**: linha sem card fica em branco (§6.10). Selos aceitos do Blip (confirmados por imagem):
  `Enviada`, `Lida`, `Entregue`, `Falha` — os demais casos recebem exatamente um desses.
- **P2** Troca de painel entre clientes diferentes não foi medida no site real (só o mesmo cliente). A proteção
  §6.4 cobre. **O BM fará o teste real** quando o bm estiver pronto: campo "últimos N" = 2 ou 3, depois conferir
  as linhas à mão contra o Blip antes de rodar o lote.
- **P3** Rodar o snippet de diagnóstico com 3–4 nomes em sequência (inclusive um título telefone) se quiser
  medir o tempo real de troca de painel.
