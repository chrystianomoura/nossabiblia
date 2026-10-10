"""
Script de importação automática para o PostgreSQL (NossaBíblia)
Suporta conexão com PostgreSQL local ou Neon na nuvem.

Uso:
  python3 seed.py
  (lê automaticamente DATABASE_URL_UNPOOLED ou DATABASE_URL de .env.local)
  ou: python3 seed.py --url "sua_url_aqui"
"""

import os
import sys
import json
import argparse

def get_db_url(cli_url):
    if cli_url:
        return cli_url
    if os.getenv("DATABASE_URL_UNPOOLED"):
        return os.getenv("DATABASE_URL_UNPOOLED")
    if os.getenv("DATABASE_URL"):
        return os.getenv("DATABASE_URL")
    
    # Tenta ler .env.local
    base_dir = os.path.dirname(os.path.abspath(__file__))
    env_local = os.path.join(base_dir, ".env.local")
    if os.path.exists(env_local):
        urls = {}
        with open(env_local, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATABASE_URL_UNPOOLED="):
                    urls["unpooled"] = line.split("=", 1)[1].strip('"\'')
                elif line.startswith("DATABASE_URL="):
                    urls["pooled"] = line.split("=", 1)[1].strip('"\'')
        if "unpooled" in urls:
            return urls["unpooled"]
        if "pooled" in urls:
            return urls["pooled"]
    return None

def main():
    parser = argparse.ArgumentParser(description="Seed do banco de dados NossaBíblia")
    parser.add_argument("--url", default=None, help="URL de conexão PostgreSQL")
    args = parser.parse_args()

    db_url = get_db_url(args.url)
    if not db_url:
        print("Erro: Nenhuma URL de banco encontrada em --url, variáveis de ambiente ou .env.local")
        sys.exit(1)

    try:
        import psycopg2
        from psycopg2.extras import execute_batch
    except ImportError:
        print("Instalando driver psycopg2-binary temporariamente para importação direta...")
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary"])
        import psycopg2
        from psycopg2.extras import execute_batch

    base_dir = os.path.dirname(os.path.abspath(__file__))
    schema_path = os.path.join(base_dir, "schema.sql")
    naa_path = os.path.join(base_dir, "NAA.json")
    nvt_path = os.path.join(base_dir, "NVT.json")

    print("Conectando ao PostgreSQL no Neon...")
    conn = psycopg2.connect(db_url)
    cur = conn.cursor()

    print("1. Executando schema.sql (criando tabelas, tipos e índices GIN)...")
    with open(schema_path, "r", encoding="utf-8") as f:
        cur.execute(f.read())
    conn.commit()
    print("   Tabelas e índices criados com sucesso!")

    print("2. Carregando livros e versículos...")
    with open(naa_path, "r", encoding="utf-8") as f:
        naa_data = json.load(f)
    with open(nvt_path, "r", encoding="utf-8") as f:
        nvt_data = json.load(f)

    # Inserir 66 livros
    book_records = []
    for i in range(66):
        book_id = i + 1
        name = naa_data[i]["name"]
        abbrev = naa_data[i]["abbrev"]
        testament = "OT" if book_id <= 39 else "NT"
        chapters_count = len(naa_data[i]["chapters"])
        book_records.append((book_id, name, abbrev, testament, chapters_count))

    execute_batch(cur, """
        INSERT INTO books (id, name, abbrev, testament, chapters_count)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING;
    """, book_records)
    conn.commit()
    print("   66 livros canônicos inseridos!")

    # Inserir NAA
    print("3. Inserindo versículos NAA...")
    naa_records = []
    for i, book in enumerate(naa_data):
        book_id = i + 1
        for c_idx, chapter in enumerate(book["chapters"]):
            chap_num = c_idx + 1
            for v_idx, text in enumerate(chapter):
                v_num = v_idx + 1
                naa_records.append((book_id, chap_num, v_num, 'NAA', text))

    execute_batch(cur, """
        INSERT INTO verses (book_id, chapter, verse, translation, text)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (book_id, chapter, verse, translation) DO UPDATE SET text = EXCLUDED.text;
    """, naa_records, page_size=2000)
    conn.commit()
    print(f"   {len(naa_records)} versículos NAA inseridos!")

    # Inserir NVT
    print("4. Inserindo versículos NVT...")
    nvt_records = []
    for i, book in enumerate(nvt_data):
        book_id = i + 1
        for c_idx, chapter in enumerate(book["chapters"]):
            chap_num = c_idx + 1
            for v_idx, text in enumerate(chapter):
                v_num = v_idx + 1
                nvt_records.append((book_id, chap_num, v_num, 'NVT', text))

    execute_batch(cur, """
        INSERT INTO verses (book_id, chapter, verse, translation, text)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (book_id, chapter, verse, translation) DO UPDATE SET text = EXCLUDED.text;
    """, nvt_records, page_size=2000)
    conn.commit()
    print(f"   {len(nvt_records)} versículos NVT inseridos!")

    cur.close()
    conn.close()
    print("\n🎉 Sucesso total! Banco NossaBíblia populado e pronto no Neon.")

if __name__ == "__main__":
    main()
