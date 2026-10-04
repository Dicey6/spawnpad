/* =====================================================================
   SPAWN PAD UI
   Layers:  UI  ->  `api` (token data / query layer)  ->  Solana + Pump SDK
   The UI never calculates prices, balances or curve state. Everything comes from `api`.
   Production: set SEED_ON = false and implement each `api` method (shapes documented below).
   ===================================================================== */


/* ---------- config (see config.js) ---------- */
const CFG = window.SPAWN_CONFIG || {};
const SEED_ON = (() => {   /* sample data for layout review only. ?seed=1 turns it on for this tab, ?seed=0 turns it off */
  try { const q = new URLSearchParams(location.search); if (q.get('seed') === '1') sessionStorage.setItem('sp:seed', '1'); if (q.get('seed') === '0') sessionStorage.removeItem('sp:seed'); return !!CFG.SEED || sessionStorage.getItem('sp:seed') === '1'; } catch { return !!CFG.SEED; }
})();

/* ---------- utils ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => { try { const x = new URL(u); return x.protocol === 'https:' ? x.href : ''; } catch { return ''; } };
const MINT_RE = /[1-9A-HJ-NP-Za-km-z]{32,44}/;
const isMint = s => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s);
const short = a => a ? a.slice(0, 4) + '…' + a.slice(-4) : '';
const store = { get(k, d) { try { const v = localStorage.getItem('sp:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('sp:' + k, JSON.stringify(v)); } catch {} } };
const sstore = { get(k, d) { try { const v = sessionStorage.getItem('sp:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { sessionStorage.setItem('sp:' + k, JSON.stringify(v)); } catch {} } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const txUrl = sig => sig ? 'https://solscan.io/tx/' + encodeURIComponent(sig) : '';
const acctUrl = a => 'https://solscan.io/account/' + encodeURIComponent(a);

function fmtPrice(n) {
  if (n == null || !isFinite(n)) return '—';
  if (n === 0) return '0';
  if (n >= 1) return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
  if (n >= 0.0001) return String(+n.toPrecision(4));
  const m = n.toFixed(22).match(/^0\.(0+)(\d{1,6})/);
  if (!m) return n.toExponential(2);
  return `0.0<sub>${m[1].length}</sub>${m[2].replace(/0+$/, '').slice(0, 4) || '0'}`;
}
function fmtCompact(n, d = 2) {
  if (n == null || !isFinite(n)) return '—';
  const a = Math.abs(n);
  for (const [v, s] of [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']]) if (a >= v) return +(n / v).toFixed(d) + s;
  return n.toLocaleString('en-US', { maximumFractionDigits: d });
}
const usd = (n, d = 1) => n == null || !isFinite(n) ? '—' : '$' + fmtCompact(n, d);
const fmtSol = (n, d = 4) => n == null || !isFinite(n) ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: d });
function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return Math.floor(s) + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}
const chg = n => n == null ? '<span class="dim">—</span>' : `<span class="chg ${n >= 0 ? 'up' : 'dn'}">${n >= 0 ? '+' : ''}${n.toFixed(1)}%</span>`;

const IC = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 2.8 19.5h18.4z"/><path d="M12 10v4.5M12 17.4v.1"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 16V8M8.5 11.5 12 8l3.5 3.5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'
};

/* ---------- images (IPFS gateways with fallback) ---------- */
const GATEWAYS = ['https://ipfs.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/', 'https://cloudflare-ipfs.com/ipfs/'];
const ipfsPath = u => { if (!u) return ''; if (u.startsWith('ipfs://')) return u.slice(7).replace(/^ipfs\//, ''); const m = u.match(/^https:\/\/[^/]+\/ipfs\/(.+)$/); return m ? m[1] : ''; };
const imgSrc = u => { const p = ipfsPath(u); return p ? GATEWAYS[0] + p : (safeUrl(u) || (u && /^(data:image\/|blob:)/.test(u) ? u : '')); };
document.addEventListener('error', e => {
  const el = e.target; if (!el || el.tagName !== 'IMG' || !el.dataset.fb) return;
  const p = el.dataset.ipfs, g = +(el.dataset.g || 0) + 1;
  if (p && g < GATEWAYS.length) { el.dataset.g = g; el.src = GATEWAYS[g] + p; } else if (el.parentNode) el.parentNode.textContent = el.dataset.sym || '?';
}, true);
/** Token metadata JSON (image, description, socials) from the on-chain metadata URI */
const metaCache = new Map();
function resolveMeta(uri) {
  if (!uri) return Promise.resolve(null); if (metaCache.has(uri)) return metaCache.get(uri);
  const p = ipfsPath(uri), urls = p ? GATEWAYS.map(g => g + p) : [safeUrl(uri)].filter(Boolean);
  const pr = (async () => { for (const u of urls) { try { const ac = new AbortController(), t = setTimeout(() => ac.abort(), 6000); const r = await fetch(u, { signal: ac.signal }); clearTimeout(t); if (!r.ok) continue; const j = await r.json();
    return { image: typeof j.image === 'string' ? j.image : '', description: typeof j.description === 'string' ? j.description : '', socials: { x: j.twitter || '', telegram: j.telegram || '', website: j.website || '' } }; } catch {} } return null; })();
  metaCache.set(uri, pr); return pr;
}

/* ---------- live event stream ----------
   One shared WebSocket (never one per token). Events are real on-chain activity from a data stream; the UI treats them
   as hints and re-reads authoritative state through `api` after each one.
   Default source: PumpPortal's free data socket (third-party, unofficial). Production: point LIVE_URL at your own
   Helius / indexer stream via NEXT_PUBLIC_LIVE_WS_URL. Set '' to disable. */
const LIVE_URL = CFG.LIVE_WS_URL === undefined ? 'wss://pumpportal.fun/api/data' : CFG.LIVE_WS_URL;
const live = (() => {
  let ws = null, status = LIVE_URL ? 'idle' : 'disabled', tries = 0, opened = false, timer;
  const sl = new Set(), feed = new Set(), toks = new Map();
  const setS = x => { status = x; sl.forEach(f => f(x)); };
  const send = o => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
  const sync = () => { if (feed.size) { send({ method: 'subscribeNewToken' }); send({ method: 'subscribeMigration' }); } if (toks.size) send({ method: 'subscribeTokenTrade', keys: [...toks.keys()] }); };
  function connect() {
    if (!LIVE_URL || ws) return; clearTimeout(timer); setS(opened ? 'reconnecting' : 'connecting');
    try { ws = new WebSocket(LIVE_URL); } catch { ws = null; return setS('offline'); }
    ws.onopen = () => { opened = true; tries = 0; setS('live'); sync(); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } dispatch(m); };
    ws.onclose = () => { ws = null; if (!feed.size && !toks.size) return setS('idle'); if (!opened && ++tries >= 3) return setS('offline'); setS(opened ? 'reconnecting' : 'connecting'); timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(tries, 5))); };
    ws.onerror = () => { try { ws && ws.close(); } catch {} };
  }
  function dispatch(m) {
    if (!m || !m.txType || !m.mint) return;
    if (m.txType === 'create') feed.forEach(f => f({ type: 'new', token: { mint: m.mint, name: m.name, symbol: m.symbol, uri: m.uri, creator: m.traderPublicKey, createdAt: Date.now(), marketCapSol: m.marketCapSol, initialBuySol: m.solAmount } }));
    else if (m.txType === 'migrate') feed.forEach(f => f({ type: 'migrated', mint: m.mint }));
    else if (m.txType === 'buy' || m.txType === 'sell') { const hs = toks.get(m.mint); if (!hs) return; const sol = +m.solAmount, tok = +m.tokenAmount;
      const trade = { sig: m.signature, ts: Date.now(), side: m.txType, wallet: m.traderPublicKey, solAmount: sol, tokenAmount: tok, priceSol: tok > 0 ? sol / tok : null }; hs.forEach(f => f({ type: 'trade', trade })); }
  }
  const idle = () => { if (!feed.size && !toks.size) { clearTimeout(timer); if (ws) { try { ws.close(); } catch {} } else setS('idle'); } };
  return {
    status: () => status,
    onStatus(f) { sl.add(f); return () => sl.delete(f); },
    retry() { tries = 0; opened = false; if (!ws && (feed.size || toks.size)) connect(); },
    subFeed(h) { feed.add(h); connect(); if (ws && ws.readyState === 1) { send({ method: 'subscribeNewToken' }); send({ method: 'subscribeMigration' }); } return () => { feed.delete(h); idle(); }; },
    subToken(mint, h) { if (!toks.has(mint)) toks.set(mint, new Set()); const first = toks.get(mint).size === 0; toks.get(mint).add(h); connect(); if (first && ws && ws.readyState === 1) send({ method: 'subscribeTokenTrade', keys: [mint] });
      return () => { const set = toks.get(mint); if (set) { set.delete(h); if (!set.size) toks.delete(mint); } idle(); }; }
  };
})();

/* =====================================================================
   DATA LAYER  (`api`)
   Token shape (USD values converted by the adapter from SOL price):
   { mint, name, symbol, image(https), description, creator, createdAt(ms),
     socials:{x,telegram,website}, status:'curve'|'migrated',
     priceSol, priceUsd, marketCapUsd, change24hPct, volume24hUsd, holders,
     progressPct (curve only), solRemaining (curve only), txBuys24h, txSells24h,
     spark:[numbers] (list cards), liquidityUsd, migratedAt(ms), poolAddress? (migrated only) }
   ===================================================================== */
const NOT_WIRED = what => Object.assign(new Error(what + ' is not connected yet.'), { notWired: true });
const SOLANA_RPC_URL = typeof CFG.RPC_URL === 'string' && CFG.RPC_URL.startsWith('https://')
  ? CFG.RPC_URL
  : 'https://api.mainnet-beta.solana.com';
let rpcRequestId = 0;

