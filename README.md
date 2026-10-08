# MatchLink

MatchLink turns a donation link into an atomic Solana donation: the donor's SPL-token transfer and the sponsor's matching transfer land in the recipient wallet in the same transaction. Campaign rules and the matching pool are transparent on-chain; the share link is an Actions/Blinks endpoint with a regular web fallback.

**Hackathon MVP scope:** devnet and test tokens only. No mainnet funds, custodial backend, identity checks, price oracle, multi-token campaigns, quadratic matching, refunds, or Sybil-proofing.

## How the MVP works

1. The sponsor creates a campaign with a fixed SPL mint, recipient, expiry, match rate, per-donation ceiling, per-wallet ceiling, and a test-token pool in one wallet transaction.
2. Sponsor tokens go to a campaign PDA's associated-token vault. Both per-donation and per-wallet match caps are enforced on-chain.
3. A donor opens the Action, chooses an amount, and signs. The program transfers the donation and the capped available match to the recipient atomically.
4. Anyone can inspect campaign counters and vault balance. After expiry, the sponsor can close the campaign from its page and reclaim any residual pool.

The initial safety rule rejects a donation when donor == recipient. It does not stop Sybil wallets or a sponsor from coordinating with donors. Avoid volatile tokens: the contract uses token units, not USD prices.

## Repository map

- `programs/matchlink` — Anchor program source.
- `app` — Next.js campaign page and Actions endpoints.
- `lib` — Solana address, parsing, and transaction helpers.
- `PLAN.md` — approved development plan and stage status.

## Run the web app

Requirements: Node.js 20+ and npm.

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Create a campaign at `/create` after the program is deployed and a test mint is funded. Set `NEXT_PUBLIC_PROGRAM_ID` after building/deploying the Anchor program. The home page uses live devnet reads when a campaign address is provided in the URL or environment; otherwise it clearly shows a preview state.

## Build and deploy the program

Requirements: Rust, Solana CLI, Anchor CLI, and a devnet keypair funded only with test SOL. Review `Anchor.toml`, then:

```powershell
anchor build
anchor keys sync
anchor build
solana config set --url devnet
anchor deploy
```

Never point this demo at mainnet or use a wallet holding real assets. The program ID in `Anchor.toml` is a placeholder until generated with `anchor keys sync`; copy the generated address into `.env.local` as `NEXT_PUBLIC_PROGRAM_ID`.

## Actions/Blinks

The API implements the Solana Actions GET/POST contract and CORS preflight. Set `NEXT_PUBLIC_APP_URL` to the public origin before sharing, and add that origin's `/actions.json` to a supported Actions client. The browser page is the fallback for clients that render a plain link. Exact host support varies by social client and wallet.

## Hackathon demo checklist

- Build and deploy on devnet; publish the generated program ID and IDL.
- Create a test SPL mint and campaign, fund the vault, and configure a short expiry.
- Share the action URL and QR.
- From a separate donor wallet, donate 5 tokens; show recipient +10 (subject to the configured cap) and pool -5 in the same confirmed transaction.
- Show the transaction signature, campaign account, and vault balance in an explorer.
- Include an ordinary-browser fallback and keep a short screen recording in case the social client lacks Blink rendering.

## Current status

The source and web/Blink flows are implemented. TypeScript type checking passes. Production bundling in this managed Windows environment is blocked because SWC cannot canonicalize workspace paths (OS access denied); Anchor compilation, deployment, and the end-to-end devnet transaction also require the missing Rust/Anchor/Solana toolchain and a test wallet. See `PLAN.md` for stage status.
