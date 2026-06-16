const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const sbH = (e={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...e });

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type,Authorization', 'Content-Type':'application/json' };
  if (event.httpMethod==='OPTIONS') return { statusCode:200, headers, body:'' };

  const q = event.queryStringParameters||{};

  if (event.httpMethod==='GET') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/planos?order=valor.asc`,{ headers:sbH() });
    return { statusCode:200, headers, body:JSON.stringify(await r.json()) };
  }

  if (event.httpMethod==='POST') {
    const body = JSON.parse(event.body||'{}');
    const { nome, qtd_lavagens, valor, servico, descricao } = body;
    if (!nome||!valor) return { statusCode:400, headers, body:JSON.stringify({erro:true,msg:'nome e valor obrigatórios.'}) };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/planos`,{ method:'POST', headers:sbH({Prefer:'return=representation'}), body:JSON.stringify({nome,qtd_lavagens:Number(qtd_lavagens)||8,valor:Number(valor)||0,servico:servico||'simples',descricao:descricao||''}) });
    return { statusCode:201, headers, body:JSON.stringify((await r.json())?.[0]) };
  }

  if (event.httpMethod==='DELETE' && q.id) {
    await fetch(`${SUPABASE_URL}/rest/v1/planos?id=eq.${q.id}`,{ method:'DELETE', headers:sbH({Prefer:'return=minimal'}) });
    return { statusCode:200, headers, body:JSON.stringify({ok:true}) };
  }

  return { statusCode:405, headers, body:'{}' };
};
