const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const sbH = (extra={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...extra });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if (req.method==='OPTIONS') return res.status(200).end();

  const q = req.query||{};

  // GET → lista planos
  if (req.method==='GET' && !q.action) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/planos?order=valor.asc`, { headers: sbH() });
    return res.status(200).json(await r.json());
  }

  // GET ?action=assinaturas&cliente_id=X → assinaturas do cliente
  if (req.method==='GET' && q.action==='assinaturas') {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/assinaturas?cliente_id=eq.${q.cliente_id}&order=created_at.desc&limit=10`,
      { headers: sbH() }
    );
    const rows = await r.json();
    // Busca dados dos planos
    const planoIds = [...new Set((rows||[]).map(a=>a.plano_id))];
    let planosMap = {};
    if (planoIds.length) {
      const rp = await fetch(`${SUPABASE_URL}/rest/v1/planos?id=in.(${planoIds.join(',')})`, { headers: sbH() });
      (await rp.json()||[]).forEach(p=>planosMap[p.id]=p);
    }
    return res.status(200).json((rows||[]).map(a=>({...a, plano:planosMap[a.plano_id]||null})));
  }

  // POST → cria plano
  if (req.method==='POST' && !q.action) {
    const buf = await new Promise((ok,err)=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err); });
    const { nome, qtd_lavagens, valor, servico, descricao } = JSON.parse(buf||'{}');
    if (!nome||!qtd_lavagens||!valor) return res.status(400).json({erro:true,msg:'nome, qtd_lavagens e valor obrigatórios.'});
    const r = await fetch(`${SUPABASE_URL}/rest/v1/planos`, {
      method:'POST', headers:sbH({Prefer:'return=representation'}),
      body:JSON.stringify({ nome, qtd_lavagens:Number(qtd_lavagens), valor:Number(valor), servico:servico||'simples', descricao:descricao||'' }),
    });
    return res.status(201).json((await r.json())?.[0]);
  }

  // POST ?action=assinar → assina plano para cliente
  if (req.method==='POST' && q.action==='assinar') {
    const buf = await new Promise((ok,err)=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err); });
    const { cliente_id, plano_id } = JSON.parse(buf||'{}');
    if (!cliente_id||!plano_id) return res.status(400).json({erro:true,msg:'cliente_id e plano_id obrigatórios.'});

    // Calcula validade (30 dias)
    const validade = new Date(Date.now()+30*24*60*60*1000).toISOString().split('T')[0];
    const r = await fetch(`${SUPABASE_URL}/rest/v1/assinaturas`, {
      method:'POST', headers:sbH({Prefer:'return=representation'}),
      body:JSON.stringify({ cliente_id, plano_id, lavagens_usadas:0, validade, ativa:true, created_at:new Date().toISOString() }),
    });
    return res.status(201).json((await r.json())?.[0]);
  }

  // PATCH ?action=usar&id=X → usa uma lavagem da assinatura
  if (req.method==='PATCH' && q.action==='usar') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/assinaturas?id=eq.${q.id}&select=lavagens_usadas,plano_id,planos(qtd_lavagens)&limit=1`, { headers: sbH() });
    const rows = await r.json();
    const a = rows?.[0];
    if (!a) return res.status(404).json({erro:true,msg:'Assinatura não encontrada.'});
    const novoUso = (a.lavagens_usadas||0)+1;
    const ativa   = novoUso < (a.planos?.qtd_lavagens||0);
    await fetch(`${SUPABASE_URL}/rest/v1/assinaturas?id=eq.${q.id}`, {
      method:'PATCH', headers:sbH({Prefer:'return=minimal'}),
      body:JSON.stringify({ lavagens_usadas:novoUso, ativa }),
    });
    return res.status(200).json({ ok:true, lavagens_usadas:novoUso, ativa });
  }

  // DELETE ?id=X → remove plano
  if (req.method==='DELETE' && q.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/planos?id=eq.${q.id}`, { method:'DELETE', headers:sbH({Prefer:'return=minimal'}) });
    return res.status(200).json({ok:true});
  }

  return res.status(405).end();
};