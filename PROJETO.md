# Nossa Bíblia: especificação do projeto

Este documento descreve a especificação funcional e as decisões técnicas da aplicação **Nossa Bíblia**, um app web pessoal para ler a Bíblia, marcar versículos, organizar leituras por tema e estudar palavras.

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

7. **Marcar versículo:** o usuário escolhe uma cor de uma paleta.
8. **Comentário:** cada marcação pode ter um comentário opcional.
9. **Pastas:** o usuário cria pastas e organiza as marcações nelas.
10. **Ordem:** as marcações aparecem com a mais recente primeiro.

## Favoritos (exige conta verificada)

11. **Favoritar versículo:** favorito e marcação são independentes. O mesmo versículo pode ter as duas coisas.
12. **Lista única:** favoritos não podem ser organizados em pastas.
13. **Ordem:** os favoritos aparecem com o mais recente primeiro.

## Compartilhamento (público)

14. **Compartilhar texto:** o usuário compartilha um versículo ou um capítulo como texto, com a referência e a tradução embaixo. Exemplo: "Salmos 23:1 (NVT)".

## Comparação de traduções (pública)

15. **Lado a lado:** NAA e NVT em colunas.
16. **Modo por versículo:** cada versículo mostra logo abaixo o correspondente na outra tradução.
17. **Versículos ausentes:** quando uma passagem tem numeração diferente nas duas traduções, cada uma mostra só o que existe nela.

## Temas

18. **Carrosséis de leitura:** sequências de versículos agrupadas por tema (por exemplo, depressão, ansiedade, medo). Os temas e os versículos são curados pelo autor. A curadoria automática está fora de escopo.
19. **Versículo do dia por tema:** o usuário escolhe um tema e recebe um versículo sorteado daquele tema. Vale um por dia.
20. **Limite diário:** se o usuário pedir outro no mesmo dia, aparece a mensagem "versículo do dia já gerado; reflita e medite sobre ele".

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

25. Versículo do dia, com o botão para escolher um tema e sortear.
26. Sessões de temas escolhidos pelo autor.
27. Botão principal para abrir a Bíblia no último texto lido.
28. Linha de progresso dos últimos 7 dias.

## Atalho para a Bíblia

29. O botão principal abre a Bíblia no último texto lido.
30. Se o usuário chegar à leitura pela busca, abre o texto pesquisado.

## Navegação entre abas

31. As abas "Marcações" e "Favoritos" ficam sempre visíveis, com nomes curtos, ícones e cores próprias, para serem identificadas à primeira vista.

## Progresso (exige conta verificada)

32. **Positivo:** um por dia, ganho na primeira vez que qualquer tela da Bíblia carrega para o usuário. Vale para página inicial, leitura, marcações, favoritos, busca, comparação e qualquer outra página de texto bíblico.
33. **Sem exigência:** basta a tela carregar. Não há tempo mínimo de leitura nem necessidade de avançar.
34. **Reset:** o dia é contado pelo horário de São Paulo, com reset à meia-noite, independentemente do fuso do usuário.
35. **Linha de 7 dias:** check para dia com positivo, X para dia passado sem positivo, bolinha vazia para o dia atual sem positivo ainda. Dias futuros não aparecem.
36. **Quadro anual:** ao tocar na linha, abre um calendário que começa na data de abertura da conta e vai até hoje, pintando cada dia conforme o positivo. A data de abertura tem destaque próprio. Dias anteriores a ela não aparecem.

## Conta

37. **Cadastro:** nome, sobrenome, e-mail digitado duas vezes e senha digitada duas vezes.
    - **Identificação humana:** o sistema não utiliza arrobas (`@usuario`) nem redes sociais; apenas o nome e sobrenome do usuário.
    - **Nomes compostos:** a divisão em dois campos explícitos (*Nome* e *Sobrenome*) permite que pessoas com nomes compostos (ex.: *Maria Laura*, *João Pedro*) preencham o primeiro campo livremente, garantindo que o app e os e-mails usem a saudação correta (*"Olá, Maria Laura"*).
    - **Validação de veracidade:** validação dupla (no front-end para feedback instantâneo ao usuário e no back-end para garantia de segurança e integridade). Textos vazios, espaços excessivos ou nomes puramente numéricos são rejeitados.
