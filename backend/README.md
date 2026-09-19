# Netfly Sport - Backend Server

Express + Prisma (PostgreSQL / Supabase) + WebSocket + TypeScript backend API.

---

## 🚀 Si ta ngarkoni & hostoni në Render.com

### Hapi 1: Ngarkoni kodin e backend-it në GitHub
1. Hapni terminalin brenda këtij folderi (`backend/`):
   ```bash
   git init
   git add .
   git commit -m "Initial backend commit"
   git branch -M main
   git remote add origin https://github.com/USERNAME/netfly-backend.git
   git push -u origin main
   ```
*(Ose nëse e keni bërë push të gjithë projektin `netfly` në një repo të vetëm, mund ta zgjidhni `backend` si Root Directory në Render).*

---

### Hapi 2: Krijoni Web Service në Render.com
1. Shkoni te [dashboard.render.com](https://dashboard.render.com) dhe klikoni **New + > Web Service**.
2. Zgjidhni repository-n tuaj të GitHub (`netfly-backend`).
3. Plotësoni këto konfigurime:
   - **Name:** `netfly-sport-backend` (ose çfarë emri të dëshironi)
   - **Region:** Frankfurt (EU) ose më e afërta
   - **Runtime:** `Node`
   - **Branch:** `main`
   - **Root Directory:** Lëreni bosh nëse repo përmban vetëm backend-in (ose shkruani `backend` nëse keni bërë push të gjithë projektin së bashku).
   - **Build Command:**
     ```bash
     npm install && npm run build && npm run db:seed
     ```
   - **Start Command:**
     ```bash
     npm start
     ```
   - **Plan:** Free

---

### Hapi 3: Environment Variables (Variablat e Mjedisit)
Te seksioni **Environment Variables** në Render, shtoni:
- `NODE_ENV` = `production`
- `DATABASE_URL` = URL-ja e **Session pooler** nga Supabase (IPv4 — host-i direkt `db.<ref>.supabase.co` është IPv6-only dhe Render nuk lidhet dot):
  ```env
  postgresql://postgres.<PROJECT-REF>:<PASSWORD>@aws-<n>-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=10&pool_timeout=30
  ```
  Ku i gjeni vlerat: Supabase Dashboard → **Connect** → *Session pooler* (port 5432).
  (Shembull për projektin aktual: region `eu-west-1`, prefix `aws-1`.)
- `JWT_SECRET` = `vendosni_nje_çeles_te_sigurt_kudo_ketu`
- `CORS_ORIGINS` = `*`
- `LUCKYBET_PARTNER_ID` = `d3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f`

> Tabelat krijohen automatikisht: Build Command përfshin `prisma db push` (dhe `db:seed` krijon admin/manager).
> Nëse ndryshoni `DATABASE_URL` në Render, bëni **Manual Deploy → Deploy latest commit** (ose Clear build cache & deploy).

4. Klikoni **Deploy Web Service**!
Render do të ndërtojë serverin, do të gjenerojë databazën dhe do të nisë API-n dhe WebSocket-in.
URL-ja juaj do të jetë: `https://netfly-sport-backend.onrender.com`

---

## ⚙️ Zhvillimi Lokal (Local Development)

```bash
# Instalo varësitë
npm install

# Setup databazën
npm run setup

# Nis serverin lokal në portin 3001
npm run dev
```
