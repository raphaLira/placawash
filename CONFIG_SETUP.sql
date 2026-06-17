CREATE TABLE IF NOT EXISTS configuracoes (
  id                        SERIAL PRIMARY KEY,
  user_id                   UUID UNIQUE NOT NULL,
  nome_lavajato             TEXT DEFAULT '',
  endereco                  TEXT DEFAULT '',
  telefone_estabelecimento  TEXT DEFAULT '',
  msg_entrada               TEXT,
  msg_saida                 TEXT,
  atualizado_em             TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE configuracoes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='configuracoes' AND policyname='user_own_config') THEN
    CREATE POLICY "user_own_config" ON configuracoes
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

SELECT 'Tabela configuracoes criada ✓' AS status;
