const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const PAGE_SIZE    = 100;
const sbH = (extra={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...extra });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if (req.method==='OPTIONS') return res.status(200).end();

  const q      = req.query || {};
  const action = q.action  || 'lista';

  if (req.method==='GET' && action==='lista') {
    const [rSub,rMod] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/sub_segmentos?select=id,fk_segmento,nome,categoria_id&order=fk_segmento.asc,nome.asc&limit=300`,{headers:sbH()}),
      fetch(`${SUPABASE_URL}/rest/v1/modelos?select=fk_sub_segmento`,{headers:sbH()}),
    ]);
    const [rows,modelos] = await Promise.all([rSub.json(),rMod.json()]);
    const contagem={};
    (modelos||[]).forEach(m=>{if(m.fk_sub_segmento)contagem[m.fk_sub_segmento]=(contagem[m.fk_sub_segmento]||0)+1;});
    return res.status(200).json({rows:rows||[], contagem});
  }

  if (req.method==='GET' && action==='modelos') {
    const id    = q.id||'';
    const busca = q.busca||'';
    const page  = Math.max(1,parseInt(q.page||'1'));
    const offset= (page-1)*PAGE_SIZE;
    if (!id) return res.status(400).json({erro:true,msg:'id obrigatório'});
    let url = `${SUPABASE_URL}/rest/v1/modelos?fk_sub_segmento=eq.${id}&order=modelo.asc&limit=${PAGE_SIZE}&offset=${offset}`;
    if (busca) url+=`&modelo=ilike.*${encodeURIComponent(busca)}*`;
    const r = await fetch(url,{headers:sbH({Prefer:'count=exact'})});
    const rows  = await r.json();
    const total = parseInt(r.headers.get('content-range')?.split('/')[1]||'0');
    return res.status(200).json({rows:rows||[], total, pages:Math.ceil(total/PAGE_SIZE)});
  }

  if (req.method==='GET' && action==='buscar_sub') {
    const busca=(q.busca||'').trim();
    if (!busca) return res.status(200).json({subIds:[]});
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/modelos?modelo=ilike.*${encodeURIComponent(busca)}*&select=fk_sub_segmento&limit=500`,
      {headers:sbH()}
    );
    const rows  = await r.json();
    const subIds= [...new Set((rows||[]).map(m=>m.fk_sub_segmento).filter(Boolean))];
    return res.status(200).json({subIds});
  }

  if (req.method==='POST') {
    const buf = await new Promise(resolve=>{let d='';req.on('data',c=>d+=c);req.on('end',()=>resolve(d));});
    const {id,categoriaId} = JSON.parse(buf||'{}');
    if (!id||!categoriaId) return res.status(400).json({erro:true,msg:'id e categoriaId obrigatórios.'});
    await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/sub_segmentos?id=eq.${id}`,{
        method:'PATCH',headers:sbH({Prefer:'return=minimal'}),body:JSON.stringify({categoria_id:categoriaId}),
      }),
      fetch(`${SUPABASE_URL}/rest/v1/veiculos?fk_sub_segmento=eq.${id}&categoria_manual=eq.false`,{
        method:'PATCH',headers:sbH({Prefer:'return=minimal'}),body:JSON.stringify({categoria_id:categoriaId}),
      }),
    ]);
    return res.status(200).json({ok:true});
  }

  return res.status(405).end();
};
