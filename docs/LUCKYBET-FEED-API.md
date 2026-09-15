# MANUALI I FEED-IT — gw-lucky-bet / bitgames6205

> Analizë e provuar (live) e API-t që ushqen faqen `bitgames6205.com`.
> Të gjitha shembujt më poshtë janë **verifikuar me kërkesa reale** (statusi + mostra e përgjigjes janë kopjuar nga përgjigja e serverit).
> Data e verifikimit: 2026-09-15 — Versioni i frontend-it: `v0.4131.0`

---

## 0. Të dhënat bazë (credentials / parametrat)

| Gjëja | Vlera |
|---|---|
| Host REST | `https://api-gateway.gw-lucky-bet.com` |
| Host realtime (kuota + score) | `wss://api-gateway.gw-lucky-bet.com/push-server-v2/` (Socket.IO v4, `EIO=4`) |
| Host i dytë realtime (feature/statistika) | `wss://api-gateway.gw-lucky-bet.com/sportfeed-feature-ws/` |
| **Partner ID (`p`)** | `d3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f` |
| Gjuha (`l`) | `en-001` (mundësi të tjera në `/api/translations/...`) |
| Frontend (burimi i analizës) | `https://bitgames6205.com/resources/v1/app/assets/betting-Do2Hl4M0.js` |
| Statike (logo / ikona) | `https://bstatic.live/...` |

Partner ID-ja mund të dërgohet në **dy mënyra** (të dyja funksionojnë):

1. Si query-param në URL: `?p=d3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f&l=en-001`
2. Si header (kështu e bën vetë frontend-i):
   ```
   accept: application/json
   Content-Type: application/json
   x-lang: en-001
   x-external-partner-id: d3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f
   x-user-location: AL          # opsionale, kodi i shtetit (geo)
   token: <JWT>                 # vetëm për endpoint-et e mbrojtura (baste/balancë)
   ```

> Frontend-i i faqes merr këto vlera nga redirect-i i hyrjes: `/cdaredirect` → `redirect_data` (Base64: `{"type":"auth","redirectStartTime":...,"domainCheckDuration":...}`) + `auth_secret` + `token` + `cda_arg`. Kjo është **sesioni i lojtarit** (baste), jo feed-i i ndeshjeve. Për ID-të e ndeshjeve dhe kuotat nuk të duhet asnjë token.

---

## 1. ⭐ URL KRYESORE QË JEP **ID-të E NDESHJEVE**

```
POST https://api-gateway.gw-lucky-bet.com/matches/get-many?l=en-001&p=d3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f
Content-Type: application/json

{ "sportId": 18, "service": "live", "limit": 100 }
```

Kjo është e vetmja URL që duhet për "listën e ndeshjeve + ID-të".
**ID-ja e ndeshjes = `result.items[].id`** (numër i plotë, p.sh. `40068754`).

URL-ja e faqes për çdo ndeshje ndërtohet si:
`https://bitgames6205.com/betting/match/sport/<slug>-<id>` (p.sh. `.../uzbekistan-u23-vs-philippines-u23-40031879`)

### Shembull përgjigjeje (shkurtuar, e vërtetë)

```json
{
  "result": {
    "items": [
      {
        "id": 40031879,
        "name": "Uzbekistan U23 - Philippines U23",
        "slug": "uzbekistan-u23-vs-philippines-u23",
        "sportId": 18,
        "sport":   { "id": 18, "slug": "football", "sportType": "default", "tag": "football", "isEsport": false },
        "sportTag": "football",
        "categoryId": 1657,
        "category": { "id": 1657, "slug": "asia" },
        "tournamentId": 47494,
        "tournament": { "id": 47494, "slug": "national-teams-u-23-asian-games" },
        "homeTeam":   { "id": 52028951, "name": "Uzbekistan U23", "position": 1, "slug": "uzbekistan-u23",
                        "logo": { "url": "https://bstatic.live/team-icons/10-52028951.webp" } },
        "awayTeam":   { "id": 51994817, "name": "Philippines U23", "position": 2, "slug": "philippines-u23",
                        "logo": { "url": "https://bstatic.live/team-icons/10-51994817.webp" } },
        "competitors": [ /* homeTeam + awayTeam në një array */ ],
        "logo": { "url": "https://bstatic.live/icons/5d5e2f469217a4ab9baac95a881f9a7f45866914.webp" },
        "service": "PREMATCH",        // PREMATCH | LIVE
        "serviceV2": "prematch",      // prematch | live
        "isHot": false,
        "closed": true,
        "createdAt": 1789393454,      // epoch sekonda
        "startAt": 1789453800,        // epoch sekonda (fillimi i ndeshjes)
        "updatedAt": 1789461069181    // epoch milisekonda
      }
    ],
    "meta": {
      "geoZone": "RU",
      "geoZoneId": 1,
      "total": 1185,      // ⚠️ = numri i item-eve QË U KTHYEN, jo totali global
      "userGroup": "ALL"
    }
  }
}
```

