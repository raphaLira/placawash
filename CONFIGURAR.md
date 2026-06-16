# PlacaWash — Configuração

## 1. Preencha suas chaves no index.html

Abra o `index.html` e substitua:

```
%%SUPABASE_URL%%      → URL do seu projeto Supabase
                        Ex: https://xyzxyz.supabase.co

%%SUPABASE_ANON_KEY%% → Chave anon pública do Supabase
                        Em: Settings → API → anon public
```

## 2. Variáveis de ambiente no Vercel

No painel do Vercel → Site Settings → Environment Variables, adicione:

- `SUPABASE_URL`  → mesma URL acima
- `SUPABASE_KEY`  → chave **service_role** (não a anon!)

## 3. Google OAuth no Supabase

1. Supabase → Authentication → Providers → Google → Ativar
2. Cole Client ID e Client Secret do Google Cloud Console
3. Em URL Configuration → Site URL → cole sua URL do Vercel
4. Em Redirect URLs → adicione: `https://SEU-SITE.vercel.app`

## 4. Deploy

Suba todos os arquivos no GitHub e conecte ao Vercel.
