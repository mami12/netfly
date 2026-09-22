# Përmbledhje e session-it — Netfly (futboll real, kuota live)

> 📌 **Përditësim i hostimit (i verifikuar):** repo-t e vjetra ishin fshirë nga GitHub-i.
> U rikrijuan dhe u mbushën sërish:
> - `https://github.com/mami12/netfly` (private) — monorepo `backend/` + `frontend/`
> - `https://github.com/mami12/netfly-frontend` (publik) — hoston GitHub Pages: `https://mami12.github.io/netfly-frontend`
> - Backend live: `https://netfly-backend-1.onrender.com` (`/api/health` → ok, `/api/matches` → 200)
>
> Udhëzuesi i deploy-it në Render: **`docs/DEPLOY-RENDER.md`** (Blueprint në rrënjë: `render.yaml`).

Dokument referimi: çfarë ndërtuam, pse, si, me çfarë, dhe çfarë mbetet.


---

## 1. Qëllimi

Të kemi një faqe bastesh me **vetëm futboll real** (pa simulime, pa kazino, pa basketboll),
me **të gjitha tregjet** e kuotave nga burimi real, që përditësohen **në kohë reale**,
me pezullim automatik të kuotave kur shënohet gol, dhe bazë të dhënash që nuk humbet.

---

## 2. Burimi i të dhënave (feed-i real)

Platforma burim: **bitgames6205.com** → API/WSS: **api-gateway.gw-lucky-bet.com**

| Çfarë | Endpoint |
|---|---|
| Lista e ndeshjeve (ID-të) | `POST /matches/get-many` — body `{sportId:18, service:"live"\|"prematch", limit:2000}` |
| Kategoritë (filtrim virtual) | `GET /categories/get-many?sportId=18` |
| Detajet e ndeshjes | `GET /matches/get?matchId=...` |
| Sportet / turnetë | `GET /sports/get`, `GET /tournaments/get` |
| Kuotat + score live | `WSS /push-server-v2/?Language=en-001&externalPartnerId=<PARTNER>&EIO=4&transport=websocket` |

- `sportId: 18` = **futboll** (as kazino, as basketboll).
- Nuk ka "API key" klasik: mjafton `p=<partnerId>` (`externalPartnerId`).
- Abonimi bëhet me mesazhe socket.io: `42["subscribe",{"messageType":"subscribe-match-odds","data":{"matchIds":[...],"isBaseOddsGroups":false}}]`
  dhe `subscribe-match-info` për score/minutë/status.
- `isBaseOddsGroups:false` = **të gjitha grupet** (deri 88 tregje për ndeshje); `true` = vetëm grupet bazë.
- Formatet: `match-odds-snapshot`, `match-odds` (update), `match-info-snapshot`, `match-info`.
- Fushat e kuotës: `cf` (koeficienti), `name`, `outcome` (kodi: `1`,`x`,`2`,`over`,`under`,`yes`,`no`,`odd`,`even`), `status`.
- Score: `data.matchScore.t1/t2`, minuta: `data.matchTime` (milisekonda), statusi: `data.status`.

Grupet "Early payout" (emri përmban score-in, p.sh. `Full time result (Early payout 2:0)`)
**filtrohen** — ato krijonin tregje të dublikuara identike në çdo gol.

---

## 3. Hostet & shërbimet

| Shërbim | Roli | Adresa |
|---|---|---|
| **GitHub** | Kodi burim | `https://github.com/mami12/netfly` (monorepo: `backend/` + `frontend/`) |
| **Render** | Hosting **BACKEND** (Web Service, root `backend`) | `netfly-backend-1.onrender.com` |
| **GitHub Pages** | Hosting **FRONTEND** (dega `gh-pages` e `netfly-frontend`) | `mami12.github.io/netfly-frontend` |
| **Supabase** | Baza Postgres (projekt `tvynxkthwxlxjlllehgo`, region `eu-west-1`) | Session pooler: `aws-1-eu-west-1.pooler.supabase.com:5432` |
| **JWT** | Sesionet e përdoruesve | `JWT_SECRET` (env në Render) |