async function rpcCall(method, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(SOLANA_RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcRequestId, method, params }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Solana RPC request failed (HTTP ${response.status}).`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message || 'Solana RPC request failed.');
    return payload.result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Solana RPC request timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const TOKEN_PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'
];

const api = {
  ready: false,   // true only when a token-list indexer is connected
  /** -> { items:Token[], total:number }   tab: 'trending' | 'migrated'. Requires a token indexer. */
  async listTokens({ tab, page, pageSize }) { return { items: [], total: 0 }; },
  /** -> Token[3]  top 3 by the indexer's ranking */
  async getKing() { return []; },
  /** -> Token[]  name / ticker / CA match. Must also resolve any valid CA straight from chain. */
  async search(q, { limit = 8 } = {}) { return []; },
  /** -> Token | null  read from chain (bonding curve account / PumpSwap pool) */
  async getToken(mint) { return null; },
  /** -> [{ sig, ts, side:'buy'|'sell', wallet, solAmount, tokenAmount, priceSol }] newest first */
  async getTrades(mint) { return []; },
  /** -> [{ address, amount, pct, label? }] largest first */
  async getHolders(mint) {
    if (!isMint(mint)) throw new Error('Token mint address is invalid.');
    const filter = { filters: [{ memcmp: { offset: 0, bytes: mint } }], encoding: 'jsonParsed', commitment: 'confirmed' };
    const [supplyResult, ...accountResults] = await Promise.all([
      rpcCall('getTokenSupply', [mint, { commitment: 'confirmed' }]),
      ...TOKEN_PROGRAMS.map(program => rpcCall('getProgramAccounts', [program, filter]))
    ]);
    const totalSupply = Number(supplyResult?.value?.uiAmountString);
    if (!Number.isFinite(totalSupply) || totalSupply <= 0) return [];
    const balances = new Map();
    for (const rows of accountResults) {
      for (const row of rows || []) {
        const info = row?.account?.data?.parsed?.info;
        const amount = Number(info?.tokenAmount?.uiAmountString);
        if (!info?.owner || !Number.isFinite(amount) || amount <= 0) continue;
        balances.set(info.owner, (balances.get(info.owner) || 0) + amount);
      }
    }
    return [...balances].map(([address, amount]) => ({ address, amount, pct: amount / totalSupply * 100 }))
      .sort((a, b) => b.amount - a.amount);
  },
  /** tf: '1H'|'24H'|'7D' -> [{ t:ms, price:SOL }] oldest first */
  async getChart(mint, tf) { return []; },
  /** -> { sol:number|null, token:number|null } */
  async getBalances(address, mint) {
    if (!isMint(address)) throw new Error('Wallet address is invalid.');
    if (mint && !isMint(mint)) throw new Error('Token mint address is invalid.');
    const [solResult, tokenResult] = await Promise.all([
      rpcCall('getBalance', [address, { commitment: 'confirmed' }]),
      mint
        ? rpcCall('getTokenAccountsByOwner', [address, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }])
        : Promise.resolve(null)
    ]);
    const token = tokenResult
      ? tokenResult.value.reduce((sum, account) => {
          const amount = Number(account?.account?.data?.parsed?.info?.tokenAmount?.uiAmountString);
          return sum + (Number.isFinite(amount) ? amount : 0);
        }, 0)
      : null;
    return {
      sol: Number.isFinite(solResult?.value) ? solResult.value / 1e9 : null,
      token
    };
  },
  /** side 'buy': amount in SOL; 'sell': amount in tokens.
   *  -> { out, minOut, priceImpactPct, networkFeeSol, platformFeeSol }  (out in tokens for buy, SOL for sell) */
  async quote({ mint, side, amount, slippageBps }) { throw NOT_WIRED('Quoting'); },
  /** Build tx with the Pump SDK, wallet signs, send, wait for confirmation. Resolve ONLY after confirmation.
   *  onPhase('sign') -> onPhase('submitted', { signature }) -> resolve { signature } */
  async trade({ mint, side, amount, slippageBps, wallet }, onPhase) { throw NOT_WIRED('Trading'); },
  /** -> { networkFeeSol, rentSol, platformFeeSol, initialBuySol, totalSol } */
  async quoteLaunch({ initialBuySol }) { throw NOT_WIRED('Launch cost estimate'); },
  /** params: { name, symbol, description, socials, image:File, initialBuySol }
   *  onPhase('upload') -> onPhase('sign') -> onPhase('submitted', { signature }) ; resolve { mint, signature } after confirmation */
  async createToken(params, wallet, onPhase) {
    if (!window.SpawnLaunch || typeof window.SpawnLaunch.createToken !== 'function') {
      throw new Error('The launch SDK bundle is missing. Run npm run build:launch before starting the site.');
    }
    return window.SpawnLaunch.createToken(params, wallet, onPhase, SOLANA_RPC_URL);
  },
  /** Realtime trades for one token: handler({ type:'trade', trade }) ; returns unsubscribe. The UI also polls. */
  subscribe(mint, handler) { return live.subToken(mint, handler); },
  /** Realtime launches/migrations: handler({ type:'new', token } | { type:'migrated', mint }) ; returns unsubscribe. */
  subscribeFeed(handler) { return live.subFeed(handler); }
};

/* ---------------------------------------------------------------------
   DEV SEED DATA  — isolated block. Layout review only. Set SEED_ON=false (or delete this block) in production.
   Seeded quotes are plain arithmetic. Trading, creation and balances are never faked.
   --------------------------------------------------------------------- */
(function seedBlock() {
  if (!SEED_ON) return;
  let s = 20261002; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const rs = n => Array.from({ length: n }, () => B58[Math.floor(rnd() * 58)]).join('');
  const A = ['Orbit', 'Nova', 'Kiln', 'Vanta', 'Pixel', 'Moss', 'Ember', 'Zephyr', 'Quill', 'Lumen', 'Cinder', 'Halo', 'Rune', 'Atlas', 'Mochi', 'Glitch', 'Tundra', 'Echo', 'Pulse', 'Drift', 'Sable', 'Onyx', 'Fable', 'Gizmo', 'Nimbus', 'Tonic', 'Ripple', 'Basil', 'Comet', 'Dusk'];
  const B = ['Cat', 'Frog', 'Bot', 'Labs', 'Coin', 'Dog', 'Fox', 'Ghost', 'Club', 'Inu', 'Owl', 'Bear', 'Moon', 'Cult', 'Punk'];
  const SOL = 160, now = Date.now(), used = new Set(), list = [];
  const img = (sym, hue) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="hsl(${hue} 30% 12%)"/><text x="32" y="43" font-family="Arial" font-weight="700" font-size="30" text-anchor="middle" fill="hsl(${hue} 80% 66%)">${sym[0]}</text></svg>`);
  for (let i = 0; i < 155; i++) {
    let name = A[(i * 7 + Math.floor(rnd() * 3)) % A.length] + ' ' + B[(i * 5 + Math.floor(rnd() * 4)) % B.length], k = 2;
    while (used.has(name)) name = name.replace(/ \d+$/, '') + ' ' + (k++); used.add(name);
    const sym = (name.split(' ')[0].slice(0, 3) + name.split(' ')[1].slice(0, 2)).toUpperCase().replace(/\d/g, '');
    const mig = i < 45, mcap = mig ? 70000 + Math.pow(rnd(), 2) * 1.9e6 : 4000 + rnd() * 64500;
    const createdAt = now - (mig ? (2 + rnd() * 30) * 864e5 : 3e5 + Math.pow(rnd(), 2) * 2.4 * 864e5);
    const c24 = mig ? (rnd() - .5) * 70 : (rnd() - .38) * 220;
    let v = 1, sp = Array.from({ length: 24 }, (_, j) => (v *= 1 + (rnd() - .5 + c24 / 2400) * .12));
    list.push({
      mint: rs(44), name, symbol: sym, image: img(name, Math.floor(rnd() * 360)), description: '', creator: rs(44), createdAt,
      socials: { x: 'https://x.com/', telegram: 'https://t.me/spawnpad', website: '' },
      status: mig ? 'migrated' : 'curve', priceUsd: mcap / 1e9, priceSol: mcap / 1e9 / SOL, marketCapUsd: mcap, change24hPct: c24,
      volume24hUsd: mcap * (.25 + rnd() * 3), holders: Math.floor(30 + rnd() * (mig ? 4200 : 600)),
      progressPct: mig ? 100 : Math.min(99.4, mcap / 690), solRemaining: mig ? 0 : Math.max(0.3, 85 * (1 - mcap / 69000)),
      txBuys24h: Math.floor(20 + rnd() * 900), txSells24h: Math.floor(10 + rnd() * 600), spark: sp,
      liquidityUsd: mig ? mcap * (.08 + rnd() * .12) : null, migratedAt: mig ? Math.max(createdAt + 36e5, now - rnd() * 20 * 864e5) : null
    });
  }
  const hs = str => { let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return Math.abs(h) % 2147483647 || 1; };
  const rng = seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const find = m => list.find(t => t.mint === m) || null;
  const paged = (arr, page, size) => ({ items: arr.slice((page - 1) * size, page * size), total: arr.length });
  const curve = list.filter(t => t.status === 'curve').sort((a, b) => b.volume24hUsd - a.volume24hUsd);
  const migd = list.filter(t => t.status === 'migrated').sort((a, b) => b.migratedAt - a.migratedAt);
  Object.assign(api, {
    ready: true,
    async listTokens({ tab, page, pageSize }) { await sleep(280); return paged(tab === 'migrated' ? migd : curve, page, pageSize); },
    async getKing() { await sleep(200); return curve.slice(0, 3); },
    async search(q, { limit = 8 } = {}) { await sleep(120); q = q.trim().toLowerCase(); if (!q) return []; return list.filter(t => t.name.toLowerCase().includes(q) || t.symbol.toLowerCase().includes(q) || t.mint.toLowerCase() === q).slice(0, limit); },
    async getToken(mint) { await sleep(250); return find(mint); },
    async getTrades(mint) { const t = find(mint); if (!t) return []; const r = rng(hs(mint)), out = []; let p = t.priceSol * .8;
      for (let i = 0; i < 30; i++) { const side = r() > .45 ? 'buy' : 'sell'; p *= side === 'buy' ? 1 + r() * .03 : 1 - r() * .02; const sol = +(.05 + r() * 1.6).toFixed(3); out.push({ sig: 'seed' + i, ts: now - (30 - i) * 4.2 * 6e4, side, wallet: rs(44), solAmount: sol, tokenAmount: sol / p, priceSol: p }); }
      return out.reverse(); },
    async getHolders(mint) { const t = find(mint); if (!t) return []; const r = rng(hs(mint) + 1); let left = 100 - (t.status === 'curve' ? 100 - t.progressPct * .8 : 0); const o = [];
      if (t.status === 'curve') o.push({ address: rs(44), amount: 0, pct: 100 - t.progressPct * .8, label: 'Bonding curve' });
      for (let i = 0; i < 12; i++) { const p = +(r() * 6 + .3).toFixed(2); o.push({ address: rs(44), amount: p * 1e7, pct: p, label: i === 2 ? 'Creator' : undefined }); }
      return o.sort((a, b) => b.pct - a.pct); },
    async getChart(mint, tf) { await sleep(150); const t = find(mint); if (!t) return []; const n = tf === '1H' ? 60 : tf === '24H' ? 96 : 140, span = tf === '1H' ? 36e5 : tf === '24H' ? 864e5 : 6048e5, r = rng(hs(mint) + tf.length);
      const end = t.priceSol; let p = end / (1 + (t.change24hPct / 100) * (tf === '1H' ? .1 : 1)); const out = [];
      for (let i = 0; i < n; i++) { p *= 1 + (r() - .5) * .05 + ((end - p) / end) * .04; out.push({ t: now - span + (i / (n - 1)) * span, price: Math.max(p, end * .05) }); }
      out[n - 1].price = end; return out; },
    async quote({ mint, side, amount, slippageBps }) { await sleep(180); const t = find(mint); if (!t) throw new Error('Token not found.');
      const impact = Math.min(40, side === 'buy' ? amount * (t.status === 'curve' ? 1.3 : .4) : amount * t.priceSol * 1.1);
      const out = side === 'buy' ? (amount / t.priceSol) * (1 - impact / 100) : amount * t.priceSol * (1 - impact / 100);
      return { out, minOut: out * (1 - slippageBps / 1e4), priceImpactPct: impact, networkFeeSol: .000005, platformFeeSol: null }; }
    /* trade / createToken / quoteLaunch / getBalances intentionally stay unwired: no fake transactions, balances or costs */
  });
})();

/* ---------- app state ---------- */
const state = { wallet: null, balances: { sol: null, token: null }, mint: null, slip: store.get('slip', 100) };
let navId = 0, cleanups = [], walletListeners = [];
const WALLETS = [
  { id: 'phantom', name: 'Phantom', get: () => (window.phantom && window.phantom.solana && window.phantom.solana.isPhantom) ? window.phantom.solana : null, url: 'https://phantom.app/download' },
  { id: 'solflare', name: 'Solflare', get: () => (window.solflare && window.solflare.isSolflare) ? window.solflare : null, url: 'https://solflare.com/download' }
];