**Kujdes:** `get-many` **nuk ka paginim** — `offset`, `skip`, `page`, `cursor` injorohen nga serveri (testuar: të gjitha kthejnë të njëjtat item-e).
Për të marrë gjithçka, rrit `limit` (testuar `limit:5000` → kthen të gjitha 1185 ndeshjet e futbollit pa problem).

---

## 2. Skema e plotë e trupit (body) të `matches/get-many`

Frontend-i i faqes e thërret kështu (kodi real, i de-minifikuar):

```js
{ service, sportId, includeSportType, excludeSportType, tournamentId,
  limit, hotsLimit, startBefore, sortType, categoryId, categoryIds, include: { category } }
```

### Filtrat — çka punon dhe çka NUK punon (të testuara)

| Fusha | Statusi | Vlera / Shembull |
|---|---|---|
| `sportId` | ✅ punon | `18` = Futboll |
| `service` | ✅ punon | `"live"` ose `"prematch"` |
| `categoryId` | ✅ punon | `139` → vetëm Spanjë |
| `categoryIds` | ✅ punon | `[153,139,144]` → Angli + Spanjë + Itali |
| `tournamentId` | ✅ punon | `919` → vetëm Premier League |
| `limit` | ✅ punon | `10 … 5000` (default: pa limit → kthen të gjitha) |
| `includeSportType` | ✅ punon | `"default"` \| `"esport"` \| `"polybet"` |
| `excludeSportType` | ✅ punon | `"polybet"` ose `["polybet","racing"]` |
| `hotsLimit` + `sortType:"hot_widget"` | ✅ punon | vetëm ndeshjet "hot" |
| `offset` / `skip` / `page` / `cursor` | ❌ injorohet | pa paginim |
| `excludeCategoryId(s)` | ❌ injorohet | filtro në anën tënde |
| `query` / `search` / `startBefore` | ❌ injorohet këtu | përdor `/matches/search` |

---

## 3. VETËM FUTBOLL (pa kazino, pa basketboll, pa esport)

`sportId: 18` = vetëm futboll. Por brenda futbollit ka edhe ndeshje **virtuale / replay** që nuk janë futboll real.
Kategoritë që duhen hequr:

| categoryId | slug | Çka është | Turne tipik |
|---|---|---|---|
| 989 | `cyberfifa` | CyberFIFA (lojtarë virtualë, `AS Roma (mko1919)`) | `esportsbattle-2x4-min`, `h2h-gg-league-2x4-min` |
| 1940 | `replays` | Përsëritje ndeshjesh të luajtura | `la-liga`, `premier-league`, `serie-a` |
| 2038 | `ereplays` | eHighlights / penallti të përsëritura | `ehighlights-world-cup`, `world-cup-penalty-shootout` |
| 969 | `short-football` | "Short football" 2x2 / 3x3 (format i shkurtër) | `short-football-2x2-2x5-mins` |
| 1666 | `world` | Baste afatgjata (Long-term bets, pa rezultat live) | `FIFA World Cup 2030. Long-term bets` |

### Kërkesa e rekomanduar për futboll real

```json
POST /matches/get-many?l=en-001&p=<partnerId>
{
  "sportId": 18,
  "service": "live",
  "limit": 500,
  "excludeSportType": ["polybet", "racing", "esport"]
}
```

…dhe filtro në anën tënde:

```ts
const BLOCKED_CATEGORIES = new Set(['cyberfifa', 'replays', 'ereplays', 'short-football', 'world']);
const realFootball = items.filter(m => m.sportId === 18 && !BLOCKED_CATEGORIES.has(m.category?.slug));
```

**Ose** merr vetëm kategoritë reale me një kërkesë (më e pastër):

```json
{ "sportId": 18, "limit": 500, "categoryIds": [153,139,144,168,106,100,1661,1662,1657,183,147,138,143,123,519,117,140,131,165,93,167,151,105,156,146,137,113,161,145,141,177,96,112,166,167] }
```

### Shpërndarja reale e futbollit (matur: 1185 ndeshje gjithsej)

