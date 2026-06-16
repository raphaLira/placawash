const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const sbH = (e={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...e });

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type,Authorization', 'Content-Type':'application/json' };
  if (event.httpMethod==='OPTIONS') return { statusCode:200, headers, body:'' };

  const q = event.queryStringParameters||{};

  if (event.httpMethod==='GET' && q.action==='fila') {
    const hoje = new Date().toISOString().split('T')[0];
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ordens_servico?created_at=gte.${hoje}T00:00:00&order=created_at.asc&limit=100`,{ headers:sbH({Prefer:'count=exact'}) });
    const rows = await r.json();
    return { statusCode:200, headers, body:JSON.stringify({rows:rows||[]}) };
  }

  if (event.httpMethod==='GET' && q.action==='caixa') {
    const data = q.data||new Date().toISOString().split('T')[0];
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ordens_servico?created_at=gte.${data}T00:00:00&created_at=lte.${data}T23:59:59&status=eq.pronto&select=valor,servico,categoria_id`,{ headers:sbH() });
    const rows = await r.json();
    const total = (rows||[]).reduce((s,r)=>s+(r.valor||0),0);
    const qtd   = rows?.length||0;
    const ticket= qtd>0?Math.round(total/qtd):0;
    const porServico={};
    (rows||[]).forEach(r=>{ const k=r.servico||'simples'; if(!porServico[k])porServico[k]={qtd:0,total:0}; porServico[k].qtd++; porServico[k].total+=r.valor||0; });
    return { statusCode:200, headers, body:JSON.stringify({total,qtd,ticket,porServico,data}) };
  }

  if (event.httpMethod==='POST') {
    const body = JSON.parse(event.body||'{}');
    const { placa,marca,modelo,cor,categoria_id,servico,valor,obs,telefone,cliente_id } = body;
    if (!placa||!valor) return { statusCode:400, headers, body:JSON.stringify({erro:true,msg:'placa e valor obrigatórios.'}) };
    const row = { placa:placa.replace(/[^A-Z0-9]/gi,'').toUpperCase(), marca:marca||'', modelo:modelo||'', cor:cor||'', categoria_id:categoria_id||null, servico:servico||'simples', valor:Number(valor)||0, obs:obs||'', telefone:telefone||'', cliente_id:cliente_id||null, status:'aguardando', created_at:new Date().toISOString() };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ordens_servico`,{ method:'POST', headers:sbH({Prefer:'return=representation'}), body:JSON.stringify(row) });
    const result = await r.json();
    return { statusCode:201, headers, body:JSON.stringify(result?.[0]||row) };
  }

  if (event.httpMethod==='PATCH') {
    const id   = q.id;
    if (!id) return { statusCode:400, headers, body:JSON.stringify({erro:true,msg:'id obrigatório.'}) };
    const body = JSON.parse(event.body||'{}');
    if (body.status==='pronto')      body.finalizado_em = new Date().toISOString();
    if (body.status==='em_lavagem')  body.iniciado_em   = new Date().toISOString();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ordens_servico?id=eq.${id}`,{ method:'PATCH', headers:sbH({Prefer:'return=representation'}), body:JSON.stringify(body) });
    const result = await r.json();
    return { statusCode:200, headers, body:JSON.stringify(result?.[0]||{ok:true}) };
  }

  if (event.httpMethod==='DELETE') {
    const id = q.id;
    if (!id) return { statusCode:400, headers, body:JSON.stringify({erro:true,msg:'id obrigatório.'}) };
    await fetch(`${SUPABASE_URL}/rest/v1/ordens_servico?id=eq.${id}`,{ method:'PATCH', headers:sbH({Prefer:'return=minimal'}), body:JSON.stringify({status:'cancelado'}) });
    return { statusCode:200, headers, body:JSON.stringify({ok:true}) };
  }

  return { statusCode:405, headers, body:'{}' };
};
