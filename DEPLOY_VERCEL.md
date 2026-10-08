# Deploy MatchLink to Vercel

MatchLink is a Next.js application, so Vercel can detect the framework and use the existing `npm run build` script without a custom adapter or output-directory override. The repository root is the app root.

## Before importing the repository

The web app and Actions endpoints can deploy independently from the Anchor program, but campaign creation and donations need a real program deployed to Solana devnet. `Anchor.toml` currently contains a placeholder program ID. Do not treat the app as demo-ready until the program has been built, reviewed, deployed, and exercised with test tokens.

1. Build and deploy the Anchor program to devnet using a test-only deployer wallet.
2. Record the generated program ID and make sure the Anchor IDL/program address agree.
3. Prepare a devnet SPL mint, test-token balances, and (optionally) a campaign address for the home page.
4. Do not use a mainnet wallet, real funds, or private keys as Vercel environment variables.

The Anchor program is not built by Vercel's Next.js build. Deploy it separately with the Solana/Anchor toolchain before enabling the full app flow.

## Import into Vercel

1. In Vercel, import `Eunoia-SSS/Copilot-Skill` from GitHub.
2. Set **Root Directory** to `.` and **Framework Preset** to **Next.js**.
3. Leave the detected install/build/output settings at their defaults. The project uses `package-lock.json` and the `build` script in `package.json`.
4. Add the environment variables below to **Preview** and **Production**. Use devnet values in both until a separate, deliberately configured environment is ready.
5. Deploy. Vercel builds from the connected Git branch and gives Preview deployments their own URL.

## Environment variables

| Variable | Required | Value |
| --- | --- | --- |
| `NEXT_PUBLIC_SOLANA_CLUSTER` | Yes | `devnet` |
| `NEXT_PUBLIC_PROGRAM_ID` | Yes for campaign and donation flows | The actual deployed devnet Anchor program ID; replace the `Anchor.toml` placeholder after deployment |
| `SOLANA_RPC_URL` | No | Devnet RPC URL for server-side route handlers; defaults to `https://api.devnet.solana.com` |
| `NEXT_PUBLIC_CAMPAIGN_ADDRESS` | No | Existing devnet campaign account to show on the home page; leave unset to show the preview state |

`NEXT_PUBLIC_PROGRAM_ID` is public configuration, not a secret. Never add a wallet keypair, seed phrase, or private key. The app constructs Actions URLs and icon URLs from the incoming request origin, so Preview deployments do not need a hard-coded production base URL.

When adding or changing Vercel variables, create a new deployment for the changes to take effect. `NEXT_PUBLIC_*` values are embedded during the build and are not runtime-switchable.

## Verify a deployment

After Vercel reports a successful build:

1. Open `/` and confirm the preview state or configured campaign loads.
2. Open `/actions.json`; its relative `apiPath` should resolve to the Actions endpoint on the current deployment's hostname.
3. Once a devnet campaign exists, open `/api/campaign/<CAMPAIGN_ADDRESS>` and confirm it returns the public campaign state.
4. Open `/api/actions/<CAMPAIGN_ADDRESS>` and confirm it returns an Actions response. A 400 before a valid campaign is configured is expected.
5. Test campaign creation and a small donation with separate devnet wallets, then confirm the transaction and token balances in Solana Explorer.

The MVP is devnet/test-token only. A successful Vercel build does not compile, deploy, or audit the Anchor program.

## Local preflight

Run from the repository root with Node.js 20.9 or newer:

```sh
npm ci
npm run typecheck
npm run build
```
