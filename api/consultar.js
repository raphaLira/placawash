const TOKEN        = '5275830624180eb26cb17bfadbc7ec8c';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const sbH = () => ({
  apikey:        SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type':'application/json',
});

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Lê placa
  let placa = '';
  try {
    const buf = await new Promise((ok,err) => {
      let d=''; req.on('data',c=>d+=c); req.on('end',()=>ok(d)); req.on('error',err);
    });
    placa = (JSON.parse(buf||'{}').placa||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
  } catch {
    placa = (req.query?.placa||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
  }

  if (!placa||(!/^[A-Z]{3}\d{4}$/.test(placa)&&!/^[A-Z]{3}\d[A-Z]\d{2}$/.test(placa)))
    return res.status(400).json({erro:true,msg:'Placa inválida.'});

  // ── 1. Cache ──────────────────────────────────────────────────────────────
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const rc   = await fetch(`${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${placa}&limit=1`,{headers:sbH()});
      const rows = await rc.json();
      const c    = rows?.[0];
      if (c) {
        let catId = c.categoria_id;
        let subSegNome = c.sub_seg_nome;

        // Sempre pega categoria atual do sub-segmento (reflete edições do usuário)
        if (c.fk_sub_segmento && !c.categoria_manual) {
          const rs = await fetch(
            `${SUPABASE_URL}/rest/v1/sub_segmentos?id=eq.${c.fk_sub_segmento}&select=categoria_id,nome&limit=1`,
            {headers:sbH()}
          );
          const sub = await rs.json();
          if (sub?.[0]?.categoria_id) {
            catId      = sub[0].categoria_id;
            subSegNome = sub[0].nome;
          }
        }

        // Atualiza cache silenciosamente
        fetch(`${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${placa}`,{
          method:'PATCH', headers:{...sbH(),Prefer:'return=minimal'},
          body:JSON.stringify({categoria_id:catId, consultado_em:new Date().toISOString()}),
        }).catch(()=>{});

        return res.status(200).json({
          ...c.dados,
          _cache:true, _categoriaId:catId, _categoriaManual:c.categoria_manual, _subSegNome:subSegNome,
        });
      }
    } catch(e){console.error('[cache]',e.message);}
  }

  // ── 2. API externa ────────────────────────────────────────────────────────
  let apiData;
  try {
    const r   = await fetch(`https://wdapi2.com.br/consulta/${placa}/${TOKEN}`,{
      headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000),
    });
    const txt = await r.text();
    if (!r.ok) return res.status(r.status).json({erro:true,msg:`Erro ${r.status}`});
    apiData = JSON.parse(txt);
    if (apiData.erro||apiData.error)
      return res.status(400).json({erro:true,msg:apiData.msg||'Placa não encontrada.'});
  } catch(e) {
    return res.status(500).json({erro:true,msg:`Erro: ${e.message}`});
  }

  const ex = apiData.extra || {};

  // ── 3. Busca sub-segmento PELO NOME que já vem na API ────────────────────
  // ex.sub_segmento = "AU - SUVs" — mesmo nome da tabela sub_segmentos!
  let categoriaId = null, subSegId = null, subSegNome = null;
  const nomeSubSeg = ex.sub_segmento || '';

  if (nomeSubSeg && SUPABASE_URL && SUPABASE_KEY) {
    try {
      const rs = await fetch(
        `${SUPABASE_URL}/rest/v1/sub_segmentos?nome=eq.${encodeURIComponent(nomeSubSeg)}&select=id,nome,categoria_id&limit=1`,
        {headers:sbH()}
      );
      const sub = await rs.json();
      if (sub?.[0]) {
        subSegId    = sub[0].id;
        subSegNome  = sub[0].nome;
        categoriaId = sub[0].categoria_id;
        console.log(`[SUB-SEG] "${nomeSubSeg}" → id=${subSegId} cat=${categoriaId}`);
      }
    } catch(e){console.error('[sub_seg]',e.message);}
  }

  // ── 4. Salva no banco ─────────────────────────────────────────────────────
  await fetch(`${SUPABASE_URL}/rest/v1/veiculos`,{
    method:'POST', headers:{...sbH(),Prefer:'resolution=merge-duplicates'},
    body:JSON.stringify({
      placa,
      marca:           apiData.MARCA||'',
      modelo:          apiData.MODELO||ex.modelo||'',
      fk_sub_segmento: subSegId    ||null,
      sub_seg_nome:    subSegNome  ||null,
      ano:             apiData.ano ||ex.ano_fabricacao||'',
      ano_modelo:      apiData.anoModelo||ex.ano_modelo||'',
      cor:             apiData.cor||'',
      combustivel:     ex.combustivel||'',
      especie:         ex.especie||'',
      municipio:       ex.municipio||'',
      uf:              ex.uf||'',
      chassi:          apiData.chassi||'',
      codigo_situacao: String(apiData.codigoSituacao??'0'),
      categoria_id:    categoriaId||null,
      categoria_manual:false,
      consultas:       1,
      consultado_em:   new Date().toISOString(),
      dados:           apiData,
    }),
  }).catch(e=>console.error('[save]',e.message));

  return res.status(200).json({
    ...apiData,
    _cache:false, _categoriaId:categoriaId, _categoriaManual:false, _subSegNome:subSegNome,
  });
};
