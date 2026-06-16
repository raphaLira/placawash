/**
 * Netlify Function — sub_segmentos
 * GET ?action=lista              → todos os sub-segmentos com contagem de modelos
 * GET ?action=modelos&id=X       → modelos de um sub-segmento (com busca e paginação)
 * GET ?action=buscar_sub&busca=X → quais sub_segmentos contêm modelos com esse nome
 * POST                           → atualiza categoria_id de um sub-segmento
 *                                  E atualiza TODOS os veículos daquele sub-segmento no cache
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PAGE_SIZE    = 100;

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

  const q      = event.queryStringParameters || {};
  const action = q.action || 'lista';

  // ── GET lista ─────────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET' && action === 'lista') {
    const [rSub, rMod] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/sub_segmentos?select=id,fk_segmento,nome,categoria_id&order=fk_segmento.asc,nome.asc&limit=300`, { headers: sbH() }),
      fetch(`${SUPABASE_URL}/rest/v1/modelos?select=fk_sub_segmento`, { headers: sbH() }),
    ]);
    const [rows, modelos] = await Promise.all([rSub.json(), rMod.json()]);
    const contagem = {};
    (modelos||[]).forEach(m => { if(m.fk_sub_segmento) contagem[m.fk_sub_segmento]=(contagem[m.fk_sub_segmento]||0)+1; });
    return { statusCode:200, headers, body: JSON.stringify({ rows:rows||[], contagem }) };
  }

  // ── GET modelos ───────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET' && action === 'modelos') {
    const id     = q.id    || '';
    const busca  = q.busca || '';
    const page   = Math.max(1, parseInt(q.page||'1'));
    const offset = (page-1)*PAGE_SIZE;
    if (!id) return { statusCode:400, headers, body: JSON.stringify({erro:true,msg:'id obrigatório'}) };

    let url = `${SUPABASE_URL}/rest/v1/modelos?fk_sub_segmento=eq.${id}&order=modelo.asc&limit=${PAGE_SIZE}&offset=${offset}`;
    if (busca) url += `&modelo=ilike.*${encodeURIComponent(busca)}*`;

    const r     = await fetch(url, { headers: sbH({Prefer:'count=exact'}) });
    const rows  = await r.json();
    const total = parseInt(r.headers.get('content-range')?.split('/')[1]||'0');
    return { statusCode:200, headers, body: JSON.stringify({ rows:rows||[], total, pages:Math.ceil(total/PAGE_SIZE) }) };
  }

  // ── GET buscar_sub ────────────────────────────────────────────────────────
  if (event.httpMethod === 'GET' && action === 'buscar_sub') {
    const busca = (q.busca||'').trim();
    if (!busca) return { statusCode:200, headers, body: JSON.stringify({subIds:[]}) };

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/modelos?modelo=ilike.*${encodeURIComponent(busca)}*&select=fk_sub_segmento&limit=500`,
      { headers: sbH() }
    );
    const rows   = await r.json();
    const subIds = [...new Set((rows||[]).map(m=>m.fk_sub_segmento).filter(Boolean))];
    return { statusCode:200, headers, body: JSON.stringify({ subIds }) };
  }

  // ── POST: salva categoria do sub-segmento ─────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body||'{}'); }
    catch { return { statusCode:400, headers, body: JSON.stringify({erro:true,msg:'Body inválido.'}) }; }

    const { id, categoriaId } = body;
    if (!id||!categoriaId)
      return { statusCode:400, headers, body: JSON.stringify({erro:true,msg:'id e categoriaId obrigatórios.'}) };

    // 1. Atualiza o sub-segmento
    await fetch(`${SUPABASE_URL}/rest/v1/sub_segmentos?id=eq.${id}`, {
      method:'PATCH', headers:sbH({Prefer:'return=minimal'}),
      body:JSON.stringify({categoria_id:categoriaId}),
    });

    // 2. Atualiza TODOS os veículos que têm esse fk_sub_segmento no cache
    //    Isso garante que veículos já consultados reflitam a nova categoria
    const updateVeiculos = await fetch(
      `${SUPABASE_URL}/rest/v1/veiculos?fk_sub_segmento=eq.${id}&categoria_manual=eq.false`,
      {
        method:'PATCH',
        headers:sbH({Prefer:'return=minimal'}),
        body:JSON.stringify({categoria_id:categoriaId}),
      }
    );

    console.log(`[sub_seg] id=${id} → ${categoriaId} | veiculos atualizados: ${updateVeiculos.status}`);

    return { statusCode:200, headers, body: JSON.stringify({ok:true}) };
  }

  return { statusCode:405, headers, body:'{}' };
};
