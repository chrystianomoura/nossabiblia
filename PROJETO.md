# Nossa Bíblia: especificação do projeto

Este documento descreve a especificação funcional e as decisões técnicas da aplicação **Nossa Bíblia**, um app web pessoal para ler a Bíblia, marcar versículos, acompanhar o progresso de leitura e estudar palavras.

---

## Visão geral

- **Nome oficial:** Nossa Bíblia (escrito separado em qualquer texto; nos identificadores técnicos, como o repositório, o pacote e o projeto no Neon, é `nossabiblia`)
- **Tipo:** aplicação web (funciona no navegador do computador e do celular).
- **Uso:** pessoal. O app é feito para o próprio autor. Se um dia for público, questões de licença das traduções precisam ser revistas.
- **Traduções:** NAA e NVT.
- **Ordem dos livros:** sempre canônica (Gênesis a Apocalipse).
- **Regra central:** a leitura é pública, sem login. Qualquer ação que salve algo exige conta com e-mail verificado.

---

## Leitura (pública)

1. **Leitura da Bíblia:** texto em NAA ou NVT, na ordem canônica, escolhendo a tradução.
2. **Tamanho da letra:** o usuário aumenta ou diminui. A preferência fica salva no navegador.
3. **Navegação:** setas ou gestos de deslize passam para o capítulo seguinte ou anterior.
4. **Continuar de onde parou:** o último capítulo lido fica guardado.
5. **Modo escuro:** disponível em todo o app.
6. **Busca por referência:** digitar "João 3:16" mostra só esse versículo, com correspondência exata. A referência aparece num cartão no topo da busca, antes dos resultados de palavra (implementada em `client/src/lib/reference.js`, com testes).
    - **Formatos:**
        - capítulo: `salmos 23` (mostra o total de versículos e abre o leitor);
        - versículo: `salmos 23 versículo 2`, `salmos 23 v 2`, `salmos 23:2`, `joão 3:16`, `jo 3.16`, `jo 3,16`, `joão 3 16`;
        - intervalo de versículos: `joão 3:16-18`;
        - livros numerados: `1 joão`, `1joão`, `1jo`, `1ª joão`, `I João`, `II Coríntios`, `primeiro João`.

      Pontuação de frase colada ao fim (`joão 3:16.`) é ignorada.
    - **Separador de verdade:** capítulo e versículo precisam de `:`, `.`, `,`, espaço ou `v` entre eles. O número nunca é partido: `salmos 23-25` não vira "Salmos 2:3-25", simplesmente não é reconhecido. Também não são tratados: intervalo de capítulos, lista de versículos (`23:1,3`), versículo parcial (`23:1a`) e intervalo entre capítulos (`3:16-4:2`).
    - **Livro:** pelo nome, por abreviação (`sl`, `mt`, `1co`) ou por prefixo de 3 letras ou mais (`mat` mostra o cartão de Mateus). As abreviações são só as da base (Pv, Fp, Mc...; `pr`, `fl` e `mr` não valem). Abreviação de 1 ou 2 letras só vale com número depois: `os 2` é Oséias 2, mas `os` sozinho é a palavra "os". `jn` é Jonas e `jo` é João, como nas edições em português.
    - **Mais de um livro serve:** aparecem sempre em ordem canônica, o mais antigo primeiro (`jo 3:16` mostra Jó e depois João; `tim` mostra 1 e 2 Timóteo).
    - **Acento:** a mesma regra da busca de palavra, inclusive nos nomes de livros (`joaõ 3:16` não encontra nada).
    - **Sem exceção para livros de um capítulo só:** `judas 5` é o capítulo 5 e a tela diz "Judas tem 1 capítulo" (sem ponto final); `judas 1` abre o capítulo e `judas 1:5`, o versículo.
    - **Validação na tradução escolhida:** NAA e NVT numeram alguns versículos de forma diferente (2 Coríntios 13:14 só existe na NVT). Fora dos limites, a tela informa o que existe ("Salmos tem 150 capítulos", "Salmos 23 tem 6 versículos na NAA", "Esse intervalo de versículos não é válido"), todas **sem ponto final**, como a mensagem "Nenhum resultado para: “…”" (decisão do usuário). Havendo alguma referência válida entre os candidatos (`fil 2`, `jo 3:30`), as inválidas não aparecem.
    - **Referência e palavra:** uma referência com número não dispara busca de palavra. Um livro sem número (`mar`) mostra o livro e, em grupo separado, as ocorrências da palavra.

## Marcações (exige conta verificada)

7. **Marcar versículo:** o usuário escolhe uma de **4 cores** (amarelo, verde, azul e rosa, em tons suaves). A marcação é **por versículo** e vale nas duas traduções: uma por versículo, e a tradução em que foi criada só serve para exibir (decisão de 14/10/2026).
8. ~~**Comentário:**~~ **Removido do projeto em 16/10/2026** (decisão do usuário: a marcação por cor já cobre). O número fica reservado para não mudar a numeração das outras regras.
9. ~~**Pastas:**~~ **Removido do projeto em 16/10/2026** (decisão do usuário: a tela "Marcações" já permite organizar: por data, em ordem canônica e por cor). O número fica reservado.
10. **Ordem:** as marcações aparecem com a mais recente primeiro.

Tela "Marcações" (`/marcacoes`; decidida com o usuário em 16/10/2026, **implementada e aprovada**):

