/**
 * Blurt chain configuration for the Denser → Blurt port.
 *
 * Every value can be overridden at runtime with the usual REACT_APP_* env vars
 * (see apps/blog/.env.blurt and apps/wallet/.env.blurt).
 */
import env from '@beam-australia/react-env';

/** Blurt mainnet chain id */
export const BLURT_CHAIN_ID = 'cd8d90f29ae273abec3eaa7731e25934c63eb654d55080caff2ebb7f5df6381f';

/** Public key prefix used by Blurt (Hive/Steem use STM) */
export const BLURT_ADDRESS_PREFIX = 'BLT';
export const WAX_ADDRESS_PREFIX = 'STM';

/** Asset symbols */
export const BLURT_SYMBOL = 'BLURT';
export const BLURT_PRECISION = 3;
export const VESTS_PRECISION = 6;

/** NAI identifiers (same numeric NAIs as Steem/Hive) */
export const NAI_BLURT = '@@000000021';
export const NAI_HBD = '@@000000013';
export const NAI_VESTS = '@@000000037';

/**
 * Default RPC nodes. They must be Nexus nodes (Blurt's Hivemind fork) because
 * Denser relies on the `bridge.*` API. First node is the default one.
 */
export const BLURT_DEFAULT_NODES: string[] = (
  env('BLURT_NODES') || 'https://rpc.beblurt.com,https://rpc.blurt.world,https://blurt-rpc.saboin.com'
)
  .split(',')
  .map((n: string) => n.trim().replace(/\/+$/, ''))
  .filter(Boolean);

/** Feature switches: what exists on Blurt and what does not */
export const blurtFeatures = {
  /** No stable coin on Blurt */
  hbd: false,
  /** No internal market (HIVE/HBD) */
  internalMarket: false,
  /** No HBD → HIVE conversions */
  conversions: false,
  /** Blurt uses bandwidth fees paid in BLURT instead of Resource Credits */
  resourceCredits: false,
  /** No recurrent transfers */
  recurrentTransfers: false,
  /** No price feed (no HBD) */
  priceFeed: false,
  /** Blurt has no downvotes */
  downvotes: false,
  /** Communities are served by Nexus */
  communities: true,
  /** DAO proposals exist on Blurt */
  proposals: true,
  /** No Hivesense AI search on Blurt */
  aiSearch: false,
  /** Every transaction burns a small BLURT fee (flat + per kbyte) */
  transactionFees: true
} as const;

/** Labels shown in the UI */
export const blurtLabels = {
  coin: 'BLURT',
  power: 'Blurt Power',
  powerShort: 'BP',
  chainName: 'Blurt'
} as const;

export const isBlurt = (): boolean => (env('CHAIN') || 'blurt').toLowerCase() === 'blurt';
