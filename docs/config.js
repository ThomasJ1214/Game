// ─────────────────────────────────────────────────────────────
// BACKEND URL CONFIGURATION
//
// For local development, it falls back to same-origin.
// For production, the URL is determined based on the environment.
// ─────────────────────────────────────────────────────────────

(function() {
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

  if (isLocal) {
    window.BACKEND_URL = ''; // Falls back to same-origin
  } else {
    // REPLACE THIS with your actual Fly.io backend URL after deployment
    // Example: 'https://pixel-duel.fly.dev'
    window.BACKEND_URL = 'https://pixel-duel.fly.dev';
  }
})();
