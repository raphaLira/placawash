const TOKEN        = '5275830624180eb26cb17bfadbc7ec8c';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const sbH = () => ({
  apikey:         SUPABASE_KEY,
  Authorization:  `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
});

// Busca categoria pelo modelo completo (ex: "HYUNDAI/CRETA 16A ATTITU")
// extra.modelo já vem no formato correto da API
async function buscarCategoria(modeloCompleto) {
  if (!modeloCompleto) return null;
  const M = modeloCompleto.toUpperCase().trim();

  // 1. Busca exata
  const r1 = await fetch(
    `${SUPABASE_URL}/rest/v1/modelos?modelo=eq.${encodeURIComponent(M)}&select=fk_sub_segmento,sub_segmentos(id,nome,categoria_id)&limit=1`,
    { headers: sbH() }
  );
  const d1 = await r1.json();
  if (d1?.[0]?.sub_segmentos?.categoria_id) return {
    categoriaId: d1[0].sub_segmentos.categoria_id,
    subSegId:    d1[0].fk_sub_segmento,
    subSegNome:  d1[0].sub_segmentos.nome,
  };

  // 2. Busca prefixo MARCA/PRIMEIRAP* (ex: HYUNDAI/CRETA*)
  const prefixo = M.split(' ').slice(0,2).join(' ');
  const r2 = await fetch(
    `${SUPABASE_URL}/rest/v1/modelos?modelo=ilike.${encodeURIComponent(prefixo)}%25&select=fk_sub_segmento,sub_segmentos(id,nome,categoria_id)&order=id.asc&limit=1`,
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

// Busca categoria atual do sub-segmento (sempre atualizada)
async function getCatSubSeg(subSegId) {
  if (!subSegId) return null;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/sub_segmentos?id=eq.${subSegId}&select=categoria_id,nome&limit=1`,
    { headers: sbH() }
  );
  const d = await r.json();
  return d?.[0] || null;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Lê placa
  let placa = '';
  try {
    const buf = await new Promise((ok, err) => {
      let d = ''; req.on('data', c => d += c); req.on('end', () => ok(d)); req.on('error', err);
    });
    placa = (JSON.parse(buf || '{}').placa || '').replace(/[^A-Z0-9]/gi,'').toUpperCase();
  } catch {
    placa = (req.query?.placa || '').replace(/[^A-Z0-9]/gi,'').toUpperCase();
  }

  if (!placa || (!/^[A-Z]{3}\d{4}$/.test(placa) && !/^[A-Z]{3}\d[A-Z]\d{2}$/.test(placa)))
    return res.status(400).json({erro:true, msg:'Placa inválida.'});

  // ── 1. Verifica cache ────────────────────────────────────────────────────
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const rc = await fetch(
        `${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${placa}&limit=1`,
        { headers: sbH() }
      );
      const rows = await rc.json();
      const c    = rows?.[0];

      if (c) {
        // Sempre busca a categoria ATUAL do sub-segmento (reflete mudanças)
        let catId     = c.categoria_id;
        let subSegNome= c.sub_seg_nome;

        if (c.fk_sub_segmento && !c.categoria_manual) {
          const sub = await getCatSubSeg(c.fk_sub_segmento);
          if (sub?.categoria_id) {
            catId      = sub.categoria_id;
            subSegNome = sub.nome;
          }
        }

        // Atualiza categoria e timestamp no cache
        fetch(`${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${placa}`, {
          method:'PATCH', headers:{...sbH(), Prefer:'return=minimal'},
          body: JSON.stringify({ categoria_id: catId, consultado_em: new Date().toISOString() }),
        }).catch(()=>{});

        return res.status(200).json({
          ...c.dados,
          _cache:           true,
          _categoriaId:     catId,
          _categoriaManual: c.categoria_manual,
          _subSegNome:      subSegNome,
        });
      }
    } catch(e) { console.error('[cache]', e.message); }
  }

  // ── 2. Consulta API externa ───────────────────────────────────────────────
  let apiData;
  try {
    const r   = await fetch(`https://wdapi2.com.br/consulta/${placa}/${TOKEN}`, {
      headers:{Accept:'application/json'}, signal:AbortSignal.timeout(10000),
    });
    const txt = await r.text();
    if (!r.ok) return res.status(r.status).json({erro:true, msg:`Erro ${r.status}`});
    apiData   = JSON.parse(txt);
    if (apiData.erro||apiData.error)
      return res.status(400).json({erro:true, msg:apiData.msg||'Placa não encontrada.'});
  } catch(e) {
    return res.status(500).json({erro:true, msg:`Erro: ${e.message}`});
  }

  // ── 3. Determina modelo completo e busca categoria ────────────────────────
  const ex             = apiData.extra || {};
  // USA extra.modelo pois já vem no formato "HYUNDAI/CRETA 16A ATTITU"
  const modeloCompleto = ex.modelo || apiData.marcaModelo || `${apiData.MARCA}/${apiData.MODELO}` || '';
  const modelo         = apiData.MODELO || ex.modelo || '';
  const marca          = apiData.MARCA  || '';

  let categoriaId = null, subSegId = null, subSegNome = null;

  if (modeloCompleto) {
    const mc = await buscarCategoria(modeloCompleto);
    if (mc) {
      categoriaId = mc.categoriaId;
      subSegId    = mc.subSegId;
      subSegNome  = mc.subSegNome;
    }
  }

  // ── 4. Salva no banco ─────────────────────────────────────────────────────
  if (SUPABASE_URL && SUPABASE_KEY) {
    await fetch(`${SUPABASE_URL}/rest/v1/veiculos`, {
      method:'POST',
      headers:{...sbH(), Prefer:'resolution=merge-duplicates'},
      body: JSON.stringify({
        placa,
        marca,
        modelo,
        fk_sub_segmento:  subSegId    || null,
        sub_seg_nome:     subSegNome  || null,
        ano:              apiData.ano || ex.ano_fabricacao || '',
        ano_modelo:       apiData.anoModelo || ex.ano_modelo || '',
        cor:              apiData.cor || '',
        combustivel:      ex.combustivel || '',
        especie:          ex.especie || '',
        municipio:        ex.municipio || '',
        uf:               ex.uf || '',
        chassi:           apiData.chassi || '',
        codigo_situacao:  String(apiData.codigoSituacao ?? '0'),
        categoria_id:     categoriaId || null,
        categoria_manual: false,
        consultas:        1,
        consultado_em:    new Date().toISOString(),
        dados:            apiData,
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