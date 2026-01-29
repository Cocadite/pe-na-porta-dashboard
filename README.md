# É Os Pé Na Porta — Admin (Vercel)

Este projeto contém:
- Dashboard em /dashboard
- 1 única API em /api/app (POST) com tudo

## Vercel
1. Crie Vercel Postgres (Storage) e conecte ao projeto (gera POSTGRES_URL automaticamente)
2. Configure ENV:
- ADMIN_API_KEY=mesma chave do bot
- ALLOWED_ORIGINS=https://pe-na-porta-site.vercel.app (opcional)
3. Deploy.

A dashboard usa a mesma API: /api/app
