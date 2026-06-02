const { URL } = require('url');

const TOKEN        = '5275830624180eb26cb17bfadbc7ec8c';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const sbH = () => ({
  apikey:         SUPABASE_KEY,
  Authorization:  `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
});

// Busca categoria pelo modelo na tabela
// Tabela modelos tem: "HYUNDAI/CRETA 16A ATTITU"
// API retorna MARCA="HYUNDAI" e MODELO="CRETA 16A ATTITU"
// Então monta "HYUNDAI/CRETA 16A ATTITU" e busca com ILIKE
async function buscarCategoria(marca, modelo) {
  if (!marca && !modelo) return null;

  // Monta o padrão de busca: MARCA/MODELO
  const chave = `${marca}/${modelo}`.toUpperCase();
  
  // Busca na tabela modelos usando ILIKE para ser tolerante
  // Pega o primeiro resultado que casar
  const url = `${SUPABASE_URL}/rest/v1/modelos`
    + `?modelo=ilike.${encodeURIComponent(chave)}%`
    + `&select=modelo,fk_sub_segmento,sub_segmentos(id,nome,categoria_id)`
    + `&limit=1`;

  const r = await fetch(url, { headers: sbH() });
  const d = await r.json();

  if (d?.[0]?.sub_segmentos?.categoria_id) {
    return {
      categoriaId: d[0].sub_segmentos.categoria_id,
      subSegId:    d[0].fk_sub_segmento,
      subSegNome:  d[0].sub_segmentos.nome,
    };
  }

  // Se não achou com modelo completo, tenta só MARCA/PRIMEIRAP
  const primeiraP = modelo.toUpperCase().split(' ')[0];
  const chave2 = `${marca}/${primeiraP}`.toUpperCase();

  const url2 = `${SUPABASE_URL}/rest/v1/modelos`
    + `?modelo=ilike.${encodeURIComponent(chave2)}%`
    + `&select=modelo,fk_sub_segmento,sub_segmentos(id,nome,categoria_id)`
    + `&limit=1`;

  const r2 = await fetch(url2, { headers: sbH() });
  const d2 = await r2.json();

  if (d2?.[0]?.sub_segmentos?.categoria_id) {
    return {
      categoriaId: d2[0].sub_segmentos.categoria_id,
      subSegId:    d2[0].fk_sub_segmento,
      subSegNome:  d2[0].sub_segmentos.nome,
    };
  }

  return null;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type':                 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };

  // Parse da placa
  let placa;
  try {
    placa = (JSON.parse(event.body||'{}').placa||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
  } catch {
    placa = (event.queryStringParameters?.placa||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
  }

  if (!placa || (!/^[A-Z]{3}\d{4}$/.test(placa) && !/^[A-Z]{3}\d[A-Z]\d{2}$/.test(placa)))
    return { statusCode:400, headers, body: JSON.stringify({erro:true, msg:'Placa inválida.'}) };

  // 1. Verifica cache no banco
  if (SUPABASE_URL && SUPABASE_KEY) {
    const rc = await fetch(
      `${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${placa}&limit=1`,
      { headers: sbH() }
    );
    const cached = await rc.json();

    if (cached?.[0]) {
      const c = cached[0];
      let catId = c.categoria_id;

      // Se não foi corrigido manualmente, sempre verifica a categoria atual do sub-segmento
      if (!c.categoria_manual && c.fk_sub_segmento) {
        const rs = await fetch(
          `${SUPABASE_URL}/rest/v1/sub_segmentos?id=eq.${c.fk_sub_segmento}&select=categoria_id&limit=1`,
          { headers: sbH() }
        );
        const sub = await rs.json();
        const catAtual = sub?.[0]?.categoria_id;
        if (catAtual) catId = catAtual; // usa sempre a categoria atual do sub-segmento
      }

      // Atualiza consultado_em em background
      fetch(`${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${placa}`, {
        method:'PATCH', headers:{...sbH(),Prefer:'return=minimal'},
        body: JSON.stringify({consultado_em: new Date().toISOString()}),
      }).catch(()=>{});

      return {
        statusCode:200, headers,
        body: JSON.stringify({
          ...c.dados,
          _cache:           true,
          _categoriaId:     catId,
          _categoriaManual: c.categoria_manual,
          _consultadoEm:    c.consultado_em,
          _subSegNome:      c.sub_seg_nome || null,
        }),
      };
    }
  }

  // 2. Consulta API externa
  const url = `https://wdapi2.com.br/consulta/${placa}/${TOKEN}`;
  let apiData;
  try {
    const res  = await fetch(url, { headers:{Accept:'application/json'}, signal:AbortSignal.timeout(10000) });
    const text = await res.text();
    if (!res.ok) return { statusCode:res.status, headers, body: JSON.stringify({erro:true,msg:`Erro ${res.status}`}) };
    apiData = JSON.parse(text);
    if (apiData.erro||apiData.error)
      return { statusCode:400, headers, body: JSON.stringify({erro:true,msg:apiData.msg||'Placa não encontrada.'}) };
  } catch(e) {
    return { statusCode:500, headers, body: JSON.stringify({erro:true,msg:`Erro: ${e.message}`}) };
  }

  // 3. Busca categoria pelo modelo
  const ex    = apiData.extra || {};
  const marca = apiData.MARCA || '';
  const modelo= apiData.MODELO || ex.modelo || '';

  let categoriaId = null;
  let subSegId    = null;
  let subSegNome  = null;

  if (marca && modelo) {
    const mc = await buscarCategoria(marca, modelo);
    if (mc) {
      categoriaId = mc.categoriaId;
      subSegId    = mc.subSegId;
      subSegNome  = mc.subSegNome;
    }
  }

  // 4. Salva no banco
  if (SUPABASE_URL && SUPABASE_KEY) {
    await fetch(`${SUPABASE_URL}/rest/v1/veiculos`, {
      method:'POST',
      headers:{...sbH(), Prefer:'resolution=merge-duplicates'},
      body: JSON.stringify({
        placa,
        marca,
        modelo,
        fk_sub_segmento: subSegId    || null,
        sub_seg_nome:    subSegNome  || null,
        ano:             apiData.ano || ex.ano_fabricacao || '',
        ano_modelo:      apiData.anoModelo || ex.ano_modelo || '',
        cor:             apiData.cor || '',
        combustivel:     ex.combustivel || '',
        especie:         ex.especie || '',
        municipio:       ex.municipio || '',
        uf:              ex.uf || '',
        chassi:          apiData.chassi || '',
        codigo_situacao: String(apiData.codigoSituacao??'0'),
        categoria_id:    categoriaId || null,
        categoria_manual: false,
        consultas:       1,
        consultado_em:   new Date().toISOString(),
        dados:           apiData,
      }),
    });
  }

  return {
    statusCode:200, headers,
    body: JSON.stringify({
      ...apiData,
      _cache:           false,
      _categoriaId:     categoriaId,
      _categoriaManual: false,
      _subSegNome:      subSegNome,
    }),
  };
};

// Adaptador Vercel
module.exports = async (req, res) => {
  const event = {
    httpMethod: req.method,
    queryStringParameters: Object.fromEntries(
      new URL(req.url, 'http://localhost').searchParams.entries()
    ),
    headers: req.headers,
    body: await new Promise(resolve => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => resolve(data || null));
    }),
  };
  const result = await exports.handler(event);
  Object.entries(result.headers||{}).forEach(([k,v])=>res.setHeader(k,v));
  res.status(result.statusCode||200).send(result.body||'');
};