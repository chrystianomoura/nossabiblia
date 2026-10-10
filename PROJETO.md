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
6. **Busca por referência:** digitar "João 3:16" mostra só esse versículo, com correspondência exata.

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

21. **Busca exata:** procura uma palavra dentro de uma tradução escolhida.
22. **Ordem:** resultados sempre na ordem canônica. Não há ordenação cronológica.
23. **Contagem:** número exato de ocorrências da palavra na tradução escolhida.
24. **Filtros:** restrição ao Antigo ou ao Novo Testamento, ou a um livro específico.

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
- **Processo:** download único dos arquivos, importação via script, arquivos descartados após a carga. O texto bíblico passa a ser dado estático no banco.

#### Diagnóstico e validação dos arquivos JSON

Os arquivos `NAA.json` e `NVT.json` foram inspecionados e validados:
- **Estrutura:** array raiz contendo os 66 livros canônicos com chaves `name` (nome), `abbrev` (abreviação) e `chapters` (matriz bidimensional `chapters[capitulo][versiculo]`).
- **Limpeza do texto:** 100% puro, sem tags HTML, entidades corrompidas ou formatações indesejadas.
- **Consistência de livros:** os nomes e abreviações dos 66 livros canônicos coincidem de forma idêntica entre NAA e NVT.
- **Capítulos:** 1.189 capítulos idênticos em ambas as versões.
- **Versículos:** 31.105 versículos na NAA e 31.102 na NVT. A variação de 3 versículos decorre de diferenças históricas de versificação da crítica textual em 14 capítulos específicos (ex.: 2 Coríntios 13 possui 13 versículos na NAA e 14 na NVT, onde as saudações finais foram agrupadas ou separadas).
- **Decisão arquitetural de modelagem:** para manter integridade canônica e desacoplamento, cada versículo terá seu próprio registro em tabela normalizada com indicação explícita da tradução (`book_id`, `chapter`, `verse`, `translation`, `text`), sem vincular as traduções em colunas paralelas na mesma linha.

### Banco de dados

- **Sistema:** PostgreSQL
- **Motivo:** banco relacional mais completo do mercado open-source. Suporte nativo a busca de texto com `tsvector` e índice `GIN`, incluindo stemming em português. Transações, constraints e tipos de dado precisos para as regras de negócio do projeto. Amplamente usado em produção, o aprendizado tem valor duradouro.
- **Autenticação:** implementada do zero no backend, sem uso de serviços gerenciados de auth. Decisão consciente com o objetivo de aprender o ciclo completo de autenticação, mesmo que implique mais tempo de desenvolvimento.
- **Campos de perfil do usuário:** colunas `first_name` (VARCHAR(100)) e `last_name` (VARCHAR(100)) na tabela `users`. Saudações na interface e e-mails utilizam `first_name`. Validação e sanitização (trim, rejeição de números puros) aplicadas no backend antes da inserção.

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
3. ✅ Esquema SQL DDL completo (`schema.sql`) projetado com todas as tabelas, índices GIN de texto em português e regras de negócio.
4. ✅ Scripts de carga e seed criados: `seed.sql` (arquivo SQL puro de 9,1 MB pronto para execução via psql em transação atômica) e `seed.py` (script automatizado para rodar local ou apontando para o Neon).
5. ✅ Versionamento e backup no GitHub configurados (repositório privado `chrystianomoura/nossabiblia`).
6. ⏳ **Próximo passo imediato:** configurar a instância do PostgreSQL (local via Homebrew ou no Neon gratuito) e rodar a importação para validar as buscas instantâneas.
