# Deploy i backend-it në Render.com (hap pas hapi)

Repo: **https://github.com/mami12/netfly** (private, monorepo: `backend/` + `frontend/`)
Backend live (i verifikuar): `https://netfly-backend-1.onrender.com/api/health` → `{"status":"ok"}`

> ⚠️ Shënim i rëndësishëm: repo-t e vjetra `netfly` / `netfly-backend` / `netfly-frontend`
> ishin **fshirë** nga GitHub-i (llogaria `mami12` kishte 0 repo). Repo-ja e re `netfly`
> u krijua nga kodi lokal, prandaj Render-it duhet t'i **rilidhet** repo-ja (Hapi 3 ose 4).

---

## Hapi 1 — Kodi është në GitHub ✅

Kodi lokal është push-uar në `main` (plus dega `versioni-punes-2026-09-19` dhe tag-u
`v-pune-2026-09-19` si rezervë historie).

Kontroll:
```powershell
git ls-remote origin
```

---

## Hapi 2 — Struktura që pret Render-i

| Skedari | Roli |
|---|---|
| `render.yaml` (në **rrënjë**) | Blueprint-i që lexon Render-i. Krijon Web Service me `rootDir: backend`. |
| `backend/render.yaml` | Vetëm referencë (Render nuk e lexon nga nën-dosja). |
| `backend/package.json` | `build` = `prisma generate && prisma db push && tsc`; `start` = `prisma db push && node dist/index.js` |
| `backend/src/index.ts` | API + WebSocket; `/api/health` për health check; mbyllje e pastër në `SIGTERM`. |

Render-i e **injoron** `.env` (nuk është në git) — çdo variabël vendoset në dashboard.

---

## ⚠️ Nëse shërbimi u krijua me cilësimet DEFAULT (gabimi `prisma: not found`)

Kur krijon **New + → Web Service** (pa Blueprint), Render-i e vendos vetë Build Command
`yarn install; yarn build` dhe **Root Directory bosh**. Atëherë `yarn install` instalon
vetëm varësitë e rrënjës → `backend/node_modules` mbetet i zbrazët → log-u shfaq:

```
> prisma generate && prisma db push && tsc
sh: 1: prisma: not found
error Command failed with exit code 127.
```

Repo-ja tani e mbulon **edhe** këtë rast: skriptet e rrënjës (`build`/`start`) instalojnë
dhe ndërtojnë vetë backend-in me `npm --prefix backend ...`. Pra me cilësimet default
mjafton të vendosësh env vars (Hapi 3) dhe të bësh **Manual Deploy**.

Konfigurimi i rekomanduar (më i shpejtë, pa punë të panevojshme):
Settings → **Root Directory = `backend`** · **Build Command = `npm ci && npm run build && npm run db:seed`** ·
**Start Command = `npm start`** · **Health Check Path = `/api/health`** → Save → Manual Deploy.

| | Rrënja e repos (default) | Root Directory = `backend` |
|---|---|---|
| Build | `yarn install; yarn build` → (root) → install+build+seed i backend-it | `npm install && npm run build && npm run db:seed` |
| Start | `yarn start` → (root) → `prisma db push && node dist/index.js` | `npm start` (e njëjta gjë) |
| Node.js | 22.22.0 (nga `.node-version` në rrënjë) | 22.22.0 (`.node-version` + `engines` në `backend/`) |

> Versione të Node-it: Render-i sot përdor **24.21.0** si default për shërbimet e reja,
> ndërsa Prisma 5.22 mbulon zyrtarisht 18/20/22 — prandaj repo-ja e fikson **22.22.0**
> me `.node-version` (+ `engines.node`). Nëse do ta ndryshosh: env var `NODE_VERSION`.

---

## 🔒 Instalimi deterministik (pse s'ka më `error TS2769`)

**Problemi:** `yarn install` pa lockfile e zgjidhte `@types/compression` → `"@types/express": "*"`
→ instalohej **`@types/express@5.x`** (kopje e dytë tipash) ndërsa `express` mbeti v4 → `tsc` binte me:

```
src/index.ts(46,9): error TS2769: No overload matches this call.
  Argument of type 'RequestHandler<ParamsDictionary, any, any, ParsedQs, Record<string, any>>'
  is not assignable to parameter of type 'PathParams'.
```

