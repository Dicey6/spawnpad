/* Spawn Pad runtime config. Loaded before app.js. Do NOT put secrets here: everything in this file is public. */
window.SPAWN_CONFIG = {
  /* Sample market data for layout review only. Keep false in production.
     Preview it without changing this file by opening the site with ?seed=1 */
  SEED: false,

  /* Live launches / migrations / per-token trades (WebSocket).
     Default is PumpPortal's free third-party stream. Swap in your own Helius or indexer stream for production.
     Set to '' to turn the live feed off. */
  LIVE_WS_URL: 'wss://pumpportal.fun/api/data',

  /* Public, keyless Solana mainnet RPC. This is called directly by the browser. */
  RPC_URL: 'https://api.mainnet-beta.solana.com'
};