```
england 146  europe 96   argentina 69  italy 53   germany 37  usa 37
brazil 35    russia 33   spain 32      france 29  scotland 29 asia 28
greece 22    czechia 22  netherlands 21 denmark 21 poland 21   ukraine 20
japan 20     sweden 19   turkey 19     colombia 18 austria 18  mexico 17
... (gjithsej 79 kategoritë) ...
replays 5    cyberfifa 5   ereplays 3   short-football 2   world 5   <-- HIQ
```

Nga `limit:300` ndeshje "live", vetëm **3** ishin futboll real (pjesa tjetër cyberfifa/replays) — pra filtrimi është i detyrueshëm.

---

## 4. Endpoint-et mbështetëse (inventari, i testuar)

### 4.1 Sporte / kategori / turne

| Endpoint | Metoda | Trupi & Params | Kthen |
|---|---|---|---|
| `/sports/get-many` | POST | `{}` / `{"service":"live"}` / `{"includeSportType":"esport"}` | `items[].sport{id,name,slug,tag,sportType,isEsport}` + `activeMatchesCount` |
| `/sports/get` | GET | `?sportId=18` | një sport |
| `/categories/get-many` | POST | `{"sportId":18}` / `{"sportId":18,"service":"live"}` | `items[].category{id,name,slug,sportId,iconUrl}` + `activeMatchesCount` |
| `/categories/get` | GET | `?categoryId=201` | një kategori |
| `/tournaments/get-many` | POST | `{"sportId":18}` / `{"categoryId":139}` | `items[].tournament{id,name,slug,categoryId,sportId}` + `activeMatchesCount`, `liveTournamentOrder`, `prematchTournamentOrder`, `riskLimit` |
| `/tournaments/get` | GET | `?tournamentId=47494` | një turn |

### 4.2 Ndeshjet

| Endpoint | Metoda | Trupi & Params | Shënim |
|---|---|---|---|
| **`/matches/get-many`** | POST | shih §2 | **⭐ lista + ID-të e ndeshjeve** |
| `/matches/get` | GET | `?matchId=40031879` | detajet e një ndeshje (+ `closed`) |
| `/matches/search` | POST | `{"search":"arsenal","limit":5}` | kërkim me emër (⚠️ `query` nuk punon) |
| `/matches/get-status` | POST | `{"matchId":40031879}` | kthen `{"result":{"isHidden":false}}` (kontroll aksesi; **jo** score) |
| `/matches/get-live-id` | GET | `?matchId=...` | ID e transmetimit live |
| `/matches/history` | GET | *pa parametra të dokumentuar* → `400` | rezultatet e ndeshjeve të mbyllura |
| `/broadcast/get-url` | POST | `{"matchId":...}` | URL e videos (`400` pa të drejta) |
| `/subgames/get-many` | POST | `{"sportId":18}` | grupet e tregjeve: Main, Total, Handicap, Halves, Corners, Correct Score… |
| `/odds-groups/get-descriptions` | GET | `?sportId=18` | përshkrimet e tregjeve (6439, 90461, …) |

### 4.3 Të mbrojtura me token (`403 Forbidden` pa sesion lojtari)

`/bets/get-base-settings`, `/bets/get-settings`, `/bets/make-bet-v2`, `/bets/history/get`, `/bets/history/get-many`,
`/bets/get-max-bet-amount`, `/bets/check-activity`, `/bets/refund`, `/b/get`, `/b/get-many`, `/b/accept-rules`,
`/b/get-participation`, `/bonuses/get-many`, `/freebets/get-many`, `/feature-flags/get-many`, `/highlights/get-many`,
`/shared-bets/create`, `/shared-bets/get`, `/fortune-wheel/get-settings`, `/auth/login`.

→ Këto kërkojnë header-in `token: <JWT>` nga flukse-i i hyrjes (`/cdaredirect` + `auth_secret`). Pa atë: `403`.
**Për ID-të e ndeshjeve dhe kuotat nuk të duhet asnjë token.**

---

## 5. ⭐ KUOTAT & REZULTATI LIVE (WebSocket) — i verifikuar me lidhje reale

Kuotat **nuk vijnë me REST**. Vijnë me Socket.IO v4 në `/push-server-v2/`.

### Lidhja (protokolli EIO=4)