- **Como chegar:** ícone de marcador na barra do leitor (ao lado da lupa) e botão **"Marcações"** na página inicial de quem está logado (o menu "Conta" tem só "Início" e "Sair"). Na própria tela o ícone fica preenchido (ativo): com a página rolada ele sobe suavemente (sem animação para quem pede menos movimento); já no topo, busca a lista de novo (sem recarregar a página). Sem número em lugar nenhum (nem contador no ícone, nem total na tela). Visitante vai ao login e volta; conta não verificada vê "Confirme seu e-mail para ver suas marcações.".
- **Lista:** cartões com o versículo **completo**, pintado como no leitor, com referência, tradução e data relativa ("há 3 horas", "ontem"). Tocar abre o leitor no versículo. 20 por vez, com "Mostrar mais".
- **Ordem:** "Mais recentes" (padrão) ou "Ordem canônica", esta com um título por livro (15 px, cor principal do texto).
- **Filtro de cor:** menu **nativo** ("Todas as cores, Amarelo, Azul, Rosa, Verde"), sem seta; com uma cor escolhida a pílula fica pintada com ela. Combina com a ordem. Sem resultado: "Nenhuma marcação na cor rosa." (com ponto final, decisão do usuário).
- **Tradução:** seletor NAA | NVT ao lado do filtro, igual ao da busca. Vale para a lista inteira e fica no endereço (`?t=`). Ao chegar, vale a tradução do leitor naquele momento (ícone do leitor) ou, vindo da página inicial, a última lida (`nb-last-read`), ou a NAA.
- **Busca:** versículo já marcado mostra uma **bolinha cheia da cor** depois da referência, tanto no resultado de palavra quanto no cartão de referência de versículo (um intervalo mostra uma bolinha por versículo marcado). Cartões de capítulo e de livro não mostram. Só mostra: tocar abre o leitor. O índice das marcações é pedido uma vez ao abrir a busca (`GET /api/bookmarks/index`), só para conta verificada.
- **Leitor:** a paleta mostra as cores em ordem alfabética, sem botão "Remover" (tocar na cor com o certo remove). O fundo da marcação tem 2 px de respiro em cima e embaixo. As marcações chegam **junto** com o texto (o capítulo só entra quando os dois chegaram; as dos capítulos vizinhos são buscadas de antemão; uma nova tentativa silenciosa se falhar, sem aviso).
- **Paleta e teclado (16/10/2026, aprovados):** as bolinhas da paleta são cheias da cor viva (o certo contrasta com ela). Só um versículo entra na ordem do Tab (o último em que o foco esteve) e ↑ ↓ andam entre eles; Enter ou espaço abre a paleta e leva o foco à cor atual; ← → (e Home/End) andam entre as cores, Enter escolhe, Esc fecha, e depois de escolher ou fechar o foco volta ao versículo. ← → dentro da paleta não trocam de capítulo. Cada versículo é anunciado como "Versículo N".
- **Releitura ao voltar para a aba:** depois de mais de 45 s fora da aba ou da janela, o leitor relê as marcações do capítulo aberto e dos vizinhos (só conta verificada; nada acontece enquanto uma marcação sua ainda está sendo salva; só repinta se algo mudou), e a tela "Marcações" relê tudo o que já estava carregado (até 200 itens), em silêncio: se falhar, a lista continua como estava. Ausência curta não pede nada.
- **Barra:** o nome das pílulas "Conta" e "Entrar" sobe 1 px (centro óptico: são quase só letras minúsculas), em todas as larguras; a altura da pílula não muda.

## Favoritos (removido do projeto)

11. ~~**Favoritar versículo**~~ · 12. ~~**Lista única**~~ · 13. ~~**Ordem**~~ — **removidos em 16/10/2026** (decisão do usuário: a marcação por cor já cobre). Os números ficam reservados, para não mudar a numeração das outras regras. A tabela `favorites` foi apagada do banco (migração 005), e a tabela `bookmark_folders` e a coluna `bookmarks.folder_id` também (migração 006: as pastas saíram junto).

## Compartilhamento (público)

14. **Compartilhar texto:** o usuário compartilha um versículo ou um capítulo como texto, com a referência e a tradução embaixo. Exemplo: "Salmos 23:1 (NVT)".

## Comparação de traduções (pública)

15. **Lado a lado:** NAA e NVT em colunas.
16. **Modo por versículo:** cada versículo mostra logo abaixo o correspondente na outra tradução.
17. **Versículos ausentes:** quando uma passagem tem numeração diferente nas duas traduções, cada uma mostra só o que existe nela.

## Temas e versículo do dia (removidos do projeto)

18. ~~**Carrosséis de leitura**~~ · 19. ~~**Versículo do dia por tema**~~ · 20. ~~**Limite diário**~~ — **removidos em 16/10/2026** (decisão do usuário). Os números ficam reservados, para não mudar a numeração das outras regras. As tabelas `daily_verses`, `theme_verses` e `themes` foram apagadas do banco (migração 007) e a rota `GET /api/daily-verse` deixou de existir.

## Busca de palavra (pública)

21. **Busca exata:** procura uma palavra (ou frase) dentro da tradução escolhida. As regras estão implementadas em `server/search.js` e cobertas por testes e pela bateria de precisão:
    - **Palavra inteira, sem stemming:** "sol" nunca encontra "solo" nem "solos".
    - **Maiúsculas e minúsculas são iguais:** `Sol`, `SOL` e `sOl` valem o mesmo.
    - **Acento, palavra por palavra:** sem acento vale qualquer forma (`joao` encontra "João"); com acento, ele precisa estar certo e completo. `joaõ` (til na letra errada) não encontra nada, e `orfã` não encontra "órfã", porque falta o acento do "ó". Não há tentativa automática de "corrigir" o acento.
    - **Mais de uma palavra é a sequência exata:** juntas e na ordem digitada (a pontuação entre elas é ignorada). "luz trevas" não existe nos textos e não retorna nada.
    - **Palavra com hífen é uma palavra só:** "disse" não encontra "disse-lhes"; quem procura "disse-lhes" digita completo.
    - **Número com ponto ou vírgula entre dígitos é uma palavra só** (só a NVT tem algarismos): `3.700` encontra "3.700" (1 Crônicas 12:27), mas `700` não encontra dentro de "3.700" e `273` não encontra dentro de "22.273". Quem procura o número digita como está escrito.
    - **Tamanho:** até 600 caracteres e 100 termos, o que cobre o maior versículo (NAA Ester 8:9: 508 caracteres e 95 termos; NVT Josué 8:33: 483 e 86). Dá para colar um versículo inteiro. Uma busca maior que qualquer versículo não casa com nada e responde "nenhum resultado" (não é erro).
    - **Sem resultado:** a tela mostra apenas "Nenhum resultado para: “…”", com o que foi digitado em negrito. Não há sugestão nem correção automática.