**Zgjidhja (e aplikuar në `backend/package.json`):**
- `"@types/express": "4.17.25"` dhe `"@types/compression": "1.8.1"` — versione të fiksuara (pa `^`).
- `"resolutions"` (për yarn) + `"overrides"` (për npm) që detyrojnë një version të vetëm:
  `@types/express` = `4.17.25`, `@types/express-serve-static-core` = `4.19.9`.
- **Lockfile-at e regjistruar në repo:** `backend/yarn.lock` dhe `yarn.lock` (rrënjë) → instalimi
  jep gjithmonë të njëjtat versione (pa "No lockfile found").
- `postinstall` u thjeshtua në `prisma generate` (nuk ekzekuton më `tsc` gjatë instalimit).

**Verifikuar lokalisht** me `yarn@1.22.22` (i njëjti version si në Render): `yarn install` → `prisma generate` → `tsc --noEmit` → **exit 0**.

> ℹ️ `engines.node` u hoq me qëllim: yarn v1 e trajton si gabim të vdekshëm
> (`The engine "node" is incompatible with this module`) kur versioni lokal nuk përputhet.
> Versioni fiksohet vetëm me `.node-version` (Render e respekton: *"Using Node.js version 22.22.0 via .../backend/.node-version"*).

---

## Hapi 3 — Deploy me Blueprint (rekomanduar: 1 klikim)

1. Hyr në https://dashboard.render.com → **New +** → **Blueprint**.
2. Lidh GitHub-in me llogarinë `mami12` dhe jepi Render-it akses te repo-ja **netfly**
   (private repo kërkon instalimin e *Render GitHub App*: Settings → GitHub → Configure access).
3. Zgjidh repo-n `netfly`, branch `main` (Render e gjen vetë `render.yaml` në rrënjë) → **Apply**.
4. Kur ta kërkojë, plotëso **`DATABASE_URL`** (vlera e vetme e detyrueshme):

   ```
   postgresql://postgres.tvynxkthwxlxjlllehgo:<PASSWORD>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=10&pool_timeout=30
   ```
   - `<PASSWORD>` = fjalëkalimi i bazës (Supabase → Project Settings → Database).
   - Duhet **Session pooler** (port **5432**, host `aws-1-eu-west-1.pooler.supabase.com`) — IPv4.
   - **Mos përdor** host-in direkt `db.<ref>.supabase.co`: është IPv6-only dhe Render nuk lidhet
     dot (gabimi `ENOTFOUND`).
   - `connection_limit=10&pool_timeout=30` janë **të detyrueshëm**, përndryshe kuotat nuk
     shkruhen (`Timed out fetching a new connection`).
   - ⚠️ Në log-un e Render-it duhet të shfaqet `...pooler.supabase.com:`**`5432`**. Nëse shfaqet
     `:6543` ke marrë **Transaction pooler** (pgbouncer) → `prisma db push` dështon me
     `prepared statement "s0" already exists`. Kopjo URL-në nga Supabase → **Connect → Session pooler**.

Render-i krijon automatikisht: `NODE_ENV=production`, `JWT_SECRET` (i gjeneruar),
`CORS_ORIGINS=*`, `LUCKYBET_PARTNER_ID`, `LUCKYBET_API_HOST`, `LUCKYBET_LANGUAGE`.

---

## Hapi 4 — Deploy manual (nëse s'përdor Blueprint)

**New + → Web Service** → repo `netfly` → plotëso:

| Fusha | Vlera |
|---|---|
| Name | `netfly-backend` |
| Region | Frankfurt (EU) |
| Runtime | `Node` |
| Branch | `main` |
| **Root Directory** | **`backend`** ← shumë e rëndësishme |
| Build Command | `npm ci && npm run build && npm run db:seed` (ose `yarn install; yarn build` — të dyja punojnë tani) |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |
| Plan | Free |

Pastaj **Environment → Add Environment Variable**:
`DATABASE_URL` (shih Hapi 3), `JWT_SECRET`, `CORS_ORIGINS=*`,
`LUCKYBET_PARTNER_ID=d3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f`,
`LUCKYBET_API_HOST=api-gateway.gw-lucky-bet.com`, `LUCKYBET_LANGUAGE=en-001`.

**Mos vendos `PORT`** — Render-i e jep vetë (`process.env.PORT`).

