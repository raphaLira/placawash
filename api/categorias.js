const { URL } = require('url');

// Handler original Netlify
/**
 * Netlify Function — consultar
 * Fluxo:
 *  1. Placa no cache?
 *     a. SIM → verifica se categoria ainda é válida (compara com sub_segmento atual)
 *              Se mudou → atualiza cache e retorna nova categoria
 *              Se não mudou → retorna cache direto
 *     b. NÃO → consulta API, determina categoria, salva e retorna
 */

const TOKEN        = '5275830624180eb26cb17bfadbc7ec8c';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

const sbH = () => ({
  apikey:         SUPABASE_KEY,
  Authorization:  `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
});

async function getCachedPlaca(placa) {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${placa}&limit=1`,
    { headers: sbH() }
  );
  const rows = await r.json();
  return rows?.[0] || null;
}

// Busca a categoria atual do sub-segmento (pode ter mudado desde que foi cacheado)
async function getCategoriaAtualDoSubSeg(subSegId) {
  if (!subSegId) return null;
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/sub_segmentos?id=eq.${subSegId}&select=categoria_id&limit=1`,
    { headers: sbH() }
  );
  const rows = await r.json();
  return rows?.[0]?.categoria_id || null;
}

async function getCategoriaByModelo(modelo, marca) {
  if (!modelo) return null;
  const M = modelo.toUpperCase();
  const MK = (marca||'').toUpperCase();

  // Tentativas em ordem de especificidade:
  const tentativas = [
    // 1. Busca: MARCA/MODELO (formato tabela: "HYUNDAI/CRETA 16A ATTITU")
    MK ? `${encodeURIComponent(MK+'/')}${encodeURIComponent(M)}` : null,
    // 2. Busca exata pelo modelo
    encodeURIComponent(M),
    // 3. Busca: contém o modelo (ilike)
    null,
  ].filter(Boolean);

  for (const enc of tentativas) {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/modelos?modelo=eq.${enc}&select=fk_sub_segmento,sub_segmentos(id,nome,categoria_id)&limit=1`,
      { headers: sbH() }
    );
    const d = await r.json();
    if (d?.[0]?.sub_segmentos?.categoria_id)
      return { categoriaId: d[0].sub_segmentos.categoria_id, subSegId: d[0].fk_sub_segmento, subSegNome: d[0].sub_segmentos.nome };
  }

  // Busca parcial: primeiras 2 palavras do modelo
  const primeiras = M.split(' ').slice(0,2).join(' ');
  const buscas = [
    // Com marca: MARCA/PRIMEIRAS*
    MK ? `${SUPABASE_URL}/rest/v1/modelos?modelo=ilike.${encodeURIComponent(MK+'/'+primeiras)}%25&select=fk_sub_segmento,sub_segmentos(id,nome,categoria_id)&order=id.asc&limit=1` : null,
    // Só modelo: *PRIMEIRAS*
    `${SUPABASE_URL}/rest/v1/modelos?modelo=ilike.*${encodeURIComponent(primeiras)}*&select=fk_sub_segmento,sub_segmentos(id,nome,categoria_id)&order=id.asc&limit=1`,
    // Primeira palavra
    `${SUPABASE_URL}/rest/v1/modelos?modelo=ilike.*${encodeURIComponent(M.split(' ')[0])}*&select=fk_sub_segmento,sub_segmentos(id,nome,categoria_id)&order=id.asc&limit=1`,
  ].filter(Boolean);

  for (const url of buscas) {
    const r = await fetch(url, { headers: sbH() });
    const d = await r.json();
    if (d?.[0]?.sub_segmentos?.categoria_id)
      return { categoriaId: d[0].sub_segmentos.categoria_id, subSegId: d[0].fk_sub_segmento, subSegNome: d[0].sub_segmentos.nome };
  }

  return null;
}

async function upsertVeiculo(row) {
  await fetch(`${SUPABASE_URL}/rest/v1/veiculos`, {
    method:  'POST',
    headers: { ...sbH(), Prefer: 'resolution=merge-duplicates' },
    body:    JSON.stringify(row),
  });
}