38. **Conta não verificada:** fica nesse estado até o e-mail ser confirmado. Um aviso fixo e chamativo pede a confirmação em qualquer tela logada. Marcações, favoritos, progresso e exportação ficam bloqueados. Leitura, busca, comparação e compartilhamento continuam livres.
39. **Reenvio da confirmação:** uma vez. Depois, bloqueado por 12 horas, contadas a partir do último envio.
40. **Correção do e-mail:** permitida enquanto a conta não estiver verificada, com a mesma regra de reenvio.
41. **Prazo de 7 dias:** conta não verificada que não for confirmada em 7 dias é apagada, com tudo relacionado a ela. Sem aviso prévio e sem bloqueio do e-mail, que pode se cadastrar de novo.
42. **Data de abertura:** dia da confirmação do e-mail. Fica registrada para sempre, salvo exclusão da conta.
43. **Recuperação de senha:** por e-mail.
44. **Encerrar sessões:** o usuário sai de todos os dispositivos de uma vez.
45. **Exportação:** todos os dados da conta, com a data de cada marcação e de cada favorito.
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
- **Cartões "Marcações & Notas", "Progresso diário", "Leitura sem distrações":** todos com a largura do maior e centralizados. Até 640 px (onde a descrição mais longa deixa de caber em uma linha, ~615 px, com folga) o conteúdo empilha: ícone em cima, título e descrição centralizados. O ícone é só um contorno dourado (sem preenchimento), porque o dourado translúcido virava oliva sujo sobre o cartão azul do tema escuro.
- **Cabeçalho em linha única até 320 px:** abaixo de 520 px a marca (selo e nome) e os botões encolhem com a largura da tela e nunca quebram linha.

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
- Curadoria automática de temas.

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

#### Stack de produção (planejada)

| Camada | Serviço | Custo |
|---|---|---|
| Frontend | Cloudflare Pages | Gratuito, sem limite de banda |
| Backend | Railway | US$ 5 crédito/mês grátis |
| Banco de dados | Neon | Gratuito (0,5 GB) |
| E-mails | Resend | 3.000 e-mails/mês grátis |

### Limite diário do versículo por tema (item 19–20)

- O limite é **global**: o usuário recebe um único versículo por dia, independentemente de ter escolhido um tema específico ou de ter pedido de forma geral. Uma vez gerado o versículo do dia, qualquer nova tentativa — em qualquer tema — exibe a mensagem "versículo do dia já gerado; reflita e medite sobre ele".
- Impacto no esquema: a tabela de controle registra apenas a data do último versículo gerado por usuário, sem vínculo com o tema.

---

## Estado atual

1. ✅ Decisões técnicas e arquiteturais alinhadas (PostgreSQL, Neon, Cloudflare Pages, keep-alive inteligente para evitar suspensão, autenticação própria).
2. ✅ Arquivos de dados bíblicos (`NAA.json` e `NVT.json`) inspecionados e validados: dados 100% limpos e coerentes.
3. ✅ Esquema SQL DDL completo (`schema.sql`) projetado com todas as tabelas, índice GIN de texto (dicionário `simple`, sem acento) e regras de negócio.
4. ✅ Scripts de carga e seed criados: `seed.sql` (arquivo SQL puro de 9,1 MB pronto para execução via psql em transação atômica) e `seed.py` (script automatizado para rodar local ou apontando para o Neon).
5. ✅ Versionamento e backup no GitHub configurados (repositório privado `chrystianomoura/nossabiblia`).
6. ✅ Instância serverless PostgreSQL no Neon configurada e conectada (projeto `nossabiblia`, branch `production`).
7. ✅ Carga completa (seed) executada com 100% de sucesso na nuvem: 66 livros e todos os 62.207 versículos (31.105 NAA + 31.102 NVT) gravados e indexados com GIN. Busca textual instantânea validada.
8. ✅ Servidor backend (API REST) estruturado com Fastify, pool de conexões Neon, robô inteligente de keep-alive ping (06:00 às 23:00 SP) e rotas públicas validadas:
   - `GET /health`: Monitoramento de status da API e banco de dados.
   - `GET /api/books`: Retorna os 66 livros da Bíblia na ordem canônica (divididos em AT e NT).
   - `GET /api/books/:book/chapters/:chapter?translation=NAA`: Leitura completa de capítulos em NAA ou NVT.
   - `GET /api/search?q=palavra&translation=NAA&testament=AT&book_id=19&limit=50&offset=0`: Busca exata (itens 21 a 24). O índice GIN acha os versículos candidatos e uma conferência no texto confirma a palavra e conta as ocorrências. Responde `total_occurrences`, `total_verses`, `has_more` e, por versículo, `occurrences` e `matches` (posições para o destaque). `testament` e `book_id` recortam o resultado (item 24). Parâmetros inválidos dão 400: tradução, testamento, `book_id` e também parâmetros repetidos (`?translation=NAA&translation=NVT`). `limit` vai de 1 a 200 e `offset` tem teto de 100.000 (a Bíblia tem 31 mil versículos; um número gigante estourava o inteiro do banco e dava erro 500). Além do fim da lista, a resposta vem com a lista e os totais zerados.
   - `GET /api/daily-verse`: Versículo do dia público.
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
18. ⏳ **Pendências da busca:** a dica "Encontrado na NVT" quando a busca der zero na tradução escolhida (adiada pelo usuário); decidir se as mensagens de falha ("Não foi possível buscar agora. Verifique a conexão e tente de novo.", "Não foi possível carregar mais.", "Não foi possível carregar essa referência.") também perdem o ponto final.
19. ⏳ **Próximo passo:** Fase 4 (Sistema de Autenticação, Cadastro de Usuários, Envio de E-mails com Resend e Marcações Pessoais).
