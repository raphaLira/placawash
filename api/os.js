const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const sbH = (extra={}) => ({
  apikey:        SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type':'application/json',
  ...extra,
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const q = req.query || {};

  // GET ?action=fila → OS do dia (aguardando + em_lavagem + pronto)
  if (req.method === 'GET' && q.action === 'fila') {
    const hoje = new Date().toISOString().split('T')[0];
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/ordens_servico?created_at=gte.${hoje}T00:00:00&order=created_at.desc&limit=100`,
      { headers: sbH({ Prefer:'count=exact' }) }
    );
    const rows  = await r.json();
    const total = r.headers.get('content-range')?.split('/')[1] || 0;
    return res.status(200).json({ rows: rows||[], total: Number(total) });
  }

  // GET ?action=caixa&data=2026-06-01 → resumo financeiro do dia
  if (req.method === 'GET' && q.action === 'caixa') {
    const data  = q.data || new Date().toISOString().split('T')[0];
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/ordens_servico?created_at=gte.${data}T00:00:00&created_at=lt.${data}T23:59:59&status=eq.pronto&select=valor,servico,categoria_id`,
      { headers: sbH() }
    );
    const rows = await r.json();
    const total = (rows||[]).reduce((s,r)=>s+(r.valor||0), 0);
    const qtd   = rows?.length || 0;
    const ticket= qtd > 0 ? Math.round(total/qtd) : 0;

    // Agrupa por serviço
    const porServico = {};
    (rows||[]).forEach(r => {
      const k = r.servico || 'simples';
      if (!porServico[k]) porServico[k] = { qtd:0, total:0 };
      porServico[k].qtd++;
      porServico[k].total += r.valor||0;
    });

    return res.status(200).json({ total, qtd, ticket, porServico, data });
  }

  // POST → cria nova OS
  if (req.method === 'POST') {
    const buf = await new Promise((ok,err)=>{
      let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err);
    });
    const body = JSON.parse(buf||'{}');
    const { placa, marca, modelo, categoria_id, servico, valor, cor, obs } = body;
    if (!placa || !valor) return res.status(400).json({erro:true, msg:'placa e valor obrigatórios.'});

    const row = {
      placa:        placa.replace(/[^A-Z0-9]/gi,'').toUpperCase(),
      marca:        marca        || '',
      modelo:       modelo       || '',
      categoria_id: categoria_id || null,
      servico:      servico      || 'simples',
      valor:        Number(valor)||0,
      cor:          cor          || '',
      obs:          obs          || '',
      status:       'aguardando',
      created_at:   new Date().toISOString(),
    };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/ordens_servico`, {
      method:'POST',
      headers: sbH({ Prefer:'return=representation' }),
      body: JSON.stringify(row),
    });
    const result = await r.json();
    return res.status(201).json(result?.[0] || row);
  }

  // PATCH ?id=123 → atualiza status da OS
  if (req.method === 'PATCH') {
    const id  = q.id;
    if (!id) return res.status(400).json({erro:true, msg:'id obrigatório.'});

    const buf = await new Promise((ok,err)=>{
      let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err);
    });
    const body = JSON.parse(buf||'{}');

    // Se está finalizando, marca horário
    if (body.status === 'pronto') body.finalizado_em = new Date().toISOString();
    if (body.status === 'em_lavagem') body.iniciado_em = new Date().toISOString();

    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/ordens_servico?id=eq.${id}`,
      { method:'PATCH', headers:sbH({Prefer:'return=representation'}), body:JSON.stringify(body) }
    );
    const result = await r.json();
    return res.status(200).json(result?.[0] || {ok:true});
  }

  // DELETE ?id=123 → cancela OS
  if (req.method === 'DELETE') {
    const id = q.id;
    if (!id) return res.status(400).json({erro:true, msg:'id obrigatório.'});
    await fetch(`${SUPABASE_URL}/rest/v1/ordens_servico?id=eq.${id}`,{
      method:'PATCH', headers:sbH({Prefer:'return=minimal'}),
      body:JSON.stringify({status:'cancelado'}),
    });
    return res.status(200).json({ok:true});
  }

  return res.status(405).end();
};
