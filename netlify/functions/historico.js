/**
 * Netlify Function — historico
 * GET  → lista todos os veículos salvos (com paginação)
 * DELETE ?placa=ABC1234 → remove um veículo do cache
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return { statusCode: 503, headers, body: JSON.stringify({ erro: true, msg: 'Banco não configurado.' }) };
  }

  // ── LIST ──────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const page  = parseInt(event.queryStringParameters?.page  || '1');
    const limit = parseInt(event.queryStringParameters?.limit || '50');
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/veiculos?order=consultado_em.desc&offset=${from}&limit=${limit}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          Prefer: 'count=exact',
        },
      }
    );

    const total = res.headers.get('content-range')?.split('/')[1] || '?';
    const rows  = await res.json();
    return { statusCode: 200, headers, body: JSON.stringify({ total, rows }) };
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    const placa = (event.queryStringParameters?.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    if (!placa) return { statusCode: 400, headers, body: JSON.stringify({ erro: true, msg: 'Placa ausente.' }) };

    await fetch(`${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${placa}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ erro: true, msg: 'Método não permitido.' }) };
};