> **Frontend-i NUK është në Render** — është në GitHub Pages. Deploy-i i frontend-it bëhet
> me skriptin `frontend/deploy-gh-pages.ps1` (build → push në degën `gh-pages`).
> Backend-i në Render përditësohet vetë në çdo `git push` në `main`.

**DATABASE_URL (i plotë, me parametrat e nevojshëm):**
```
postgresql://postgres.tvynxkthwxlxjlllehgo:<PASSWORD>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=10&pool_timeout=30
```
> `connection_limit=10&pool_timeout=30` janë **të detyrueshëm** — pa ata pool-i i Prisma-s
> mbushet dhe kuotat nuk shkruhen (gabimi `Timed out fetching a new connection`).
>
> ⚠️ **Mos përdor host-in direkt** `db.tvynxkthwxlxjlllehgo.supabase.co` — projekteve të reja
> Supabase u jepet **vetëm IPv6** (`2a05:d018:...`, pa record A), ndërsa **Render-i nuk ka
> dalje IPv6**, prandaj lidhja dështon me `ENOTFOUND`. Gjithmonë URL-ja e **Session pooler**
> (Supavisor, IPv4): `aws-<n>-<region>.pooler.supabase.com:5432` me user `postgres.<project-ref>`.

**Frontend-i** lexon backend-in nga `frontend/.env`:
```
VITE_API_URL=https://netfly-backend-1.onrender.com
VITE_WS_URL=wss://netfly-backend-1.onrender.com
```

---

## 4. Baza e të dhënave (Prisma + PostgreSQL/Supabase)

Skema: `backend/prisma/schema.prisma`

| Model | Përmbajtja | Shënim |
|---|---|---|
| `Sport` | Futboll | vetëm 1 sport |
| `Category` | Vendi/kategoria (p.sh. "India") | filtri i virtuale bëhet me `slug` |
| `Tournament` | Liga/kupa (p.sh. "Bangalore Super Division") | grupimi në faqe bëhet me `Category - Tournament` |
| `Match` | Ndeshja | `id = "lb-<idEfeed>"`, `isSimulated`, `isSuspended`, **`manualSuspended`** (pezullim nga admini) |
| `Market` | Tregu (grup kuotash) | **`extId`** = id e grupit nga feed-i; **`@@unique([matchId, name])`** |
| `Outcome` | Kuota | **`code`** = kodi nga feed-i (`1/x/2/over/...`); **`@@unique([marketId, name])`** |
| `Ticket` / `TicketLine` | Skedinat e basteve | statuset WON/LOST/VOID, rifondim për VOID |
| `User` | Lojtar / Menaxher / Admin | `role`, `managerId` (hierarki menaxheri) |
| `Transaction` | Historiku i lëvizjeve | deposit / bet / win / refund / manager |

**Dy constraint-et unike janë mbrojtja përfundimtare kundër dublikatave** — edhe nëse dy
procese shkruajnë njëkohësisht, dublikata fizikisht nuk mund të krijohet.

---

## 5. Arkitektura & rrjedha e të dhënave

```
feed-i (LuckyBet)          backend (Render)                       frontend (React)
──────────────────         ───────────────────────                ─────────────────
POST /matches/get-many ──► LuckyBetFeed.doSync()  ── upsert ──►    Supabase (Postgres)
   (çdo 60 s)                 ↓                                       ↑
                              endMatch() → BetSettler.settleMatch()    │
                                                                       │
WSS push-server-v2 ───────► LuckyBetFeed (applyOdds / applyInfo) ──────┘
   live kuota & score           ↓
                                WSService.broadcast('odds', delta)
                                        │
                                        ▼
                              frontend oddsStore (1 lidhje WS)
                                        │
                                        ▼
                              OddsButton (useLiveOdds) → kuota live
```

**Komponentët kryesorë:**