> Nëse shërbimi i vjetër `netfly-backend-1` ekziston ende: Settings → **Root Directory = `backend`**,
> pastaj **Manual Deploy → Deploy latest commit**. Nëse repo-ja shfaqet si e shkëputur,
> rilidhe nga Settings → Git (repo-ja e vjetër u fshi).

---

## Hapi 5 — Frontend-i (lidhja me backend-in)

Frontend-i shërbehet nga **GitHub Pages** (repo `netfly-frontend`, dega `gh-pages`):

```powershell
powershell -ExecutionPolicy Bypass -File frontend\deploy-gh-pages.ps1
```

URL-të e backend-it jepen në `frontend/.env` **para** build-it:

```env
VITE_API_URL=https://netfly-backend-1.onrender.com
VITE_WS_URL=wss://netfly-backend-1.onrender.com
```

> Nëse URL-ja e Render-it ndryshon (emër/regjion i re), përditëso të dyja vlerat
> dhe ripërsërit build+deploy-in. Pa `VITE_API_URL` frontend-i thërret `/api` relativ
> dhe kërkesat dështojnë.

---

## Verifikimi

```powershell
# 1) Health i backend-it (duhet {"status":"ok"})
curl https://<emri>.onrender.com/api/health

# 2) Lista e ndeshjeve (lexon Supabase + feed-in LuckyBet)
curl "https://<emri>.onrender.com/api/matches" -UseBasicParsing

# 3) WebSocket: hape wss://<emri>.onrender.com (duhet te lidhet pa gabim)
```

Kredencialet e testimit (krijuar nga `prisma/seed.ts`): **`admin` / `admin123`**, **`manager` / `manager123`**.

---

## Gabime të shpeshta dhe zgjidhjet

| Gabimi në log | Shkaku | Zgjidhja |
|---|---|---|
| `error TS2769: No overload matches this call ... not assignable to parameter of type 'PathParams'` | `yarn install` pa lockfile zgjidh `@types/express@5.x` (nga `@types/compression`) | Tashmë e rregulluar me `resolutions`/`overrides` + `yarn.lock`; mos i hiq ato |
| `prepared statement "s0" already exists` / `prisma db push` dështon | `DATABASE_URL` në port **6543** (Transaction pooler, pgbouncer) | Përdor port **5432** (Session pooler) |
| `sh: 1: prisma: not found` / `exit code 127` | Root Directory bosh + `yarn install` s'instalon varësitë e backend-it | Vendos **Root Directory = `backend`** (ose lëri default-et: skriptet e rrënjës tani i instalojnë vetë) |
| `info No lockfile found` (yarn) | Nuk ka `yarn.lock` në rrënjë | Info, jo gabim — build-i vazhdon |
| `Cannot find module '/opt/render/project/src/frontend/dist/index.js'` | Root Directory e gabuar | Vendos **`backend`** |
| `ENOTFOUND db.<ref>.supabase.co` | Host-i direkt i Supabase = IPv6-only | Përdor **Session pooler** (IPv4, port 5432) |
| `Timed out fetching a new connection` | Pool-i i Prisma-s mbushet | Shto `&connection_limit=10&pool_timeout=30` në `DATABASE_URL` |
| `P1001: Can't reach database server` | `DATABASE_URL` mungon/mos saktë | Rishkruaj variablin → Save → Manual Deploy |
| Build ok, por faqja bosh | `VITE_API_URL` i gabuar në frontend | Ripërsërit build-in e frontend-it |
| Deploy kalon, kuotat nuk përditësohen | Instancë falas në gjumë | Hap faqen (kërkesa e zgjon) ose kalo në plan me pagesë |

---

## Përditësimet e ardhshme

```powershell
git add -A
git commit -m "nderrimi"
git push origin main      # Render-i (autoDeploy) e ripërtërin vetë backend-in
```

Për frontend-in: ekzekuto përsëri `frontend\deploy-gh-pages.ps1`.

> 🔐 Kujdes: në `C:\Users\User\Desktop\Crack\aftereffect\netfly-git-backup\*\config`
> është ruajtur një token GitHub në tekst të hapur (`ghp_...`). Rotacionoje/fshije atë
> token nga GitHub → Settings → Developer settings → Personal access tokens, sepse
> kush e lexon atë skedar e kontrollon plotësisht llogarinë.
