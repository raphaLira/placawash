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

  // GET → lista modelos com filtros e ordenação
  if (req.method==='GET') {
    const page     = Math.max(1, parseInt(q.page||'1'));
    const busca    = (q.busca||'').trim();
    const catFiltro= (q.cat||'').trim();    // id da categoria ou 'SEM'
    const segFiltro= (q.seg||'').trim();    // fk_segmento do sub-segmento
    const ordem    = q.ordem || 'az';
    const offset   = (page-1)*PAGE_SIZE;

    try {
      // ── Se filtro por categoria, precisamos buscar sub-segmentos primeiro ──
      let subIdsPermitidos = null; // null = sem filtro

      if (catFiltro === 'SEM') {
        // Sub-segmentos SEM categoria
        const rs = await fetch(
          `${SUPABASE_URL}/rest/v1/sub_segmentos?categoria_id=is.null&select=id${segFiltro?'&fk_segmento=eq.'+segFiltro:''}`,
          { headers: sbH() }
        );
        const subs = await rs.json();
        subIdsPermitidos = Array.isArray(subs) ? subs.map(s=>s.id) : [];
      } else if (catFiltro) {
        // Sub-segmentos COM essa categoria
        const rs = await fetch(
          `${SUPABASE_URL}/rest/v1/sub_segmentos?categoria_id=eq.${encodeURIComponent(catFiltro)}&select=id${segFiltro?'&fk_segmento=eq.'+segFiltro:''}`,
          { headers: sbH() }
        );
        const subs = await rs.json();
        subIdsPermitidos = Array.isArray(subs) ? subs.map(s=>s.id) : [];
      } else if (segFiltro) {
        // Só filtro por segmento
        const rs = await fetch(
          `${SUPABASE_URL}/rest/v1/sub_segmentos?fk_segmento=eq.${segFiltro}&select=id`,
          { headers: sbH() }
        );
        const subs = await rs.json();
        subIdsPermitidos = Array.isArray(subs) ? subs.map(s=>s.id) : [];
      }

      // Se filtro retornou lista vazia → sem resultados
      if (subIdsPermitidos !== null && subIdsPermitidos.length === 0) {
        return res.status(200).json({ rows:[], total:0, pages:0, page });
      }

      // ── Monta query dos modelos ──────────────────────────────────────────
      const orderDir = ordem === 'za' ? 'desc' : 'asc';
      let url = `${SUPABASE_URL}/rest/v1/modelos?select=id,modelo,fk_sub_segmento&limit=${PAGE_SIZE}&offset=${offset}`;

      if (ordem === 'cat') {
        url += '&order=fk_sub_segmento.asc,modelo.asc';
      } else {
        url += `&order=modelo.${orderDir}`;
      }

      if (busca) url += `&modelo=ilike.*${encodeURIComponent(busca)}*`;
      if (subIdsPermitidos !== null) url += `&fk_sub_segmento=in.(${subIdsPermitidos.join(',')})`;

      const r     = await fetch(url, { headers: sbH({Prefer:'count=exact'}) });
      const rows  = await r.json();
      const range = r.headers.get('content-range')||'';
      const total = parseInt(range.split('/')[1]||'0')||0;

      if (!Array.isArray(rows)) {
        console.error('[modelos] resposta inesperada:', JSON.stringify(rows).slice(0,200));
        return res.status(200).json({ rows:[], total:0, pages:0, page });
      }

      // ── Busca sub-segmentos dos resultados ────────────────────────────────
      const subIds = [...new Set(rows.map(r=>r.fk_sub_segmento).filter(Boolean))];
      let subMap = {};

      if (subIds.length > 0) {
        const rs = await fetch(
          `${SUPABASE_URL}/rest/v1/sub_segmentos?id=in.(${subIds.join(',')})&select=id,nome,categoria_id,fk_segmento`,
          { headers: sbH() }
        );
        const subs = await rs.json();
        if (Array.isArray(subs)) subs.forEach(s=>{ subMap[s.id]=s; });
      }

      const rowsComSub = rows.map(row => ({
        ...row,
        sub_segmentos: subMap[row.fk_sub_segmento]||null,
      }));

      return res.status(200).json({
        rows:  rowsComSub,
        total,
        pages: Math.max(1, Math.ceil(total/PAGE_SIZE)),
        page,
      });

    } catch(e) {
      console.error('[modelos] erro:', e.message);
      return res.status(200).json({ rows:[], total:0, pages:0, page });
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
        fetch(`${SUPABASE_URL}/rest/v1/sub_segmentos?id=eq.${sub_segmento_id}`,{
          method:'PATCH', headers:sbH({Prefer:'return=minimal'}),
          body:JSON.stringify({categoria_id}),
        }),
        fetch(`${SUPABASE_URL}/rest/v1/veiculos?fk_sub_segmento=eq.${sub_segmento_id}&categoria_manual=eq.false`,{
          method:'PATCH', headers:sbH({Prefer:'return=minimal'}),
          body:JSON.stringify({categoria_id}),
        }),
      ]);

      return res.status(200).json({ok:true});
    } catch(e) {
      return res.status(500).json({erro:true,msg:e.message});
    }
  }

  return res.status(405).end();
};