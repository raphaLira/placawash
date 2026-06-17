const { URL } = require('url');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const sbH = (e={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...e });

function getUserId(event) {
  const auth  = event.headers?.authorization || event.headers?.Authorization || '';
  const token = auth.replace('Bearer ','');
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.sub;
  } catch(e) { return null; }
}

const MSG_ENTRADA_DEFAULT = `🚗 *{nome_lavajato}*

Olá! Recebemos seu veículo:
*{marca} {modelo} {cor}*
Placa: *{placa}*

Serviço: *{servico}*
Valor: *R$ {valor}*

Assim que ficar pronto te avisamos! ⏳`;

const MSG_SAIDA_DEFAULT = `✅ *{nome_lavajato}*

Seu veículo está pronto!
*{marca} {modelo} {cor}*
Placa: *{placa}*

Serviço: *{servico}*
Valor: *R$ {valor}*

Obrigado pela preferência! 💧`;

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type,Authorization', 'Content-Type':'application/json' };
  if (event.httpMethod==='OPTIONS') return { statusCode:200, headers, body:'' };

  const userId = getUserId(event);
  if (!userId) return { statusCode:401, headers, body:JSON.stringify({erro:true,msg:'Não autenticado.'}) };

  // ── GET configuração do usuário ─────────────────────────────────────────
  if (event.httpMethod==='GET') {
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes?user_id=eq.${userId}&limit=1`,{ headers:sbH() });
      const rows = await r.json();
      const config = Array.isArray(rows) ? rows[0] : null;

      if (!config) {
        // Retorna defaults sem salvar ainda
        return { statusCode:200, headers, body: JSON.stringify({
          nome_lavajato: '',
          endereco: '',
          telefone_estabelecimento: '',
          msg_entrada: MSG_ENTRADA_DEFAULT,
          msg_saida: MSG_SAIDA_DEFAULT,
        })};
      }

      return { statusCode:200, headers, body: JSON.stringify(config) };
    } catch(e) {
      return { statusCode:200, headers, body: JSON.stringify({
        nome_lavajato:'', endereco:'', telefone_estabelecimento:'',
        msg_entrada: MSG_ENTRADA_DEFAULT, msg_saida: MSG_SAIDA_DEFAULT,
      })};
    }
  }

  // ── POST salva/atualiza configuração ────────────────────────────────────
  if (event.httpMethod==='POST') {
    const body = JSON.parse(event.body||'{}');
    const { nome_lavajato, endereco, telefone_estabelecimento, msg_entrada, msg_saida } = body;

    const row = {
      user_id: userId,
      nome_lavajato: nome_lavajato||'',
      endereco: endereco||'',
      telefone_estabelecimento: telefone_estabelecimento||'',
      msg_entrada: msg_entrada || MSG_ENTRADA_DEFAULT,
      msg_saida: msg_saida || MSG_SAIDA_DEFAULT,
      atualizado_em: new Date().toISOString(),
    };

    const r = await fetch(`${SUPABASE_URL}/rest/v1/configuracoes`,{
      method:'POST',
      headers: sbH({ Prefer:'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify(row),
    });
    const result = await r.json();
    return { statusCode:200, headers, body: JSON.stringify(Array.isArray(result)?result[0]:row) };
  }

  return { statusCode:405, headers, body:'{}' };
};

// Adaptador Vercel