async function patchVeiculo(placa, dados) {
  await fetch(`${SUPABASE_URL}/rest/v1/veiculos?placa=eq.${placa}`, {
    method:  'PATCH',
    headers: { ...sbH(), Prefer: 'return=minimal' },
    body:    JSON.stringify(dados),
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type':                 'application/json',
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode:200, headers, body:'' };

  let placa;
  if (event.httpMethod === 'GET') {
    placa = (event.queryStringParameters?.placa||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
  } else {
    try { placa = (JSON.parse(event.body||'{}').placa||'').replace(/[^A-Z0-9]/gi,'').toUpperCase(); }
    catch { return { statusCode:400, headers, body: JSON.stringify({erro:true,msg:'Body inválido.'}) }; }
  }

  if (!placa||(!/^[A-Z]{3}\d{4}$/.test(placa)&&!/^[A-Z]{3}\d[A-Z]\d{2}$/.test(placa)))
    return { statusCode:400, headers, body: JSON.stringify({erro:true,msg:'Placa inválida.'}) };

  // ── 1. Verifica cache ──────────────────────────────────────────────────────
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const cached = await getCachedPlaca(placa);
      if (cached) {
        let categoriaId     = cached.categoria_id;
        let categoriaManual = cached.categoria_manual;

        // Se não foi corrigida manualmente, verifica se a categoria do sub-segmento mudou
        if (!categoriaManual && cached.fk_sub_segmento) {
          const catAtual = await getCategoriaAtualDoSubSeg(cached.fk_sub_segmento);
          if (catAtual && catAtual !== categoriaId) {
            // Categoria mudou — atualiza o cache silenciosamente
            console.log(`[CACHE UPDATE] ${placa}: ${categoriaId} → ${catAtual}`);
            categoriaId = catAtual;
            patchVeiculo(placa, { categoria_id: catAtual, consultado_em: new Date().toISOString() }).catch(console.warn);
          } else {
            // Só incrementa visita
            patchVeiculo(placa, { consultado_em: new Date().toISOString() }).catch(console.warn);
          }
        }

        console.log(`[CACHE HIT] ${placa} | cat=${categoriaId} | manual=${categoriaManual}`);
        return {
          statusCode: 200, headers,
          body: JSON.stringify({
            ...cached.dados,
            _cache:           true,
            _categoriaId:     categoriaId,
            _categoriaManual: categoriaManual,
            _consultadoEm:    cached.consultado_em,
            _subSegNome:      cached.sub_seg_nome || null,
          }),
        };
      }
    } catch(e) { console.warn('[cache]', e.message); }
  }

  // ── 2. Consulta API externa ────────────────────────────────────────────────
  const url = `https://wdapi2.com.br/consulta/${placa}/${TOKEN}`;
  console.log(`[API] ${url}`);
  let apiData;
  try {
    const res  = await fetch(url, { headers:{Accept:'application/json'}, signal:AbortSignal.timeout(10000) });
    const text = await res.text();
    if (!res.ok) return { statusCode:res.status, headers, body: JSON.stringify({erro:true,msg:`Erro ${res.status} da API.`}) };
    try { apiData = JSON.parse(text); } catch {
      return { statusCode:500, headers, body: JSON.stringify({erro:true,msg:'Resposta inválida da API.'}) };
    }
    if (apiData.erro||apiData.error)
      return { statusCode:400, headers, body: JSON.stringify({erro:true,msg:apiData.msg||'Placa não encontrada.'}) };
  } catch(err) {
    return { statusCode:500, headers, body: JSON.stringify({erro:true,msg:`Erro de conexão: ${err.message}`}) };
  }

  // ── 3. Determina categoria pelo modelo ────────────────────────────────────
  const ex     = apiData.extra || {};
  const modelo = apiData.MODELO || ex.modelo || '';
  let categoriaId = null;
  let subSegId    = null;
  let subSegNome  = null;

  if (SUPABASE_URL && SUPABASE_KEY && modelo) {
    try {
      const mc = await getCategoriaByModelo(modelo, apiData.MARCA||'');
      if (mc) {
        categoriaId = mc.categoriaId;
        subSegId    = mc.subSegId;
        subSegNome  = mc.subSegNome || null;
        console.log(`[MODELO] "${modelo}" → ${categoriaId} (sub=${subSegId})`);
      }
    } catch(e) { console.warn('[modelo]', e.message); }
  }

  // ── 4. Salva no banco ─────────────────────────────────────────────────────
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      await upsertVeiculo({
        placa,
        marca:           apiData.MARCA           || '',
        modelo,
        fk_sub_segmento: subSegId                || null,
        ano:             apiData.ano             || ex.ano_fabricacao || '',
        ano_modelo:      apiData.anoModelo        || ex.ano_modelo    || '',
        cor:             apiData.cor             || '',
        combustivel:     ex.combustivel          || '',
        especie:         ex.especie              || '',
        municipio:       ex.municipio            || '',
        uf:              ex.uf                   || '',
        chassi:          apiData.chassi          || '',
        codigo_situacao: String(apiData.codigoSituacao??'0'),
        categoria_id:    categoriaId             || null,
        sub_seg_nome:    subSegNome              || null,
        categoria_manual: false,
        consultas:       1,
        consultado_em:   new Date().toISOString(),
        dados:           apiData,
      });
    } catch(e) { console.warn('[save]', e.message); }
  }

  return {
    statusCode: 200, headers,
    body: JSON.stringify({
      ...apiData,
      _cache:           false,
      _categoriaId:     categoriaId,
      _categoriaManual: false,
      _subSegNome:      subSegNome || null,
    }),
  };
};


// Adaptador Vercel
module.exports = async (req, res) => {
  // Monta evento no formato Netlify
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

  // Aplica headers
  Object.entries(result.headers || {}).forEach(([k, v]) => res.setHeader(k, v));
  res.status(result.statusCode || 200).send(result.body || '');
};