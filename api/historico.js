const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const sbH = (extra={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...extra });

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Content-Type','application/json');
  if (req.method==='OPTIONS') return res.status(200).end();

  if (req.method==='GET') {
    const page  = parseInt(req.query?.page||'1');
    const limit = parseInt(req.query?.limit||'100');
    const offset= (page-1)*limit;
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/veiculos?order=consultado_em.desc&limit=${limit}&offset=${offset}`,
      { headers:sbH({Prefer:'count=exact'}) }
    );
    const rows  = await r.json();
    const total = r.headers.get('content-range')?.split('/')[1]||'0';
    return res.status(200).json({rows:rows||[], total:Number(total), page});
  }

  if (req.method==='DELETE') {
    const placa = (req.query?.placa||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
    if (!placa) return res.status(400).json({erro:true,msg:'placa obrigatória.'});
    await fetch(`${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${placa}`, {
      method:'DELETE', headers:sbH({Prefer:'return=minimal'}),
    });
    return res.status(200).json({ok:true});
  }

  return res.status(405).end();
};
