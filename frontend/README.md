# Netfly Sport - Frontend

React + TypeScript + Vite + Tailwind CSS sportsbook frontend client.

---

## 🚀 Opsionet për Hostim në GitHub

### Opsioni A: Hostim me GitHub Pages
1. Krijo një repository të ri në GitHub (psh. `netfly-frontend`).
2. Në terminal brenda kësaj dosjeje:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for frontend"
   git branch -M main
   git remote add origin https://github.com/USERNAME/netfly-frontend.git
   git push -u origin main
   ```
3. Për ta publikuar në GitHub Pages:
   - Mund të përdorni GitHub Actions (shkoni te **Settings > Pages > Build and deployment > Source: GitHub Actions > zgjidhni Static HTML ose Node.js Vite**).
   - Ose instaloni `gh-pages`:
     ```bash
     npm install -D gh-pages
     ```
     Dhe shtoni te `package.json`:
     ```json
     "predeploy": "npm run build",
     "deploy": "gh-pages -d dist"
     ```
     Pastaj ekzekutoni: `npm run deploy`.

### Opsioni B: Lidhja e GitHub me Vercel / Netlify (Më e Rekomanduara & Falas)
1. Bëni push këtë folder në GitHub.
2. Shkoni te [Vercel](https://vercel.com) ose [Netlify](https://netlify.com) dhe lidhni llogarinë me GitHub.
3. Importoni repository-n `netfly-frontend`.
4. Te **Environment Variables**, shtoni:
   - `VITE_API_URL`: `https://emri-juaj-backend.onrender.com`
   - `VITE_WS_URL`: `wss://emri-juaj-backend.onrender.com`
5. Klikoni **Deploy**!

---

## ⚙️ Zhvillimi Lokal (Development)

```bash
# Instalo varësitë
npm install

# Nis serverin lokal
npm run dev
```
Hapni shfletuesin në: `http://localhost:5173/`
