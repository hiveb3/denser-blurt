/**
 * Blurt compatibility shim for the JSON-RPC layer.
 *
 * Denser talks to the chain through @hiveio/wax, which expects Hive-shaped
 * data. Blurt (a Steem 0.23 fork) returns almost the same structures, with a
 * few systematic differences that this shim irons out *on the wire*, so the
 * rest of the code base keeps working unchanged:
 *
 *  - field names:   reward_blurt_balance  → reward_hive_balance, ... (*blurt* → *hive*)
 *  - public keys:   BLT…                  → STM… (same key, different prefix)
 *  - legacy assets: "1.000 BLURT"         → "1.000 HIVE"
 *  - missing HBD fields are added as zero balances
 *  - Hive-only APIs (rc_api, feed history, hivesense…) get neutral answers
 *
 * Outgoing parameters get the opposite treatment (STM → BLT, hive → blurt).
 * Transactions are NOT sent through this shim: they are built and signed with
 * the Blurt serializer in ./transaction.ts.
 */
import { BLURT_ADDRESS_PREFIX, WAX_ADDRESS_PREFIX, BLURT_DEFAULT_NODES, NAI_HBD } from './config';

const KEY_RE = /^(BLT|STM)([1-9A-HJ-NP-Za-km-z]{50})$/;
const LEGACY_BLURT_RE = /^(-?\d+\.\d{3}) BLURT$/;

/** Response: Blurt → Hive shape */
export function blurtToHive(value: any): any {
  if (Array.isArray(value)) return value.map(blurtToHive);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      // only whole tokens: reward_blurt_balance → reward_hive_balance (not reblurted_by)
      const key = k.replace(/(^|_)blurt(?=_|$)/g, '$1hive');
      out[key] = blurtToHive(v);
    }
    addMissingHiveFields(out);
    return out;
  }
  if (typeof value === 'string') {
    const key = value.match(KEY_RE);
    if (key && key[1] === BLURT_ADDRESS_PREFIX) return WAX_ADDRESS_PREFIX + key[2];
    const asset = value.match(LEGACY_BLURT_RE);
    if (asset) return `${asset[1]} HIVE`;
  }
  return value;
}

/** Request params: Hive → Blurt shape */
export function hiveToBlurt(value: any): any {
  if (Array.isArray(value)) return value.map(hiveToBlurt);
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = hiveToBlurt(v);
    return out;
  }
  if (typeof value === 'string') {
    const key = value.match(KEY_RE);
    if (key && key[1] === WAX_ADDRESS_PREFIX) return BLURT_ADDRESS_PREFIX + key[2];
  }
  return value;
}

const zeroLike = (sample: any): any =>
  typeof sample === 'string' ? '0.000 HBD' : { amount: '0', precision: 3, nai: NAI_HBD };

/** Adds the HBD fields Hive code expects but Blurt does not have */
function addMissingHiveFields(o: Record<string, any>) {
  // Accounts (database_api.find_accounts / condenser_api.get_accounts)
  if ('balance' in o && 'vesting_shares' in o && 'savings_balance' in o) {
    const z = zeroLike(o.balance);
    o.hbd_balance ??= z;
    o.savings_hbd_balance ??= z;
    o.reward_hbd_balance ??= z;
    o.hbd_seconds ??= '0';
    o.savings_hbd_seconds ??= '0';
    o.hbd_seconds_last_update ??= '1970-01-01T00:00:00';
    o.hbd_last_interest_payment ??= '1970-01-01T00:00:00';
    o.savings_hbd_seconds_last_update ??= '1970-01-01T00:00:00';
    o.savings_hbd_last_interest_payment ??= '1970-01-01T00:00:00';
    o.downvote_manabar ??= o.voting_manabar;
    o.posting_json_metadata ??= o.json_metadata ?? '';
  }
  // Dynamic global properties
  if ('head_block_number' in o && 'total_vesting_fund_hive' in o) {
    const z = zeroLike(o.current_supply);
    o.current_hbd_supply ??= z;
    o.init_hbd_supply ??= z;
    o.hbd_interest_rate ??= 0;
    o.hbd_print_rate ??= 0;
    o.hbd_stop_percent ??= 0;
    o.hbd_start_percent ??= 0;
    o.downvote_pool_percent ??= 0;
  }
}

