# Spawn Pad

Solana token launchpad UI. Static site (no build step), ready for Vercel.

## Deploy to Vercel
**Drag and drop:** vercel.com/new -> import this folder (or push it to GitHub and import the repo). Framework preset: **Other**. Build command: none. Output directory: leave empty.

**CLI:**
```
npm i -g vercel
vercel        # preview
vercel --prod # production
```

## Run locally
```
npm run dev      # http://localhost:3000
```

## Data and local use

Spawn Pad uses the public Solana mainnet RPC configured in `config.js` for wallet and on-chain reads. It does not use Supabase or a database. Browser preferences are stored locally. The token-create flow uses the official Pump SDK and Pump's metadata upload API.

The default RPC is shared and rate-limited. You can replace `RPC_URL` in `config.js` with another public HTTPS Solana RPC endpoint. Any endpoint configured here is visible to site visitors.

## Launch tokens

The create-only flow sends the image and metadata through the app's same-origin server handler to Pump's current metadata upload endpoint, then builds Pump's V2 create instruction. No Pinata account or upload secret is required. Images are limited to 4 MB; uploaded image and metadata are public. The mint keypair is generated in memory, signs only the mint account, and is never persisted or sent to a server. The connected wallet signs as payer and creator. Success is shown only after Solana confirms the transaction.

The upload endpoint is part of Pump's live frontend API rather than a separately versioned public contract. It has only been checked with a local mocked response here; verify a real metadata upload before relying on it for a launch.

The metadata handler runs locally through `server.js` and on Vercel through `/api/metadata`. The launch form currently supports creation only: set Initial buy to `0`; after confirmation, the token link opens Pump.fun.

The site has no frontend framework or build pipeline. Run `npm run build:launch` after changing `launch-sdk.js` to refresh its checked-in browser bundle. `npm run dev` serves the site and local metadata endpoint from the small Node server; this command is not run as part of implementation.

## What works today
- Wallet connect (Phantom, Solflare), search, routing, launch form, token page, trading panel, mobile layouts.
- **Live feed:** new launches and migrations stream into the Live strip, and open token pages receive trades in real time (needs `LIVE_WS_URL`).
- Token images load from metadata with IPFS gateway fallback.
- Wallet balances and holder lists are fetched from Solana RPC.

## What is not wired yet (shows honest "not connected" states, never fake results)
| Feature | Where to wire it |
|---|---|
| Buy / sell, launch-cost quote | `api.trade` and `api.quoteLaunch` in `app.js` |
| Token lists, King of the Hill, name/ticker search, historical trades, chart history | `api.listTokens`, `api.getKing`, `api.search`, `api.getTrades`, `api.getChart` (requires a separate indexer; it is not Supabase) |
| Single token state | `api.getToken` (read bonding curve / PumpSwap pool from chain) |

Every method and its return shape is documented in the **DATA LAYER** block of `app.js`.

## Sample data
Lists are empty until the indexer is connected. To see the full layout, open the site with `?seed=1` (for example `https://your-site.vercel.app/?seed=1`). Sample data is isolated in the `seedBlock` function in `app.js`. `SEED` in `config.js` must stay `false` in production.

## Security
- No private keys, ever: wallets sign every transaction.
- `config.js` is public. Put only public values there.
- Token metadata uploads are proxied server-side to Pump's `frontend-api-v3.pump.fun` endpoint; the browser does not call that cross-origin API directly.
- The CSP in `vercel.json` allows `https:` images and `https:`/`wss:` connections. Tighten `connect-src` to your RPC, indexer and stream hosts once they are final.

## Files
`index.html` markup - `styles.css` design system (colours are the variables at the top) - `app.js` UI + data layer - `config.js` runtime config - `vercel.json` headers.
