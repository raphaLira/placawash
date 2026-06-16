/**
 * Netlify Function — categorias
 * GET              → lista todas as categorias ativas
 * POST             → cria ou atualiza uma categoria
 * DELETE ?id=SUV   → desativa (soft delete) uma categoria
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const sbH = (extra={}) => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  ...extra,
});

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };

  // ── GET: lista categorias ──────────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/categorias_preco?ativo=eq.true&order=ordem.asc,label.asc`,
      { headers: sbH() }
    );
    const rows = await r.json();
    return { statusCode:200, headers, body: JSON.stringify(rows||[]) };
  }

  // ── POST: cria / atualiza categoria ───────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body||'{}'); }
    catch { return { statusCode:400, headers, body: JSON.stringify({erro:true,msg:'Body inválido.'}) }; }

    const { id, label, emoji, descricao, cor, preco, ordem } = body;
    if (!id||!label)
      return { statusCode:400, headers, body: JSON.stringify({erro:true,msg:'id e label obrigatórios.'}) };

    // Normaliza o ID: maiúsculo, sem espaços, sem acentos
    const safeId = id.toUpperCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^A-Z0-9_]/g,'_').slice(0,30);

    const row = {
      id:       safeId,
      label:    label.trim(),
      emoji:    emoji||'🚗',
      descricao: descricao||'',
      cor:      cor||'#00e5ff',
      preco:    parseInt(preco)||0,
      ordem:    parseInt(ordem)||99,
      ativo:    true,
    };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/categorias_preco`, {
      method: 'POST',
      headers: sbH({ Prefer:'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify(row),
    });
    const result = await r.json();
    return { statusCode:200, headers, body: JSON.stringify(result?.[0]||row) };
  }

  // ── DELETE: desativa categoria ─────────────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    const id = event.queryStringParameters?.id;
    if (!id) return { statusCode:400, headers, body: JSON.stringify({erro:true,msg:'id obrigatório.'}) };

    await fetch(`${SUPABASE_URL}/rest/v1/categorias_preco?id=eq.${id}`, {
      method: 'PATCH',
      headers: sbH({ Prefer:'return=minimal' }),
      body: JSON.stringify({ ativo: false }),
    });
    return { statusCode:200, headers, body: JSON.stringify({ok:true}) };
  }

  return { statusCode:405, headers, body:'{}' };
};
