# MatchLink implementation plan

This repository implements the approved Donation Blink MVP plan. Scope is devnet/test tokens only; no real funds, mainnet, or deployment using the user's wallet.

## Product rules for the MVP

- One SPL token mint per campaign; campaign authority is the sponsor.
- A sponsor funds the campaign vault before sharing a link.
- Default match is 1:1, bounded by per-donation and per-wallet caps and available vault balance.
- Each donation and its match are executed atomically by one Solana program instruction.
- Donor and recipient cannot be the same wallet. This is a basic self-dealing guard, not Sybil resistance.
- After the campaign ends, the sponsor can reclaim the unspent pool.
- Campaign content is presentation metadata; balances, limits, counters, mint, and recipient are on-chain.

## Stages

1. **MVP rules and threat boundaries** — documented above and in README.
2. **On-chain program** — Anchor program with campaign PDA, sponsor-funded token vault, per-wallet stats PDA, atomic donation/match, and post-expiry residual withdrawal.
3. **Web and Blink** — Next.js sponsor campaign creation/funding flow, donor experience, shareable QR/link, and Solana Actions GET/POST/OPTIONS endpoints.
4. **Campaign state** — read campaign/vault state from Solana; keep descriptive metadata off-chain.
5. **Devnet demonstration** — create/fund a campaign, donate 5 test tokens, observe recipient +10 and pool -5.
6. **Demo package** — setup guide, limitations, and hackathon walkthrough checklist.

## Status

- [x] Stage 1 — rules recorded.
- [x] Stage 2 — Anchor source and account/instruction design authored.
- [x] Stage 3 — web UI and Actions endpoints authored.
- [x] Stage 4 — chain read paths authored.
- [ ] Stage 5 — blocked pending Rust/Anchor/Solana CLI and a deployer-controlled devnet wallet.
- [x] Stage 6 — README and demo checklist authored.

## Verification notes

No secrets or wallet files are read. The current machine has Node/npm but no `rustc`, `cargo`, `anchor`, or `solana` command. TypeScript checking passes. Next.js production bundling is blocked because SWC receives OS access denied while canonicalizing this managed Windows workspace path. `npm audit` reports five moderate advisories and no high or critical findings after removing the affected optional SDK dependency. Compiling/deploying the program and signing a devnet transaction also require a Solana toolchain and test wallet.
