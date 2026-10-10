import fs from "fs";
import path from "path";
import pg from "pg";
const { Client } = pg;

function getDbUrl() {
  if (process.env.DATABASE_URL_UNPOOLED) return process.env.DATABASE_URL_UNPOOLED;
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envPath = path.resolve(".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    let unpooled = null;
    let pooled = null;
    for (const line of lines) {
      if (line.startsWith("DATABASE_URL_UNPOOLED=")) {
        unpooled = line.split("=", 2)[1].replace(/["']/g, "").trim();
      } else if (line.startsWith("DATABASE_URL=")) {
        pooled = line.split("=", 2)[1].replace(/["']/g, "").trim();
      }
    }
    if (unpooled) return unpooled;
    if (pooled) return pooled;
  }
  throw new Error("Nenhuma URL encontrada em .env.local ou variáveis de ambiente.");
}

async function runSeed() {
  const dbUrl = getDbUrl();
  console.log("Conectando ao PostgreSQL no Neon...");
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log("Conectado com sucesso!");

  // 1. Executar schema.sql
  console.log("1. Executando schema.sql (criando tabelas, constraints e índices GIN)...");
  const schemaSql = fs.readFileSync("schema.sql", "utf-8");
  await client.query(schemaSql);
  console.log("   Schema criado com sucesso!");

  // 2. Carregar JSONs
  console.log("2. Lendo arquivos JSON...");
  const naa = JSON.parse(fs.readFileSync("NAA.json", "utf-8"));
  const nvt = JSON.parse(fs.readFileSync("NVT.json", "utf-8"));

  // 3. Inserir Livros
  console.log("3. Inserindo os 66 livros canônicos...");
  for (let i = 0; i < 66; i++) {
    const bookId = i + 1;
    const name = naa[i].name;
    const abbrev = naa[i].abbrev;
    const testament = bookId <= 39 ? "OT" : "NT";
    const chaptersCount = naa[i].chapters.length;

    await client.query(
      `INSERT INTO books (id, name, abbrev, testament, chapters_count)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [bookId, name, abbrev, testament, chaptersCount]
    );
  }
  console.log("   66 livros inseridos com sucesso!");

  // 4. Inserir Versículos em Lotes
  async function insertVerses(data, translation) {
    console.log(`4. Inserindo versículos de ${translation}...`);
    const batchSize = 1000;
    let batch = [];
    let count = 0;

    for (let b = 0; b < data.length; b++) {
      const bookId = b + 1;
      for (let c = 0; c < data[b].chapters.length; c++) {
        const chapter = c + 1;
        for (let v = 0; v < data[b].chapters[c].length; v++) {
          const verse = v + 1;
          const text = data[b].chapters[c][v];

          batch.push([bookId, chapter, verse, translation, text]);
          count++;

          if (batch.length >= batchSize) {
            await insertBatch(client, batch);
            process.stdout.write(`   ${count} versículos de ${translation} inseridos...\r`);
            batch = [];
          }
        }
      }
    }

    if (batch.length > 0) {
      await insertBatch(client, batch);
      console.log(`   Total de ${count} versículos de ${translation} inseridos com sucesso!`);
    }
  }

  async function insertBatch(client, rows) {
    const values = [];
    const params = [];
    let p = 1;

    for (const r of rows) {
      values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++})`);
      params.push(...r);
    }

    const query = `
      INSERT INTO verses (book_id, chapter, verse, translation, text)
      VALUES ${values.join(", ")}
      ON CONFLICT (book_id, chapter, verse, translation)
      DO UPDATE SET text = EXCLUDED.text;
    `;

    await client.query(query, params);
  }

  await insertVerses(naa, "NAA");
  await insertVerses(nvt, "NVT");

  // 5. Teste de busca rápida
  console.log("\n5. Testando busca textual instantânea...");
  const t0 = Date.now();
  const searchRes = await client.query(
    `SELECT b.name, v.chapter, v.verse, v.translation, v.text
     FROM verses v
     JOIN books b ON b.id = v.book_id
     WHERE v.search_vector @@ to_tsquery('portuguese', 'misericórdia')
     LIMIT 5;`
  );
  const elapsed = Date.now() - t0;
  console.log(`   Busca retornou em ${elapsed}ms:`);
  for (const row of searchRes.rows) {
    console.log(`   - ${row.name} ${row.chapter}:${row.verse} (${row.translation}): "${row.text.substring(0, 50)}..."`);
  }

  await client.end();
  console.log("\n Banco de dados no Neon totalmente configurado e testado com sucesso!");
}

runSeed().catch(err => {
  console.error("Erro na execução:", err);
  process.exit(1);
});