| Skedari | Roli |
|---|---|
| `backend/src/feeds/LuckyBetFeed.ts` | Zemra: sinkronizim ndeshjesh, abonim kuotash, ruajtje, pezullim goli, pastrim |
| `backend/src/services/betSettler.ts` | Mbyllja e ndeshjes: gjykon tregjet + skedinat (WON/LOST/VOID + rifondim) |
| `backend/src/services/wsService.ts` | WebSocket për frontend-in (`odds`, `match:` kanale) |
| `backend/src/routes/sports.ts` | `/api/matches` (listë e lehtë), `/api/matches/:id` (të gjitha tregjet) |
| `backend/src/routes/bets.ts` | Vendosje / ruajtje / cashout i skedinave |
| `frontend/src/api/oddsStore.ts` | **Një lidhje e vetme** WS + `useLiveOdds(outcomeId)` |
| `frontend/src/utils/labels.ts` | Përkthimi i emrave të tregjeve/opsioneve në shqip |
| `frontend/src/components/Sports/MatchList.tsx` | Lista, grupuar sipas ligave, butonat 1X2 |
| `frontend/src/components/Sports/MatchDetail.tsx` | Të gjitha tregjet, në seksione të organizuara |
| `frontend/src/components/Sports/OddsButton.tsx` | Butoni i kuotës (kuota live + 🔒 kur pezullohet) |

**Ciklet kohore:**
- **60 s** — rifreskimi i listës së ndeshjeve (live + prematch) nga API-ja
- **20 s** — cikli i abonimit: live me të gjitha grupet + 25 më të afërtat me të gjitha grupet + dritare rrotulluese 90 me grupet bazë
- **12 s** — rifreskimi i faqes së detajeve (statuset + kuotat)
- **15 s** — rifreskimi i listës në frontend
- **25 s** — rrjetë sigurie: ç-pezullim automatik nëse pas golit nuk vijnë kuota të reja

---

## 6. Problemet e gjetura & zgjidhjet (kjo ishte pjesa kryesore)

### 6.1 Ndeshjet PREMATCH nuk abonoheshin **kurrë** 🎯 (shkaku kryesor)
```ts
this.subTimer = setInterval(() => this.subscribeNow(this.liveIds), 30000); // VETEM live!
```
Shumica e ndeshjeve (prematch) nuk merrnin **asnjë kuotë** → faqja shfaqte "Duke u ngarkuar...".
**Zgjidhja:** `subscribeCycle()` — LIVE me të gjitha grupet + 25 më të afërtat me të gjitha grupet
+ dritare rrotulluese 90 me grupet bazë; abonimi nis **menjëherë** (id-të mblidhen para punës me DB).

### 6.2 Dublikatat ("i njëjti opsion 2-3 herë")
Dy shkaqe të pavarura:
- `applyOdds()` thirrej **pa `await`** (fire & forget) → dy mesazhe njëkohësisht krijonin tregje identike
- Grupet **"Early payout"** kishin score-in në emër → **çdo gol krijonte një treg të ri identik**

**Zgjidhja:** serializim me radhë + **constraint unik në DB** + filtrimi i "Early payout" + pastrimi i
mbetjeve (3082 tregje të tepërta u fshinë). Rezultati i matur: **0 dublikata**.

### 6.3 Kuotat nuk përditësoheshin në kohë reale
`OddsButton` thërriste `useWebSocket()` → **një lidhje WebSocket për ÇDO buton** (qindra lidhje).
**Zgjidhja:** `api/oddsStore.ts` — një lidhje e vetme për gjithë faqen + `useLiveOdds(outcomeId)`
me `useSyncExternalStore`.

### 6.4 Pezullimet mungonin
`if (cf <= 0) continue;` → kuota e vjetër mbetej **aktive** gjatë golit.
**Zgjidhja:** `cf<=0` → `status='SUSPENDED'` (shfaqet 🔒, serveri e refuzon bastin)
+ **bllokimi i golit**: kur ndryshon score → `isSuspended=true`, ç-pezullohet me push-in e parë
të kuotave (ose pas 25 s); pezullimi manual i adminit (`manualSuspended`) nuk hiqet automatikisht.

### 6.5 1X2 nuk shfaqej në listë
`MatchList` kërkonte outcome me emër `'1'/'X'/'2'` — feed-i dërgon **emrat e ekipeve**.
**Zgjidhja:** kolonë e re `Outcome.code` (nga fusha `outcome` e feed-it) + zgjidhje me
`code` → pastaj emër → pastaj emër ekipi. Gjykimi i basteve në `BetSettler` tani përdor gjithashtu `code`.

