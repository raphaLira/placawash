const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PAGE_SIZE    = 100;
const sbH = (e={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...e });

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type,Authorization', 'Content-Type':'application/json' };
  if (event.httpMethod==='OPTIONS') return { statusCode:200, headers, body:'' };

  const q = event.queryStringParameters||{};

  if (event.httpMethod==='GET') {
    const page     = Math.max(1,parseInt(q.page||'1'));
    const busca    = (q.busca||'').trim();
    const catFiltro= (q.cat||'').trim();
    const segFiltro= (q.seg||'').trim();
    const ordem    = q.ordem||'az';
    const offset   = (page-1)*PAGE_SIZE;
    try {
      let subIdsPermitidos = null;
      if (catFiltro==='SEM') {
        const rs = await fetch(`${SUPABASE_URL}/rest/v1/sub_segmentos?categoria_id=is.null&select=id${segFiltro?'&fk_segmento=eq.'+segFiltro:''}`,{ headers:sbH() });
        const subs = await rs.json(); subIdsPermitidos = Array.isArray(subs)?subs.map(s=>s.id):[];
      } else if (catFiltro) {
        const rs = await fetch(`${SUPABASE_URL}/rest/v1/sub_segmentos?categoria_id=eq.${encodeURIComponent(catFiltro)}&select=id${segFiltro?'&fk_segmento=eq.'+segFiltro:''}`,{ headers:sbH() });
        const subs = await rs.json(); subIdsPermitidos = Array.isArray(subs)?subs.map(s=>s.id):[];
      } else if (segFiltro) {
        const rs = await fetch(`${SUPABASE_URL}/rest/v1/sub_segmentos?fk_segmento=eq.${segFiltro}&select=id`,{ headers:sbH() });
        const subs = await rs.json(); subIdsPermitidos = Array.isArray(subs)?subs.map(s=>s.id):[];
      }
      if (subIdsPermitidos!==null&&subIdsPermitidos.length===0)
        return { statusCode:200, headers, body:JSON.stringify({rows:[],total:0,pages:0,page}) };

      let url = `${SUPABASE_URL}/rest/v1/modelos?select=id,modelo,fk_sub_segmento&limit=${PAGE_SIZE}&offset=${offset}`;
      url += ordem==='cat'?'&order=fk_sub_segmento.asc,modelo.asc':`&order=modelo.${ordem==='za'?'desc':'asc'}`;
      if (busca) url+=`&modelo=ilike.*${encodeURIComponent(busca)}*`;
      if (subIdsPermitidos!==null) url+=`&fk_sub_segmento=in.(${subIdsPermitidos.join(',')})`;

      const r     = await fetch(url,{ headers:sbH({Prefer:'count=exact'}) });
      const rows  = await r.json();
      const total = parseInt((r.headers.get('content-range')||'').split('/')[1]||'0')||0;
      if (!Array.isArray(rows)) return { statusCode:200, headers, body:JSON.stringify({rows:[],total:0,pages:0,page}) };

      const subIds = [...new Set(rows.map(r=>r.fk_sub_segmento).filter(Boolean))];
      let subMap = {};
      if (subIds.length>0) {
        const rs = await fetch(`${SUPABASE_URL}/rest/v1/sub_segmentos?id=in.(${subIds.join(',')})&select=id,nome,categoria_id`,{ headers:sbH() });
        const subs = await rs.json();
        if (Array.isArray(subs)) subs.forEach(s=>{ subMap[s.id]=s; });
      }
      return { statusCode:200, headers, body:JSON.stringify({ rows:rows.map(r=>({...r,sub_segmentos:subMap[r.fk_sub_segmento]||null})), total, pages:Math.max(1,Math.ceil(total/PAGE_SIZE)), page }) };
    } catch(e) {
      return { statusCode:200, headers, body:JSON.stringify({rows:[],total:0,pages:0,page}) };
    }
  }

  if (event.httpMethod==='PATCH') {
    const body = JSON.parse(event.body||'{}');
    const { sub_segmento_id, categoria_id } = body;
    if (!sub_segmento_id||!categoria_id) return { statusCode:400, headers, body:JSON.stringify({erro:true,msg:'obrigatórios.'}) };
    await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/sub_segmentos?id=eq.${sub_segmento_id}`,{ method:'PATCH', headers:sbH({Prefer:'return=minimal'}), body:JSON.stringify({categoria_id}) }),
      fetch(`${SUPABASE_URL}/rest/v1/veiculos?fk_sub_segmento=eq.${sub_segmento_id}&categoria_manual=eq.false`,{ method:'PATCH', headers:sbH({Prefer:'return=minimal'}), body:JSON.stringify({categoria_id}) }),
    ]);
    return { statusCode:200, headers, body:JSON.stringify({ok:true}) };
  }

  return { statusCode:405, headers, body:'{}' };
};