/* ---------- toasts / modal ---------- */
let toastN = 0;
function toast({ type = 'success', title, body = '', link = '', ttl }) {
  const id = 't' + (++toastN), el = document.createElement('div'); el.id = id; $('#toasts').appendChild(el);
  paintToast(el, { type, title, body, link }); el._d = { type, title, body, link };
  const t = ttl ?? (type === 'pending' ? 0 : type === 'error' ? 9000 : 5500); if (t) setTimeout(() => el.remove(), t);
  return id;
}
function paintToast(el, { type, title, body, link }) {
  el.className = 'toast ' + type;
  const ic = type === 'pending' ? '<span class="spin ic"></span>' : `<span class="ic">${type === 'success' ? IC.check : IC.alert}</span>`;
  el.innerHTML = `${ic}<div><b>${esc(title)}</b>${body ? `<p>${esc(body)}</p>` : ''}${link ? `<a href="${esc(link)}" target="_blank" rel="noopener">View on Solscan</a>` : ''}</div><button class="x" aria-label="Dismiss">&times;</button>`;
  $('.x', el).onclick = () => el.remove();
}
function updateToast(id, p) { const el = document.getElementById(id); if (!el) return; el._d = { ...el._d, ...p }; paintToast(el, el._d); if (p.type && p.type !== 'pending') setTimeout(() => el.remove(), p.type === 'error' ? 10000 : 7000); }
function openModal(html) {
  closeModal(); const m = document.createElement('div'); m.className = 'modal'; m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  m.addEventListener('mousedown', e => { if (e.target === m) closeModal(); }); document.addEventListener('keydown', escClose);
  $('#overlay').appendChild(m); const f = $('button,a,input', m); f && f.focus(); return m;
}
function escClose(e) { if (e.key === 'Escape') closeModal(); }
function closeModal() { $$('.modal').forEach(m => m.remove()); document.removeEventListener('keydown', escClose); }