22. **Ordem:** resultados sempre na ordem canônica. Não há ordenação cronológica. A lista é paginada, de 50 em 50 versículos ("Mostrar mais").
23. **Contagem:** número exato de **ocorrências** da palavra (ou da frase) na tradução escolhida, isto é, cada vez que ela aparece inteira, sem hífen colado. É mostrado com o total de versículos ("4.664 ocorrências em 4.085 versículos"), e cada versículo com a palavra repetida indica a quantidade ("2×") e tem todas as repetições destacadas.
24. **Filtros:** restrição ao Antigo ou ao Novo Testamento, ou a um livro específico. Implementados (API e tela). O filtro só **recorta** a busca de palavra: não muda as regras (itens 21 e 23), o destaque nem a contagem, que passa a ser a do recorte ("1.405 ocorrências em 1.226 versículos" dentro do Novo Testamento).
    - **Onde:** um botão com o ícone de funil, ao lado do botão NAA/NVT da busca, abre um painel dentro do modal.
    - **Padrão:** Toda a Bíblia. Sem tocar em nada o comportamento é idêntico ao de antes (o filtro é opt-in) e ele **zera ao fechar o modal**, para ninguém achar que uma palavra "não existe" por ter esquecido o filtro ligado.
    - **Seletor** "Toda a Bíblia | Antigo | Novo": uma pílula única desliza até a opção marcada (0,25 s; sem animação se o sistema pede movimento reduzido). Ao escolher um livro, nenhuma opção fica marcada e a pílula some.
    - **Campo de livro:** lista curta de 5 linhas (o resto rola), com "Todos os livros" como primeira linha. Digitar filtra a lista sem exigir acento (`salm`, `1 jo`); ↑ ↓ e Enter funcionam; o destaque do mouse some quando ele sai da linha, e o do teclado só existe depois de usar as setas. Ao clicar num livro a lista reabre na mesma posição de rolagem (só vale se for a mesma lista; escolhido digitando, ela reabre no livro). Clicar no campo com a lista aberta a fecha.
    - **Escolher um livro sobrepõe o testamento** (e escolher um testamento zera o livro): a tela nunca monta um conflito. Com Antigo ou Novo marcado, a lista de livros traz só os livros daquele testamento.
    - **Lembrete de que há filtro:** uma etiqueta sob a barra ("Novo Testamento ✕", "Salmos ✕", que ao clicar tira o filtro) e o botão do funil pintado (escuro no tema claro e claro no escuro; **não há bolinha**). Os dois valem com o painel aberto ou fechado.
    - **Só busca de palavra:** referências (`salmos 23`, `joão 3:16`) e cartões de livro **ignoram** o filtro; são endereços, não buscas.
    - **Acompanham o recorte:** a contagem, o "Mostrar mais" (que traz só itens do recorte; trocar o filtro reinicia a lista) e a troca NAA/NVT (mantém o filtro). Os ids dos livros são os mesmos nas duas traduções.
    - **Sem resultado dentro de um filtro:** `Nenhum resultado para: “sol” em Salmos` (o recorte entra na mensagem, com o mesmo formato do item 21).
    - **Teclado:** Esc fecha em camadas (lista de livros, painel, modal); Tab nunca sai do diálogo; o anel de foco do campo de livro só aparece para quem navega por teclado.
    - **API:** `GET /api/search?q=...&testament=AT|NT&book_id=1..66`. Testamento e livro em conflito dão zero resultados; testamento aceita qualquer caixa; filtros vazios são ignorados. Valores inválidos dão **400**, nunca 500 nem filtro ignorado em silêncio: `book_id` só aceita dígitos (recusa `abc`, `1.5`, `-1`, `1e1`, `0x10`, ` 5`, `1,2`; `007` vale 7) e vai de 1 a 66; `testament` só `AT` ou `NT`.

## Página inicial

Quem **não** está logado vê a apresentação (título, subtítulo, os cartões de benefícios e a Bíblia de amostra). Quem está logado vê a **tela pessoal** abaixo (decidida com o usuário em 16/10/2026; a Bíblia de amostra, o título e o subtítulo não aparecem):

25. ~~Versículo do dia~~ — removido do projeto (ver "Temas e versículo do dia").
26. ~~Sessões de temas~~ — removidas do projeto.
27. **Botão principal "Continuar a leitura"** (ou "Começar a leitura" se a pessoa nunca leu): abre a Bíblia no último texto lido, e mostra embaixo onde parou ("Salmos 23 · NAA").
28. **Linha de progresso dos últimos 7 dias** (ver "Progresso").

Composição, de cima para baixo, **no meio da tela**: a **saudação** ("Bom dia", "Boa tarde" ou "Boa noite", vírgula e o primeiro nome), um **cartão único** com o progresso (a semana; tocar abre o quadro do ano), o botão de **leitura** e, por último, **"Marcações"**. A saudação segue a hora do aparelho; **não existe norma oficial** (nem da Academia Brasileira de Letras, nem do Manual de Redação da Presidência: é costume): "bom dia" das 5 h até 11:59, "boa tarde" das 12 h até 17:59 e "boa noite" das 18 h até 4:59 (a madrugada segue "boa noite"). Conta não verificada vê "Confirme seu e-mail para acompanhar seu progresso." no lugar da semana.

## Atalho para a Bíblia

29. O botão principal abre a Bíblia no último texto lido.
30. Se o usuário chegar à leitura pela busca, abre o texto pesquisado.

## Navegação entre abas

31. A aba "Marcações" fica sempre visível, com nomes curtos, ícones e cores próprias, para serem identificadas à primeira vista.

## Progresso (exige conta verificada)

32. **Positivo:** um por dia, ganho na primeira vez que uma tela com texto da Bíblia carrega para o usuário: leitura, marcações, resultados da busca (e comparação, quando existir). **A tela inicial não conta**, porque não mostra texto bíblico (decisão de 16/10/2026).
33. **Sem exigência:** basta a tela carregar. Não há tempo mínimo de leitura nem necessidade de avançar.
34. **Reset:** o dia é contado pelo horário de São Paulo, com reset à meia-noite, independentemente do fuso do usuário.
35. **Linha de 7 dias** (a semana é um cartão que se ajusta ao número de dias, de 1 a 7; o título "Progresso diário" define a largura mínima): um círculo por dia, com 42 px (36 px no celular) e 14 px entre eles. Todos os rótulos ficam em negrito, na cor principal do texto. **Verde** com ✓ para dia com positivo, **vermelho** com X para dia passado sem positivo, círculo tracejado para o dia atual sem positivo ainda. **No dia de hoje o rótulo é "Hoje"** (e não o dia da semana), sem borda no círculo. **O dia de abertura da conta conta como lido** (verde com ✓, mesmo sem leitura; a data da abertura aparece como referência no calendário). Dias futuros não aparecem, **nem os anteriores à abertura da conta** (uma conta de 3 dias mostra 4 círculos). Sem número de dias seguidos. Embaixo, centralizado, o texto "ver o ano" (branco e sublinhado, sem seta) abre o quadro anual; o cartão é centralizado e sem anel de foco amarelo. A semana começa a carregar junto com a sessão (sem esperar o `/api/me`) e o servidor a calcula em uma consulta só.
36. **Quadro anual: calendário de um mês por vez** (decisão do usuário em 16/10/2026, depois de testar o círculo, o gráfico estilo GitHub e outras propostas). Ao tocar no progresso abre uma janela com **o calendário comum no meio**: título "Seu ano de leitura" e "Conta aberta em ..." centralizados, setas para os meses anteriores e seguintes (de hoje para trás, até o mês da abertura; não há mês depois de hoje), os dias da semana (D S T Q Q S S) e **todos os dias do mês**. A divisão entre os dias é uma linha de 2 px **na cor do fundo do cartão** (separa qualquer cor de dia, nos dois temas; uma linha cinza translúcida sumia sobre o verde e o vermelho). **Cada quadrado é inteiro de uma cor só**, sem borda nem anel: **verde** se a pessoa leu (o dia da abertura sempre é verde) e **vermelho** se não leu. Todos os números têm a mesma letra (sem negrito para hoje). Os dias antes da abertura e depois de hoje aparecem **sem cor de leitura, só com o número**, grande e legível, num fundo suave. Legenda de dois itens (leu, não leu), com o texto na cor principal, e nenhum número de contagem. Fecha com o X, o Esc ou um toque fora (fundo da página desfocado); o foco entra no X e volta ao cartão. Cada dia é uma célula de uma grade para leitor de tela ("16 de outubro: você leu"). Cores: `--day-read`, `--day-miss` e `--day-on-read` (texto sobre o verde: branco no claro, escuro no escuro, por contraste).

