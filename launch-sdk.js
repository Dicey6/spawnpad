import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction
} from '@solana/web3.js';
import { PUMP_SDK } from '@pump-fun/pump-sdk';

const MAINNET_GENESIS_HASH = '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2X2';
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

async function uploadMetadata({ name, symbol, description, socials, image }) {
  if (!(image instanceof File)) throw new Error('Choose an image for the token.');
  if (!IMAGE_TYPES.has(image.type)) throw new Error('Use a PNG, JPG, GIF or WebP image.');
  if (image.size > MAX_IMAGE_BYTES) throw new Error('Choose an image under 4 MB.');

  const form = new FormData();
  form.set('name', name.trim());
  form.set('symbol', symbol);
  form.set('description', description || '');
  form.set('file', image);
  if (socials?.x) form.set('twitter', socials.x);
  if (socials?.telegram) form.set('telegram', socials.telegram);
  if (socials?.website) form.set('website', socials.website);

  const response = await fetch('/api/metadata', {
    method: 'POST',
    credentials: 'same-origin',
    body: form
  });
  let result;
  try { result = await response.json(); } catch { result = {}; }
  if (!response.ok) throw new Error(result.error || 'Pump could not upload the token metadata.');
  if (typeof result.metadataUri !== 'string' || result.metadataUri.length > 2048) {
    throw new Error('Pump returned an invalid metadata URI.');
  }
  let uri;
  try { uri = new URL(result.metadataUri); } catch { throw new Error('Pump returned an invalid metadata URI.'); }
  if (uri.protocol !== 'https:') throw new Error('Pump returned an insecure metadata URI.');
  return uri.toString();
}

async function getPriorityMicroLamports(connection) {
  try {
    const samples = await connection.getRecentPrioritizationFees();
    const fees = samples
      .map(sample => Number(sample.prioritizationFee))
      .filter(fee => Number.isFinite(fee) && fee > 0)
      .sort((a, b) => a - b);
    if (!fees.length) return 1000;
    const p75 = fees[Math.floor((fees.length - 1) * 0.75)];
    return Math.max(1000, Math.min(p75, 1_000_000));
  } catch {
    return 1000;
  }
}

function simulationMessage(simulation) {
  const logs = simulation?.value?.logs || [];
  const useful = logs.filter(line => /error|failed|insufficient|custom program/i.test(line)).slice(-3);
  const detail = useful.join(' ').trim();
  return detail || JSON.stringify(simulation?.value?.err || 'unknown simulation error');
}

async function createToken(params, wallet, onPhase, rpcUrl) {
  if (!wallet?.provider || typeof wallet.provider.signTransaction !== 'function') {
    throw new Error('Connect a Solana wallet that supports transaction signing.');
  }
  if (Number(params.initialBuySol || 0) > 0) {
    throw new Error('Initial buys are not enabled in this create-only flow. Set Initial buy to 0; the token can still be traded after launch.');
  }
  if (typeof rpcUrl !== 'string' || !rpcUrl.startsWith('https://')) {
    throw new Error('A public HTTPS Solana RPC endpoint is required.');
  }
  if (!params.name?.trim() || params.name.trim().length > 32) {
    throw new Error('Token name must be between 1 and 32 characters.');
  }
  if (!/^[A-Z0-9]{2,10}$/.test(params.symbol || '')) {
    throw new Error('Ticker must be 2–10 letters or numbers.');
  }
  if ((params.description || '').length > 500) {
    throw new Error('Description must be 500 characters or fewer.');
  }

  const creator = new PublicKey(wallet.address);
  if (wallet.provider.publicKey && wallet.provider.publicKey.toString() !== creator.toBase58()) {
    throw new Error('The connected wallet changed. Reconnect it and try again.');
  }
  const connection = new Connection(rpcUrl, 'confirmed');
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== MAINNET_GENESIS_HASH) {
    throw new Error('The configured RPC endpoint is not Solana mainnet.');
  }

  onPhase?.('upload');
  const uri = await uploadMetadata(params);

  // This keypair exists only for this launch and is never stored or transmitted.
  const mint = Keypair.generate();
  const createInstruction = await PUMP_SDK.createV2Instruction({
    mint: mint.publicKey,
    name: params.name.trim(),
    symbol: params.symbol,
    uri,
    creator,
    user: creator,
    mayhemMode: false
  });
  const priorityMicroLamports = await getPriorityMicroLamports(connection);
  const latest = await connection.getLatestBlockhash('confirmed');
  const message = new TransactionMessage({
    payerKey: creator,
    recentBlockhash: latest.blockhash,
    instructions: [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityMicroLamports }),
      createInstruction
    ]
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([mint]);

  const simulation = await connection.simulateTransaction(transaction, {
    commitment: 'confirmed',
    sigVerify: false
  });
  if (simulation.value.err) {
    throw new Error('Pump token-creation simulation failed: ' + simulationMessage(simulation));
  }

  onPhase?.('sign');
  const signedTransaction = await wallet.provider.signTransaction(transaction);
  if (!signedTransaction || typeof signedTransaction.serialize !== 'function') {
    throw new Error('The wallet did not return a signed transaction.');
  }
  const signature = await connection.sendRawTransaction(signedTransaction.serialize(), {
    preflightCommitment: 'confirmed',
    maxRetries: 3
  });
  onPhase?.('submitted', { signature });

  let confirmation;
  try {
    confirmation = await connection.confirmTransaction({
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight
    }, 'confirmed');
  } catch (error) {
    throw new Error(`Transaction ${signature} was submitted but not confirmed. Check its status before retrying. ${error?.message || ''}`.trim());
  }
  if (confirmation.value.err) {
    throw new Error(`Transaction ${signature} failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }

  return { mint: mint.publicKey.toBase58(), signature };
}

window.SpawnLaunch = Object.freeze({ createToken });