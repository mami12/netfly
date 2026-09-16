# Përmbledhje e session-it — Netfly (futboll real, kuota live)

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
| **Render** | Hosting backend + frontend | backend: `netfly-backend-1.onrender.com` (root `backend`) |
| **Neon** | Baza Postgres | `ep-jolly-pine-b4zrmc2q.c-6.us-east-2.aws.neon.tech` → db `neondb` |
| **Kredencialet JWT** | Sesionet e përdoruesve | `JWT_SECRET` (env) |

**DATABASE_URL (i plotë, me parametrat e nevojshëm):**
```
postgresql://neondb_owner:...@ep-jolly-pine-b4zrmc2q.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require&connection_limit=10&pool_timeout=30
```
> `connection_limit=10&pool_timeout=30` janë **të detyrueshëm** — pa ata pool-i i Prisma-s
> mbushet dhe kuotat nuk shkruhen (gabimi `Timed out fetching a new connection`).

**Frontend-i** lexon backend-in nga `frontend/.env`:
```
VITE_API_URL=https://netfly-backend-1.onrender.com
VITE_WS_URL=wss://netfly-backend-1.onrender.com
```

---

## 4. Baza e të dhënave (Prisma + PostgreSQL/Neon)

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
POST /matches/get-many ──► LuckyBetFeed.doSync()  ── upsert ──►    Neon (Postgres)
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

### 6.8 Pastrime të tjera
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

### 9.1 Backend
- Render → shërbimi i backend-it → **Settings**: Repository = `mami12/netfly`, **Root Directory = `backend`**
- **Environment** → `DATABASE_URL` duhet të përmbajë `&connection_limit=10&pool_timeout=30`
- **Manual Deploy → Deploy latest commit**

### 9.2 Frontend ⚠️ (arsyeja pse sheh ende `markets.Full time result`)
Frontend-i i deploy-uar vjen nga repo-ja tjetër `mami12/netfly-frontend` — **pa ndryshimet e reja**.
- Render → shërbimi i frontend-it → **Settings**: Repository = `mami12/netfly`, **Root Directory = `frontend`**
- **Build Command** = `npm install && npm run build`, **Publish Directory** = `dist`
- Ose: kopjo përmbajtjen e `frontend/` te `netfly-frontend` dhe bëj push

Pas kësaj, **një `git push` i vetëm përditëson të dyja** (frontend + backend).

### 9.3 Përmirësime të mundshme më tej
- Mbulim më i plotë i kuotave për prematch (rritja e dritares) — varet nga sa e duron Neon falas
- Faqosje më e detajuar e tregjeve komplekse (kornera/kartona) sipas grupeve
- Cache në memorie për `/api/matches` që faqja të hapet më shpejt
- Postgres me pagesë (Neon) për më shumë lidhje + më shumë shkrime/s

---

## 10. Komandat e dobishme

```bash
# Zhvillim lokal (backend)
cd backend
npx tsx src/index.ts          # nis serverin (port 3001)

# Baza e të dhënave
npx prisma db push            # zbaton skemën në Neon
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
