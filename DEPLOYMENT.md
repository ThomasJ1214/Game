# Pixel Duel — Deployment Guide

## Architecture

GitHub Pages only serves **static files** — it can't run Node.js.  
So the app is split into two parts:

| Part | What it is | Where it runs |
|---|---|---|
| **Frontend** | `docs/` folder (HTML, CSS, JS) | GitHub Pages (free, always on) |
| **Backend** | `server.js` (Socket.io game server) | Railway / Render / Fly.io |

---

## Step 1 — Deploy the Backend

Pick one of the options below. You'll get a URL like  
`https://pixel-duel-production.up.railway.app` — you need it for Step 2.

### Option A: Railway (recommended)

```bash
npm install -g @railway/cli
railway login
railway init      # run from inside the Game/ folder
railway up
```

Railway auto-detects Node.js, injects `PORT`, and supports WebSockets out of the box.  
Free Hobby plan = 500 hours/month.

### Option B: Render

1. Push this repo to GitHub.
2. **render.com → New → Web Service** → connect repo.
3. Set:
   - Build command: `npm install`
   - Start command: `node server.js`
4. Deploy.

> Render free tier sleeps after 15 min of inactivity (~30 s cold start on first visit).

### Option C: Fly.io

```bash
# Install flyctl, then:
fly auth login
fly launch     # say NO to Postgres
fly deploy
```

---

## Step 2 — Point the Frontend at Your Backend

Open `docs/config.js` and paste your backend URL:

```js
// docs/config.js
window.BACKEND_URL = 'https://pixel-duel-production.up.railway.app';
//                    ↑ replace with your actual backend URL
```

Commit and push:

```bash
git add docs/config.js
git commit -m "Set backend URL"
git push
```

---

## Step 3 — Enable GitHub Pages

1. Go to your repo on GitHub → **Settings → Pages**.
2. Under **Branch**, select `main` (or whichever branch) and folder **`/docs`**.
3. Click **Save**.

GitHub will give you a URL like:

```
https://yourusername.github.io/Game/
```

That's it — share this URL with your friend!

---

## Playing Online

1. You open `https://yourusername.github.io/Game/` → **Create Game** → share the 4-letter code.
2. Friend opens the **same URL** → **Join Game** → types the code.
3. You click **Start Game** once both names appear in the lobby.

---

## Local Development

No GitHub Pages or backend deploy needed — just run locally:

```bash
npm install
npm start
# → http://localhost:3000
```

Leave `BACKEND_URL = ''` in `config.js` when developing locally.  
The frontend and backend are on the same origin, so Socket.io connects automatically.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Connection lost" immediately | Check `BACKEND_URL` in `config.js` is correct and backend is running |
| CORS error in browser console | Make sure you copied the full URL including `https://` |
| Backend URL has a trailing slash | Remove it: `'https://…app'` not `'https://…app/'` |
| Render cold start — game hangs | Wait 30 s on first visit, then reload |
| GitHub Pages shows old version | Hard-refresh (`Ctrl+Shift+R`) or wait a minute for CDN to update |
