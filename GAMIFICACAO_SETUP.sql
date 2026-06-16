-- Tabela de streaks (sequência de dias usando o app)
CREATE TABLE IF NOT EXISTS user_streaks (
  id               SERIAL PRIMARY KEY,
  user_id          UUID UNIQUE NOT NULL,
  streak_atual     INTEGER DEFAULT 0,
  streak_recorde   INTEGER DEFAULT 0,
  ultima_atividade DATE,
  criado_em        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_streaks' AND policyname='user_own_streak') THEN
    CREATE POLICY "user_own_streak" ON user_streaks
      FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

SELECT 'Tabela user_streaks criada ✓' AS status;
