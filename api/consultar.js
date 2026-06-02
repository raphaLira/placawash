const TOKEN        = '5275830624180eb26cb17bfadbc7ec8c';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const sbH = () => ({
  apikey:         SUPABASE_KEY,
  Authorization:  `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
});

async function buscarCategoria(marca, modelo) {
  if (!marca || !modelo) return null;
  const chave = `${marca}/${modelo}`.toUpperCase();

  // Busca MARCA/MODELO* (ex: HYUNDAI/CRETA 16A ATTITU)
  const r1 = await fetch(
    `${SUPABASE_URL}/rest/v1/modelos?modelo=ilike.${encodeURIComponent(chave)}%25&select=fk_sub_segmento,sub_segmentos(id,nome,categoria_id)&limit=1`,
    { headers: sbH() }
  );
  const d1 = await r1.json();
  if (d1?.[0]?.sub_segmentos?.categoria_id) return {
    categoriaId: d1[0].sub_segmentos.categoria_id,
    subSegId:    d1[0].fk_sub_segmento,
    subSegNome:  d1[0].sub_segmentos.nome,
  };

  // Busca MARCA/PRIMEIRAP* (ex: HYUNDAI/CRETA*)
  const primP = modelo.toUpperCase().split(' ')[0];
  const r2 = await fetch(
    `${SUPABASE_URL}/rest/v1/modelos?modelo=ilike.${encodeURIComponent(marca.toUpperCase()+'/'+primP)}%25&select=fk_sub_segmento,sub_segmentos(id,nome,categoria_id)&limit=1`,
    { headers: sbH() }
  );
  const d2 = await r2.json();
  if (d2?.[0]?.sub_segmentos?.categoria_id) return {
    categoriaId: d2[0].sub_segmentos.categoria_id,
    subSegId:    d2[0].fk_sub_segmento,
    subSegNome:  d2[0].sub_segmentos.nome,
  };

  return null;
}

// Handler Vercel (Express-style direto)
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Lê body
  let placa = '';
  try {
    const buf = await new Promise((resolve, reject) => {
      let d = '';
      req.on('data', c => d += c);
      req.on('end',  () => resolve(d));
      req.on('error', reject);
    });
    placa = (JSON.parse(buf || '{}').placa || '').replace(/[^A-Z0-9]/gi,'').toUpperCase();
  } catch {
    placa = (req.query?.placa || '').replace(/[^A-Z0-9]/gi,'').toUpperCase();
  }

  if (!placa || (!/^[A-Z]{3}\d{4}$/.test(placa) && !/^[A-Z]{3}\d[A-Z]\d{2}$/.test(placa)))
    return res.status(400).json({erro:true, msg:'Placa inválida.'});

  // 1. Cache
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const rc = await fetch(`${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${placa}&limit=1`, { headers: sbH() });
      const cached = await rc.json();
      if (cached?.[0]) {
        const c = cached[0];
        let catId = c.categoria_id;

        // Sempre busca categoria atual do sub-segmento (reflete mudanças)
        if (c.fk_sub_segmento && !c.categoria_manual) {
          const rs = await fetch(
            `${SUPABASE_URL}/rest/v1/sub_segmentos?id=eq.${c.fk_sub_segmento}&select=categoria_id,nome&limit=1`,
            { headers: sbH() }
          );
          const sub = await rs.json();
          if (sub?.[0]?.categoria_id) catId = sub[0].categoria_id;
        }

        // Atualiza timestamp em background
        fetch(`${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${placa}`, {
          method:'PATCH', headers:{...sbH(),Prefer:'return=minimal'},
          body: JSON.stringify({consultado_em: new Date().toISOString()}),
        }).catch(()=>{});

        return res.status(200).json({
          ...c.dados,
          _cache:           true,
          _categoriaId:     catId,
          _categoriaManual: c.categoria_manual,
          _subSegNome:      c.sub_seg_nome || null,
        });
      }
    } catch(e) { console.error('[cache]', e.message); }
  }

  // 2. API externa
  let apiData;
  try {
    const r   = await fetch(`https://wdapi2.com.br/consulta/${placa}/${TOKEN}`, {
      headers:{Accept:'application/json'}, signal:AbortSignal.timeout(10000),
    });
    const txt = await r.text();
    if (!r.ok) return res.status(r.status).json({erro:true, msg:`Erro ${r.status} da API`});
    apiData = JSON.parse(txt);
    if (apiData.erro || apiData.error)
      return res.status(400).json({erro:true, msg: apiData.msg||'Placa não encontrada.'});
  } catch(e) {
    return res.status(500).json({erro:true, msg:`Erro de conexão: ${e.message}`});
  }

  // 3. Busca categoria
  const ex    = apiData.extra || {};
  const marca = apiData.MARCA || '';
  const modelo= apiData.MODELO || ex.modelo || '';

  let categoriaId = null, subSegId = null, subSegNome = null;
  if (marca && modelo) {
    const mc = await buscarCategoria(marca, modelo);
    if (mc) { categoriaId = mc.categoriaId; subSegId = mc.subSegId; subSegNome = mc.subSegNome; }
  }

  // 4. Salva
  if (SUPABASE_URL && SUPABASE_KEY) {
    await fetch(`${SUPABASE_URL}/rest/v1/veiculos`, {
      method:'POST',
      headers:{...sbH(), Prefer:'resolution=merge-duplicates'},
      body: JSON.stringify({
        placa, marca, modelo,
        fk_sub_segmento: subSegId   || null,
        sub_seg_nome:    subSegNome || null,
        ano:             apiData.ano || ex.ano_fabricacao || '',
        ano_modelo:      apiData.anoModelo || ex.ano_modelo || '',
        cor:             apiData.cor || '',
        combustivel:     ex.combustivel || '',
        especie:         ex.especie || '',
        municipio:       ex.municipio || '',
        uf:              ex.uf || '',
        chassi:          apiData.chassi || '',
        codigo_situacao: String(apiData.codigoSituacao ?? '0'),
        categoria_id:    categoriaId || null,
        categoria_manual: false,
        consultas:       1,
        consultado_em:   new Date().toISOString(),
        dados:           apiData,
      }),
    }).catch(e => console.error('[save]', e.message));
  }

  return res.status(200).json({
    ...apiData,
    _cache:           false,
    _categoriaId:     categoriaId,
    _categoriaManual: false,
    _subSegNome:      subSegNome,
  });
};
