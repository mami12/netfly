# Netfly

Platformë bastesh sportive me ndeshje reale & të simuluara, kuota dinamike, menaxhim menaxherësh & lojtarësh, auditim skedinash.

## Struktura

| Dosja | Përshkrimi |
|---|---|
| `backend/` | API (Express + Prisma/PostgreSQL + WebSocket) — **kjo hostohet në Render.com** |
| `frontend/` | Klienti React + Vite + Tailwind (GitHub Pages) |
| `render.yaml` | Blueprint i Render-it (në rrënjë — kështu e lexon Render-i) |
| `docs/` | Manuali i feed-it dhe udhëzuesit e deploy-it |

## Deploy

- **Backend → Render.com:** shih [`docs/DEPLOY-RENDER.md`](docs/DEPLOY-RENDER.md) (Blueprint me 1 klikim).
- **Frontend → GitHub Pages:** `powershell -ExecutionPolicy Bypass -File frontend\deploy-gh-pages.ps1`

## Zhvillim lokal

```bash
npm run setup     # backend (npm install + prisma + seed) dhe frontend
npm run dev       # backend:3001 + frontend:5173
```