## Conta

37. **Cadastro:** nome, sobrenome, e-mail digitado duas vezes e senha digitada duas vezes.
    - **Identificação humana:** o sistema não utiliza arrobas (`@usuario`) nem redes sociais; apenas o nome e sobrenome do usuário.
    - **Nomes compostos:** a divisão em dois campos explícitos (*Nome* e *Sobrenome*) permite que pessoas com nomes compostos (ex.: *Maria Laura*, *João Pedro*) preencham o primeiro campo livremente, garantindo que o app e os e-mails usem a saudação correta (*"Olá, Maria Laura"*).
    - **Validação de veracidade:** validação dupla (no front-end para feedback instantâneo ao usuário e no back-end para garantia de segurança e integridade). Textos vazios, espaços excessivos ou nomes puramente numéricos são rejeitados.
38. **Conta não verificada:** fica nesse estado até o e-mail ser confirmado. Um aviso fixo e chamativo pede a confirmação em qualquer tela logada. Marcações, progresso e exportação ficam bloqueados. Leitura, busca, comparação e compartilhamento continuam livres.
39. **Reenvio da confirmação:** uma vez. Depois, bloqueado por 12 horas, contadas a partir do último envio.
40. **Correção do e-mail:** permitida enquanto a conta não estiver verificada, com a mesma regra de reenvio.
41. **Prazo de 7 dias:** conta não verificada que não for confirmada em 7 dias é apagada, com tudo relacionado a ela. Sem aviso prévio e sem bloqueio do e-mail, que pode se cadastrar de novo.
42. **Data de abertura:** dia da confirmação do e-mail. Fica registrada para sempre, salvo exclusão da conta.
43. **Recuperação de senha:** por e-mail.
44. **Encerrar sessões:** o usuário sai de todos os dispositivos de uma vez.
45. **Exportação:** todos os dados da conta, com a data de cada marcação.
46. **Exclusão:** apaga a conta e todos os dados. Irreversível. Vale também para conta não verificada.
47. **Bloqueio de e-mail:** após a exclusão de conta verificada, o endereço fica bloqueado por 30 dias. Só o hash do e-mail é guardado para isso. Depois desse prazo, um novo cadastro gera nova data de abertura.

## Interface da busca (decisões de tela)

Decididas com o usuário, vendo cada uma renderizada:

- **Sem balões de dica** (`title`) nos botões da barra de busca: o botão do funil e o NAA/NVT só têm `aria-label`, para leitor de tela. Foi testado um aviso próprio, mais rápido que o do navegador, e o usuário preferiu nenhum.
- **Falha de rede:** a mensagem "Não foi possível buscar agora. Verifique a conexão e tente de novo." traz o botão **Tentar de novo**, que refaz a mesma busca com a mesma tradução e o mesmo filtro (sem ele, repetir o mesmo texto não refazia a requisição). O "Mostrar mais" tem o seu próprio botão de nova tentativa, e a lista já carregada continua.
- **Selo "2×"** (versículo com a palavra repetida): no tema claro ganhou fundo dourado mais marcado e texto escuro (contraste 5,9:1; antes 3,8:1, abaixo do mínimo de 4,5:1); no tema escuro nada mudou.
- **Acessibilidade medida:** Tab e Shift+Tab nunca saem do diálogo; contraste mínimo de 4,5:1 nos textos; alvos de toque de 30 px ou mais (o mínimo da norma é 24 px; 44 px é o recomendado para toque, e não foi adotado); sem rolagem lateral de 320 a 1920 px; zoom de 200% e fonte grande sem quebrar.

## Interface do leitor (decisões de tela)

Decididas com o usuário, vendo o resultado na tela:

- **Um cartão para todos os aparelhos.** O texto rola dentro do cartão e a página não rola. A coluna de leitura tem largura máxima de 760 px (o cartão se ajusta a ela) e o cartão fica centralizado no espaço abaixo do cabeçalho.
- **Setas de capítulo:** nos lados do cartão; em telas de até 800 px, abaixo dele, centralizadas. Setas e gesto de deslizar também passam ao livro seguinte ou anterior.
- **Um parágrafo por versículo, sem recuo:** o versículo começa na linha da borda esquerda da pílula do livro e as linhas seguintes voltam a ela; o número é um sobrescrito pequeno e dourado no começo do texto (alinhado a essa linha, medido pelos pixels). Sem mensagem de fim de capítulo e sem sublinhado no título. O cartão é estreito, com respiro de 24 px (20 px no tablet, 14 px no celular) e o texto e a barra têm a mesma largura.
- **Três tamanhos de letra:** 19, 21 (padrão) e 23 px. Quem tinha outro tamanho salvo passa ao mais próximo. **Trocar a letra não faz perder o lugar:** o leitor guarda o versículo do topo (e a fração dele que já passou) e volta a ele depois da troca. Medido em Salmos 119: o v100 continua no topo com A+ e A-, no desktop e no celular.
- **Mudar a largura da janela não faz perder o lugar** (arrastar a borda, girar o celular): o leitor volta ao versículo do topo e à fração dele, como na troca da letra; mudar só a altura (barras do navegador) não mexe no texto.
- **Sem piscar:** ao trocar de capítulo o texto anterior fica até o novo chegar; o capítulo vizinho e a outra tradução são pré-carregados.
- **Posição lembrada** no histórico do navegador (F5, Voltar e Avançar), sem mexer na URL; `?v=` leva ao versículo (um terço abaixo do topo). A última leitura fica em `nb-last-read` no navegador (sem uso na tela por enquanto).
- **Seletor de livro e capítulo:** busca no topo (campo alinhado à esquerda, sem anel branco, cursor na cor do "Buscar livro"; o campo **não** recebe foco ao abrir, então o cursor só aparece depois do clique); livros à esquerda e capítulos à direita, com título do livro centralizado sobre a grade e só um respiro de 6 px sob a busca. Ao abrir pela primeira vez, o livro atual e o capítulo atual ficam no centro das listas; **ao reabrir, a lista de livros volta à rolagem em que ficou** (se o livro que você deixou marcado é o que está sendo lido; senão, centraliza o atual). Escolher outro livro **não** mexe na rolagem da lista. Sem barras de rolagem à vista. No celular o painel cabe dentro do cartão.
- **Nome na tela:** "Lamentações de Jeremias" aparece como "Lamentações" (o banco e a URL não mudam).
- Um modelo anterior, em páginas viradas como um livro, foi descartado; o código dele ficou guardado fora do projeto.

## Página inicial: Bíblia de amostra e botões em telas pequenas

