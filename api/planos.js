const { URL } = require('url');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const sbH = (e={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...e });

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type,Authorization', 'Content-Type':'application/json' };
  if (event.httpMethod==='OPTIONS') return { statusCode:200, headers, body:'' };

  const q = event.queryStringParameters||{};

  // ── GET lista planos ────────────────────────────────────────────────────
  if (event.httpMethod==='GET' && !q.action) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/planos?order=valor.asc`,{ headers:sbH() });
    return { statusCode:200, headers, body:JSON.stringify(await r.json()) };
  }

  // ── GET assinatura ativa de um cliente ──────────────────────────────────
  if (event.httpMethod==='GET' && q.action==='assinatura' && q.cliente_id) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/assinaturas?cliente_id=eq.${q.cliente_id}&ativa=eq.true&order=created_at.desc&limit=1`,
      { headers:sbH() }
    );
    const rows = await r.json();
    const assinatura = Array.isArray(rows) ? rows[0] : null;
    if (!assinatura) return { statusCode:200, headers, body:JSON.stringify(null) };

    // Busca dados do plano
    const rp = await fetch(`${SUPABASE_URL}/rest/v1/planos?id=eq.${assinatura.plano_id}&limit=1`,{ headers:sbH() });
    const planos = await rp.json();
    const plano = Array.isArray(planos) ? planos[0] : null;

    return { statusCode:200, headers, body:JSON.stringify({ ...assinatura, plano }) };
  }

  // ── GET todas assinaturas (para tela de clientes) ───────────────────────
  if (event.httpMethod==='GET' && q.action==='assinaturas_ativas') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/assinaturas?ativa=eq.true&select=*`,{ headers:sbH() });
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length===0) return { statusCode:200, headers, body:JSON.stringify([]) };

    const planoIds = [...new Set(rows.map(a=>a.plano_id))];
    const rp = await fetch(`${SUPABASE_URL}/rest/v1/planos?id=in.(${planoIds.join(',')})`,{ headers:sbH() });
    const planos = await rp.json();
    const planoMap = {};
    if (Array.isArray(planos)) planos.forEach(p=>{ planoMap[p.id]=p; });

    return { statusCode:200, headers, body:JSON.stringify(rows.map(a=>({...a, plano:planoMap[a.plano_id]||null}))) };
  }

  // ── POST cria plano ──────────────────────────────────────────────────────
  if (event.httpMethod==='POST' && !q.action) {
    const body = JSON.parse(event.body||'{}');
    const { nome, qtd_lavagens, valor, servico, descricao } = body;
    if (!nome||!valor) return { statusCode:400, headers, body:JSON.stringify({erro:true,msg:'nome e valor obrigatórios.'}) };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/planos`,{ method:'POST', headers:sbH({Prefer:'return=representation'}), body:JSON.stringify({nome,qtd_lavagens:Number(qtd_lavagens)||8,valor:Number(valor)||0,servico:servico||'simples',descricao:descricao||''}) });
    return { statusCode:201, headers, body:JSON.stringify((await r.json())?.[0]) };
  }

  // ── POST assina plano para cliente ──────────────────────────────────────
  if (event.httpMethod==='POST' && q.action==='assinar') {
    const body = JSON.parse(event.body||'{}');
    const { cliente_id, plano_id } = body;
    if (!cliente_id||!plano_id) return { statusCode:400, headers, body:JSON.stringify({erro:true,msg:'cliente_id e plano_id obrigatórios.'}) };

    // Desativa assinatura anterior se existir
    await fetch(`${SUPABASE_URL}/rest/v1/assinaturas?cliente_id=eq.${cliente_id}&ativa=eq.true`,{
      method:'PATCH', headers:sbH({Prefer:'return=minimal'}), body:JSON.stringify({ativa:false}),
    });

    const validade = new Date(Date.now()+30*24*60*60*1000).toISOString().split('T')[0];
    const r = await fetch(`${SUPABASE_URL}/rest/v1/assinaturas`,{
      method:'POST', headers:sbH({Prefer:'return=representation'}),
      body:JSON.stringify({ cliente_id, plano_id, lavagens_usadas:0, validade, ativa:true, created_at:new Date().toISOString() }),
    });
    return { statusCode:201, headers, body:JSON.stringify((await r.json())?.[0]) };
  }

  // ── PATCH usa uma lavagem da assinatura ─────────────────────────────────
  if (event.httpMethod==='PATCH' && q.action==='usar') {
    if (!q.id) return { statusCode:400, headers, body:JSON.stringify({erro:true,msg:'id obrigatório.'}) };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/assinaturas?id=eq.${q.id}&limit=1`,{ headers:sbH() });
    const rows = await r.json();
    const assinatura = Array.isArray(rows) ? rows[0] : null;
    if (!assinatura) return { statusCode:404, headers, body:JSON.stringify({erro:true,msg:'Assinatura não encontrada.'}) };

    const rp = await fetch(`${SUPABASE_URL}/rest/v1/planos?id=eq.${assinatura.plano_id}&limit=1`,{ headers:sbH() });
    const planos = await rp.json();
    const plano  = Array.isArray(planos) ? planos[0] : null;

    const novoUso = (assinatura.lavagens_usadas||0) + 1;
    const esgotou = plano ? novoUso >= plano.qtd_lavagens : false;

    await fetch(`${SUPABASE_URL}/rest/v1/assinaturas?id=eq.${q.id}`,{
      method:'PATCH', headers:sbH({Prefer:'return=minimal'}),
      body:JSON.stringify({ lavagens_usadas:novoUso, ativa: !esgotou }),
    });

    return { statusCode:200, headers, body:JSON.stringify({ ok:true, lavagens_usadas:novoUso, qtd_lavagens:plano?.qtd_lavagens||0, esgotou }) };
  }

  // ── DELETE remove plano ──────────────────────────────────────────────────
  if (event.httpMethod==='DELETE' && q.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/planos?id=eq.${q.id}`,{ method:'DELETE', headers:sbH({Prefer:'return=minimal'}) });
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
