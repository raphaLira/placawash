const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const sbH = (e={}) => ({ apikey:SUPABASE_KEY, Authorization:`Bearer ${SUPABASE_KEY}`, 'Content-Type':'application/json', ...e });

function hojeISO()  { return new Date().toISOString().split('T')[0]; }
function ontemISO() { const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0]; }

function getUserId(req) {
  const auth  = req.headers?.authorization || '';
  const token = auth.replace('Bearer ','');
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.sub;
  } catch(e) { return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type,Authorization');
  res.setHeader('Content-Type','application/json');
  if (req.method==='OPTIONS') return res.status(200).end();

  const userId = getUserId(req);
  if (!userId) return res.status(401).json({erro:true, msg:'Não autenticado.'});

  const url = new URL(req.url, 'http://x');
  const q   = Object.fromEntries(url.searchParams.entries());

  // ── GET resumo ────────────────────────────────────────────────────────────
  if (req.method==='GET' && q.action==='resumo') {
    try {
      const rs = await fetch(`${SUPABASE_URL}/rest/v1/user_streaks?user_id=eq.${userId}&limit=1`,{headers:sbH()});
      const streaks = await rs.json();
      const streak  = Array.isArray(streaks) ? streaks[0] : null;

      const hoje = hojeISO();
      const rOs  = await fetch(`${SUPABASE_URL}/rest/v1/ordens_servico?created_at=gte.${hoje}T00:00:00&status=eq.pronto&select=valor`,{headers:sbH()});
      const osHoje = await rOs.json();
      const qtdHoje   = Array.isArray(osHoje) ? osHoje.length : 0;
      const totalHoje = Array.isArray(osHoje) ? osHoje.reduce((s,o)=>s+(o.valor||0),0) : 0;

      const data30 = new Date(); data30.setDate(data30.getDate()-30);
      const rHist  = await fetch(`${SUPABASE_URL}/rest/v1/ordens_servico?created_at=gte.${data30.toISOString()}&status=eq.pronto&select=valor,created_at`,{headers:sbH()});
      const hist   = await rHist.json();

      let mediaDiaria = 8;
      let recordeDia  = 0;

      if (Array.isArray(hist) && hist.length > 0) {
        const porDia = {};
        hist.forEach(h => { const dia=h.created_at.split('T')[0]; porDia[dia]=(porDia[dia]||0)+1; });
        const valores = Object.values(porDia);
        if (valores.length) {
          mediaDiaria = Math.max(5, Math.round(valores.reduce((a,b)=>a+b,0)/valores.length));
          recordeDia  = Math.max(...valores);
        }
      }

      const rTotal = await fetch(`${SUPABASE_URL}/rest/v1/ordens_servico?status=eq.pronto&select=id`,{headers:sbH({Prefer:'count=exact'})});
      const totalGeral = parseInt((rTotal.headers.get('content-range')||'').split('/')[1]||'0')||0;

      const conquistas = [];
      if (totalGeral>=1)    conquistas.push({id:'primeira', emoji:'🎯', label:'Primeira Lavagem'});
      if (totalGeral>=100)  conquistas.push({id:'centena',  emoji:'🏆', label:'Primeira Centena'});
      if (totalGeral>=500)  conquistas.push({id:'500',      emoji:'💎', label:'500 Lavagens'});
      if (totalGeral>=1000) conquistas.push({id:'1000',     emoji:'👑', label:'Mil Lavagens'});
      if (recordeDia>=15)   conquistas.push({id:'recorde15',emoji:'⚡', label:'Dia Recorde 15+'});

      return res.status(200).json({
        streak: streak?.streak_atual||0,
        streakRecorde: streak?.streak_recorde||0,
        ultimaAtividade: streak?.ultima_atividade||null,
        metaHoje: mediaDiaria,
        progressoHoje: qtdHoje,
        totalHoje,
        recordeDia,
        totalGeral,
        conquistas,
      });
    } catch(e) {
      return res.status(200).json({ streak:0, metaHoje:8, progressoHoje:0, totalHoje:0, conquistas:[] });
    }
  }

  // ── POST checkin ──────────────────────────────────────────────────────────
  if (req.method==='POST' && q.action==='checkin') {
    try {
      const hoje  = hojeISO();
      const ontem = ontemISO();

      const rs   = await fetch(`${SUPABASE_URL}/rest/v1/user_streaks?user_id=eq.${userId}&limit=1`,{headers:sbH()});
      const rows = await rs.json();
      const existente = Array.isArray(rows) ? rows[0] : null;

      if (!existente) {
        await fetch(`${SUPABASE_URL}/rest/v1/user_streaks`,{
          method:'POST', headers:sbH({Prefer:'return=minimal'}),
          body:JSON.stringify({ user_id:userId, streak_atual:1, streak_recorde:1, ultima_atividade:hoje }),
        });
        return res.status(200).json({ streak:1, novo:true });
      }

      if (existente.ultima_atividade === hoje)
        return res.status(200).json({ streak: existente.streak_atual, novo:false });

      const novoStreak  = existente.ultima_atividade===ontem ? (existente.streak_atual||0)+1 : 1;
      const novoRecorde = Math.max(novoStreak, existente.streak_recorde||0);

      await fetch(`${SUPABASE_URL}/rest/v1/user_streaks?user_id=eq.${userId}`,{
        method:'PATCH', headers:sbH({Prefer:'return=minimal'}),
        body:JSON.stringify({ streak_atual:novoStreak, streak_recorde:novoRecorde, ultima_atividade:hoje }),
      });

      return res.status(200).json({ streak:novoStreak, recorde:novoRecorde, novo:true });
    } catch(e) {
      return res.status(200).json({ streak:0, novo:false });
    }
  }

  return res.status(405).end();
};