- **Duas páginas só no desktop:** o livro aberto da home mostra duas páginas lado a lado na tela única do desktop (1070 px ou mais), com a letra pequena da amostra (12,5 a 14,5 px) para o livro caber na altura. Abaixo de 1070 px ele tem **uma página só**, sem o vão entre elas, na mesma letra do subtítulo (19 px, entrelinha 1,6) e com o título do capítulo em 26 px; duas páginas com essa letra ficariam estreitas demais (~22 caracteres por linha).
- **Botões "Criar Conta Gratuita" e "Começar a Ler Agora":** o mesmo tamanho em todos os aparelhos (235 px, só o conteúdo, centralizados), nunca esticados até as bordas. Com as colunas empilhadas, o vão do primeiro botão para o cartão é igual ao de cima do botão (18 px).
- **Letras padronizadas abaixo do desktop (1070 px):** o subtítulo (19 px) é a régua. Título da página 36 px, título do capítulo no livro 26 px, texto da Bíblia 19 px, descrição dos cartões 17 px, títulos dos cartões e botões 15 px, seletor NAA/NVT 14 px. No desktop os valores seguem proporcionais à coluna.
- **Ponto de quebra único em 1070 px:** é a largura em que o livro deixa de caber em duas páginas; abaixo dela a página inteira vira coluna única, como no celular (nunca duas colunas com o livro em uma só).
- **Cartões "Marcações", "Progresso diário", "Leitura sem distrações":** todos com a largura do maior e centralizados. Até 640 px (onde a descrição mais longa deixa de caber em uma linha, ~615 px, com folga) o conteúdo empilha: ícone em cima, título e descrição centralizados. O ícone é só um contorno dourado (sem preenchimento), porque o dourado translúcido virava oliva sujo sobre o cartão azul do tema escuro.
- **Cabeçalho em linha única até 320 px:** abaixo de 520 px a marca (selo e nome) e os botões encolhem com a largura da tela e nunca quebram linha.

## Navegadores de celular: barras, teclado e entalhe

- **A página não rola; quem rola é o `#root`.** `html` e `body` ficam parados, para as barras do navegador permanecerem à mostra (elas só recolhem quando a página inteira rola). Consequências: o modal da busca trava o `#root` (não o `body`); ao trocar de tela (início, leitor) o `#root` volta ao topo; os testes de tela olham o `#root`, não o `window`. Em contrapartida, tocar na barra de status não volta ao topo.
- **Alturas:** fundo, home e leitor usam `svh` (altura com as barras visíveis, que não muda); só o cartão de leitura e o modal da busca usam `dvh`, para ocupar a área visível.
- **Entalhe (celular deitado):** as margens laterais usam `--safe-x`, o maior valor entre as áreas seguras da esquerda e da direita, nos dois lados; senão o conteúdo ficava deslocado para o lado oposto ao entalhe.
- **Celular deitado (altura até 500 px):** o cartão do leitor se ajusta à altura visível (mínimo de 110 px de texto) e o modal da busca começa a 14 px do topo e termina a 14 px da base, com a altura que sobra com o teclado aberto.
- **Aparelhos de toque (`hover: none`):** nenhum estilo de hover vale em toque (ficava preso depois do toque); a busca tem fundo sólido na cor do tema, sem desfoque e sem sombra, e a página de trás fica invisível enquanto ela está aberta (o iOS muda a altura da janela com atraso ao subir e baixar o teclado, e a página de trás aparecia por instantes). No celular o modal da busca usa a tela até o fim (menos as margens).
- **Sem barra de rolagem abaixo de 1070 px**, em todas as áreas (rola normalmente por toque, roda e teclado).
- **Leitor:** trocar NAA/NVT mantém o versículo do topo (e a fração dele) e o destaque do `?v=`; setas e busca de outro lugar descartam o destaque. O fundo atrás do leitor é liso (a rolagem elástica do iOS não mostra o degradê da home).

## Regras transversais

- **Fuso horário:** toda regra de dia (positivo, limite diário, reset) usa o horário de São Paulo.
- **Dados mínimos:** o app guarda só o necessário. O único dado mantido após a exclusão é o hash do e-mail, pelo prazo de bloqueio.
- **Sem notificações:** o app não envia lembretes. Os únicos e-mails são os de cadastro, confirmação, recuperação de senha e reenvio.
- **Sem sincronização sem conta:** dados locais (preferências de letra e tema, último capítulo lido) ficam no navegador e não se sincronizam entre dispositivos sem conta.

## Fora de escopo

Estes itens não entram no projeto, nem agora nem no futuro previsto:

- Busca em ordem cronológica.
- Tags nas marcações.
- Lembretes e notificações.
- Recursos de inteligência artificial.
- Imagens de card para compartilhamento.
- Comentários públicos, perfis ou rede social.
- Comentários nas marcações, favoritos e pastas (removidos do projeto em 16/10/2026: a marcação por cor e a tela "Marcações" já cobrem).
- Temas e versículo do dia (removidos do projeto em 16/10/2026).

---

## Decisões técnicas

> Esta seção registra as decisões de arquitetura e infraestrutura tomadas após o fechamento da especificação funcional.

### Fonte do texto bíblico

