const { URL } = require('url');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const sbH = (e={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...e });

function getUserId(event) {
  const auth  = event.headers?.authorization || event.headers?.Authorization || '';
  const token = auth.replace('Bearer ','');
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.sub;
  } catch(e) { return null; }
}

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type,Authorization', 'Content-Type':'application/json' };
  if (event.httpMethod==='OPTIONS') return { statusCode:200, headers, body:'' };

  const userId = getUserId(event);
  if (!userId) return { statusCode:401, headers, body:JSON.stringify({erro:true,msg:'Não autenticado.'}) };

  const q = event.queryStringParameters||{};

  // ── GET lista serviços + preços ──────────────────────────────────────────
  if (event.httpMethod==='GET' && !q.action) {
    try {
      // Busca serviços do usuário; se não tiver nenhum, retorna os globais (sem user_id) como base
      let r = await fetch(`${SUPABASE_URL}/rest/v1/servicos?user_id=eq.${userId}&ativo=eq.true&order=ordem.asc`,{ headers:sbH() });
      let servicos = await r.json();

      if (!Array.isArray(servicos) || servicos.length===0) {
        // Clona os serviços padrão (user_id null) para esse usuário
        const rDefault = await fetch(`${SUPABASE_URL}/rest/v1/servicos?user_id=is.null&ativo=eq.true&order=ordem.asc`,{ headers:sbH() });
        const defaults = await rDefault.json();
        if (Array.isArray(defaults) && defaults.length>0) {
          const clones = defaults.map(s => ({ id:s.id+'_'+userId.slice(0,8), nome:s.nome, emoji:s.emoji, descricao:s.descricao, ordem:s.ordem, ativo:true, user_id:userId }));
          await fetch(`${SUPABASE_URL}/rest/v1/servicos`,{ method:'POST', headers:sbH({Prefer:'resolution=merge-duplicates'}), body:JSON.stringify(clones) });
          servicos = clones;
        }
      }

      return { statusCode:200, headers, body:JSON.stringify(servicos||[]) };
    } catch(e) {
      return { statusCode:200, headers, body:JSON.stringify([]) };
    }
  }

  // ── GET matriz de preços (categoria x servico) ───────────────────────────
  if (event.httpMethod==='GET' && q.action==='precos') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/precos_servico?user_id=eq.${userId}`,{ headers:sbH() });
      const rows = await r.json();
      return { statusCode:200, headers, body:JSON.stringify(Array.isArray(rows)?rows:[]) };
    } catch(e) {
      return { statusCode:200, headers, body:JSON.stringify([]) };
    }
  }

  // ── POST cria/atualiza serviço ───────────────────────────────────────────
  if (event.httpMethod==='POST' && !q.action) {
    const body = JSON.parse(event.body||'{}');
    const { id, nome, emoji, descricao, ordem } = body;
    if (!nome) return { statusCode:400, headers, body:JSON.stringify({erro:true,msg:'nome obrigatório.'}) };

    const safeId = id || (nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'_') + '_' + userId.slice(0,8));
    const row = { id:safeId, nome, emoji:emoji||'💧', descricao:descricao||'', ordem:ordem||99, ativo:true, user_id:userId };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/servicos`,{
      method:'POST', headers:sbH({Prefer:'resolution=merge-duplicates,return=representation'}), body:JSON.stringify(row),
    });
    const result = await r.json();
    return { statusCode:200, headers, body:JSON.stringify(Array.isArray(result)?result[0]:row) };
  }

  // ── POST salva preço (categoria + servico) ───────────────────────────────
  if (event.httpMethod==='POST' && q.action==='preco') {
    const body = JSON.parse(event.body||'{}');
    const { categoria_id, servico_id, valor } = body;
    if (!categoria_id||!servico_id) return { statusCode:400, headers, body:JSON.stringify({erro:true,msg:'categoria_id e servico_id obrigatórios.'}) };

    const row = { categoria_id, servico_id, valor:Number(valor)||0, user_id:userId };
    await fetch(`${SUPABASE_URL}/rest/v1/precos_servico`,{
      method:'POST', headers:sbH({Prefer:'resolution=merge-duplicates,return=minimal'}), body:JSON.stringify(row),
    });
    return { statusCode:200, headers, body:JSON.stringify({ok:true}) };
  }

  // ── DELETE remove serviço (soft delete) ──────────────────────────────────
  if (event.httpMethod==='DELETE' && q.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/servicos?id=eq.${q.id}&user_id=eq.${userId}`,{
      method:'PATCH', headers:sbH({Prefer:'return=minimal'}), body:JSON.stringify({ativo:false}),
    });
    return { statusCode:200, headers, body:JSON.stringify({ok:true}) };
  }

  return { statusCode:405, headers, body:'{}' };
};

// Adaptador Vercel
module.exports = async (req, res) => {
  const qs = Object.fromEntries(new URL(req.url, 'http://x').searchParams.entries());
  const event = {
    httpMethod: req.method,
    queryStringParameters: qs,
    headers: req.headers,
    body: await new Promise(ok => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d||null)); }),
  };
  const result = await exports.handler(event);
  Object.entries(result.headers||{}).forEach(([k,v])=>res.setHeader(k,v));
  res.status(result.statusCode||200).send(result.body||'');
};
