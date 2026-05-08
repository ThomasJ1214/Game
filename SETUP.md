# Pixel Duel — Better Platform Migration Guide

This guide explains how to migrate Pixel Duel to **Vercel** (Frontend) and **Fly.io** (Backend) for superior performance and global low-latency.

## Why these platforms?

- **Vercel (Frontend):** Offers a global Edge Network (CDN) that is significantly faster than GitHub Pages for serving static assets. It also provides automatic deployments, instant rollbacks, and a better developer experience.
- **Fly.io (Backend):** Runs your Node.js game server in Firecracker micro-VMs close to your users. Its global edge deployment is ideal for real-time applications like Socket.io games, reducing latency and "lag" for players worldwide.

---

## Step 1 — Deploy the Backend to Fly.io

1. **Install Fly CTL:**
   Follow the instructions at [fly.io/docs/hands-on/install-flyctl/](https://fly.io/docs/hands-on/install-flyctl/).

2. **Login to Fly.io:**
   ```bash
   fly auth login
   ```

3. **Initialize the App:**
   ```bash
   fly launch
   ```
   - Choose a unique name for your app.
   - Select your preferred region (closest to you).
   - When asked to tweak settings, say yes and ensure the internal port is set to `3000`.
   - **Do NOT** provision a Postgres or Redis database unless you plan to add persistence later.

4. **Deploy:**
   ```bash
   fly deploy
   ```
   Once finished, you'll get a URL like `https://your-app-name.fly.dev`.

---

## Step 2 — Configure the Frontend

1. Open `docs/config.js`.
2. Update the `window.BACKEND_URL` for production:
   ```js
   // docs/config.js
   // ...
   } else {
     window.BACKEND_URL = 'https://your-app-name.fly.dev'; // Use your actual Fly.io URL
   }
   // ...
   ```

---

## Step 3 — Deploy the Frontend to Vercel

1. **Push your code to a GitHub repository.**
2. **Go to [vercel.com](https://vercel.com) and sign in.**
3. **Click "New Project" and import your repository.**
4. **Configure the project:**
   - Framework Preset: `Other`
   - Build Command: `Leave empty`
   - Output Directory: `Leave empty` (the `vercel.json` handles the routing to `docs/`)
5. **Click Deploy.**

Vercel will automatically detect `vercel.json` and serve the contents of your `docs/` folder at your new project URL.

---

## Local Development

To run the entire stack locally:

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server:
   ```bash
   npm start
   ```
3. Open `http://localhost:3000` in your browser.

The `docs/config.js` will automatically detect `localhost` and connect to the local backend.

---

## Performance Optimizations Applied

- **Compression:** Added Gzip compression to the backend to reduce the size of assets and JSON payloads.
- **Socket.io Tuning:** Optimized `pingInterval` and `pingTimeout` for faster detection of disconnected clients and better responsiveness.
- **Websocket Priority:** Explicitly enabled Websocket transport for the fastest possible real-time communication.