### 6.6 Performanca / pool-i i lidhjeve (pengesa e fshehur)
`Timed out fetching a new connection from the connection pool (limit 5)` —
qindra `applyOdds` njëkohësisht + ~3 pyetje DB **për çdo kuotë**.
**Zgjidhja:**
- `connection_limit=10&pool_timeout=30` në `DATABASE_URL`
- radhë globale `withDbSlot()` (`MAX_DB_TASKS = 3`)
- 1 pyetje për të gjitha tregjet e ndeshjes (paraprakisht), pastaj blloqe transaksioni (`flushOps`)
- lista e ndeshjeve: vetëm tregu 1X2 + `_count` → **3.74 MB → 1.18 MB**

### 6.7 Përkthimi & organizimi i faqes
- `markets.Full time result` shfaqej i papërkthen → moduli `utils/labels.ts` me fjalor + **modele**
  për emrat dinamikë (`Genoa total` → `Genoa — total gola`); kurrë çelës i papërkthen
- Opsionet: `Over/Under` → `Mbi/Nën`, `Draw` → `Barazim`, `Odd/Even` → `Tek/Çift`
- `MatchDetail`: tregjet në seksione (Kryesore / Gola / Pjesët / Statistika / Lojtarët),
  1X2 gjithmonë i pari, "Tregje shtesë" i hap të gjitha, kufi 12 kuota për treg
- `MatchList`: ndeshjet **të grupuara sipas ligave/kupave** (kupa indiane → ndeshjet indiane, etj.)

### 6.9 Score-i i gabuar: mysafiri +1 gol (0-1 në vend të 0-0) 
Feed-i jep score-in vetëm në WebSocket (`match-info`), jo në REST. Fushat e sakta:
```json
"matchScore":   { "t1": "2", "t2": "0" },        // STRINGS, jo numra
"periodsScore": [ {"t1":"1","t2":"0"}, ... ],     // për pjesë
"ts": 1789643981835,                              // timestamp (ms)
"matchTime": 3570000                              // ms → 59.5 min
```

**Shkaku:** kodi kishte një "mbrojtje" që e bllokonte score-in të ulej:
```ts
const s1 = hasScore ? Math.max(r1, cur.homeScore ?? 0) : (cur.homeScore ?? 0);
const s2 = hasScore ? Math.max(r2, cur.awayScore ?? 0) : (cur.awayScore ?? 0);
```
Kur feed-i **korrigjonte** score-in (gol i anuluar/VAR, ose push i gabuar 0-1 që pastaj
korrigjohej në 0-0), ne e mbanim **përgjithmonë** vlerën e lartë — ndërsa kuotat
vazhdonin të përditësoheshin sipas score-it të saktë. Rezultat: faqja tregonte 0-1
me kuota që i përgjigjeshin 0-0.

**Zgjidhja:** score-i merret **ashtu si është** (feed-i është burimi i së vërtetës), dhe
renditja bëhet me **`ts`**: mbahet `Map<matchId, ts>` dhe një mesazh me `ts` më të vjetër
se i fundit i aplikuar **hidhet poshtë** (mbron nga ardhja jashtë radhe, por pranon
korrigjimet me `ts` më të ri). 

**Prova:** 16 nga 16 ndeshje live → score **identik** me feed-in (0 diferenca), e matur me
skriptin që abonohet për ndeshjet tona dhe krahason.

### 6.10 Kategoria `short-football` po kalonte filtrin e virtuale
`VIRTUAL_HINTS` kishte `'shorts'` (shumës), ndërsa slug-u i kategorisë 969 është
**`short-football`** → 39 ndeshje "Short football" (të simuluara, me score 4-8) po
shfaqeshin si reale. U shtua hint-i `short` + `cleanupVirtualMatches()` që i fshin
(kategoria 969 = short-football, 989 = cyberfifa, 1940 = replays, 2038 = ereplays).