```
URL: wss://api-gateway.gw-lucky-bet.com/push-server-v2/?Language=en-001&externalPartnerId=d3edfa27-7cac-4f77-9e6e-4e2fa2d1ab5f&EIO=4&transport=websocket

1) server →  0{"sid":"...","pingInterval":25000,"pingTimeout":20000,"maxPayload":1000000}
2) client →  40                                  (hapi "namespace"-in)
3) server →  40{"sid":"...","pid":"..."}
4) client →  42["subscribe",{"messageType":"subscribe-match-odds","data":{"matchIds":[40070790],"isBaseOddsGroups":true}}]
5) server →  42["u",{"messageType":"match-odds-snapshot","data":{...}},"<ack-id>"]
```

### Kanalet (messageType)

| subscribe | unsubscribe | Event-et që kthehen | Data e dërguar |
|---|---|---|---|
| `subscribe-match-odds` | `unsubscribe-match-odds` | `match-odds-snapshot`, `match-odds` | `{"matchIds":[...],"isBaseOddsGroups":true}` |
| `subscribe-match-info` | `unsubscribe-match-info` | `match-info-snapshot`, `match-info` | `{"matchIds":[...]}` |
| `subscribe-key-value` | `unsubscribe-key-value` | `key-value-snapshot`, `key-value-update` | `{"keys":[...]}` |

*(Serveri dërgon `2` si ping çdo ~25s — klienti përgjigjet `3`.)*

### Shembull REAL `match-info-snapshot` (score live!)

```json
{
  "messageType": "match-info-snapshot",
  "data": {
    "matchId": 40070790,
    "ts": 1789462187033,
    "status": "H2",                       // H1 | H2 | "About to start" | "Finished" | "Penalty shoot-out"
    "matchTime": 4310000,                 // milisekonda lojë
    "matchScore": { "t1": "2", "t2": "0" },
    "periodsScore": [ { "t1": "2", "t2": "0" }, { "t1": "0", "t2": "0" } ],
    "enabledOddsCount": 17,
    "hasOpenOdds": true,
    "sportId": 18, "categoryId": 2038, "tournamentId": 46468,
    "providerId": 12,
    "broadcast": { "id": "40070790", "url": "https://video-translations.top-parser.com/sm/iframe?ref=..." }
  }
}
```
Përditësimet pasuese vijnë si `match-info` me të njëjtën strukturë (vetëm fushat e ndryshuara).

### Shembull REAL `match-odds-snapshot` (kuotat!)

```json
{
  "messageType": "match-odds-snapshot",
  "data": {
    "matchId": 40070888,
    "ts": 1789462073021,
    "isBaseOddsGroups": true,
    "oddsGroups": [
      {
        "id": "6257", "name": "Full time result ", "isBase": true, "baseOrder": 0,
        "order": 12000, "renderType": "cols-3", "outcomes": ["1","x","2"], "subgameIds": [2],
        "oddsList": [
          { "id": "12:L:18504369:[2,[],[0],1,0,[]]", "name": "Netherlands (V)", "outcome": "1", "cf": 2.5,  "status": 1, "ts": 1789462073021 },
          { "id": "12:L:18504369:[2,[],[0],1,1,[]]", "name": "Draw",            "outcome": "x", "cf": 3.82, "status": 1, "ts": 1789462073021 },
          { "id": "12:L:18504369:[2,[],[0],1,3,[]]", "name": "Portugal (V)",    "outcome": "2", "cf": 2.18, "status": 1, "ts": 1789462073021 }
        ]
      },
      {
        "id": "6379", "name": "Total", "isBase": true, "baseOrder": 3, "renderType": "total-2",
        "outcomes": ["under","over"], "subgameIds": [2,3],
        "oddsList": [
          { "id": "12:L:18504339:[5,[2.5],[0],1,4,[]]", "name": "Over 2.5",  "outcome": "over",  "cf": 2.03, "vars": { "v1": "2.5" }, "status": 1 },
          { "id": "12:L:18504339:[5,[2.5],[0],1,5,[]]", "name": "Under 2.5", "outcome": "under", "cf": 1.70, "vars": { "v1": "2.5" }, "status": 1 }
        ]
      }
    ]
  }
}
```

- **Kuota = `cf`** (decimal odds). `status`: `1` = aktiv/hapur, `2` = mbyllur/pezulluar (në eventin `match-odds` statusi `2` = closed).
- Formati i `id` së kuotës: `providerId:type:fixtureId:[subgame,[param],[0],?,outcomeIndex,[]]` → p.sh. `12:L:18504339:[5,[2.5],[0],1,4,[]]`.
- `match-odds-snapshot` = fotografia e plotë (përmban `name` + `cf`); `match-odds` = **vetëm ndryshimet** (pa `name`) → aplikoji me `id`.

---

## 6. Kufizimet e rëndësishme

