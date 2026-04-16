# Pixel Duel — Online Deployment Guide

## How It Works

The game runs as a single Node.js process.  
Express serves the frontend files; Socket.io handles real-time communication.  
No database — all state lives in memory (rooms reset if the server restarts).

---

## 1. Local Development

```bash
# Clone / enter the project folder
cd Game

# Install dependencies
npm install

# Start the server
npm start
# → http://localhost:3000
```

Open **two browser tabs** on `http://localhost:3000` to test both players.

---

## 2. Deploy to Railway (Recommended — easiest free tier)

Railway auto-detects Node.js and injects `PORT`.

### Steps

```bash
# 1. Install the Railway CLI
npm install -g @railway/cli

# 2. Log in
railway login

# 3. Inside the Game/ folder, initialise a new project
railway init

# 4. Deploy
railway up
```

Railway will give you a public URL like `https://pixel-duel-production.up.railway.app`.

### Notes
- No `Procfile` or extra config needed — `npm start` is detected automatically.
- The free "Hobby" plan includes 500 execution hours/month (plenty for casual play).
- WebSocket connections work out of the box.

---

## 3. Deploy to Render (Free tier with caveats)

### Steps

1. Push your code to a GitHub repository.
2. Go to [render.com](https://render.com) → **New → Web Service**.
3. Connect your GitHub repo.
4. Set:
   | Field | Value |
   |---|---|
   | **Build Command** | `npm install` |
   | **Start Command** | `node server.js` |
   | **Environment** | `Node` |
5. Click **Create Web Service**.

Render injects `PORT` automatically.

### Caveats
- Free-tier services **spin down after 15 minutes of inactivity**.  
  The first player to visit after a spin-down will wait ~30 seconds for a cold start.
- WebSocket connections are supported.

---

## 4. Deploy to Fly.io (Most control, generous free tier)

### Steps

```bash
# 1. Install Fly CLI
# macOS / Linux:
curl -L https://fly.io/install.sh | sh

# Windows: https://fly.io/docs/hands-on/install-flyctl/

# 2. Authenticate
fly auth login

# 3. Inside the Game/ folder, launch (auto-detects Node.js)
fly launch
# Accept defaults; it creates fly.toml automatically
# When asked for a Postgres database, say NO

# 4. Deploy
fly deploy
```

### Notes
- `fly launch` generates a `fly.toml`; you don't need to edit it for this project.
- The app listens on `0.0.0.0` (already configured in `server.js`).
- Free tier: 3 shared-CPU VMs, always on.

---

## 5. Environment Variables

Only one variable is needed and **all platforms inject it automatically**:

| Variable | Description | Default |
|---|---|---|
| `PORT` | Port the server listens on | `3000` |

You never need to set this manually.

---

## 6. Sharing the Game With Your Friend

Once deployed, your friend just needs the URL:

```
https://your-app-name.up.railway.app
```

1. You open the URL → **Create Game** → share the 4-letter code.
2. Friend opens the **same URL** → **Join Game** → types your code.
3. You click **Start Game** when both are in the lobby.

No account, no download, no plugins — just a browser.

---

## 7. WebSocket & Proxy Notes

All three platforms (Railway, Render, Fly.io) support WebSocket upgrades natively —
no extra configuration required.

If you run behind a custom Nginx reverse proxy, add:

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

---

## 8. Keeping Rooms Alive

Rooms are stored in memory. If the server process restarts (e.g. a new deploy), 
all active rooms are lost and players will need to create a new room.

For persistent rooms across restarts you would need a Redis adapter for Socket.io —
this is outside the scope of this guide but straightforward to add later.
