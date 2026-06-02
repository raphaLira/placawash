const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const sbH = () => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', Prefer:'return=minimal' });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if (req.method==='OPTIONS') return res.status(200).end();
  if (req.method!=='POST') return res.status(405).end();

  const buf = await new Promise(resolve => { let d=''; req.on('data',c=>d+=c); req.on('end',()=>resolve(d)); });
  const { placa, categoriaId } = JSON.parse(buf||'{}');
  if (!placa||!categoriaId) return res.status(400).json({erro:true,msg:'placa e categoriaId obrigatórios.'});

  const p = placa.replace(/[^A-Z0-9]/gi,'').toUpperCase();
  await fetch(`${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${p}`, {
    method:'PATCH', headers:sbH(), body:JSON.stringify({categoria_id:categoriaId, categoria_manual:true}),
  });
  return res.status(200).json({ok:true});
};