/** Neutral answers for APIs that do not exist on Blurt */
function emulate(method: string, params: any): any | undefined {
  switch (method) {
    case 'rc_api.find_rc_accounts':
      return {
        rc_accounts: (params?.accounts || []).map((account: string) => ({
          account,
          rc_manabar: { current_mana: '1', last_update_time: 0 },
          max_rc_creation_adjustment: { amount: '0', precision: 6, nai: '@@000000037' },
          max_rc: '1',
          delegated_rc: 0,
          received_delegated_rc: 0
        }))
      };
    case 'rc_api.list_rc_direct_delegations':
      return { rc_direct_delegations: [] };
    case 'database_api.get_feed_history':
      return {
        id: 0,
        current_median_history: {
          base: { amount: '1000', precision: 3, nai: NAI_HBD },
          quote: { amount: '1000', precision: 3, nai: '@@000000021' }
        },
        market_median_history: {
          base: { amount: '1000', precision: 3, nai: NAI_HBD },
          quote: { amount: '1000', precision: 3, nai: '@@000000021' }
        },
        current_min_history: null,
        current_max_history: null,
        price_history: []
      };
    case 'database_api.list_limit_orders':
      return { orders: [] };
    case 'database_api.find_hbd_conversion_requests':
    case 'database_api.find_collateralized_conversion_requests':
      return { requests: [] };
    case 'database_api.find_recurrent_transfers':
      return { recurrent_transfers: [] };
    default:
      return undefined;
  }
}

const isRpcUrl = (url: string): boolean => {
  if (BLURT_DEFAULT_NODES.some((n) => url.startsWith(n))) return true;
  if (typeof window === 'object' && window.localStorage) {
    try {
      const custom = JSON.parse(window.localStorage.getItem('node-endpoint') || 'null');
      if (custom && url.startsWith(custom)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
};

let installed = false;

/**
 * Wraps globalThis.fetch so every JSON-RPC call to a Blurt node is translated.
 * Idempotent; safe in SSR and in the browser.
 */
export function installBlurtRpcShim(extraEndpoints: string[] = []): void {
  if (installed || typeof globalThis.fetch !== 'function') return;
  installed = true;
  const originalFetch = globalThis.fetch.bind(globalThis);
  const endpoints = extraEndpoints.map((e) => e.replace(/\/+$/, ''));

  globalThis.fetch = async (input: any, init?: any): Promise<Response> => {
    const url = typeof input === 'string' ? input : input?.url || String(input);
    const isRpc = isRpcUrl(url) || endpoints.some((e) => url.startsWith(e));
    if (!isRpc || !init?.body || typeof init.body !== 'string') return originalFetch(input, init);

    let payload: any;
    try {
      payload = JSON.parse(init.body);
    } catch {
      return originalFetch(input, init);
    }
    if (!payload || payload.jsonrpc !== '2.0') return originalFetch(input, init);

    const single = !Array.isArray(payload);
    const calls: any[] = single ? [payload] : payload;

    // Answer emulated calls locally, forward the rest
    const local = new Map<number, any>();
    const forward: any[] = [];
    calls.forEach((c, i) => {
      const fake = emulate(c.method, c.params);
      if (fake !== undefined) local.set(i, { jsonrpc: '2.0', id: c.id, result: fake });
      else forward.push({ ...c, params: hiveToBlurt(c.params) });
    });

    let remote: any[] = [];
    if (forward.length) {
      const res = await originalFetch(input, {
        ...init,
        body: JSON.stringify(single ? forward[0] : forward)
      });
      const json = await res.json();
      remote = Array.isArray(json) ? json : [json];
    }

    let r = 0;
    const merged = calls.map((_c, i) => (local.has(i) ? local.get(i) : blurtToHive(remote[r++])));
    return new Response(JSON.stringify(single ? merged[0] : merged), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  };
}