- **Repositório:** [damarals/biblias](https://github.com/damarals/biblias)
- **Traduções:** NAA e NVT
- **Formato escolhido:** JSON (`NAA.json` e `NVT.json`)
- **Motivo:** o JSON é o formato mais adequado para importação em banco próprio. Permite escrever um script de importação que popula o esquema projetado pelo autor, sem herdar a estrutura de terceiros. Os arquivos SQLite do repositório foram descartados por trazerem o esquema de outro projeto. O XML foi descartado por ser voltado a softwares de apresentação (OpenLP, Quelea).
- **Processo:** download único dos arquivos e importação via script. O texto bíblico é dado estático no banco. Os arquivos continuam no repositório: são a fonte do texto da home (`npm run sample`) e do gabarito da bateria de precisão.

#### Diagnóstico e validação dos arquivos JSON

Os arquivos `NAA.json` e `NVT.json` foram inspecionados e validados:
- **Estrutura:** array raiz contendo os 66 livros canônicos com chaves `name` (nome), `abbrev` (abreviação) e `chapters` (matriz bidimensional `chapters[capitulo][versiculo]`).
- **Limpeza do texto:** sem tags HTML nem entidades corrompidas. A inspeção inicial, porém, não percebeu duas sujeiras invisíveis na NVT (hífen invisível e acento desmontado), descobertas depois e corrigidas no banco (ver "Qualidade dos dados"). A NVT também tem algarismos em 853 versículos; a NAA escreve os números por extenso.
- **Consistência de livros:** os nomes e abreviações dos 66 livros canônicos coincidem de forma idêntica entre NAA e NVT.
- **Capítulos:** 1.189 capítulos idênticos em ambas as versões.
- **Versículos:** 31.105 versículos na NAA e 31.102 na NVT. A variação de 3 versículos decorre de diferenças históricas de versificação da crítica textual em 14 capítulos específicos (ex.: 2 Coríntios 13 possui 13 versículos na NAA e 14 na NVT, onde as saudações finais foram agrupadas ou separadas).
- **Decisão arquitetural de modelagem:** para manter integridade canônica e desacoplamento, cada versículo terá seu próprio registro em tabela normalizada com indicação explícita da tradução (`book_id`, `chapter`, `verse`, `translation`, `text`), sem vincular as traduções em colunas paralelas na mesma linha.

### Banco de dados

- **Sistema:** PostgreSQL 18 (Neon, locale `C.UTF-8`)
- **Motivo:** banco relacional mais completo do mercado open-source. Suporte nativo a busca de texto com `tsvector` e índice `GIN` (dicionário `simple`, sem stemming, porque a busca é exata: ver item 21). Transações, constraints e tipos de dado precisos para as regras de negócio do projeto. Amplamente usado em produção, o aprendizado tem valor duradouro.
- **Autenticação:** implementada do zero no backend, sem uso de serviços gerenciados de auth. Decisão consciente com o objetivo de aprender o ciclo completo de autenticação, mesmo que implique mais tempo de desenvolvimento.
- **Campos de perfil do usuário:** colunas `first_name` (VARCHAR(100)) e `last_name` (VARCHAR(100)) na tabela `users`. Saudações na interface e e-mails utilizam `first_name`. Validação e sanitização (trim, rejeição de números puros) aplicadas no backend antes da inserção.

### Busca exata

- **Dois estágios.** O índice GIN (`to_tsvector('simple', immutable_unaccent(text))`, coluna gerada `search_vector`) só escolhe **candidatos**: ignora acento e quebra palavra com hífen em partes, então nunca deixa um acerto de fora. Quem decide é uma conferência no texto (`regexp_count(lower(texto), padrão)`), que aplica as regras do item 21 e conta as ocorrências. Assim, lista e contagem nunca divergem.
- **Sem stemming, de propósito.** O dicionário `portuguese` do PostgreSQL reduz "solo" a "sol": medido, a busca por "solo" devolveria os mesmos 186 versículos de "sol", contra 12 da busca exata. A busca exata exige o dicionário `simple`.
- **Uma só definição das regras.** `server/search.js` gera o mesmo padrão para o PostgreSQL e para o JavaScript; o servidor devolve a posição de cada destaque e a tela só pinta. A lista de formas acentuadas aceitas (`ACCENT_FORMS`) é a que existe nos textos (ã á é ç ê í ó à õ ú ô â).
- **Números fora do índice.** O tokenizador do PostgreSQL trata "3.700" como um termo só, e a busca separava em "3" e "700": versículos com número ficavam impossíveis de achar. Palavras com número agora não entram no filtro de candidatos; uma busca só de números confere todos os versículos da tradução (300 a 400 ms).
- **Limites derivados dos dados.** Uma frase só casa dentro de um versículo, então o teto da busca é o maior versículo, com folga para os espaços de quem cola. Um teste de banco falha se algum versículo passar do limite.
- **Segurança.** Só letras, números, hífen e o ponto ou vírgula dos números entram no padrão; o resto vira separador. O texto digitado nunca é concatenado em SQL ou em expressão regular (usa parâmetros).

### Filtros na API e no SQL

- Os filtros são condições a mais na mesma consulta da busca (`b.testament = $n`, `v.book_id = $n`), sempre por parâmetros; `server/search.js` não foi tocado. Em buscas só de números (varredura completa) o filtro até acelera, pois há menos versículos para conferir.
- `book_id` é validado com `/^\d+$/` antes de virar número: `Number()` aceitaria `1e1` (= 10), ` 5` e `0x10`, e o filtro valeria sobre um livro que o usuário não pediu.
- Parâmetros de texto passam por `String(...)` antes de `.toUpperCase()`: um parâmetro repetido chega do Fastify como lista, e chamar o método direto nela derrubava a rota com erro 500 (valia também para o capítulo e para o versículo do dia).
- **Cliente** (`SearchModal.jsx`): o recorte é `{ testament, bookId }` (um zera o outro); a chave de cada resposta inclui o recorte, então uma resposta atrasada de um filtro anterior nunca sobrescreve a do filtro atual; "Mostrar mais" só anexa se a chave ainda for a mesma. A pílula do seletor é medida no JavaScript (posição e largura do botão marcado, remedida por `ResizeObserver`), porque "Toda a Bíblia" é mais larga que os outros dois botões.
- **Armadilha do Chrome:** uma lista com rolagem (`overflow: auto`) sem filhos focáveis vira parada do Tab. A lista de livros recebeu `tabIndex={-1}`; sem isso o foco ia para ela, o campo perdia o foco, a lista fechava e o foco caía na página, fora do diálogo. Foi achado pela bateria de tela.
- O diálogo da busca não corta o que sai dele (`overflow` visível), para a lista de livros poder flutuar por cima dos resultados; o corpo com rolagem corta os próprios cantos arredondados.

### Qualidade dos dados

A busca exata exige texto limpo. Os arquivos de origem da NVT trouxeram **hífen invisível** (U+00AD, marca de quebra de linha de impressão) no meio de palavras em 182 versículos e **acento desmontado** (letra + acento solto) em 3 versículos. O banco foi limpo (185 versículos, só NVT) por `server/scripts/clean-verse-text.mjs`, que é idempotente, tem modo de teste, roda em transação e guarda cópia dos originais. `NAA.json`, `NVT.json` e `seed.sql` não foram alterados: o script deve ser rodado após qualquer nova carga. Um teste de banco falha se as sujeiras voltarem.

### Testes e precisão

- `npm test`: **63 testes**: regras da busca (puros), analisador de referências, e o contrato contra o banco (só leitura), que inclui os filtros (Antigo + Novo = total; a soma dos 66 livros = total; recortes sem vazar livros de fora; conflito dá zero; parâmetros inválidos dão 400; `offset` gigante e parâmetro repetido não dão erro 500). Os números dos testes de banco são o contrato.
- `npm run test:accuracy`: bateria de precisão, **15 camadas e cerca de 104 mil conferências** contra um gabarito independente (`server/accuracy/oracle.js`), que lê `NAA.json` e `NVT.json` por força bruta e de outro jeito que a busca; também confere os 62.207 versículos do banco contra os arquivos e todos os 1.189 capítulos em várias grafias de referência. Camadas dos filtros: (10) Antigo, Novo e cada livro contra o gabarito, Antigo + Novo = total e, em parte das buscas, a soma dos 66 livros = total; (11) listas completas dentro do recorte; (12) as combinações testamento + livro para todos os 66 livros; (13) parâmetros hostis. Leva uns 18 minutos no tamanho padrão; `ACCURACY_SCALE=0.2` dá uma rodada rápida.
- **Verificações da tela** (`client/scripts/ui-checks/`, skill `playwright-cli`): comportamento (incluindo 150 ações aleatórias conferidas com a API), visual (6 tamanhos de tela, claro e escuro, contraste, corte, sobreposição) e conferências específicas da pílula, do botão do funil, da nova tentativa e do espaçamento. Detalhes no README.
- **Segurança dos scripts da tela:** só rodam contra `localhost` (recusam outra página e abortam, enquanto rodam, qualquer requisição para fora dele, exceto as fontes do Google), só leem (GET), e nunca guardam credenciais; textos de ataque neles (XSS, SQL) são dados de teste. A bateria de precisão lê o banco de **produção** (só leitura, ~104 mil consultas): quando a Fase 4 trouxer escrita, os testes devem rodar numa **branch separada da Neon**.
- **Defeitos que a bateria já revelou:** números com ponto ("3.700") não eram achados; `offset` gigante, parâmetro `translation` repetido e `book_id=1e1` davam erro 500 ou filtro errado; o Tab saía do diálogo pela lista de livros. Todos corrigidos.
- Não prova que as regras estão certas (o gabarito segue as decisões deste documento), só que o código as cumpre. Não cobre leitor de tela de verdade, Safari/Firefox nem carga no banco.

### Infraestrutura

#### Ambiente de desenvolvimento

- PostgreSQL instalado localmente via Homebrew.
- Sem custo, sem dependência de rede, acesso total ao banco durante o desenvolvimento.

#### Banco em produção

- **Serviço:** [Neon](https://neon.tech) — PostgreSQL serverless gerenciado.
- **Plano:** gratuito (0,5 GB de armazenamento).
- **Capacidade:** suficiente para o texto completo das duas traduções (~6 MB de texto + índices ~15 MB) e dados de usuário para uso pessoal e compartilhamento com amigos e família.
- **Limitação:** o banco suspende após 5 minutos de inatividade no plano gratuito, causando um cold start de 1–3 segundos na primeira requisição após inatividade.
- **Mitigação:** cron job no backend enviando `SELECT 1` a cada 4 minutos, ativo apenas das 6h às 23h no horário de São Paulo, evitando cold start no período de uso e poupando horas de computação do plano gratuito durante a madrugada.

```javascript
// Mantém o banco acordado das 6h às 23h (horário de Brasília)
cron.schedule('*/4 6-23 * * *', async () => {
  await pool.query('SELECT 1');
});
```

#### Stack de produção (em uso desde 14/10/2026, tudo gratuito)

| Camada | Serviço | Custo e limites |
|---|---|---|
| Frontend | Cloudflare (Worker com arquivos estáticos, `client/wrangler.jsonc`) | Gratuito; deploy a cada push no `main` |
| Backend | Render, plano gratuito (`nossabiblia-api`, Ohio) | Gratuito; dorme após 15 minutos sem uso (a primeira requisição leva ~50 s) |
| Banco de dados | Neon | Gratuito: 0,5 GB e 100 CU-horas por mês (por isso o keep-alive vem desligado e a API guarda a leitura em memória) |
| Backup | GitHub Actions + Cloudflare R2 | Gratuito; retenção de 90 dias |
| E-mails | Resend | 3.000 por mês e 100 por dia, grátis |

A decisão original previa a Railway para a API; o plano dela deixou de ser gratuito, então a escolha foi a Render (ver as alternativas estudadas no item 21 do "Estado atual").

---

## Estado atual

1. ✅ Decisões técnicas e arquiteturais alinhadas (PostgreSQL, Neon, Cloudflare, Render, autenticação própria; o keep-alive inteligente foi desligado por gastar a cota gratuita da Neon).
2. ✅ Arquivos de dados bíblicos (`NAA.json` e `NVT.json`) inspecionados e validados: dados 100% limpos e coerentes.
3. ✅ Esquema SQL DDL completo (`schema.sql`) projetado com todas as tabelas, índice GIN de texto (dicionário `simple`, sem acento) e regras de negócio.
4. ✅ Scripts de carga e seed criados: `seed.sql` (arquivo SQL puro de 9,1 MB pronto para execução via psql em transação atômica) e `seed.py` (script automatizado para rodar local ou apontando para o Neon).
5. ✅ Versionamento e backup no GitHub configurados (repositório privado `chrystianomoura/nossabiblia`).
6. ✅ Instância serverless PostgreSQL no Neon configurada e conectada (projeto `nossabiblia`, branch `production`).
7. ✅ Carga completa (seed) executada com 100% de sucesso na nuvem: 66 livros e todos os 62.207 versículos (31.105 NAA + 31.102 NVT) gravados e indexados com GIN. Busca textual instantânea validada.
8. ✅ Servidor backend (API REST) estruturado com Fastify, pool de conexões Neon, robô de keep-alive ping (06:00 às 23:00 SP; **desligado por padrão desde 14/10/2026**, só liga com `KEEPALIVE=on`, porque gasta ~128 CU-horas por mês e a Neon gratuita dá 100), `/healthz` sem banco para a hospedagem e rotas públicas validadas:
   - `GET /health`: Monitoramento de status da API e banco de dados.
   - `GET /api/books`: Retorna os 66 livros da Bíblia na ordem canônica (divididos em AT e NT).
   - `GET /api/books/:book/chapters/:chapter?translation=NAA`: Leitura completa de capítulos em NAA ou NVT.
   - `GET /api/search?q=palavra&translation=NAA&testament=AT&book_id=19&limit=50&offset=0`: Busca exata (itens 21 a 24). O índice GIN acha os versículos candidatos e uma conferência no texto confirma a palavra e conta as ocorrências. Responde `total_occurrences`, `total_verses`, `has_more` e, por versículo, `occurrences` e `matches` (posições para o destaque). `testament` e `book_id` recortam o resultado (item 24). Parâmetros inválidos dão 400: tradução, testamento, `book_id` e também parâmetros repetidos (`?translation=NAA&translation=NVT`). `limit` vai de 1 a 200 e `offset` tem teto de 100.000 (a Bíblia tem 31 mil versículos; um número gigante estourava o inteiro do banco e dava erro 500). Além do fim da lista, a resposta vem com a lista e os totais zerados.
9. ✅ Frontend SPA (Vite + React 19 + CSS puro com tokens + Lucide Icons) estruturado, compilado e rodando:
   - Home em tela dividida: manifesto, benefícios e o livro aberto de Gênesis 1 em NAA/NVT, embutido no código (aparece sem esperar a API).
   - Leitor em cartão vertical com rotas por URL (`/ler/joao/3?t=NVT&v=16-18`), três tamanhos de letra, seletor de livro e capítulo, navegação por setas e gestos, posição lembrada, tema claro e escuro (ver "Interface do leitor").
   - Marca NB, acessibilidade (teclado, foco, leitor de tela) e layout responsivo para celular, tablet e desktop.
10. ✅ Busca exata (itens 21 a 24): palavra inteira, caixa, acento, frase, hífen, números, contagem em ocorrências, paginação e colagem de versículo inteiro.
11. ✅ Busca por referência (item 6): `salmos 23`, `joão 3:16-18`, `I João 4:8`, `mat`.
12. ✅ Qualidade dos dados: limpeza da NVT (185 versículos) com script idempotente.
13. ✅ **Filtros da busca** (item 24): Antigo, Novo e livro, com o painel, o seletor de pílula, a lista curta de livros, a etiqueta e o botão do funil pintado; API validada (400 para valores inválidos).
14. ✅ Testes: 63 testes automatizados, bateria de precisão de 15 camadas (~104 mil conferências) e verificações da tela, tudo verde. Defeitos achados no caminho (offset gigante, parâmetro repetido, `book_id=1e1`, foco do Tab) foram corrigidos.
15. ✅ Acabamento da busca: botão "Tentar de novo" na falha de rede, selo "2×" legível no tema claro, sem balões de dica nos botões.
16. ✅ Textos: as mensagens da busca por referência ficaram **sem ponto final** (decisão do usuário) e a marca aparece sempre como "Nossa Bíblia" (com espaço), inclusive no título da aba do navegador.
17. ✅ **Leitor redesenhado** (ver "Interface do leitor"): cartão vertical para todos os aparelhos, sem piscar entre capítulos, posição lembrada e verificações da tela próprias (`leitor-livro.js`).
18. ✅ **Decisões fechadas da busca:** a dica "Encontrado na NVT" (quando a busca dá zero na tradução escolhida) **não será feita**; as mensagens de falha ("Não foi possível buscar agora. Verifique a conexão e tente de novo.", "Não foi possível carregar mais.", "Não foi possível carregar essa referência.") **mantêm o ponto final**; os botões de 30 a 38 px de altura (seletor NAA/NVT, botões redondos de 36 px) **ficam como estão**, e o usuário conferiu no aparelho.
19. ✅ **Celular e telas pequenas:** ponto de quebra único em 1070 px, letras padronizadas a partir do subtítulo, livro de uma página, cartões enxutos e centralizados, cabeçalho em linha única até 320 px, página que não rola (o `#root` rola, para as barras do navegador ficarem à mostra), `svh`/`dvh`, margem simétrica no entalhe, celular deitado, toque sem `:hover` preso, busca com fundo sólido, sem barras de rolagem à vista abaixo do desktop e o leitor que mantém o lugar ao trocar de tradução ou de largura (ver "Navegadores de celular"). Os oito `ui-checks` e os 63 testes passam; o usuário conferiu no aparelho.
20. ✅ **Preparação da Fase 4 (14/10/2026):** domínio `nossabiblia.party` com DNS, TLS estrito, e-mail de entrada (`contato@`) e DNSSEC (**aguardando**: a zona está assinada e a Cloudflare publica o DS no registro sozinha, em um a dois dias); Resend verificado (envio testado e entregue na caixa de entrada); migrações `001` e `002` ensaiadas em branch separada da Neon (20 testes de regra e 12 como `nb_app`) e **aplicadas na produção em 14/10/2026** (modo teste antes); servidor com CORS de lista fixa, certificado do banco verificado, cabeçalhos de segurança e limite de requisições; `backup.mjs` com envio ao R2 testado (bucket privado, retenção de 90 dias, token restrito); servidor conectando como o papel de banco limitado `nb_app` (menor privilégio, migração 002); contrato da API em `API.md`. A branch de produção da Neon não pôde ser protegida (limite do plano), e a janela de recuperação da Neon é de 6 horas.
21. ✅ **Publicado (14/10/2026), tudo gratuito:** o **site** em https://nossabiblia.party (e `www`), como Worker com arquivos estáticos no Cloudflare (raiz `client`, `npm ci && npm run build` + `npx wrangler deploy`, `client/wrangler.jsonc`, token de build próprio `nossabiblia-build`, deploy a cada push no `main`), HTTPS, http redireciona para https, cabeçalhos de segurança de `dist/_headers` (CSP com hash do script do tema; testada com 0 violações e provada contra script injetado); e a **API** em https://api.nossabiblia.party (Render grátis, serviço `nossabiblia-api`, Ohio, Node 24, `/healthz` sem banco, papel de banco limitado `nb_app`, CORS só para `nossabiblia.party`, Auto-Deploy desligado). Verificado de ponta a ponta no navegador: home, leitor (Gênesis 1 com 31 versículos), busca ("Deus" = 4.664 ocorrências em 4.085 versículos) e Salmos 23 NVT com destaque. **Limites do plano grátis:** a API dorme após 15 minutos sem uso e a primeira requisição leva ~50 s (falta a mensagem "acordando o servidor" na tela). Um incidente do Render (status.render.com) pausou os deploys gratuitos por horas no mesmo dia; alternativas estudadas: Koyeb e Vercel Hobby.
22. ✅ **Experiência e automação (14/10/2026):** aviso "Acordando o servidor" na tela quando a API gratuita demora mais de 4 s; contrato das rotinas diárias no GitHub Actions (backup para o R2 e faxina das contas não verificadas, cada uma com o seu papel de banco de menor privilégio, migração 003) e integração contínua (lint, testes sem banco e build); README de portfólio com diagrama da arquitetura, decisões e trade-offs. Os papéis `nb_backup` e `nb_maint` foram criados e a migração 003 aplicada na produção, os segredos estão no GitHub e as rotinas passam a rodar depois do primeiro push dos workflows.
23. ✅ **Revisão e correções (14/10/2026):** cache em memória e `Cache-Control` na leitura (poupa a cota gratuita da Neon); limite de requisições deixa de ser burlável por `X-Forwarded-For` falso (`TRUST_PROXY=3`, medido com uma rota de diagnóstico temporária e provado em produção: IPs inventados passam a dividir o mesmo contador); cabeçalhos de cache do site sem contradição; faxina só depois do backup; e **restauração do backup ensaiada de ponta a ponta** (`restore.mjs`), com hash por tabela idêntico, que corrigiu três defeitos do backup.
24. ✅ **Endurecimento e organização (15/10/2026):** dependências em dia (e as sem uso removidas), Dependabot e `npm audit` no CI; DNS com CAA, DMARC em quarentena e `www` redirecionando para o domínio principal (o DNSSEC aguarda a publicação automática do DS pela Cloudflare; o DMARC em quarentena foi provado com SPF, DKIM e DMARC = PASS num e-mail de teste ao Gmail; Outlook e iCloud ainda não foram testados); HSTS gradual no site; fontes auto-hospedadas (medidas idênticas às do Google); prévia de compartilhamento (Open Graph), `robots.txt` e sitemap com os 1.189 capítulos; servidor em camadas (`routes/`, `services/`, `http/`); teste de fumaça da tela (Playwright) no CI; e a infraestrutura documentada como código (`render.yaml`, `infra/`).
25. ⏳ **Próximo passo:** Fase 4 (Sistema de Autenticação, Cadastro de Usuários, Envio de E-mails com Resend e Marcações Pessoais).
