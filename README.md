# babylon-toolkit-e2e

Playwright E2E test suite for the Babylon Vault webapp, derived directly from the [product intent specification](./stories.yaml).

## Overview

This suite is the **machine-verifiable proof** that the implementation satisfies the specification. Every `test()` call maps to one acceptance criterion from a specific story. The `[BT-XX]` prefix in test titles enables deterministic mapping by the [Locus audit action](https://github.com/jonybur/locus-audit-action).

## Test naming convention

All test titles use the `[BT-XX]` prefix format:

```
[BT-04] Dashboard shows list of available vault providers fetched from GraphQL
[BT-06] If ETH transaction fails, BTC Pre-PegIn transaction is NOT broadcast
```

This allows `locus-audit-action@v1` to match tests back to stories deterministically without AI inference.

## Coverage

| Story | Title | Section |
|-------|-------|---------|
| BT-01 | User can connect a Bitcoin wallet | Wallet Connection |
| BT-02 | User can connect an Ethereum wallet | Wallet Connection |
| BT-03 | User can disconnect wallets | Wallet Connection |
| BT-04 | User selects a vault provider and deposit amount | Deposit Flow |
| BT-05 | Deposit step 1 — Proof-of-Possession signing | Deposit Flow |
| BT-06 | Deposit step 2 — Ethereum vault registration | Deposit Flow |
| BT-07 | Deposit step 3 — Pre-PegIn BTC transaction broadcast | Deposit Flow |
| BT-08 | Deposit step 4 — WOTS key submission and payout signing | Deposit Flow |
| BT-09 | Deposit step 5 — Vault artifact download | Deposit Flow |
| BT-10 | Deposit step 6 — Vault activation (HTLC secret reveal) | Deposit Flow |
| BT-21 | Sanctioned addresses are blocked from depositing | Compliance |
| BT-22 | Users in restricted jurisdictions are geofenced | Compliance |

### Not yet covered (to be added in subsequent ticks)

- BT-11: User can view active vaults and deposit positions (Vault Lifecycle)
- BT-12: User can resume an interrupted deposit (Vault Lifecycle)
- BT-13: User can supply vaultBTC as Aave collateral (Aave Integration)
- BT-14: User can borrow against Aave collateral (Aave Integration)
- BT-15: User can repay Aave debt (Aave Integration)
- BT-16: User can monitor Aave position health (Position Monitoring)
- BT-17: Cascade risk simulation (Position Monitoring)
- BT-18: User can initiate a vault withdrawal (Withdrawal)
- BT-19: User can monitor pegout status (Withdrawal)
- BT-20: User can view transaction activity log (Activity Log)
- BT-23: User can navigate between registered DeFi applications (Application Selection)

## How to run

```bash
# Install dependencies
npm install

# Install Playwright browsers (Chromium only for CI)
npx playwright install chromium

# Run all tests
npm test

# Run with HTML report
npm test -- --reporter=html

# Run CI mode (GitHub Actions annotations)
npm run test:ci

# Run a specific file
npx playwright test services/vault/e2e/deposit-flow.spec.ts

# Run tests matching a story
npx playwright test --grep "\\[BT-06\\]"
```

## Architecture

```
babylon-toolkit-e2e/
├── stories.yaml                         # Spec source of truth (23 stories, BT-01 to BT-23)
├── playwright.config.ts                 # Chromium-only, fullyParallel: false
├── global-setup.ts                      # Logs coverage info on startup
├── mocks/
│   ├── wallet-providers.ts              # window.okxwallet, window.unisat, window.ethereum
│   └── blockchain.ts                    # GraphQL, geolocation, sanctions, BTC RPC mocks
└── services/vault/e2e/
    ├── wallet-connection.spec.ts        # BT-01, BT-02, BT-03
    ├── deposit-flow.spec.ts             # BT-04 through BT-10 (critical path)
    └── compliance.spec.ts              # BT-21, BT-22
```

## Mock strategy

All wallet providers and blockchain calls are mocked:

- **Window mocks** (`mocks/wallet-providers.ts`): OKX, Unisat, and MetaMask injected via `page.addInitScript()` before any page code runs
- **Route mocks** (`mocks/blockchain.ts`): GraphQL, geolocation API, sanctions check, Bitcoin RPC — all intercepted via `page.route()`
- **Override helpers**: `mockEthTransactionFail()`, `mockSanctionedAddress()`, `mockRestrictedJurisdiction()`, `mockActivationHashMismatch()` for error-path tests

Tests run in CI without a live blockchain connection.

## CI integration

The CI workflow should:

1. Start the app: `npm run dev` (or `next start`)
2. Run tests: `npm run test:ci`
3. Run Locus audit: `jonybur/locus-audit-action@v1` with `stories-path: stories.yaml`

The audit action reads `test_refs` from `stories.yaml` and matches `[BT-XX]` patterns in test output to produce a deterministic coverage report. See `drafts/babylon-toolkit-locus-audit-workflow.yml` for the full CI workflow template.
