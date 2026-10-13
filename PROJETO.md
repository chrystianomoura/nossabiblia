# NossaBíblia: especificação do projeto

Este documento descreve a especificação funcional e as decisões técnicas da aplicação **NossaBíblia**, um app web pessoal para ler a Bíblia, marcar versículos, organizar leituras por tema e estudar palavras.

---

## Visão geral

- **Nome oficial:** NossaBíblia
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
    - **Sem exceção para livros de um capítulo só:** `judas 5` é o capítulo 5 e a tela diz "Judas tem 1 capítulo."; `judas 1` abre o capítulo e `judas 1:5`, o versículo.
    - **Validação na tradução escolhida:** NAA e NVT numeram alguns versículos de forma diferente (2 Coríntios 13:14 só existe na NVT). Fora dos limites, a tela informa o que existe ("Salmos tem 150 capítulos.", "Salmos 23 tem 6 versículos na NAA."). Havendo alguma referência válida entre os candidatos (`fil 2`, `jo 3:30`), as inválidas não aparecem.
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
24. **Filtros:** restrição ao Antigo ou ao Novo Testamento, ou a um livro específico (a API já aceita `testament` e `book_id`; a tela ainda não tem os controles).

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

### Qualidade dos dados

A busca exata exige texto limpo. Os arquivos de origem da NVT trouxeram **hífen invisível** (U+00AD, marca de quebra de linha de impressão) no meio de palavras em 182 versículos e **acento desmontado** (letra + acento solto) em 3 versículos. O banco foi limpo (185 versículos, só NVT) por `server/scripts/clean-verse-text.mjs`, que é idempotente, tem modo de teste, roda em transação e guarda cópia dos originais. `NAA.json`, `NVT.json` e `seed.sql` não foram alterados: o script deve ser rodado após qualquer nova carga. Um teste de banco falha se as sujeiras voltarem.

### Testes e precisão

- `npm test`: testes das regras (puros), do analisador de referências e do contrato contra o banco (só leitura). Os números dos testes de banco são o contrato.
- `npm run test:accuracy`: bateria de precisão. Compara cerca de 12 mil buscas reais com um gabarito independente (`server/accuracy/oracle.js`), que lê `NAA.json` e `NVT.json` por força bruta e de outro jeito que a busca; também confere os 62.207 versículos do banco contra os arquivos e todos os 1.189 capítulos em várias grafias de referência. Já revelou um defeito real (números com ponto). Não prova que as regras estão certas, só que o código as cumpre.

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
   - `GET /api/search?q=palavra&translation=NAA&limit=50&offset=0`: Busca exata (itens 21 a 24). O índice GIN acha os versículos candidatos e uma conferência no texto confirma a palavra e conta as ocorrências. Responde `total_occurrences`, `total_verses`, `has_more` e, por versículo, `occurrences` e `matches` (posições para o destaque).
   - `GET /api/daily-verse`: Versículo do dia público.
9. ✅ Frontend SPA (Vite + React 19 + CSS puro com tokens + Lucide Icons) estruturado, compilado e rodando:
   - Home em tela dividida: manifesto, benefícios e o livro aberto de Gênesis 1 em NAA/NVT, embutido no código (aparece sem esperar a API).
   - Leitor imersivo com rotas por URL (`/ler/joao/3?t=NVT&v=16-18`), tamanho de letra, navegação por setas e gestos, tema claro e escuro.
   - Marca NB, acessibilidade (teclado, foco, leitor de tela) e layout responsivo para celular, tablet e desktop.
10. ✅ Busca exata (itens 21 a 24): palavra inteira, caixa, acento, frase, hífen, números, contagem em ocorrências, paginação e colagem de versículo inteiro.
11. ✅ Busca por referência (item 6): `salmos 23`, `joão 3:16-18`, `I João 4:8`, `mat`.
12. ✅ Qualidade dos dados: limpeza da NVT (185 versículos) com script idempotente.
13. ✅ Testes: 56 testes automatizados e uma bateria de precisão de cerca de 12 mil buscas contra um gabarito independente, toda verde.
14. ⏳ **Pendências da busca:** controles de filtro por Antigo/Novo Testamento e por livro na tela (a API já aceita); dica "Encontrado na NVT" quando a busca der zero na tradução escolhida (adiada).
15. ⏳ **Próximo passo:** Fase 4 (Sistema de Autenticação, Cadastro de Usuários, Envio de E-mails com Resend e Marcações Pessoais).
