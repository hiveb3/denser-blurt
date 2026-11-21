/**
 * Converts operations built by @hiveio/wax (HF26 / NAI JSON, as returned by
 * `txBuilder.toApi()`) into Blurt legacy operations ([name, payload] tuples
 * with "1.000 BLURT" assets) that the Blurt serializer understands.
 *
 * Hive and Blurt share the operation *names* but not the numeric ids, so wax
 * cannot serialize/sign for Blurt; dblurt does that from these tuples.
 */
import { BLURT_PRECISION, NAI_BLURT, NAI_HBD, NAI_VESTS, VESTS_PRECISION } from './config';
import { hiveToBlurt } from './rpc-shim';

export type BlurtOperation = [string, Record<string, any>];

export class BlurtUnsupportedOperationError extends Error {
  constructor(what: string) {
    super(`Not available on Blurt: ${what}`);
    this.name = 'BlurtUnsupportedOperationError';
  }
}

/** Operations that exist on Blurt (dblurt serializer list) */
const BLURT_OPERATIONS = new Set([
  'vote', 'comment', 'transfer', 'transfer_to_vesting', 'withdraw_vesting', 'account_create',
  'account_update', 'witness_update', 'account_witness_vote', 'account_witness_proxy',
  'delete_comment', 'custom_json', 'comment_options', 'set_withdraw_vesting_route', 'claim_account',
  'create_claimed_account', 'request_account_recovery', 'recover_account', 'change_recovery_account',
  'escrow_transfer', 'escrow_dispute', 'escrow_release', 'escrow_approve', 'transfer_to_savings',
  'transfer_from_savings', 'cancel_transfer_from_savings', 'claim_reward_balance',
  'delegate_vesting_shares', 'witness_set_properties', 'create_proposal', 'update_proposal_votes',
  'remove_proposal'
]);

/** custom_json ids that only make sense on Hive */
const HIVE_ONLY_CUSTOM_JSON = new Set(['rc']);

const isNai = (v: any) => v && typeof v === 'object' && typeof v.nai === 'string' && 'amount' in v;

const fmt = (amount: string, precision: number) => {
  const neg = amount.startsWith('-');
  const digits = (neg ? amount.slice(1) : amount).padStart(precision + 1, '0');
  const int = digits.slice(0, digits.length - precision);
  const dec = digits.slice(digits.length - precision);
  return `${neg ? '-' : ''}${int}.${dec}`;
};

/** NAI asset → legacy Blurt asset string */
export function naiToBlurt(asset: { amount: string; precision: number; nai: string }, context: string): string {
  switch (asset.nai) {
    case NAI_BLURT:
      return `${fmt(String(asset.amount), BLURT_PRECISION)} BLURT`;
    case NAI_VESTS:
      return `${fmt(String(asset.amount), VESTS_PRECISION)} VESTS`;
    case NAI_HBD:
      if (String(asset.amount) === '0') return `0.000 BLURT`;
      throw new BlurtUnsupportedOperationError(`HBD amounts (${context})`);
    default:
      throw new BlurtUnsupportedOperationError(`asset ${asset.nai} (${context})`);
  }
}

function convertAssets(value: any, context: string): any {
  if (isNai(value)) return naiToBlurt(value, context);
  if (typeof value === 'string') {
    // legacy strings coming from wax helpers
    const m = value.match(/^(-?\d+\.\d{3}) (HIVE|STEEM)$/);
    if (m) return `${m[1]} BLURT`;
    if (/^(-?\d+\.\d{3}) (HBD|SBD)$/.test(value)) throw new BlurtUnsupportedOperationError(`HBD amounts (${context})`);
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => convertAssets(v, context));
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) out[k] = convertAssets(v, context);
    return out;
  }
  return value;
}

/** wax extension objects {type, value} → legacy static_variant [index, value] */
function convertCommentOptionsExtensions(extensions: any[] = []): any[] {
  return extensions.map((ext) => {
    if (Array.isArray(ext)) return ext;
    if (ext?.type === 'comment_payout_beneficiaries' || ext?.type === 'comment_payout_beneficiaries_extension') {
      return [0, { beneficiaries: ext.value?.beneficiaries ?? [] }];
    }
    throw new BlurtUnsupportedOperationError(`comment_options extension ${ext?.type}`);
  });
}

function convertOne(name: string, value: Record<string, any>): BlurtOperation {
  let op = name.replace(/_operation$/, '');
  let v: Record<string, any> = { ...value };

  switch (op) {
    case 'account_update2': {
      // Blurt's account_update already carries posting_json_metadata,
      // but it needs the ACTIVE key (Hive's account_update2 only needs posting).
      op = 'account_update';
      v = {
        account: v.account,
        owner: v.owner,
        active: v.active,
        posting: v.posting,
        memo_key: v.memo_key,
        json_metadata: v.json_metadata ?? '',
        posting_json_metadata: v.posting_json_metadata ?? '',
        extensions: []
      };
      break;
    }
    case 'account_update':
      v.posting_json_metadata ??= '';
      break;
    case 'comment_options': {
      const max = v.max_accepted_payout;
      // HBD-denominated payout cap → same cap in BLURT ("0.000" = decline payout)
      if (isNai(max) && max.nai === NAI_HBD) v.max_accepted_payout = { ...max, nai: NAI_BLURT };
      if (typeof max === 'string') v.max_accepted_payout = max.replace(/ (HBD|SBD)$/, ' BLURT');
      delete v.percent_hbd;
      delete v.percent_steem_dollars;
      v.extensions = convertCommentOptionsExtensions(v.extensions);
      break;
    }
    case 'claim_reward_balance': {
      v = {
        account: v.account,
        reward_blurt: v.reward_hive ?? v.reward_steem ?? v.reward_blurt,
        reward_vests: v.reward_vests
      };
      break;
    }
    case 'vote':
      if (Number(v.weight) < 0) throw new BlurtUnsupportedOperationError('downvotes');
      break;
    case 'custom_json':
      if (HIVE_ONLY_CUSTOM_JSON.has(v.id)) throw new BlurtUnsupportedOperationError(`custom_json "${v.id}" (Resource Credits)`);
      break;
    default:
      break;
  }

  if (!BLURT_OPERATIONS.has(op)) throw new BlurtUnsupportedOperationError(`operation ${op}`);

  // drop undefined optionals, convert assets and key prefixes
  for (const k of Object.keys(v)) if (v[k] === undefined) delete v[k];
  return [op, hiveToBlurt(convertAssets(v, op))];
}

/**
 * @param apiTx result of `JSON.parse(txBuilder.toApi())` (or the object itself)
 */
export function waxTransactionToBlurtOperations(apiTx: any): BlurtOperation[] {
  const tx = typeof apiTx === 'string' ? JSON.parse(apiTx) : apiTx;
  return (tx.operations || []).map((o: any) => {
    if (Array.isArray(o)) return convertOne(o[0], o[1]);
    return convertOne(o.type, o.value);
  });
}