1. **Pa paginim** në `get-many` → `offset`/`skip`/`page`/`cursor` injorohen. Përdor `limit` të madh (testuar deri 5000) ose kërko sipas `tournamentId` / `categoryId` / `service`.
2. `meta.geoZone = "RU"` — zona gjeografike caktohet nga serveri; mund të ndryshojë me header-in `x-user-location`.
3. **Pa dokumentacion zyrtar publik** — kjo analizë është nxjerrë nga klienti (devtools + `betting-Do2Hl4M0.js`) dhe provuar me kërkesa reale.
4. Endpoint-et e basteve (`/bets/*`, `/b/*`) kërkojnë JWT lojtari; nuk duhen për ID-të/kuotat.
5. Klienti i faqes rifreskon çdo ~5–10s + websocket; mos e abuzo me kërkesa të tepërta.
6. ID-të e ndeshjeve janë të pandryshueshme (të njëjtat në URL-në e faqes) → mund t'i ruash si çelës të jashtëm në DB.
7. Gabimet e validimit kthehen në këtë format (jo kod HTTP-4xx me tekst bosh):
   ```json
   { "errors": [ { "code": "validation_error",
                   "message": "matchId must be a number conforming to the specified constraints. Given: NaN",
                   "meta": { "url": "/matches/get?matchId=..." } } ] }
   ```
   (p.sh. `GET /matches/get` pa `matchId` → `400`; `/matches/get-status` me `matchIds` në shumës → `400`.)
8. Në URL gjithmonë shto `l=`/`p=` si `?...&` — mos i dyfisho `?`-at kur path-i ka query vetë.

---

## 7. Si ta lidhësh me Netfly (rekomandim arkitekturor)

1. Krijo `backend/src/feeds/LuckyBetFeed.ts` që implementon **`IFeedProvider`** (i njëjti kontratë si `ExternalFeedAdapter.ts`):
   - `start()` → polling `POST /matches/get-many` (`sportId:18`, `service:"live"` + `"prematch"`, `limit:500`) çdo ~10s → **upsert** në Prisma (`Sport` → `Category` → `Tournament` → `Match`) duke përdorur `items[].id` si ID e jashtme.
   - Lidh WebSocket-in e `/push-server-v2/` dhe bëj `subscribe-match-info` + `subscribe-match-odds` për ID-të LIVE.
   - `match-odds-snapshot` → krijo/përditëso `Market` + `Outcome` (kuota = `cf`) dhe thirr `broadcastOddsDelta` (i njëjti mekanizëm si në `ExternalFeedAdapter`).
   - `match-info-snapshot` → përditëso score/statusin (`H1`/`H2` → `LIVE`, `Finished` → `ENDED`, `About to start` → `PREMATCH`).
2. Shto në `.env`: `LUCKYBET_API_HOST`, `LUCKYBET_PARTNER_ID`, `LUCKYBET_LANGUAGE` (shih `.env.example`).
3. Ndezja në `src/index.ts` si te feed-i tjetër: `if (process.env.LUCKYBET_PARTNER_ID) { luckyBetFeed.start(); }`.
4. Testim i shpejtë (skedari i shtuar në repo):
   ```bash
   cd backend
   npx tsx luckybet-probe.ts          # ose: set LUCKYBET_PARTNER_ID=... && npx tsx luckybet-probe.ts
   ```

### Lidhje me strukturën e Netfly

| LuckyBet | Netfly (Prisma) |
|---|---|
| `items[].sport.{id,slug,name}` | `Sport` (`slug`, `name`, `iconName`) |
| `items[].category.{id,slug}` | `Category` |
| `items[].tournament.{id,slug}` | `Tournament` |
| `items[].id` (p.sh. 40031879) | `Match.id` / fushë e jashtme |
| `homeTeam` / `awayTeam` | `Match.homeTeam` / `awayTeam` |
| `startAt` (sekonda) | `Match.startTime` |
| `service` PREMATCH/LIVE | `Match.status` |
| `match-info-snapshot.matchScore` | `Match.homeScore` / `awayScore` |
| `oddsGroups[].name` + `oddsList[].cf` | `Market` + `Outcome.odds` |

> ⚠️ **Shënim ligjor/operacional:** partner-ID-ja dhe `auth_secret` janë kredenciale të platformës së tjetrit. Për prodhim kërko një marrëveshje / feed të licencuar (ose përdor ofruesin me kontratë që përdor tashmë projekti, bzzoiro). Përdorimi pa autorizim mund të shkelë ToS-in dhe të bllokohet.
