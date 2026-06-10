const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PAGE_SIZE    = 100;
const sbH = (e={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...e });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if (req.method==='OPTIONS') return res.status(200).end();

  const q = req.query||{};

  // GET → lista modelos com sub-segmento e categoria atual
  if (req.method==='GET') {
    const page   = Math.max(1, parseInt(q.page||'1'));
    const busca  = (q.busca||'').trim();
    const offset = (page-1)*PAGE_SIZE;

    let url = `${SUPABASE_URL}/rest/v1/modelos`
      + `?select=id,modelo,fk_sub_segmento,sub_segmentos(id,nome,categoria_id)`
      + `&order=modelo.asc`
      + `&limit=${PAGE_SIZE}&offset=${offset}`;

    if (busca) url += `&modelo=ilike.*${encodeURIComponent(busca)}*`;

    const r     = await fetch(url, { headers: sbH({Prefer:'count=exact'}) });
    const rows  = await r.json();
    const total = parseInt(r.headers.get('content-range')?.split('/')[1]||'0');

    return res.status(200).json({
      rows:  rows||[],
      total,
      pages: Math.ceil(total/PAGE_SIZE),
      page,
    });
  }

  // PATCH → atualiza categoria do sub-segmento
  // body: { sub_segmento_id, categoria_id, todos: true/false }
  if (req.method==='PATCH') {
    const buf = await new Promise((ok,err)=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err); });
    const { sub_segmento_id, categoria_id } = JSON.parse(buf||'{}');
    if (!sub_segmento_id||!categoria_id) return res.status(400).json({erro:true,msg:'sub_segmento_id e categoria_id obrigatórios.'});

    // Atualiza categoria do sub-segmento
    await fetch(`${SUPABASE_URL}/rest/v1/sub_segmentos?id=eq.${sub_segmento_id}`, {
      method:'PATCH', headers:sbH({Prefer:'return=minimal'}),
      body:JSON.stringify({categoria_id}),
    });

    // Atualiza veículos em cache que NÃO foram corrigidos manualmente
    await fetch(`${SUPABASE_URL}/rest/v1/veiculos?fk_sub_segmento=eq.${sub_segmento_id}&categoria_manual=eq.false`, {
      method:'PATCH', headers:sbH({Prefer:'return=minimal'}),
      body:JSON.stringify({categoria_id}),
    });

    return res.status(200).json({ok:true});
  }

  return res.status(405).end();
};