### 6.11 Minutat mbeteshin "0'" + ndeshje të pafilluara shfaqeshin si LIVE
Feed-i i liston si `service: "LIVE"` edhe ndeshjet që **nuk kanë filluar**
(`status: "About to start"` / `"Not started yet"`) → ne i shënonim **LIVE** dhe ato
shfaqeshin në "NDESHJET LIVE" me **0'**, ndërsa ndeshjet e vërteta live kishin
`matchTime` që shpesh mungonte → mbeteshin në 0'.
**Zgjidhja:**
- `notStarted` (regex `about to start|not started|scheduled|postpon|delay|cancel`) → statusi **PREMATCH**, jo LIVE
  (ato shfaqen te "Ndeshjet e ardhshme" me orën e nisjes)
- **Fallback** për minutat: nëse `matchTime` mungon/0 → llogaritet nga `startTime`
  (`Math.min(90, minutat e kaluara)`)
- U shtua fusha **`period`** (statusi i feed-it: "1st Half"/"Break Time"/"2nd Half")
  → shfaqet në shqip: **Pjesa 1 / Pushim / Pjesa 2 / Nis së shpejti / Përfundoi**

Rezultati: **Live 39 → 14, me minutë 0 → 0**; minutat reale 91' / 85' / 66' / 69'.

### 6.12 Dublikatat në UI: "i njëjti opsion 2 herë"
Seksionet e tregjeve në `MatchDetail` **nuk ishin ekskluzive**: secili treg shfaqej në
seksionin e vet **dhe** në "Të tjera" (që kishte `match: () => true` dhe i kapte të gjitha).
P.sh. "Të Dyja Ekipet Shënojnë" dukej 2 herë. **Zgjidhja:** grupim me shënim `used` —
çdo treg shfaqet vetëm në **seksionin e parë** që përputhet.

### 6.13 Statistikat live (kornera / kartona)
`sportTag: "football"` **nuk** i dallon lojërat virtuale — dallimi bëhet vetëm me `categoryId`
(969/989/1940/2038). U shtuan:
- **`extHomeId` / `extAwayId`** (id-të e ekipeve nga feed-i) — `scoreBoard.results` është i
  keyed nga id-ja e ekipit, jo nga pozicioni
- **`homeCorners`/`awayCorners`/`homeYellow`/`awayYellow`/`homeRed`/`awayRed`** →
  shfaqen në faqen e detajeve: 🚩 Kornera ·  Kartonë · 🟥 Të kuq

### 6.14 Tregjet pa emër u hoqën
402 tregje kishin emrin **"Market"** (grup pa emër nga feed-i). Tani nuk krijohen më
(`if (!rawName) continue`) dhe mbetjet u fshinë me `cleanupUnnamedMarkets()`.

### 6.15 Ora e nisjes në shqip + përkthime të plota
- `formatKickoff()`: **"Sot, 20:45"** · **"Nesër, 18:00"** · **"17 Sht, 20:45"**
- ~35 përkthime të reja tregjesh + modele për emrat dinamikë
  (`Result and both teams to score` → `Rezultati & Të dyja shënojnë`,
   `Winning margin X by 2 goals` → `Diferenca — X me 2 gola`,
   `From 1 to 15 minute inclusive. Goal to be scored` → `Nga minuta 1-15 — Gol`,
   `X Asian total` → `X — total aziatik`)

### 6.16 Pastrime të tjera
- `SimulationFeed` u hoq fare; `seed.ts` krijon vetëm admin + menaxher
- `ExternalFeedAdapter` (Bzzoiro) dhe çelësat e vjetër API u hoqën
- 8 skedarë bosh mbeturinash (nga redirect i log-ut të Render) u fshinë nga repo
- Dublikatat në skema: `@@unique` për `Market` dhe `Outcome`

---

## 7. Commit-et e session-it

| Commit | Përmbajtja |
|---|---|
| `b29a602` | Kodi fillestar backend + frontend (feed real, të gjitha tregjet) |
| `7a9745a` | Heqje e API-ve të vjetra, pa simulime, bllokim goli, schema Postgres + seed minimal |
| `440cfb5` | `syncInFlight` — mbrojtje nga mbivendosja e sinkronizimit |
| `1f54ed2` | Vetëm futboll real: Neon, pezullim goli, cache performance |
| `03e3049` | Pastrim: 8 skedarë bosh + skript debug |
| `f5fa99d` | **Kuotat: dublikatat, pezullimet, abonimi prematch, performanca, organizimi UI** |
| `69cb35f` | Lista e ndeshjeve 3× më e lehtë (vetëm 1X2 + `_count`) |
| `0eb2b16` | **Grupim sipas ligave + etiketa shqip + 1X2 i pari** |

