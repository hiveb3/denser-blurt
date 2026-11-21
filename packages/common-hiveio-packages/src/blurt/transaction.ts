/**
 * Builds, hashes and broadcasts Blurt transactions.
 *
 * Flow used by TransactionService (packages/transaction):
 *   1. wax builds and validates the operations as usual (same UI code as Hive)
 *   2. waxTransactionToBlurtOperations() turns them into Blurt legacy ops
 *   3. prepareBlurtTransaction() adds TaPoS from a Blurt node and computes the
 *      Blurt signing digest (Blurt chain id + Blurt serializer)
 *   4. the existing signer (WIF / hb-auth safe storage) signs that digest
 *   5. broadcastBlurtTransaction() sends it with condenser_api
 */
import { cryptoUtils, type Transaction, type SignedTransaction } from '@beblurt/dblurt';
import { BLURT_CHAIN_ID, BLURT_DEFAULT_NODES } from './config';
import { BlurtOperation } from './operations';

export interface PreparedBlurtTransaction {
  transaction: Transaction;
  digest: string;
  transactionId: string;
}

let rpcEndpoint: string = BLURT_DEFAULT_NODES[0];
export const setBlurtBroadcastEndpoint = (endpoint: string) => {
  rpcEndpoint = endpoint.replace(/\/+$/, '');
};
export const getBlurtBroadcastEndpoint = () => rpcEndpoint;

let rpcId = 1;
async function rpc<T = any>(method: string, params: any): Promise<T> {
  const nodes = [rpcEndpoint, ...BLURT_DEFAULT_NODES.filter((n) => n !== rpcEndpoint)];
  let lastError: unknown;
  for (const node of nodes) {
    try {
      // NOTE: goes through the RPC shim, but condenser_api answers are not renamed
      // in a way that matters here (head_block_id / head_block_number are untouched)
      const res = await fetch(node, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: rpcId++, method, params })
      });
      const json = await res.json();
      if (json.error) {
        const err = new Error(json.error.message || 'Blurt RPC error');
        (err as any).data = json.error.data;
        (err as any).code = json.error.code;
        throw err;
      }
      return json.result as T;
    } catch (e: any) {
      lastError = e;
      // RPC application errors (assert failures, missing auth...) must not be retried on another node
      if (e && typeof e === 'object' && 'code' in e) throw e;
    }
  }
  throw lastError;
}

const chainIdBuffer = () => Buffer.from(BLURT_CHAIN_ID, 'hex');

export async function prepareBlurtTransaction(
  operations: BlurtOperation[],
  expireInSeconds = 60
): Promise<PreparedBlurtTransaction> {
  const props = await rpc<any>('condenser_api.get_dynamic_global_properties', []);
  const headBlockId: string = props.head_block_id;
  const ref_block_num = props.head_block_number & 0xffff;
  const ref_block_prefix = Buffer.from(headBlockId, 'hex').readUInt32LE(4);
  const expiration = new Date(new Date(props.time + 'Z').getTime() + expireInSeconds * 1000)
    .toISOString()
    .slice(0, -5);

  const transaction: Transaction = {
    ref_block_num,
    ref_block_prefix,
    expiration,
    operations: operations as any,
    extensions: []
  };

  const digest = cryptoUtils.transactionDigest(transaction, chainIdBuffer()).toString('hex');
  const transactionId = cryptoUtils.generateTrxId(transaction);
  return { transaction, digest, transactionId };
}

export async function broadcastBlurtTransaction(
  prepared: PreparedBlurtTransaction,
  signatures: string[]
): Promise<{ transactionId: string }> {
  const signed: Omit<SignedTransaction, 'transaction_id' | 'block_num' | 'transaction_num'> = {
    ...prepared.transaction,
    signatures
  };
  await rpc('condenser_api.broadcast_transaction', [signed]);
  return { transactionId: prepared.transactionId };
}

/**
 * Estimated BLURT fee for a set of operations (Blurt burns a flat fee per
 * operation plus a fee per kbyte, both set by witnesses).
 */
export async function estimateBlurtFee(operations: BlurtOperation[]): Promise<string> {
  const witnessProps = await rpc<any>('condenser_api.get_chain_properties', []);
  const parse = (a: any) => parseFloat(String(a ?? '0').split(' ')[0]) || 0;
  const flat = parse(witnessProps.operation_flat_fee);
  const perKb = parse(witnessProps.bandwidth_kbytes_fee);
  const bytes = new TextEncoder().encode(JSON.stringify(operations)).length;
  const fee = flat * operations.length + perKb * Math.max(1, bytes / 1024);
  return `${fee.toFixed(3)} BLURT`;
}
