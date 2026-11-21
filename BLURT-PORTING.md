# Denser → Blurt port

Fork of [openhive-network/denser](https://github.com/openhive-network/denser) (the code behind **new.hive.blog**) adapted to the **Blurt** blockchain. Branch: `blurt`.

The goal is to keep the upstream UI unchanged where possible and isolate every chain difference in a thin compatibility layer. That makes it easier to merge upstream updates later.

## How it works

```
UI (unchanged)
  │
  ├─ reads ──► wax API client ──► fetch ──► [Blurt RPC shim] ──► Blurt Nexus node
  │                                              ▲ translates Blurt ⇄ Hive shapes
  │
  └─ writes ─► TransactionService.processHiveAppOperation
                 1. wax builds and validates the ops (same code as Hive)
                 2. waxTransactionToBlurtOperations()  → Blurt legacy ops
                 3. prepareBlurtTransaction()          → TaPoS + Blurt digest (dblurt)
                 4. signer.signDigest()                → WIF / hb-auth safe storage
                 5. broadcastBlurtTransaction()        → condenser_api.broadcast_transaction
```

Code: `packages/common-hiveio-packages/src/blurt/`

| File | What it does |
|---|---|
| `config.ts` | chain id `cd8d90f2…381f`, `BLT` prefix, Nexus nodes, feature switches |
| `rpc-shim.ts` | wraps `fetch`: `reward_blurt_*`→`reward_hive_*`, `BLT…`→`STM…` keys, `"x BLURT"`→`"x HIVE"`, zero HBD fields, fake answers for `rc_api`, feed history, market |
| `operations.ts` | wax HF26 ops → Blurt ops (NAI→`BLURT`/`VESTS`, `account_update2`→`account_update`, `claim_reward_balance` fields, `comment_options` without `percent_hbd`; blocks downvotes, HBD, RC, convert, market) |
| `transaction.ts` | Blurt serialization, digest and broadcast via `@beblurt/dblurt`, node failover, fee estimate |

UI labels: `packages/ui/lib/chain-labels.ts` (`COIN`, `POWER`, `HAS_HBD`, `HAS_RC`, `HAS_MARKET`, `HAS_DOWNVOTES`, `HAS_PRICE_FEED`). `REACT_APP_CHAIN=hive` brings back the original Hive behaviour.

## Hive vs Blurt differences handled

| Topic | Hive | Blurt | In the port |
|---|---|---|---|
| Op ids / serialization | Hive ids | different ids (e.g. `account_create`=5) | own serializer (dblurt) |
| Chain id | `beeab0de…` | `cd8d90f2…` | `site.ts`, `.env.blurt` |
| Key prefix | `STM` | `BLT` | shim converts both ways |
| Coin | HIVE / HBD | BLURT only | HBD rows, select options, market hidden |
| Power | Hive Power (HP) | Blurt Power (BP) | labels + locales |
| Downvotes | yes | **no** | downvote button hidden, op blocked |
| Resource Credits | yes | no: BLURT fee per tx | RC row hidden, `rc_api` emulated |
| Price feed / $ value | yes | no | "estimated value" row hidden |
| Internal market | yes | no | menu/links hidden |
| Communities | Hivemind | Nexus | works through `bridge.*` |
| Profile update | `account_update2` (posting) | `account_update` (**active key**) | converted |
| Login | Keychain, PeakVault, MetaMask, Google, HiveAuth, hb-auth, WIF | — | only **hb-auth safe storage** and **WIF** |
| AI search (Hivesense) | yes | no | `REACT_APP_AI_DOMAIN=""` |

## Run

```bash
./scripts/blurt-setup.sh dev      # blog http://localhost:3000, wallet http://localhost:4000
./scripts/blurt-setup.sh build && ./scripts/blurt-setup.sh start
```

Requirements: Node 20, pnpm 10, access to the `@hiveio` registry on gitlab.syncad.com (see `.npmrc`).
The first `pnpm install` must run with `--no-frozen-lockfile`, because `@beblurt/dblurt` is new; commit the updated `pnpm-lock.yaml` afterwards.

## To do (phase 2)

- [ ] First full build + smoke tests on a real Blurt account (vote, comment, post, transfer, power up, claim)
- [ ] Check hb-auth key verification against `BLT` keys (it uses the main-thread chain, so it should go through the shim)
- [ ] Show the estimated BLURT fee before signing (`estimateBlurtFee()` is ready, UI missing)
- [ ] Replace `wax.formatter` "HIVE" labels in the blog (payouts, author rewards)
- [ ] Blurt image upload endpoint (proxy defaults to `imgp.blurt.world`)
- [ ] Remove/hide remaining Hive-only pages: `/market`, RC delegations, HBD conversions, recurrent transfers
- [ ] Footer and links (whitepaper, dApps, explorer) pointing to Blurt resources
- [ ] Logo, favicon, colours
- [ ] Optional: a Blurt browser-extension signer (e.g. Whale Vault) if there is demand
- [ ] Update playwright fixtures (they are recorded from Hive)