/* ---------- wallet ---------- */
function openWalletModal() {
  const rows = WALLETS.map(w => { const p = w.get();
    return p ? `<button class="wl" data-w="${w.id}"><span class="wi">${w.name[0]}</span>${w.name}<i>Detected</i></button>` : `<a class="wl" href="${w.url}" target="_blank" rel="noopener"><span class="wi">${w.name[0]}</span>${w.name}<i>Install</i></a>`; }).join('');
  const m = openModal(`<header><h2>Connect a wallet</h2><button class="btn ibtn btn-sm" data-close aria-label="Close" style="width:32px">${IC.x.replace('<svg', '<svg width="16" height="16"')}</button></header><p class="muted" style="margin:0">Your wallet signs every transaction. Spawn Pad never sees your keys.</p>${rows}`);
  $('[data-close]', m).onclick = closeModal; $$('[data-w]', m).forEach(b => b.onclick = () => connectWallet(b.dataset.w));
}
async function connectWallet(id, silent) {
  const w = WALLETS.find(x => x.id === id), p = w && w.get(); if (!p) return;
  try {
    const r = silent ? await p.connect({ onlyIfTrusted: true }) : await p.connect(); const pk = (r && r.publicKey) || p.publicKey; if (!pk) throw new Error('no key');
    state.wallet = { id, name: w.name, provider: p, address: pk.toString() }; store.set('wallet', id);
    p.on && p.on('disconnect', () => { if (state.wallet && state.wallet.provider === p) clearWallet(); });
    p.on && p.on('accountChanged', k => { if (k) { state.wallet.address = k.toString(); walletChanged(); } else clearWallet(); });
    closeModal(); walletChanged(); if (!silent) toast({ title: 'Wallet connected', body: short(state.wallet.address), ttl: 2500 });
  } catch (e) { if (!silent) toast({ type: 'error', title: 'Wallet not connected', body: e && e.code === 4001 ? 'You rejected the connection request.' : 'Could not connect. Try again.' }); }
}
function clearWallet() { state.wallet = null; state.balances = { sol: null, token: null }; walletChanged(); }
async function disconnectWallet() { try { state.wallet && state.wallet.provider.disconnect && await state.wallet.provider.disconnect(); } catch {} store.set('wallet', null); clearWallet(); }
function walletChanged() { paintWalletBtn(); refreshBalances(); walletListeners.forEach(f => f()); }
function paintWalletBtn() { const b = $('#walletBtn'); b.textContent = state.wallet ? short(state.wallet.address) : 'Connect Wallet'; b.className = 'btn'; $('#walletMenu').hidden = true; }
async function refreshBalances() {
  if (!state.wallet) { state.balances = { sol: null, token: null }; return; }
  try { state.balances = await api.getBalances(state.wallet.address, state.mint); } catch { state.balances = { sol: null, token: null }; }
  walletListeners.forEach(f => f('balances'));
}
$('#walletBtn').onclick = e => {
  e.stopPropagation(); if (!state.wallet) return openWalletModal();
  const m = $('#walletMenu'); m.innerHTML = `<button data-a="copy">Copy address</button><a href="${esc(acctUrl(state.wallet.address))}" target="_blank" rel="noopener">View wallet</a><div class="sep"></div><button data-a="dc">Disconnect</button>`;
  m.hidden = !m.hidden; $$('[data-a]', m).forEach(b => b.onclick = () => { m.hidden = true; b.dataset.a === 'copy' ? copyText(state.wallet.address, 'Address copied') : disconnectWallet(); });
};
document.addEventListener('click', () => { $('#walletMenu').hidden = true; $$('.pop.auto').forEach(p => p.hidden = true); });
async function copyText(t, msg = 'Copied') {
  try { await navigator.clipboard.writeText(t); } catch { const a = document.createElement('textarea'); a.value = t; a.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch {} a.remove(); }
  toast({ title: msg, ttl: 1800 });
}
async function shareUrl(url, name) { if (navigator.share) { try { await navigator.share({ title: name, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } } copyText(url, 'Link copied'); }
const appUrl = path => location.origin + location.pathname + '#' + path;

/* ---------- TokenCard (one component, variants: king | trending | migrated | search).
   The responsive "mobile" layout is the same markup collapsing to a card via CSS. ---------- */
function coinEl(img, sym, cls = '') {
  const src = imgSrc(img), p = ipfsPath(img), tx = esc((sym || '?').slice(0, 2));
  return `<span class="coin ${cls}">${src ? `<img src="${esc(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" data-fb="1" data-sym="${tx}" ${p ? `data-ipfs="${esc(p)}" data-g="0"` : ''}>` : tx}</span>`;
}
function spark(arr, up) {
  if (!arr || arr.length < 2) return '<div class="spark"></div>';
  const W = 200, H = 44, lo = Math.min(...arr), hi = Math.max(...arr), sp = hi - lo || 1;
  const pts = arr.map((v, i) => [i * W / (arr.length - 1), H - 4 - ((v - lo) / sp) * (H - 8)]);
  const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' '), c = up ? '#1CE56E' : '#FF5C6A';
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="${c}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}
const statusChip = t => t.status === 'migrated' ? '<span class="chip mig">MIGRATED</span>' : '<span class="chip">CURVE</span>';
function tokenCard(t, variant = 'trending', i = 0, rank = 0) {
  const href = `#/token/${encodeURIComponent(t.mint)}`, style = `style="--i:${Math.min(i, 14)}"`;
  const sub = `by ${esc(short(t.creator))} · ${ago(t.createdAt)}`;
  if (variant === 'king') {
    const tx = (t.txBuys24h || 0) + (t.txSells24h || 0);
    return `<a class="tc-king enter r${rank}" href="${href}" ${style}>
      <div class="k-top"><span class="rank">#${rank}</span>${coinEl(t.image, t.symbol)}<div class="k-id"><b>${esc(t.name)}</b><span class="muted">${esc(t.symbol)}</span></div>${statusChip(t)}</div>
      <div class="k-px"><strong>${usd(t.marketCapUsd)}</strong>${chg(t.change24hPct)}</div>
      <div class="k-sub"><span>Price <b style="color:var(--ink);font-weight:600">${fmtPrice(t.priceSol)} SOL</b></span><span>${fmtCompact(tx, 1)} txns</span></div>
      ${spark(t.spark, (t.change24hPct || 0) >= 0)}
      <div class="k-prog"><div><span>Bonding curve</span><b style="color:var(--ink)">${(+t.progressPct || 0).toFixed(0)}%</b></div><div class="bar"><i style="width:${Math.min(100, +t.progressPct || 0)}%"></i></div></div>
      <div class="k-meta"><span>Creator ${esc(short(t.creator))}</span><span>Age ${ago(t.createdAt)}</span></div></a>`;
  }
  if (variant === 'search') {
    return `<a class="tc-search enter" href="${href}" ${style}>${coinEl(t.image, t.symbol)}<div style="min-width:0"><div style="display:flex;gap:8px;align-items:center"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</b><span class="muted">${esc(t.symbol)}</span>${statusChip(t)}</div><div class="dim" style="font-size:12px">${esc(short(t.mint))}</div></div><div style="text-align:right"><b>${usd(t.marketCapUsd)}</b><div class="dim" style="font-size:12px">mcap</div></div></a>`;
  }
  const mig = variant === 'migrated';
  const token = `<div class="c-token">${coinEl(t.image, t.symbol)}<div class="tt"><div class="nm"><b>${esc(t.name)}</b><em>${esc(t.symbol)}</em>${statusChip(t)}</div><div class="sub">${sub}</div></div></div>`;
  const c = (l, v, cls = '') => `<div class="cell n ${cls}"><span class="l">${l}</span>${v}</div>`;
  if (mig) return `<a class="tc-row cols-m enter" href="${href}" ${style}>${token}${c('Market cap', usd(t.marketCapUsd))}${c('Price', fmtPrice(t.priceSol) + ' <span class="dim">SOL</span>')}${c('Volume', usd(t.volume24hUsd))}${c('Liquidity', usd(t.liquidityUsd))}${c('Holders', fmtCompact(t.holders, 1))}${c('Migrated', t.migratedAt ? ago(t.migratedAt) + ' ago' : '—')}</a>`;
  return `<a class="tc-row cols-t enter" href="${href}" ${style}>${token}${c('Market cap', usd(t.marketCapUsd))}${c('Price', fmtPrice(t.priceSol) + ' <span class="dim">SOL</span>')}${c('24h', chg(t.change24hPct))}${c('Volume', usd(t.volume24hUsd))}${c('Holders', fmtCompact(t.holders, 1))}<div class="cell c-curve"><span class="l">Bonding curve</span><div class="bar"><i style="width:${Math.min(100, +t.progressPct || 0)}%"></i></div><span>${(+t.progressPct || 0).toFixed(0)}%</span></div>${c('Age', ago(t.createdAt))}</a>`;
}

/* ---------- search ---------- */
function attachSearch(input, pop, { onNavigate } = {}) {
  let timer, id = 0, items = [], sel = -1;
  pop.classList.add('auto');
  const close = () => { pop.hidden = true; input.setAttribute('aria-expanded', 'false'); sel = -1; };
  const go = path => { close(); input.blur(); onNavigate && onNavigate(); location.hash = path; };
  const highlight = () => $$('.sr-row', pop).forEach((r, i) => r.setAttribute('aria-selected', i === sel));
  pop.addEventListener('click', e => e.stopPropagation()); input.addEventListener('click', e => e.stopPropagation());
  async function run() {
    const q = input.value.trim(); if (!q) { close(); return; }
    const my = ++id, ca = (q.match(MINT_RE) || [])[0], isCa = ca && isMint(ca);
    pop.hidden = false; input.setAttribute('aria-expanded', 'true');
    pop.innerHTML = '<div class="pop-msg">Searching…</div>';
    let res = []; try { res = await api.search(isCa ? ca : q, { limit: 6 }); } catch { if (my === id) pop.innerHTML = '<div class="pop-msg red">Search failed. Try again.</div>'; return; }
    if (my !== id) return; items = [];
    let html = '';
    if (isCa && !res.some(t => t.mint === ca)) { items.push('/token/' + encodeURIComponent(ca)); html += `<div class="sr-row" data-i="0"><span class="coin sm">CA</span><div><b>Open token</b><div class="dim" style="font-size:12px">${esc(ca)}</div></div><span></span></div>`; }
    res.forEach(t => { const idx = items.length; items.push('/token/' + encodeURIComponent(t.mint));
      html += `<div class="sr-row" data-i="${idx}">${coinEl(t.image, t.symbol, 'sm')}<div style="min-width:0"><div style="display:flex;gap:8px;align-items:center"><b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</b><span class="muted">${esc(t.symbol)}</span>${statusChip(t)}</div><div class="dim" style="font-size:12px">${esc(short(t.mint))}</div></div><div class="r"><b>${usd(t.marketCapUsd)}</b></div></div>`; });
    if (!items.length) html = `<div class="pop-msg">No tokens found.</div>`;
    else html += `<div class="sr-row" data-i="${items.length}" style="color:var(--g)"><span></span><b>See all results for “${esc(q)}”</b><span></span></div>`, items.push('/search?q=' + encodeURIComponent(q));
    pop.innerHTML = html; sel = -1;
    $$('.sr-row', pop).forEach(r => r.onclick = () => go(items[+r.dataset.i]));
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 200); });
  input.addEventListener('focus', () => { if (input.value.trim()) run(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { if (!items.length) return; e.preventDefault(); sel = (sel + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; highlight(); }
    else if (e.key === 'Enter') { e.preventDefault(); const q = input.value.trim(); if (!q) return; const ca = (q.match(MINT_RE) || [])[0];
      if (sel >= 0 && items[sel]) return go(items[sel]); if (ca && isMint(ca)) return go('/token/' + encodeURIComponent(ca)); go('/search?q=' + encodeURIComponent(q)); }
    else if (e.key === 'Escape') close();
  });
  return { close };
}
attachSearch($('#qD'), $('#popD'));
$('#searchBtn').onclick = () => {
  const o = document.createElement('div'); o.className = 'sov';
  o.innerHTML = `<div style="display:flex;gap:10px;align-items:center"><div class="sbox" style="flex:1"><div class="field">${IC.search}<input id="qM" placeholder="Search name, ticker or address" autocomplete="off" spellcheck="false" aria-label="Search tokens"></div></div><button class="btn" id="sovX">Cancel</button></div><div class="pop" id="popM"></div>`;
  $('#overlay').appendChild(o); const inp = $('#qM'); inp.focus(); const c = () => o.remove();
  $('#sovX').onclick = c; const s = attachSearch(inp, $('#popM'), { onNavigate: c }); $('#popM').hidden = true;
};
$('#menuBtn').onclick = () => {
  const d = document.createElement('div'); d.className = 'drawer'; const cur = routeName();
  d.innerHTML = `<nav><button class="btn ibtn" id="drX" style="justify-self:end;margin-bottom:6px" aria-label="Close">${IC.x.replace('<svg', '<svg width="18" height="18"')}</button>
    ${[['home', '#/', 'Explore'], ['trending', '#/trending', 'Trending'], ['migrated', '#/migrated', 'Migrated']].map(l => `<a class="dl" href="${l[1]}" ${cur === l[0] ? 'aria-current="page"' : ''}>${l[2]}</a>`).join('')}
    <a class="btn btn-p btn-lg" href="#/launch" style="margin-top:14px">Launch</a></nav>`;
  d.onclick = e => { if (e.target === d || e.target.closest('a') || e.target.closest('#drX')) d.remove(); }; $('#overlay').appendChild(d);
};

/* ---------- router ---------- */
function parseHash() { const h = location.hash.replace(/^#/, '') || '/'; const [p, q = ''] = h.split('?'); return { parts: p.split('/').filter(Boolean), q: new URLSearchParams(q) }; }
function routeName() { const { parts } = parseHash(); const a = parts[0]; return !a ? 'home' : ['trending', 'migrated', 'search', 'launch', 'token'].includes(a) ? a : 'home'; }
function render() {
  navId++; cleanups.forEach(f => { try { f(); } catch {} }); cleanups = []; walletListeners = []; document.body.classList.remove('has-dock');
  const r = parseHash(), name = routeName(), root = $('#view'); window.scrollTo(0, 0); document.title = 'Spawn Pad';
  $$('#navLinks a').forEach(a => a.removeAttribute('aria-current')); const nl = $(`#navLinks a[data-r="${name}"]`); if (nl) nl.setAttribute('aria-current', 'page');
  state.mint = name === 'token' ? decodeURIComponent(r.parts[1] || '') : null;
  if (name === 'home') viewHome(root, r.q); else if (name === 'trending' || name === 'migrated') viewMarketPage(root, name, r.q);
  else if (name === 'search') viewSearch(root, r.q.get('q') || ''); else if (name === 'launch') viewLaunch(root); else viewToken(root, state.mint);
  refreshBalances();
}
window.addEventListener('hashchange', render);

/* ---------- market list (shared by home, /trending, /migrated) ---------- */
const PAGE_SIZE = 20;
function pageItems(cur, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const s = new Set([1, total, cur, cur - 1, cur + 1]); if (cur <= 3) [2, 3, 4, 5].forEach(n => s.add(n)); if (cur >= total - 2) [total - 1, total - 2, total - 3, total - 4].forEach(n => s.add(n));
  const a = [...s].filter(n => n >= 1 && n <= total).sort((x, y) => x - y), out = [];
  a.forEach((n, i) => { if (i && n - a[i - 1] > 1) out.push('…'); out.push(n); }); return out;
}
function mountMarket(el, { tab, page, onChange, withTabs }) {
  const my = navId; let cur = { tab, page };
  async function load() {
    el.innerHTML = `${withTabs ? tabsHtml() : ''}<div id="mList"><div class="tbl">${Array(6).fill('<div class="tc-row cols-t" style="min-height:66px"><div class="sk" style="height:34px;grid-column:1/-1"></div></div>').join('')}</div><p class="muted" style="text-align:center;margin:14px 0 0">Loading tokens…</p></div>`;
    bindTabs();
    let res; try { res = await api.listTokens({ tab: cur.tab, page: cur.page, pageSize: PAGE_SIZE }); } catch (e) { if (my !== navId) return; $('#mList', el).innerHTML = `<div class="empty"><b>Could not load tokens.</b>Check your connection and try again.<div style="margin-top:12px"><button class="btn btn-sm" id="mRetry">Try again</button></div></div>`; $('#mRetry').onclick = load; return; }
    if (my !== navId) return;
    const tp = Math.max(1, Math.ceil(res.total / PAGE_SIZE)); if (cur.page > tp) { cur.page = tp; onChange && onChange(cur); return load(); }
    const box = $('#mList', el);
    if (!res.items.length) { box.innerHTML = `<div class="empty"><b>No tokens found.</b>${api.ready ? 'New launches will appear here.' : 'The token index is not connected yet.'}${api.ready ? '' : '<code>Requires a separate token-indexing service.</code>'}</div>`; return; }
    const mig = cur.tab === 'migrated';
    box.innerHTML = `<div class="tbl"><div class="th ${mig ? 'cols-m' : 'cols-t'}"><span>Token</span><span class="n">Market cap</span><span class="n">Price</span>${mig ? '<span class="n">Volume</span><span class="n">Liquidity</span><span class="n">Holders</span><span class="n">Migrated</span>' : '<span class="n">24h</span><span class="n">Volume</span><span class="n">Holders</span><span>Bonding curve</span><span class="n">Age</span>'}</div>${res.items.map((t, i) => tokenCard(t, mig ? 'migrated' : 'trending', i)).join('')}</div>
      <nav class="pager" aria-label="Pagination"><button data-p="${cur.page - 1}" ${cur.page <= 1 ? 'disabled' : ''}>Previous</button>${pageItems(cur.page, tp).map(p => p === '…' ? '<span class="gap">…</span>' : `<button data-p="${p}" ${p === cur.page ? 'aria-current="page"' : ''}>${p}</button>`).join('')}<button data-p="${cur.page + 1}" ${cur.page >= tp ? 'disabled' : ''}>Next</button></nav>`;
    $$('[data-p]', box).forEach(b => b.onclick = () => { cur.page = +b.dataset.p; onChange && onChange(cur); load(); el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  }
  const tabsHtml = () => `<div class="mt"><div class="tabs" role="tablist">${[['trending', 'TRENDING'], ['migrated', 'MIGRATED']].map(t => `<button role="tab" data-t="${t[0]}" aria-selected="${cur.tab === t[0]}">${t[1]}</button>`).join('')}</div></div>`;
  function bindTabs() { $$('[data-t]', el).forEach(b => b.onclick = () => { if (b.dataset.t === cur.tab) return; cur = { tab: b.dataset.t, page: 1 }; onChange && onChange(cur); load(); }); }
  load();
}

/* ---------- home ---------- */
function viewHome(root, q) {
  const my = navId, saved = sstore.get('mk', { tab: 'trending', page: 1 });
  const tab = q.get('tab') === 'migrated' ? 'migrated' : q.get('tab') === 'trending' ? 'trending' : saved.tab, page = Math.max(1, parseInt(q.get('page') || saved.page, 10) || 1);
  root.innerHTML = `<div class="hl"><div><h1>Spawn the next one.</h1><p>Launch, trade and discover tokens on Solana.</p></div><a class="btn btn-p" href="#/launch">Launch a token</a></div>
    <section class="live" aria-label="Live launches"><div class="sh"><span class="ldot" id="ldot"></span><h2>LIVE</h2><span class="stat-t" id="lstat"></span><span class="line"></span></div><div class="strip" id="strip"></div></section>
    <section aria-label="King of the Hill"><div class="sh">${IC.crown}<h2>KING OF THE HILL</h2><span class="line"></span></div><div class="king" id="king">${Array(3).fill('<div class="sk" style="height:250px;border-radius:16px"></div>').join('')}</div></section>
    <section id="market" aria-label="Token marketplace"></section>`;
  mountLiveStrip();
  api.getKing().then(k => {
    if (my !== navId) return; const el = $('#king');
    el.innerHTML = k.length ? k.slice(0, 3).map((t, i) => tokenCard(t, 'king', i, i + 1)).join('') : `<div class="empty" style="grid-column:1/-1"><b>No tokens found.</b>${api.ready ? 'The top 3 appear here once tokens are trading.' : 'The token index is not connected yet.'}${api.ready ? '' : '<code>Requires a separate token-indexing service.</code>'}</div>`;
  }).catch(() => { if (my === navId) $('#king').innerHTML = '<div class="empty" style="grid-column:1/-1"><b>Could not load tokens.</b>Check your connection and refresh.</div>'; });
  mountMarket($('#market'), { tab, page, withTabs: true, onChange: c => { sstore.set('mk', c); history.replaceState(null, '', '#/?tab=' + c.tab + '&page=' + c.page); } });
}
function mountLiveStrip() {
  const my = navId, items = [], LABEL = { live: 'Live', connecting: 'Connecting…', idle: 'Connecting…', reconnecting: 'Reconnecting…', offline: 'Unavailable', disabled: 'Not configured' };
  const html = it => { const t = it.token, nm = t.name || short(t.mint);
    return `<a class="lv ${it.fresh ? 'new' : ''}" href="#/token/${encodeURIComponent(t.mint)}">${coinEl(t.image, t.symbol || nm, 'sm')}<div style="min-width:0"><div style="display:flex;gap:6px;align-items:center"><b>${esc(nm)}</b>${t.symbol ? `<span class="muted">${esc(t.symbol)}</span>` : ''}<span class="chip ${it.migrated ? 'mig' : 'ok'}">${it.migrated ? 'MIGRATED' : 'NEW'}</span></div><div class="dim" style="font-size:12px">${t.marketCapSol != null ? fmtSol(+t.marketCapSol, 1) + ' SOL mcap · ' : ''}${ago(it.at)} ago</div></div></a>`; };
  function paint() {
    if (my !== navId) return; const s = live.status(), strip = $('#strip'); if (!strip) return;
    $('#ldot').className = 'ldot ' + (s === 'live' ? 'on' : s === 'offline' || s === 'disabled' ? '' : 'warn'); $('#lstat').textContent = LABEL[s] || '';
    if (items.length) { strip.innerHTML = items.map(html).join(''); return; }
    strip.innerHTML = s === 'live' ? '<div class="strip-msg">Waiting for new launches…</div>'
      : s === 'offline' || s === 'disabled' ? `<div class="strip-msg"><span>The live feed is not connected. It needs a WebSocket data source: set <b>NEXT_PUBLIC_LIVE_WS_URL</b>.</span>${s === 'offline' ? '<button class="btn btn-sm" id="lRetry">Retry</button>' : ''}</div>` : '<div class="sk" style="height:56px;width:100%"></div>';
    const r = $('#lRetry'); if (r) r.onclick = () => live.retry();
  }
  const cap = () => { items.length = Math.min(items.length, 14); };
  const off = api.subscribeFeed(ev => {
    if (my !== navId) return;
    if (ev.type === 'new') { const it = { at: Date.now(), token: { ...ev.token, image: '' }, fresh: true }; items.unshift(it); cap(); paint(); setTimeout(() => { it.fresh = false; }, 1800);
      resolveMeta(ev.token.uri).then(m => { if (m && m.image && my === navId) { it.token.image = m.image; paint(); } }); }
    else if (ev.type === 'migrated') { const it = items.find(x => x.token.mint === ev.mint); if (it) { it.migrated = true; it.at = Date.now(); } else items.unshift({ at: Date.now(), migrated: true, token: { mint: ev.mint } }); cap(); paint(); }
  });
  const iv = setInterval(paint, 15000);
  cleanups.push(off, live.onStatus(paint), () => clearInterval(iv)); paint();
}
function viewMarketPage(root, name, q) {
  const page = Math.max(1, parseInt(q.get('page') || '1', 10) || 1);
  root.innerHTML = `<div class="hl"><div><h1>${name === 'trending' ? 'Trending' : 'Migrated'}</h1><p>${name === 'trending' ? 'Tokens trading on their bonding curve.' : 'Tokens that graduated to the PumpSwap market.'}</p></div></div><section id="market"></section>`;
  mountMarket($('#market'), { tab: name, page, withTabs: false, onChange: c => history.replaceState(null, '', '#/' + name + '?page=' + c.page) });
}
function viewSearch(root, q) {
  const my = navId;
  root.innerHTML = `<div class="hl"><div><h1>Search</h1><p>${q ? `Results for “${esc(q)}”` : 'Search by token name, ticker or contract address.'}</p></div></div><div id="res"></div>`;
  const box = $('#res');
  if (!q) { box.innerHTML = '<div class="empty"><b>Search tokens</b>Use the search bar to find a token by name, ticker or address.</div>'; return; }
  box.innerHTML = '<p class="muted">Loading tokens…</p>';
  const ca = (q.match(MINT_RE) || [])[0];
  api.search(ca && isMint(ca) ? ca : q, { limit: 40 }).then(r => {
    if (my !== navId) return;
    let extra = ca && isMint(ca) && !r.some(t => t.mint === ca) ? `<a class="tc-search" href="#/token/${encodeURIComponent(ca)}"><span class="coin">CA</span><div><b>Open token</b><div class="dim" style="font-size:12px;overflow-wrap:anywhere">${esc(ca)}</div></div><span></span></a>` : '';
    box.innerHTML = r.length || extra ? `<div class="list">${extra}${r.map((t, i) => tokenCard(t, 'search', i)).join('')}</div>` : '<div class="empty"><b>No tokens found.</b>Check the spelling or paste the contract address.</div>';
  }).catch(() => { if (my === navId) box.innerHTML = '<div class="empty"><b>Search failed.</b>Try again in a moment.</div>'; });
}

/* ---------- shared helpers ---------- */
function friendly(e) {
  const m = (e && e.message) || '';
  if (e && (e.code === 4001 || /reject|declin|denied|cancel/i.test(m))) return 'You rejected the request in your wallet. Nothing was sent.';
  if (/insufficient|0x1\b/i.test(m)) return 'Your wallet does not have enough SOL for this.';
  if (/slippage|0x1772|too much sol|too little/i.test(m)) return 'The price moved past your slippage limit.';
  if (/blockhash not found|block height exceeded|blockhash.*expired|transaction expired/i.test(m)) return 'The transaction blockhash expired. Try the launch again.';
  return m || 'Something went wrong.';
}
function normX(v) { v = v.trim(); if (!v) return ''; const m = v.match(/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})/i) || v.match(/^@?([A-Za-z0-9_]{1,15})$/); return m ? 'https://x.com/' + m[1] : null; }
function normTg(v) { v = v.trim(); if (!v) return ''; const m = v.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_+]{3,64})/i) || v.match(/^@?([A-Za-z0-9_]{4,32})$/); return m ? 'https://t.me/' + m[1] : null; }
function normWeb(v) { v = v.trim(); if (!v) return ''; if (!/^https?:\/\//i.test(v)) v = 'https://' + v; const u = safeUrl(v.replace(/^http:/i, 'https:')); return u && /\./.test(new URL(u).hostname) ? u : null; }

/* ---------- launch ---------- */
function viewLaunch(root) {
  const my = navId; let image = null, imageUrl = '', busy = false, costId = 0, costTimer; const touched = new Set();
  root.innerHTML = `<div id="lRoot"><div class="hl"><div><h1>LAUNCH YOUR TOKEN</h1><p>Bring something new to life.</p></div></div>
  <div class="launch">
    <form class="card pad form" id="lForm" novalidate>
      <div class="field2"><span class="lb" id="imgLbl">Token image</span>
        <div class="drop" id="drop" tabindex="0" role="button" aria-labelledby="imgLbl"><div id="dropIn">${IC.upload}<b>Drop an image or tap to choose</b><span class="hint">PNG, JPG, GIF or WebP · up to 4 MB · square works best</span></div></div>
        <input type="file" id="file" accept="image/png,image/jpeg,image/gif,image/webp" class="sr" tabindex="-1"><div class="err" id="e-image"></div></div>
      <div class="row2"><div class="field2"><label for="f-name">Token name</label><input class="input" id="f-name" maxlength="40" placeholder="Spawn Coin" autocomplete="off"><div class="err" id="e-name"></div></div>
        <div class="field2"><label for="f-symbol">Ticker</label><input class="input" id="f-symbol" maxlength="12" placeholder="SPAWN" autocomplete="off" autocapitalize="characters"><div class="err" id="e-symbol"></div></div></div>
      <div class="field2"><label for="f-desc">Description</label><textarea class="input" id="f-desc" maxlength="520" placeholder="What is this token about?"></textarea><div class="err" id="e-description"></div></div>
      <div class="field2"><label for="f-web">Website</label><input class="input" id="f-web" placeholder="https://" autocomplete="off" spellcheck="false"><div class="err" id="e-web"></div></div>
      <div class="row2"><div class="field2"><label for="f-x">X</label><input class="input" id="f-x" placeholder="@handle or link" autocomplete="off" spellcheck="false"><div class="err" id="e-x"></div></div>
        <div class="field2"><label for="f-tg">Telegram</label><input class="input" id="f-tg" placeholder="@name or t.me link" autocomplete="off" spellcheck="false"><div class="err" id="e-tg"></div></div></div>
       <div class="field2"><label for="f-buy">Initial buy <span class="dim" style="font-weight:400">(optional)</span></label><div class="suffix"><input class="input" id="f-buy" inputmode="decimal" placeholder="0.0" autocomplete="off"><span>SOL</span></div><div class="hint">Initial buys are not enabled in this create-only flow; set to 0 to launch.</div><div class="err" id="e-buy"></div></div>
       <div class="field2"><span class="lb">Creator</span><div class="creator" id="creator"></div></div>
      <div class="cost" id="cost"></div>
      <div id="lSubmit"></div><div id="lProg"></div>
    </form>
     <aside class="sticky"><div class="muted" style="font-size:12.5px;font-weight:700;letter-spacing:.14em;margin-bottom:10px">PREVIEW</div><div id="pv"></div><p class="note" style="margin-top:12px">Image and metadata are uploaded publicly to IPFS before wallet approval. Name, ticker and image cannot be changed after creation.</p></aside>
  </div></div>`;
  const $v = id => $('#' + id);
  const read = () => ({ name: $v('f-name').value.trim(), symbol: $v('f-symbol').value.trim().toUpperCase(), description: $v('f-desc').value.trim(), x: $v('f-x').value, tg: $v('f-tg').value, web: $v('f-web').value, buy: $v('f-buy').value.trim().replace(',', '.') });
  function validate() {
    const v = read(), e = {};
    if (!v.name) e.name = 'Enter a token name.'; else if (v.name.length > 32) e.name = 'Use 32 characters or fewer.';
    if (!v.symbol) e.symbol = 'Enter a ticker.'; else if (!/^[A-Z0-9]{2,10}$/.test(v.symbol)) e.symbol = 'Use 2–10 letters or numbers.';
    if (v.description.length > 500) e.description = 'Use 500 characters or fewer.';
    if (!image) e.image = 'Add an image for your token.';
    const x = normX(v.x), tg = normTg(v.tg), web = normWeb(v.web);
    if (x === null) e.x = 'Enter a handle like @spawnpad.'; if (tg === null) e.tg = 'Enter a handle or t.me link.'; if (web === null) e.web = 'Enter a valid website address.';
     let buy = 0; if (v.buy !== '') { buy = Number(v.buy); if (!isFinite(buy) || buy < 0) e.buy = 'Enter a valid SOL amount.'; else if (buy > 0) e.buy = 'Initial buys are not enabled in this launch flow; set this to 0.'; }
    return { v, e, norm: { x: x || '', telegram: tg || '', website: web || '' }, buy };
  }
  function paint() {
    const { v, e } = validate();
    ['name', 'symbol', 'description', 'x', 'tg', 'web', 'buy', 'image'].forEach(k => { const show = touched.has(k) && e[k], el = $v('e-' + k), inp = $v('f-' + k) || $v('drop'); if (el) el.textContent = show ? e[k] : ''; if (inp) inp.setAttribute('aria-invalid', show ? 'true' : 'false'); });
     $v('pv').innerHTML = tokenCard({ mint: 'preview', name: v.name || 'Token name', symbol: v.symbol || 'TICKER', image: imageUrl, creator: state.wallet ? state.wallet.address : '', createdAt: Date.now(), status: 'curve', marketCapUsd: null }, 'search').replace('href="#/token/preview"', 'href="#/launch" style="pointer-events:none" tabindex="-1"').replace(/<b>—<\/b>/, '<b>—</b>').replace('<div class="dim" style="font-size:12px">' + esc(short('preview')) + '</div>', '<div class="dim" style="font-size:12px">Address assigned on launch</div>');
    $v('creator').innerHTML = state.wallet ? `<div><div style="font-weight:600">${esc(state.wallet.name)} wallet</div><div class="dim" style="font-size:12.5px">${esc(short(state.wallet.address))}</div></div><span class="chip ok">CONNECTED</span>` : `<span class="muted">Connect your wallet to launch. It becomes the token creator.</span><button type="button" class="btn btn-sm" id="cw">Connect</button>`;
    const cw = $('#cw'); if (cw) cw.onclick = openWalletModal; paintSubmit();
  }
  function paintCost(c, err) {
    const row = (l, v) => `<div class="row"><span>${l}</span><b>${v == null ? '—' : fmtSol(v, 5) + ' SOL'}</b></div>`;
    $v('cost').innerHTML = `<div class="lb" style="font-weight:600;font-size:13px">Estimated launch cost</div>${row('Network fee', c && c.networkFeeSol)}${row('Account rent', c && c.rentSol)}${row('Platform fee', c && c.platformFeeSol)}${row('Initial buy', c ? c.initialBuySol : null)}<div class="row tot"><span>Total</span><b>${c ? fmtSol(c.totalSol, 5) + ' SOL' : '—'}</b></div>${err ? `<div class="note">${esc(err)}</div>` : ''}`;
  }
  function scheduleCost() { clearTimeout(costTimer); const buy = parseFloat($v('f-buy').value) || 0; const id = ++costId; paintCost(null, 'Calculating…');
     costTimer = setTimeout(async () => { try { const c = await api.quoteLaunch({ initialBuySol: buy }); if (id === costId && my === navId) paintCost(c); } catch (e) { if (id === costId && my === navId) paintCost(null, e.notWired ? 'Your wallet shows final rent and network fees before you approve.' : 'Could not estimate the cost. Try again.'); } }, 400); }
  cleanups.push(() => clearTimeout(costTimer));
  function paintSubmit() { $v('lSubmit').innerHTML = `<button class="btn btn-p btn-lg" type="submit" ${busy ? 'disabled' : ''}>${busy ? '<span class="spin"></span>Working…' : state.wallet ? 'CREATE TOKEN' : 'CONNECT WALLET'}</button><p class="note" style="text-align:center;margin:10px 0 0">Your wallet asks you to approve before anything is sent.</p>`; }
  walletListeners.push(() => { if (my === navId && $v('f-buy')) paint(); });
  ['f-name', 'f-symbol', 'f-desc', 'f-x', 'f-tg', 'f-web', 'f-buy'].forEach(id => { const el = $v(id);
    el.addEventListener('input', () => { if (id === 'f-symbol') el.value = el.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); if (id === 'f-buy') scheduleCost(); paint(); });
    el.addEventListener('blur', () => { touched.add(id.slice(2)); paint(); }); });
  const drop = $v('drop'), file = $v('file');
  const pick = f => { touched.add('image'); if (!f) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) return toast({ type: 'error', title: 'Unsupported image', body: 'Use a PNG, JPG, GIF or WebP file.' });
    if (f.size > 4 * 1024 * 1024) return toast({ type: 'error', title: 'Image is too large', body: 'Choose an image under 4 MB.' });
    if (imageUrl) URL.revokeObjectURL(imageUrl); image = f; imageUrl = URL.createObjectURL(f);
    $v('dropIn').innerHTML = `<img src="${esc(imageUrl)}" alt="Selected token image"><span class="muted" style="font-size:12.5px">${esc(f.name)} · tap to change</span>`; paint(); };
  drop.onclick = () => file.click(); drop.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } };
  file.onchange = () => pick(file.files[0]); drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files[0]); };
  cleanups.push(() => imageUrl && URL.revokeObjectURL(imageUrl));
  $v('lForm').onsubmit = async ev => {
    ev.preventDefault(); if (busy) return; ['name', 'symbol', 'description', 'x', 'tg', 'web', 'buy', 'image'].forEach(k => touched.add(k)); paint();
    const { v, e, norm, buy } = validate(); if (!state.wallet) return openWalletModal();
    if (Object.keys(e).length) { const f = $('[aria-invalid=true]'); f && f.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    busy = true; paintSubmit(); steps('upload');
    try { const res = await api.createToken({ name: v.name, symbol: v.symbol, description: v.description, socials: norm, image, initialBuySol: buy }, state.wallet, (ph, d) => steps(ph === 'submitted' ? 'confirm' : ph));
      if (my !== navId) return; done(res, v); }
    catch (err) { if (my !== navId) return; busy = false; paintSubmit(); steps(null, err); }
  };
  let lastStep = 'upload';
  function steps(phase, err) {
    const order = ['upload', 'sign', 'confirm'], lb = { upload: 'Upload image and details', sign: 'Waiting for wallet confirmation…', confirm: 'Transaction submitted. Confirming…' };
    if (phase) lastStep = phase; const ci = order.indexOf(lastStep);
     $v('lProg').innerHTML = `<ol class="steps" style="margin-top:14px">${order.map((k, i) => { const cls = err && i === ci ? 'fail' : i < ci ? 'done' : i === ci ? 'active' : ''; return `<li class="${cls}"><span class="n">${cls === 'done' ? IC.check.replace('<svg', '<svg width="13" height="13"') : i + 1}</span>${lb[k]}${cls === 'active' ? '<span class="spin" style="margin-left:auto"></span>' : ''}</li>`; }).join('')}</ol>${err ? `<div class="err" style="margin-top:10px;font-size:13.5px">Launch did not complete. ${esc(friendly(err))}</div>` : ''}`;
  }
  function done(res, v) {
     const url = 'https://pump.fun/?outputCurrency=' + encodeURIComponent(res.mint);
    $('#lRoot').innerHTML = `<div class="card pad" style="max-width:520px;margin:30px auto;display:grid;gap:14px;text-align:center;justify-items:center">${coinEl(imageUrl, v.symbol, 'lg')}<h1 style="margin:0;font:400 20px var(--display)">${esc(v.name)} is live</h1><p class="muted" style="margin:0">Transaction confirmed. Share the contract address so people can trade.</p>
      <div class="ca" style="height:auto;padding:8px 6px 8px 12px;max-width:100%"><span style="overflow-wrap:anywhere;text-align:left">${esc(res.mint)}</span><button data-c>Copy</button></div>
       <div style="display:grid;gap:8px;width:100%"><a class="btn btn-p btn-lg" href="${esc(url)}" target="_blank" rel="noopener">Trade on Pump.fun</a><button class="btn" data-s>Share</button>${res.signature ? `<a class="btn" target="_blank" rel="noopener" href="${esc(txUrl(res.signature))}">View transaction</a>` : ''}</div></div>`;
    $('[data-c]').onclick = () => copyText(res.mint, 'Address copied'); $('[data-s]').onclick = () => shareUrl(url, v.name);
  }
  paintCost(null); scheduleCost(); paint();
}

