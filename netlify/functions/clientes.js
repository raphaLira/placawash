const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const sbH = (e={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...e });

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type,Authorization', 'Content-Type':'application/json' };
  if (event.httpMethod==='OPTIONS') return { statusCode:200, headers, body:'' };

  const q = event.queryStringParameters||{};

  if (event.httpMethod==='GET' && q.placa) {
    const placa = q.placa.replace(/[^A-Z0-9]/gi,'').toUpperCase();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/clientes?placas=cs.{"${placa}"}&limit=1`,{ headers:sbH() });
    const rows = await r.json();
    return { statusCode:200, headers, body:JSON.stringify(rows?.[0]||null) };
  }

  if (event.httpMethod==='GET') {
    const busca = q.busca||'';
    let url = `${SUPABASE_URL}/rest/v1/clientes?order=nome.asc&limit=200`;
    if (busca) url += `&nome=ilike.*${encodeURIComponent(busca)}*`;
    const r = await fetch(url,{ headers:sbH({Prefer:'count=exact'}) });
    const rows  = await r.json();
    const total = r.headers.get('content-range')?.split('/')[1]||0;
    return { statusCode:200, headers, body:JSON.stringify({rows:rows||[],total:Number(total)}) };
  }

  if (event.httpMethod==='POST') {
    const body = JSON.parse(event.body||'{}');
    const { id, nome, telefone, placas, obs } = body;
    if (id) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${id}`,{ method:'PATCH', headers:sbH({Prefer:'return=representation'}), body:JSON.stringify({nome,telefone,placas:placas||[],obs:obs||''}) });
      return { statusCode:200, headers, body:JSON.stringify((await r.json())?.[0]||{ok:true}) };
    } else {
      if (!nome) return { statusCode:400, headers, body:JSON.stringify({erro:true,msg:'nome obrigatório.'}) };
      const row = { nome:nome.trim(), telefone:(telefone||'').replace(/\D/g,''), placas:placas||[], obs:obs||'', criado_em:new Date().toISOString() };
      const r = await fetch(`${SUPABASE_URL}/rest/v1/clientes`,{ method:'POST', headers:sbH({Prefer:'return=representation'}), body:JSON.stringify(row) });
      return { statusCode:201, headers, body:JSON.stringify((await r.json())?.[0]||row) };
    }
  }

  if (event.httpMethod==='DELETE' && q.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/clientes?id=eq.${q.id}`,{ method:'DELETE', headers:sbH({Prefer:'return=minimal'}) });
    return { statusCode:200, headers, body:JSON.stringify({ok:true}) };
  }

  return { statusCode:405, headers, body:'{}' };
};
