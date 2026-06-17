-- Adiciona coluna para registrar quando uma OS usa lavagem de plano
ALTER TABLE ordens_servico ADD COLUMN IF NOT EXISTS plano_usado INTEGER;

SELECT 'Coluna plano_usado adicionada ✓' AS status;
