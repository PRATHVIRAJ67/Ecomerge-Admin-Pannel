# Ecomerge-Admin-Pannel — URU Admin + Commerce API

**Admin dashboard:** https://uru-admin.prathviholla67.workers.dev
**Commerce API:** https://uru-api.prathviholla67.workers.dev (`/health`, `/api/v1/catalog/*`, `/api/v1/me/*`, `/api/v1/admin/*`)

| Folder | |
|---|---|
| `Admin/Frontend` | Admin dashboard (React + Vite + Tailwind): analytics, products, pricing, inventory, categories, orders, customers, banners |
| `Admin/Backend` | Express API used by the website, mobile app and admin. Runs on Node locally and on **Cloudflare Workers** (`src/worker.ts`, Postgres via Hyperdrive, cron for unpaid-order expiry) |
| `Shared` | Types, validation, server core (`Shared/server`) and staff UI kit (`Shared/web`) |

## Develop
```bash
npm install
cp Admin/Backend/.env.example Admin/Backend/.env     # DATABASE_URL etc. — secrets, never commit
npm run dev:api      # http://localhost:4000/health
npm run dev:admin    # http://localhost:5174
```

## Deploy (Cloudflare)
```bash
npm run deploy:api     # Worker "uru-api" (wrangler.jsonc: Hyperdrive binding, cron, vars)
npm run deploy:admin   # static site "uru-admin"
# Secrets: cd Admin/Backend && npx wrangler secret put RAZORPAY_KEY_SECRET   (etc.)
```