---

## 8. Gjendja e matur (e verifikuar në DB)

- **1360** ndeshje të hapura, **53** live
- **513** ndeshje me kuota 1X2 në listë (po rritet vazhdimisht)
- **~25 000** kuota, **~46 %** me kod të ruajtur
- **0 dublikata** (tregje dhe kuota)
- **0** tregje "Early payout"
- Pezullimet aktive në kohë reale (shihen në log: `GOL X 1-0 Y → kuotat pezulluar përkohësisht`)

---

## 9. Çfarë mbetet për të bërë (nga ana jote, në Render)

### 9.1 Backend (Render) ⚠️ KA NJË GABIM TANI
Shërbimi i backend-it ka `Root Directory` të gabuar (u vendos `frontend`), prandaj dështon me
`Cannot find module '/opt/render/project/src/frontend/dist/index.js'`.
**Rregullo:** Render → shërbimi i backend-it → Settings:
- **Root Directory** = **`backend`**  ← ktheje mbrapsht!
- **Build Command** = `npm install && npm run build && npm run db:seed`
- **Start Command** = `npm start`
- **Environment** → `DATABASE_URL` = URL-ja e **Session pooler** të Supabase (IPv4, port 5432):
  `postgresql://postgres.tvynxkthwxlxjlllehgo:<PASSWORD>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres?sslmode=require&connection_limit=10&pool_timeout=30`
  (host-i direkt `db.<ref>.supabase.co` është IPv6-only → Render nuk lidhet dot)
→ Save → Manual Deploy → Deploy latest commit

### 9.2 Frontend (GitHub Pages) ✅ U BË
Frontend-i shërbehet nga dega `gh-pages` e `netfly-frontend` (jo Render).
U përditësua me skriptin `frontend/deploy-gh-pages.ps1`.

**Për përditësime të ardhshme, vetëm:**
```powershell
powershell -ExecutionPolicy Bypass -File frontend\deploy-gh-pages.ps1
```

Pas kësaj, **një `git push` i vetëm përditëson të dyja** (frontend + backend).

### 9.3 Përmirësime të mundshme më tej
- Mbulim më i plotë i kuotave për prematch (rritja e dritares) — varet nga sa e duron Supabase falas
- Faqosje më e detajuar e tregjeve komplekse (kornera/kartona) sipas grupeve
- Cache në memorie për `/api/matches` që faqja të hapet më shpejt
- Postgres me pagesë (Supabase Pro) për më shumë lidhje + më shumë shkrime/s

---

## 10. Komandat e dobishme

```bash
# Zhvillim lokal (backend)
cd backend
npx tsx src/index.ts          # nis serverin (port 3001)

# Baza e të dhënave
npx prisma db push            # zbaton skemën në Supabase
npx prisma generate           # rigjeneron client-in
npx tsx prisma/seed.ts        # krijon admin + menaxher

# Kontroll i tipave / build
npx tsc --noEmit --strict --esModuleInterop --skipLibCheck    # backend
cd ../frontend && npx tsc --noEmit && npx vite build          # frontend

# Kontroll i shpejtë i API-t
curl http://localhost:3001/api/health
curl http://localhost:3001/api/matches      # listë (vetëm 1X2 + _count)
curl "http://localhost:3001/api/matches/lb-40069582"   # të gjitha tregjet e një ndeshje

# Git
cd .. && git add -A && git commit -m "..." && git push origin main
```

---

## 11. Kredencialet

- **Admin**: `admin` / `admin123` (krijohet nga `prisma/seed.ts`)
- **DATABASE_URL**: shih `backend/.env` (nuk ngarkohet në git)
- **LUCKYBET_PARTNER_ID**: `d3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f`

> ⚠️ Partner-ID i feed-it është kredencial e platformës burim (LuckyBet). Mund të rotacionohet
> ose bllokohet në çdo moment, dhe përdorimi pa marrëveshje shkel kushtet e tyre. Për prodhim
> afatgjatë duhet një feed i licencuar.
