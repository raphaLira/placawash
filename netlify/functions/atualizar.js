/**
 * Netlify Function — atualizar
 * POST { placa, categoriaId, marca, modelo }
 * Salva a categoria corrigida na placa específica
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const sbH = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
});

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST')    return { statusCode: 405, headers, body: '{}' };

  if (!SUPABASE_URL || !SUPABASE_KEY)
    return { statusCode: 503, headers, body: JSON.stringify({ erro: true, msg: 'Banco não configurado.' }) };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ erro: true, msg: 'Body inválido.' }) }; }

  const { placa, categoriaId } = body;
  if (!placa || !categoriaId)
    return { statusCode: 400, headers, body: JSON.stringify({ erro: true, msg: 'placa e categoriaId obrigatórios.' }) };

  const p = placa.replace(/[^A-Z0-9]/gi, '').toUpperCase();

  // Atualiza categoria da placa como correção manual
  await fetch(`${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${p}`, {
    method: 'PATCH',
    headers: sbH(),
    body: JSON.stringify({ categoria_id: categoriaId, categoria_manual: true }),
  });

  return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
};
