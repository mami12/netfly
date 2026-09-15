# 🏆 NETFLY SPORT - Platformë Basteve Sportive

Platformë e plotë bastesh sportive me ndeshje reale & të simuluara, kuota dinamike, menaxhim menaxherësh & lojtarësh, auditim skedinash dhe përshtatje të plotë për celularë.

---

## 📁 Struktura e Dosjeve (Folders)

Projekti është i ndarë qartë në dy dosje të pavarura:

```
netfly/
│
├── backend/                  # 🖥️ API Server (Render.com)
│   ├── prisma/               # Skema e databazës & Seeds
│   ├── src/                  # Express, WebSockets, Shërbimet, Rrugët (Routes)
│   ├── render.yaml           # Konfigurimi automatik për Render.com
│   ├── .env.example          # Shembull i variablave të mjedisit
│   └── package.json          # Skriptet e ekzekutimit & build
│
├── frontend/                 # 🌐 Klienti Web (GitHub / Vercel / Netlify)
│   ├── src/                  # React, Tailwind CSS, TypeScript
│   ├── public/               # Skedarët statikë, _redirects, 404.html
│   ├── .env.example          # Konfigurimi i URL-së së backend-it
│   └── package.json          # Skriptet e Vite & build
│
├── start.bat                 # Nisje me 1 klik në Windows lokalisht
├── package.json              # Skripte rrënjë për dev/build
└── README.md
```

---

## 🚀 Udhëzuesi i Hostimit (Deployment Guide)

### 1️⃣ Hostimi i Backend-it në [Render.com](https://render.com)

1. **Ngarkoni folderin `backend` në GitHub:**
   - Mund të krijoni një repo të veçantë për backend-in:
     ```bash
     cd backend
     git init
     git add .
     git commit -m "Netfly backend initial commit"
     git branch -M main
     git remote add origin https://github.com/USERNAME/netfly-backend.git
     git push -u origin main
     ```
2. **Krijoni Web Service në Render:**
   - Shkoni te [dashboard.render.com](https://dashboard.render.com) dhe klikoni **New + > Web Service**.
   - Zgjidhni repository-n e GitHub `netfly-backend`.
   - Vendosni të dhënat:
     - **Name:** `netfly-backend` (ose sipas dëshirës)
     - **Runtime:** `Node`
     - **Build Command:** `npm install && npm run build && npm run db:seed`
     - **Start Command:** `npm start`
     - **Plan:** Free
3. **Environment Variables në Render:**
   Shtoni këto variabla te tab-i **Environment**:
   - `NODE_ENV`: `production`
   - `DATABASE_URL`: `file:./dev.db`
   - `JWT_SECRET`: `çelës_sekret_i_sigurt_2026`
   - `CORS_ORIGINS`: `*`
4. Klikoni **Deploy Web Service**.
   - Pasi të përfundojë, Render do t'ju japë një URL publike, psh:
     `https://netfly-backend.onrender.com`

---

### 2️⃣ Hostimi i Frontend-it në GitHub

Mund ta ngarkoni kodin në GitHub dhe të zgjidhni një nga dy mënyrat e hostimit:

#### Mënyra A: GitHub Pages
1. Krijoni repo në GitHub (psh. `netfly-frontend`).
2. Nga terminali:
   ```bash
   cd frontend
   git init
   git add .
   git commit -m "Netfly frontend initial commit"
   git branch -M main
   git remote add origin https://github.com/USERNAME/netfly-frontend.git
   git push -u origin main
   ```
3. Përpara se ta ndërtoni për prodhim, vendosni URL-në e backend-it në skedarin `.env`:
   ```env
   VITE_API_URL=https://netfly-backend.onrender.com
   VITE_WS_URL=wss://netfly-backend.onrender.com
   ```
4. Ndërtoni projektin:
   ```bash
   npm run build
   ```
5. Mund të përdorni `gh-pages` ose GitHub Actions për ta publikuar dosjen `dist/` direkt në GitHub Pages.

#### Mënyra B: Lidhja e GitHub me Vercel / Netlify (Shumë e thjeshtë & Falas)
1. Pasi ta keni bërë push repository-n në GitHub:
2. Shkoni në [Vercel.com](https://vercel.com) ose [Netlify.com](https://netlify.com).
3. Klikoni **Add New Project** dhe zgjidhni repository-n tuaj të GitHub.
4. Te **Environment Variables**, shtoni:
   - `VITE_API_URL` = `https://netfly-backend.onrender.com`
   - `VITE_WS_URL` = `wss://netfly-backend.onrender.com`
5. Klikoni **Deploy**! Faqja do të jetë live menjëherë me SSL të sigurt (HTTPS).

---

## 💻 Testimi & Ekzekutimi Lokal (Local Development)

Në kompjuterin tuaj mund ta nisni menjëherë:
- Duke klikuar dy herë skedarin **`start.bat`**
- Ose me komandat:
  ```bash
  # Në terminalin 1:
  cd backend
  npm run dev

  # Në terminalin 2:
  cd frontend
  npm run dev
  ```

Hapni `http://localhost:5173/` në shfletues.

---

## 🔑 Llogaritë e Parazgjedhura (Default Accounts)

- **Admin:** `admin` / `admin123` (Kontroll i plotë i kuotave, ndeshjeve dhe bilanceve)
- **Manager:** `manager` / `manager123` (Krijim lojtarësh, komisione %, financa, auditim)
