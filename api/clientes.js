const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const sbH = (extra={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...extra });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if (req.method==='OPTIONS') return res.status(200).end();

  const q = req.query||{};

  // GET ?placa=ABC1234 → busca cliente pela placa
  if (req.method==='GET' && q.placa) {
    const placa = q.placa.replace(/[^A-Z0-9]/gi,'').toUpperCase();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/clientes?placas=cs.{"${placa}"}&limit=1`,
      { headers: sbH() }
    );
    const rows = await r.json();
    return res.status(200).json(rows?.[0]||null);
  }

  // GET ?id=123 → busca cliente por id
  if (req.method==='GET' && q.id) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${q.id}&limit=1`, { headers: sbH() });
    const rows = await r.json();
    return res.status(200).json(rows?.[0]||null);
  }

  // GET → lista todos os clientes
  if (req.method==='GET') {
    const busca = q.busca||'';
    let url = `${SUPABASE_URL}/rest/v1/clientes?order=nome.asc&limit=200`;
    if (busca) url += `&nome=ilike.*${encodeURIComponent(busca)}*`;
    const r = await fetch(url, { headers: sbH({Prefer:'count=exact'}) });
    const rows  = await r.json();
    const total = r.headers.get('content-range')?.split('/')[1]||0;
    return res.status(200).json({ rows:rows||[], total:Number(total) });
  }

  // POST → cria ou atualiza cliente
  if (req.method==='POST') {
    const buf = await new Promise((ok,err)=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err); });
    const body = JSON.parse(buf||'{}');
    const { id, nome, telefone, placas, obs } = body;

    if (id) {
      // Atualiza
      const r = await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${id}`, {
        method:'PATCH', headers:sbH({Prefer:'return=representation'}),
        body:JSON.stringify({ nome, telefone, placas:placas||[], obs:obs||'' }),
      });
      return res.status(200).json((await r.json())?.[0]||{ok:true});
    } else {
      // Cria
      if (!nome) return res.status(400).json({erro:true,msg:'nome obrigatório.'});
      const row = { nome:nome.trim(), telefone:(telefone||'').replace(/\D/g,''), placas:placas||[], obs:obs||'', criado_em:new Date().toISOString() };
      const r = await fetch(`${SUPABASE_URL}/rest/v1/clientes`, {
        method:'POST', headers:sbH({Prefer:'return=representation'}), body:JSON.stringify(row),
      });
      return res.status(201).json((await r.json())?.[0]||row);
    }
  }

  // DELETE ?id=123
  if (req.method==='DELETE' && q.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${q.id}`, { method:'DELETE', headers:sbH({Prefer:'return=minimal'}) });
    return res.status(200).json({ok:true});
  }

  return res.status(405).end();
};