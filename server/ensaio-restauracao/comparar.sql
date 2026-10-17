-- Uma linha por tabela: contagem e um hash do conteúdo (as linhas, em texto, em ordem fixa). Rode na origem e no destino: as duas
-- saídas têm que ser IDÊNTICAS, linha a linha. Se uma tabela diferir, o backup ou a restauração perdeu ou alterou algo.
-- Resultado esperado com os dados de dados-falsos.sql: 5 linhas (ordem alfabética das tabelas).
SELECT 'bookmarks' AS tabela, count(*) AS n, md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) AS hash FROM bookmarks x UNION ALL
SELECT 'daily_progress',   count(*), md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM daily_progress x UNION ALL
SELECT 'email_blocks',     count(*), md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM email_blocks x UNION ALL
SELECT 'sessions',         count(*), md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM sessions x UNION ALL
SELECT 'users',            count(*), md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) FROM users x
ORDER BY 1;