/* ---------- token page ---------- */
const mergeTrades = (a, b) => { const seen = new Set(), out = []; [...(b || []), ...a].forEach(t => { if (!seen.has(t.sig)) { seen.add(t.sig); out.push(t); } }); return out.sort((x, y) => y.ts - x.ts).slice(0, 60); };
function tokenSkeleton() { return `<div class="tpg"><div class="stack"><div class="sk" style="height:70px;border-radius:16px"></div><div class="sk" style="height:76px;border-radius:16px"></div><div class="sk" style="height:380px;border-radius:16px"></div></div><div class="sk" style="height:460px;border-radius:16px"></div></div>`; }
const stateBlock = (t, b, x = '') => `<div class="state"><h2>${esc(t)}</h2><p>${esc(b)}</p>${x}<a class="btn" href="#/" style="margin-top:6px">Back to Explore</a></div>`;

async function viewToken(root, mint) {
  const my = navId; root.innerHTML = tokenSkeleton(); document.body.classList.add('has-dock');
  let T; try { T = await api.getToken(mint); } catch { if (my !== navId) return; document.body.classList.remove('has-dock'); root.innerHTML = stateBlock('Could not load this token', 'The request failed. Check your connection and try again.', '<button class="btn btn-p" id="retry">Try again</button>'); $('#retry').onclick = render; return; }
  if (my !== navId) return;
  if (!T) { document.body.classList.remove('has-dock'); root.innerHTML = stateBlock('No token found.', 'Nothing exists at this address. Check it and try again.', `<code class="dim" style="overflow-wrap:anywhere;font-size:12.5px">${esc(mint)}</code>`); return; }
  document.title = T.symbol + ' · Spawn Pad';
  const D = { trades: null, holders: null, holderError: '', tab: 'trades', tf: sstore.get('tf', '24H'), chart: null };
  const P = { side: 'buy', amount: '', quote: null, q: 'idle', qErr: '', busy: false, slipOpen: false, tx: { s: 'idle' } };
  const link = u => safeUrl(u);

  root.innerHTML = `<div class="tpg">
    <div class="stack"><section class="card pad" id="head"></section><section class="stats" id="stats"></section>
      <section class="card chart-card"><div class="ch-top"><span class="muted" style="font-weight:600">${esc(T.symbol)} / SOL<span class="live-chip" id="lchip"></span></span><div class="tfs" role="group" aria-label="Chart range">${['1H', '24H', '7D'].map(t => `<button data-tf="${t}" aria-pressed="${D.tf === t}">${t}</button>`).join('')}</div></div><div class="chart" id="chart"></div></section>
      <section class="card pad" id="curve"></section>
      <section class="card" id="tabsCard"><div class="tabs2" role="tablist">${[['trades', 'Transactions'], ['holders', 'Holders'], ['info', 'About']].map(t => `<button role="tab" data-tab="${t[0]}" aria-selected="${t[0] === 'trades'}">${t[1]}</button>`).join('')}</div><div class="tab-body" id="tabBody"></div></section></div>
    <aside class="tp-side" id="side"><section class="card panel" id="panel"></section></aside>
  </div>
  <div class="scrim" id="scrim"></div>
  <div class="dock" id="dock"><div class="px"><span class="dim" style="font-size:12px">${esc(T.symbol)}</span><b id="dockPx"></b></div><button class="btn btn-p" data-dock="buy">Buy</button><button class="btn btn-s" data-dock="sell">Sell</button></div>`;
  const sheet = open => { $('#side').classList.toggle('open', open); $('#scrim').classList.toggle('open', open); };
  $$('[data-dock]').forEach(b => b.onclick = () => { if (P.side !== b.dataset.dock && !P.busy) { P.side = b.dataset.dock; P.amount = ''; P.quote = null; P.q = 'idle'; paintPanel(); } sheet(true); });
  $('#scrim').onclick = () => sheet(false);
  cleanups.push(() => document.body.classList.remove('has-dock'));

  function paintHead() {
    const socials = [[link(T.socials && T.socials.x), 'X'], [link(T.socials && T.socials.telegram), 'Telegram'], [link(T.socials && T.socials.website), 'Website']].filter(l => l[0]);
    $('#head').innerHTML = `<div class="ident">${coinEl(T.image, T.symbol, 'lg')}<div class="tt"><h1>${esc(T.name)} <em>${esc(T.symbol)}</em>${statusChip(T)}</h1>
      <div class="meta"><span class="ca"><span>${esc(short(T.mint))}</span><button id="copyCa">Copy</button></span><span>Created by <a href="${esc(acctUrl(T.creator))}" target="_blank" rel="noopener" style="color:var(--ink)">${esc(short(T.creator))}</a> · ${ago(T.createdAt)} ago</span>${socials.map(l => `<a class="soc" href="${esc(l[0])}" target="_blank" rel="noopener">${l[1]}</a>`).join('')}</div></div>
      <div style="position:relative"><button class="btn btn-sm" id="shareBtn">Share</button><div class="menu" id="shareMenu" hidden></div></div></div>`;
    $('#copyCa').onclick = () => copyText(T.mint, 'Address copied');
    $('#shareBtn').onclick = e => { e.stopPropagation(); const m = $('#shareMenu'), url = appUrl('/token/' + T.mint);
      m.innerHTML = `<button data-a="c">Copy link</button><a target="_blank" rel="noopener" href="https://x.com/intent/post?text=${encodeURIComponent(T.name + ' (' + T.symbol + ') on Spawn Pad')}&url=${encodeURIComponent(url)}">Post on X</a>${navigator.share ? '<button data-a="n">More…</button>' : ''}`;
      m.hidden = !m.hidden; $$('[data-a]', m).forEach(b => b.onclick = () => { m.hidden = true; b.dataset.a === 'c' ? copyText(url, 'Link copied') : shareUrl(url, T.name); }); };
  }
  document.addEventListener('click', () => { const m = $('#shareMenu'); if (m) m.hidden = true; }); 
  let lastPrice = null;
  function paintStats() {
    const flash = lastPrice != null && T.priceSol !== lastPrice ? (T.priceSol > lastPrice ? 'fu' : 'fd') : '';
    $('#stats').innerHTML = `<div class="stat"><div class="l">Price</div><div class="v ${flash}" id="pxv">${fmtPrice(T.priceSol)} <span class="muted" style="font-size:12px">SOL</span></div><div class="s">${T.priceUsd != null ? '$' + fmtPrice(T.priceUsd) : '&nbsp;'}</div></div>
      <div class="stat"><div class="l">Market cap</div><div class="v">${usd(T.marketCapUsd)}</div><div class="s">${chg(T.change24hPct)} 24h</div></div>
      <div class="stat"><div class="l">Volume 24h</div><div class="v">${usd(T.volume24hUsd)}</div><div class="s">${fmtCompact((T.txBuys24h || 0) + (T.txSells24h || 0), 1)} txns</div></div>
      <div class="stat"><div class="l">Holders</div><div class="v">${fmtCompact(T.holders, 1)}</div><div class="s">&nbsp;</div></div>`;
    if (flash) requestAnimationFrame(() => requestAnimationFrame(() => { const v = $('#pxv'); v && v.classList.remove('fu', 'fd'); }));
    lastPrice = T.priceSol; const dp = $('#dockPx'); if (dp) dp.innerHTML = fmtPrice(T.priceSol) + ' SOL';
  }
  function paintCurve() {
    const el = $('#curve');
    if (T.status === 'migrated') {
      el.innerHTML = `<div class="curve-top"><h3>MIGRATED</h3><span class="chip mig">MIGRATED</span></div>
        <div class="mig-grid"><div><div class="l">Liquidity</div><div class="v">${usd(T.liquidityUsd)}</div></div><div><div class="l">Market cap</div><div class="v">${usd(T.marketCapUsd)}</div></div><div><div class="l">Volume 24h</div><div class="v">${usd(T.volume24hUsd)}</div></div><div><div class="l">Holders</div><div class="v">${fmtCompact(T.holders, 1)}</div></div></div>
        <p class="note" style="margin:14px 0 0">This token left the bonding curve${T.migratedAt ? ' ' + ago(T.migratedAt) + ' ago' : ''}. Trades now route through its PumpSwap liquidity pool${T.poolAddress ? ` (<a href="${esc(acctUrl(T.poolAddress))}" target="_blank" rel="noopener" class="g">${esc(short(T.poolAddress))}</a>)` : ''}.</p>`;
    } else {
      const pct = Math.max(0, Math.min(100, +T.progressPct || 0));
      el.innerHTML = `<div class="curve-top"><h3>BONDING CURVE</h3><span class="chip">NOT MIGRATED</span></div>
        <div class="big-bar" role="progressbar" aria-valuenow="${pct.toFixed(1)}" aria-valuemin="0" aria-valuemax="100" aria-label="Bonding curve progress"><i style="width:${pct}%"></i></div>
        <div class="kvs"><div><div class="l">Progress</div><div class="v">${pct.toFixed(1)}%</div></div><div><div class="l">Remaining to migrate</div><div class="v">${T.solRemaining != null ? fmtSol(T.solRemaining, 2) + ' SOL' : '—'}</div></div><div><div class="l">Current market cap</div><div class="v">${usd(T.marketCapUsd)}</div></div></div>`;
    }
  }

  /* chart */
  async function loadChart() {
    const el = $('#chart'); el.innerHTML = '<div class="sk" style="position:absolute;inset:8px 8px 28px"></div>'; const tf = D.tf;
    try { D.chart = await api.getChart(mint, tf); } catch { D.chart = null; if (my === navId) el.innerHTML = '<div class="empty" style="margin:12px"><b>Could not load the chart.</b>Try again in a moment.</div>'; return; }
    if (my !== navId || tf !== D.tf) return; paintChart();
  }
  function paintChart() {
    const el = $('#chart'), pts = D.chart || [];
    if (pts.length < 2) { el.innerHTML = '<div class="empty" style="position:absolute;inset:12px;display:grid;place-content:center"><b>No chart data yet.</b>The chart appears after the first trades.</div>'; return; }
    const prices = pts.map(p => p.price), lo = Math.min(...prices), hi = Math.max(...prices), sp = hi - lo || hi || 1, pad = sp * .08, a = lo - pad, b = hi + pad;
    const X = i => i / (pts.length - 1) * 1000, Y = v => 400 - ((v - a) / (b - a)) * 400;
    const d = pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.price).toFixed(1)).join(' '), up = prices[prices.length - 1] >= prices[0], col = up ? '#1CE56E' : '#FF5C6A';
    const yl = [0, .25, .5, .75, 1].map(f => { const v = b - f * (b - a); return `<span class="yl" style="top:calc((100% - 22px) * ${f})">${fmtPrice(v)}</span>`; }).join('');
    const xl = [0, .25, .5, .75, 1].map(f => { const t = pts[Math.round(f * (pts.length - 1))].t, dt = new Date(t); return `<span class="xl" style="left:calc((100% - 56px) * ${f});transform:translateX(${f === 0 ? '0' : f === 1 ? '-100%' : '-50%'})">${D.tf === '7D' ? dt.toLocaleDateString([], { month: 'short', day: 'numeric' }) : dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`; }).join('');
    el.innerHTML = `<svg class="ln" viewBox="0 0 1000 400" preserveAspectRatio="none" role="img" aria-label="Price chart"><defs><linearGradient id="cg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".18"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
      ${[.25, .5, .75].map(f => `<line x1="0" x2="1000" y1="${f * 400}" y2="${f * 400}" stroke="rgba(255,255,255,.05)" vector-effect="non-scaling-stroke"/>`).join('')}
      <path d="${d} L1000 400 L0 400Z" fill="url(#cg)"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>${yl}${xl}<div class="xh" id="xh" hidden></div><div class="tip" id="tip" hidden></div>`;
    const svg = $('svg.ln', el), xh = $('#xh'), tip = $('#tip');
    const move = ev => { const r = svg.getBoundingClientRect(), x = Math.max(0, Math.min(r.width, (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left)), i = Math.round(x / r.width * (pts.length - 1)), p = pts[i];
      xh.hidden = tip.hidden = false; xh.style.left = (i / (pts.length - 1) * r.width) + 'px'; tip.innerHTML = `<b>${fmtPrice(p.price)} SOL</b> <span class="dim">${new Date(p.t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>`;
      const tw = tip.offsetWidth; tip.style.left = Math.max(4, Math.min(r.width - tw, i / (pts.length - 1) * r.width - tw / 2)) + 'px'; };
    el.onpointermove = move; el.onpointerleave = () => { xh.hidden = tip.hidden = true; };
  }
  $$('[data-tf]').forEach(b => b.onclick = () => { D.tf = b.dataset.tf; sstore.set('tf', D.tf); $$('[data-tf]').forEach(x => x.setAttribute('aria-pressed', x === b)); loadChart(); });

  /* tabs */
  const skRows = () => '<div style="padding:10px;display:grid;gap:8px">' + Array(5).fill('<div class="sk" style="height:32px"></div>').join('') + '</div>';
  let freshSig = null;
  function paintTabs() {
    const b = $('#tabBody'); $$('[data-tab]').forEach(t => t.setAttribute('aria-selected', t.dataset.tab === D.tab));
    if (D.tab === 'trades') {
      if (D.trades === null) { b.innerHTML = skRows(); return; }
      if (!D.trades.length) { b.innerHTML = '<div class="empty" style="margin:10px"><b>No transactions yet.</b>Trades appear here once they confirm.</div>'; return; }
      b.innerHTML = `<div class="tr h"><span>Time</span><span>Type</span><span class="r">SOL</span><span class="r">${esc(T.symbol)}</span><span class="r tx">Trader</span></div>` + D.trades.slice(0, 40).map((t, i) => `<div class="tr ${freshSig && i === 0 && t.sig === freshSig ? 'fresh' : ''}"><span class="muted">${ago(t.ts)} ago</span><b class="${t.side === 'buy' ? 'g' : 'red'}">${t.side === 'buy' ? 'Buy' : 'Sell'}</b><span class="r">${fmtSol(t.solAmount, 3)}</span><span class="r">${fmtCompact(t.tokenAmount)}</span><span class="r tx"><a class="muted" href="${esc(acctUrl(t.wallet))}" target="_blank" rel="noopener">${esc(short(t.wallet))}</a></span></div>`).join('');
    } else if (D.tab === 'holders') {
      if (D.holderError) { b.innerHTML = `<div class="empty" style="margin:10px"><b>Holder data is unavailable.</b>${esc(D.holderError)}</div>`; return; }
      if (D.holders === null) { b.innerHTML = skRows(); return; }
      if (!D.holders.length) { b.innerHTML = '<div class="empty" style="margin:10px"><b>No holders found.</b>The public RPC returned no token accounts for this mint.</div>'; return; }
      b.innerHTML = D.holders.slice(0, 20).map((h, i) => `<div class="hd"><span class="muted">${i + 1}</span><div style="min-width:0"><a href="${esc(acctUrl(h.address))}" target="_blank" rel="noopener">${esc(short(h.address))}</a>${h.label ? ` <span class="chip">${esc(h.label)}</span>` : ''}<div class="bar"><i style="width:${Math.min(100, h.pct * 2)}%"></i></div></div><b style="text-align:right">${(+h.pct).toFixed(2)}%</b></div>`).join('');
    } else {
      b.innerHTML = `${T.description ? `<div class="desc">${esc(T.description)}</div>` : ''}<div class="kv"><div><span>Creator</span><a href="${esc(acctUrl(T.creator))}" target="_blank" rel="noopener">${esc(short(T.creator))}</a></div><div><span>Created</span><span>${new Date(T.createdAt).toLocaleString()}</span></div><div><span>Contract address</span><a href="${esc(acctUrl(T.mint))}" target="_blank" rel="noopener">${esc(short(T.mint))}</a></div></div>`;
    }
  }
  $$('[data-tab]').forEach(t => t.onclick = () => { D.tab = t.dataset.tab; paintTabs(); });

  /* trading panel */
  const SYM = esc(T.symbol), bal = () => P.side === 'buy' ? state.balances.sol : state.balances.token;
  function paintPanel() {
    const buy = P.side === 'buy';
    $('#panel').innerHTML = `<div style="display:flex;align-items:center;gap:10px"><div class="seg" role="group" aria-label="Trade direction" style="flex:1"><button class="b" data-side="buy" aria-pressed="${buy}">BUY</button><button class="s" data-side="sell" aria-pressed="${!buy}">SELL</button></div><button class="btn btn-sm ibtn x-m" id="pClose" aria-label="Close" style="width:32px">${IC.x.replace('<svg', '<svg width="16" height="16"')}</button></div>
      ${T.status === 'migrated' ? '<span class="chip mig" style="justify-self:start">PUMPSWAP POOL</span>' : ''}
      <div class="bal"><span>${buy ? 'You pay' : 'You sell'}</span><span id="balRow"></span></div>
      <div class="amt"><input id="amt" inputmode="decimal" placeholder="0.0" autocomplete="off" aria-label="${buy ? 'Amount in SOL' : 'Amount of ' + SYM}" value="${esc(P.amount)}"><span class="unit">${buy ? 'SOL' : SYM}</span></div>
      <div class="quick">${(buy ? ['0.1', '0.5', '1', '5'] : ['25%', '50%', '75%', '100%']).map(q => `<button type="button" data-q="${q}">${q}${buy ? ' SOL' : ''}</button>`).join('')}</div>
      <div class="est" id="est" aria-live="polite"></div><div id="slipBox"></div><div id="act"></div><div id="txs"></div>`;
    $$('[data-side]').forEach(b => b.onclick = () => { if (P.busy) return; P.side = b.dataset.side; P.amount = ''; P.quote = null; P.q = 'idle'; P.tx = { s: 'idle' }; paintPanel(); });
    $('#pClose').onclick = () => sheet(false);
    const inp = $('#amt'); inp.oninput = () => { let v = inp.value.replace(',', '.').replace(/[^0-9.]/g, ''); const p = v.split('.'); if (p.length > 2) v = p[0] + '.' + p.slice(1).join(''); if (v !== inp.value) inp.value = v; P.amount = v; scheduleQuote(); };
    $$('[data-q]').forEach(b => b.onclick = () => { const q = b.dataset.q, base = bal(); let v;
      if (P.side === 'buy') v = parseFloat(q); else { if (base == null) return toast({ type: 'error', title: 'Balance unavailable', body: state.wallet ? 'Your balance has not loaded yet.' : 'Connect your wallet to trade.', ttl: 2500 }); v = base * parseFloat(q) / 100; }
      P.amount = String(+v.toFixed(P.side === 'buy' ? 4 : 2)); inp.value = P.amount; scheduleQuote(); });
    paintBal(); paintEst(); paintSlip(); paintAct(); paintTx();
  }
  function paintBal() { const r = $('#balRow'); if (!r) return; const b = bal(); r.innerHTML = state.wallet ? `Balance <b style="color:var(--ink)">${b == null ? '—' : P.side === 'buy' ? fmtSol(b, 4) + ' SOL' : fmtCompact(b) + ' ' + SYM}</b>` : '<span>Connect your wallet to trade.</span>'; }
  const slipPct = () => +(state.slip / 100).toFixed(2);
  function paintEst() {
    const e = $('#est'); if (!e) return; const buy = P.side === 'buy', x = P.quote;
    const row = (l, v) => `<div class="row"><span>${l}</span><b>${v}</b></div>`;
    const imp = x && x.priceImpactPct != null ? x.priceImpactPct : null, ic = imp > 15 ? 'red' : imp > 5 ? 'amber' : '';
    e.innerHTML = `<div><div class="label muted" style="font-size:12px">${buy ? 'Estimated tokens' : 'Estimated SOL'}</div>${P.q === 'loading' ? '<div class="sk" style="height:26px;width:55%;margin-top:4px"></div>' : `<div class="big">${x ? (buy ? fmtCompact(x.out) + ' ' + SYM : fmtSol(x.out, 5) + ' SOL') : '—'}</div>`}</div>
      ${P.q === 'error' ? `<div class="red" style="font-size:13px">${esc(P.qErr)}</div>` : ''}
      ${row('Minimum received', x ? (buy ? fmtCompact(x.minOut) + ' ' + SYM : fmtSol(x.minOut, 5) + ' SOL') : '—')}
      ${row('Price impact', imp != null ? `<span class="${ic}">${imp < .01 ? '<0.01' : imp.toFixed(2)}%</span>` : '—')}
      <div class="row"><span>Slippage</span><button type="button" class="lnk" id="slipToggle">${slipPct()}% · change</button></div>
      ${row('Network fee', x && x.networkFeeSol != null ? fmtSol(x.networkFeeSol, 6) + ' SOL' : '—')}${row('Platform fee', x && x.platformFeeSol != null ? fmtSol(x.platformFeeSol, 6) + ' SOL' : '—')}
      ${imp > 5 ? `<div class="${ic}" style="font-size:12.5px">This trade moves the price by ${imp.toFixed(1)}%. Consider a smaller amount.</div>` : ''}`;
    $('#slipToggle').onclick = () => { P.slipOpen = !P.slipOpen; paintSlip(); };
  }
  function paintSlip() {
    const s = $('#slipBox'); if (!s) return; if (!P.slipOpen) { s.innerHTML = ''; return; } const pre = [50, 100, 200, 500];
    s.innerHTML = `<div class="slip" role="group" aria-label="Slippage tolerance">${pre.map(p => `<button type="button" data-slip="${p}" aria-pressed="${state.slip === p}">${p / 100}%</button>`).join('')}<input id="slipC" inputmode="decimal" placeholder="Custom" aria-label="Custom slippage percent" value="${pre.includes(state.slip) ? '' : state.slip / 100}"><span class="muted">%</span></div>`;
    const apply = bps => { state.slip = bps; store.set('slip', bps); scheduleQuote(); paintSlip(); };
    $$('[data-slip]', s).forEach(b => b.onclick = () => apply(+b.dataset.slip));
    $('#slipC').onchange = e => { const v = parseFloat(e.target.value); if (v > 0 && v <= 50) apply(Math.round(v * 100)); else toast({ type: 'error', title: 'Slippage must be 0.01%–50%', ttl: 3000 }); };
  }
  function actState() {
    const n = parseFloat(P.amount), buy = P.side === 'buy', b = bal();
    if (P.busy) return { t: 'Working…', dis: true, spin: true };
    if (!state.wallet) return { t: 'Connect wallet', connect: true };
    if (!(n > 0)) return { t: 'Enter an amount', dis: true };
    if (b != null && n > b) return { t: buy ? 'Not enough SOL' : 'Not enough ' + T.symbol, dis: true };
    if (P.q === 'loading') return { t: 'Getting quote…', dis: true, spin: true };
    if (P.q !== 'ok') return { t: 'Quote unavailable', dis: true };
    return { t: (buy ? 'BUY ' : 'SELL ') + T.symbol };
  }
  function paintAct() { const a = $('#act'); if (!a) return; const s = actState();
    a.innerHTML = `<button class="btn btn-lg ${P.side === 'buy' || s.connect ? 'btn-p' : 'btn-s'}" id="actBtn" ${s.dis ? 'disabled' : ''}>${s.spin ? '<span class="spin"></span>' : ''}${esc(s.t)}</button>`;
    $('#actBtn').onclick = () => s.connect ? openWalletModal() : submitTrade(); }
  function paintTx() { const t = $('#txs'); if (!t) return; const x = P.tx, lk = x.sig ? ` <a href="${esc(txUrl(x.sig))}" target="_blank" rel="noopener">View on Solscan</a>` : '';
    t.innerHTML = x.s === 'sign' ? '<div class="txs"><span class="spin" style="margin-top:2px;color:var(--g)"></span><div>Waiting for wallet confirmation…</div></div>'
      : x.s === 'submitted' ? `<div class="txs"><span class="spin" style="margin-top:2px;color:var(--g)"></span><div>Transaction submitted.${lk}</div></div>`
      : x.s === 'confirmed' ? `<div class="txs ok"><span class="g">${IC.check}</span><div>Transaction confirmed.${lk}</div></div>`
      : x.s === 'failed' ? `<div class="txs bad"><span class="red">${IC.alert}</span><div>Transaction failed. Try again.<div class="muted" style="font-size:12.5px;margin-top:2px">${esc(x.msg || '')}</div></div></div>` : ''; }
  let qTimer, qId = 0;
  function scheduleQuote() {
    clearTimeout(qTimer); P.quote = null; P.tx = P.tx.s === 'confirmed' || P.tx.s === 'failed' ? { s: 'idle' } : P.tx; const n = parseFloat(P.amount);
    if (!(n > 0)) { P.q = 'idle'; paintEst(); paintAct(); paintTx(); return; } P.q = 'loading'; paintEst(); paintAct(); paintTx(); const id = ++qId;
    qTimer = setTimeout(async () => { try { const x = await api.quote({ mint, side: P.side, amount: n, slippageBps: state.slip }); if (id !== qId || my !== navId) return; P.quote = x; P.q = 'ok'; }
      catch (e) { if (id !== qId || my !== navId) return; P.q = 'error'; P.qErr = e.notWired ? 'Quotes are not connected yet.' : (e.message || 'Could not get a quote.'); } paintEst(); paintAct(); }, 350);
  }
  cleanups.push(() => clearTimeout(qTimer));
  async function submitTrade() {
    const n = parseFloat(P.amount), side = P.side; P.busy = true; P.tx = { s: 'sign' }; paintAct(); paintTx();
    try {
      const res = await api.trade({ mint, side, amount: n, slippageBps: state.slip, wallet: state.wallet, token: T }, (ph, d) => { if (ph === 'sign') P.tx = { s: 'sign' }; if (ph === 'submitted') P.tx = { s: 'submitted', sig: d && d.signature }; paintTx(); });
      P.tx = { s: 'confirmed', sig: res.signature }; P.amount = ''; P.quote = null; P.q = 'idle'; const i = $('#amt'); if (i) i.value = ''; paintEst(); paintTx();
      toast({ title: 'Transaction confirmed.', body: (side === 'buy' ? 'Bought ' : 'Sold ') + T.symbol, link: txUrl(res.signature) });
      await refreshBalances(); refresh();
    } catch (e) { P.tx = { s: 'failed', msg: e.notWired ? 'Trading is not connected yet.' : friendly(e) }; paintTx(); toast({ type: 'error', title: 'Transaction failed. Try again.', body: P.tx.msg }); }
    finally { P.busy = false; paintAct(); }
  }

  /* data loop: polling now; api.subscribe() events can feed the same paint functions later */
  async function refresh() {
    const [t, tr, h] = await Promise.allSettled([api.getToken(mint), api.getTrades(mint), api.getHolders(mint)]); if (my !== navId) return;
    if (t.status === 'fulfilled' && t.value) { const was = T.status; T = t.value; paintHead(); paintStats(); paintCurve();
      if (was !== 'migrated' && T.status === 'migrated') { toast({ title: T.symbol + ' migrated', body: 'Trading moved to the PumpSwap pool.', ttl: 8000 }); P.amount = ''; P.q = 'idle'; paintPanel(); } }
    if (tr.status === 'fulfilled') { const prev = D.trades && D.trades[0] && D.trades[0].sig; D.trades = mergeTrades(tr.value, D.liveTrades); if (!freshSig) freshSig = prev && D.trades[0] && D.trades[0].sig !== prev ? D.trades[0].sig : null; } else D.trades = D.trades || [];
    if (h.status === 'fulfilled') { D.holders = h.value; D.holderError = ''; }
    else D.holderError = h.reason && h.reason.message ? h.reason.message : 'The public RPC request failed.';
    paintTabs();
  }
  let rt; D.liveTrades = [];
  const paintLive = () => { const c = $('#lchip'); if (c) c.innerHTML = live.status() === 'live' ? '<i class="ldot on"></i>LIVE' : ''; };
  const unsub = api.subscribe(mint, ev => {
    if (my !== navId) return;
    if (ev.type === 'trade') { const t = ev.trade; if (D.liveTrades.some(x => x.sig === t.sig)) return;
      D.liveTrades.unshift(t); D.liveTrades.length = Math.min(D.liveTrades.length, 60);
      D.trades = mergeTrades(D.trades || [], D.liveTrades); freshSig = t.sig; if (D.tab === 'trades') paintTabs();
      if (D.chart && D.chart.length && t.priceSol) { D.chart.push({ t: t.ts, price: t.priceSol }); paintChart(); }
      clearTimeout(rt); rt = setTimeout(refresh, 1200); }   /* authoritative price / curve state is re-read from chain after each event */
    else refresh();
  });
  cleanups.push(() => unsub && unsub(), live.onStatus(paintLive), () => clearTimeout(rt)); paintLive();
  walletListeners.push(k => { if (my !== navId) return; if (k === 'balances') { paintBal(); paintAct(); } else paintPanel(); });
  paintHead(); paintStats(); paintCurve(); paintTabs(); paintPanel(); loadChart(); refresh();
  const iv = setInterval(refresh, 15000); cleanups.push(() => clearInterval(iv));
}

/* ---------- boot ---------- */
if (SEED_ON) { const f = $('footer.foot .wrap span:last-child'); if (f) f.textContent = 'Layout preview: sample market data is shown.'; }
paintWalletBtn(); render();
setTimeout(() => { const id = store.get('wallet', null); if (id) connectWallet(id, true); }, 350);
