const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const sbH = (extra={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...extra });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if (req.method==='OPTIONS') return res.status(200).end();

  if (req.method==='GET') {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/categorias_preco?ativo=eq.true&order=ordem.asc,label.asc`, { headers:sbH() });
    return res.status(200).json(await r.json());
  }

  if (req.method==='POST') {
    const buf = await new Promise(resolve => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>resolve(d)); });
    const body = JSON.parse(buf||'{}');
    const { id, label, emoji, descricao, cor, preco, ordem } = body;
    if (!id||!label) return res.status(400).json({erro:true,msg:'id e label obrigatórios.'});
    const safeId = id.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9_]/g,'_').slice(0,30);
    const row = { id:safeId, label:label.trim(), emoji:emoji||'🚗', descricao:descricao||'', cor:cor||'#00e5ff', preco:parseInt(preco)||0, ordem:parseInt(ordem)||99, ativo:true };
    const r = await fetch(`${SUPABASE_URL}/rest/v1/categorias_preco`, {
      method:'POST', headers:sbH({Prefer:'resolution=merge-duplicates,return=representation'}), body:JSON.stringify(row),
    });
    const result = await r.json();
    return res.status(200).json(result?.[0]||row);
  }

  if (req.method==='DELETE') {
    const id = req.query?.id;
    if (!id) return res.status(400).json({erro:true,msg:'id obrigatório.'});
    await fetch(`${SUPABASE_URL}/rest/v1/categorias_preco?id=eq.${id}`, {
      method:'PATCH', headers:sbH({Prefer:'return=minimal'}), body:JSON.stringify({ativo:false}),
    });
    return res.status(200).json({ok:true});
  }

  return res.status(405).end();
};
