const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PAGE_SIZE    = 100;
const sbH = (e={}) => ({
  apikey:        SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type':'application/json',
  ...e
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if (req.method==='OPTIONS') return res.status(200).end();

  const q = req.query||{};

  // GET → lista modelos com sub-segmento e categoria
  if (req.method==='GET') {
    const page   = Math.max(1, parseInt(q.page||'1'));
    const busca  = (q.busca||'').trim();
    const offset = (page-1)*PAGE_SIZE;

    try {
      // Busca modelos com join no sub_segmento
      let url = `${SUPABASE_URL}/rest/v1/modelos`
        + `?select=id,modelo,fk_sub_segmento,sub_segmentos(id,nome,categoria_id)`
        + `&order=modelo.asc`
        + `&limit=${PAGE_SIZE}&offset=${offset}`;

      if (busca) url += `&modelo=ilike.*${encodeURIComponent(busca)}*`;

      const r = await fetch(url, { headers: sbH({Prefer:'count=exact'}) });

      if (!r.ok) {
        const txt = await r.text();
        console.error('[modelos] erro Supabase:', r.status, txt.slice(0,200));
        return res.status(200).json({ rows:[], total:0, pages:0, page, erro: txt.slice(0,100) });
      }

      const rows  = await r.json();
      const range = r.headers.get('content-range')||'';
      const total = parseInt(range.split('/')[1]||'0')||0;

      // Garante que rows é array
      const safeRows = Array.isArray(rows) ? rows : [];

      return res.status(200).json({
        rows:  safeRows,
        total,
        pages: Math.ceil(total/PAGE_SIZE)||1,
        page,
      });
    } catch(e) {
      console.error('[modelos] erro:', e.message);
      return res.status(200).json({ rows:[], total:0, pages:0, page, erro: e.message });
    }
  }

  // PATCH → atualiza categoria do sub-segmento + veículos em cache
  if (req.method==='PATCH') {
    try {
      const buf = await new Promise((ok,err)=>{ let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err); });
      const { sub_segmento_id, categoria_id } = JSON.parse(buf||'{}');
      if (!sub_segmento_id||!categoria_id)
        return res.status(400).json({erro:true,msg:'sub_segmento_id e categoria_id obrigatórios.'});

      await Promise.all([
        // Atualiza sub-segmento
        fetch(`${SUPABASE_URL}/rest/v1/sub_segmentos?id=eq.${sub_segmento_id}`, {
          method:'PATCH', headers:sbH({Prefer:'return=minimal'}),
          body:JSON.stringify({categoria_id}),
        }),
        // Atualiza veículos em cache (não manuais)
        fetch(`${SUPABASE_URL}/rest/v1/veiculos?fk_sub_segmento=eq.${sub_segmento_id}&categoria_manual=eq.false`, {
          method:'PATCH', headers:sbH({Prefer:'return=minimal'}),
          body:JSON.stringify({categoria_id}),
        }),
      ]);

      return res.status(200).json({ok:true});
    } catch(e) {
      return res.status(500).json({erro:true, msg:e.message});
    }
  }

  return res.status(405).end();
};