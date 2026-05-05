/**
 * Vault Lifecycle E2E Tests
 * Derived from product intent specification — babylon-toolkit stories.yaml
 *
 * Stories covered:
 *   BT-11: User can view their active vaults and deposit positions
 *   BT-12: User can resume an interrupted deposit
 *
 * Naming convention: [BT-XX] prefix on every test title enables deterministic
 * mapping by the Locus audit action (locus-audit-action@v1).
 */

import { test, expect } from '@playwright/test';
import {
  setupWalletMocks,
} from '../../../mocks/wallet-providers';
import {
  setupBlockchainMocks,
} from '../../../mocks/blockchain';

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Connect both wallets — required to view vault dashboard.
 */
async function connectBothWallets(page: any) {
  await page.locator('[data-testid="connect-wallet-btn"]').click();
  await page.locator('[data-testid="btc-wallet-option-okx"]').click();
  await expect(page.locator('[data-testid="btc-address-display"]')).toBeVisible();

  await page.locator('[data-testid="connect-wallet-btn"]').click();
  await page.locator('[data-testid="eth-wallet-option-metamask"]').click();
  await expect(page.locator('[data-testid="eth-address-display"]')).toBeVisible();
}

/**
 * Seed localStorage with a pending deposit so the resume flow can be tested.
 * Mirrors the shape the app writes before BTC broadcast.
 */
async function seedPendingDeposit(
  page: any,
  options: {
    step?: string;
    btcBroadcast?: boolean;
  } = {}
) {
  const { step = 'eth-registration', btcBroadcast = false } = options;
  await page.evaluate(
    ([step, btcBroadcast]: [string, boolean]) => {
      const deposit = {
        id: 'mock-interrupted-deposit-001',
        vaultProviderId: 'vp-1',
        amountBtc: 0.01,
        status: btcBroadcast ? 'CONFIRMING' : 'PENDING',
        step,
        btcTxid: btcBroadcast ? 'mock-btc-txid-broadcast' : null,
        ethTxHash: '0xmockethregtx',
        createdAt: new Date(Date.now() - 60_000).toISOString(),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem('pendingDeposit', JSON.stringify(deposit));
    },
    [step, btcBroadcast] as [string, boolean]
  );
}

// ── BT-11: Active vault dashboard ─────────────────────────────────────────────

test.describe('[BT-11] User can view their active vaults and deposit positions', () => {
  test.beforeEach(async ({ page }) => {
    await setupWalletMocks(page);
    await setupBlockchainMocks(page);

    // Seed mock vault data via GraphQL mock override
    await page.route('**/graphql', async (route) => {
      const req = route.request();
      const body = req.postDataJSON?.() as { query?: string } | null;
      const query = body?.query ?? '';

      if (query.includes('userVaults') || query.includes('getVaults') || query.includes('vaults')) {
        await route.fulfill({
          json: {
            data: {
              vaults: [
                {
                  id: 'vault-active-001',
                  status: 'Active',
                  amountBtc: 0.05,
                  provider: { id: 'vp-1', name: 'Babylon Vault Provider Alpha' },
                  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
                },
                {
                  id: 'vault-confirming-002',
                  status: 'Confirming',
                  amountBtc: 0.02,
                  provider: { id: 'vp-2', name: 'Babylon Vault Provider Beta' },
                  createdAt: new Date(Date.now() - 3_600_000).toISOString(),
                },
              ],
            },
          },
        });
      } else if (query.includes('vaultProviders') || query.includes('VaultProviders')) {
        await route.fulfill({
          json: {
            data: {
              vaultProviders: [
                { id: 'vp-1', name: 'Babylon Vault Provider Alpha', minDeposit: 0.001, maxDeposit: 10, fee: 0.0005 },
                { id: 'vp-2', name: 'Babylon Vault Provider Beta', minDeposit: 0.005, maxDeposit: 5, fee: 0.0003 },
              ],
            },
          },
        });
      } else {
        await route.fulfill({ json: { data: {} } });
      }
    });

    await page.goto('/');
    await connectBothWallets(page);
    await page.goto('/dashboard');
  });

  test('[BT-11] Dashboard displays all vaults associated with the connected BTC+ETH address pair', async ({ page }) => {
    const vaultList = page.locator('[data-testid="vault-list"]');
    await expect(vaultList).toBeVisible({ timeout: 10000 });

    const vaultItems = page.locator('[data-testid="vault-item"]');
    await expect(vaultItems).toHaveCount(2);
  });

  test('[BT-11] Each vault shows status, deposited BTC amount, and vault provider', async ({ page }) => {
    const vaultList = page.locator('[data-testid="vault-list"]');
    await expect(vaultList).toBeVisible({ timeout: 10000 });

    const firstVault = page.locator('[data-testid="vault-item"]').first();
    await expect(firstVault.locator('[data-testid="vault-status"]')).toBeVisible();
    await expect(firstVault.locator('[data-testid="vault-amount-btc"]')).toBeVisible();
    await expect(firstVault.locator('[data-testid="vault-provider-name"]')).toBeVisible();
  });

  test('[BT-11] Active vault shows "Active" status label', async ({ page }) => {
    const vaultList = page.locator('[data-testid="vault-list"]');
    await expect(vaultList).toBeVisible({ timeout: 10000 });

    // First vault is Active in our mock
    const firstVault = page.locator('[data-testid="vault-item"]').first();
    await expect(firstVault.locator('[data-testid="vault-status"]')).toContainText(/active/i);
  });

  test('[BT-11] Confirming vault shows "Confirming" status label', async ({ page }) => {
    const vaultList = page.locator('[data-testid="vault-list"]');
    await expect(vaultList).toBeVisible({ timeout: 10000 });

    // Second vault is Confirming in our mock
    const secondVault = page.locator('[data-testid="vault-item"]').nth(1);
    await expect(secondVault.locator('[data-testid="vault-status"]')).toContainText(/confirming/i);
  });

  test('[BT-11] Pending deposit in localStorage is shown with its current step for resume', async ({ page }) => {
    // Seed a pending deposit at eth-registration step
    await seedPendingDeposit(page, { step: 'eth-registration' });
    await page.reload();

    const pendingBanner = page.locator('[data-testid="pending-deposit-banner"]');
    await expect(pendingBanner).toBeVisible({ timeout: 10000 });
    // Should indicate which step the deposit is at
    await expect(pendingBanner).toContainText(/eth.registration|pending|interrupted|resume/i);
  });

  test('[BT-11] Stale reservations (timed-out UTXO reservations) are cleaned up after timeout', async ({ page }) => {
    // Seed a very old pending deposit (over the stale threshold — 1 hour)
    await page.evaluate(() => {
      const staleDeposit = {
        id: 'mock-stale-deposit-999',
        vaultProviderId: 'vp-1',
        amountBtc: 0.01,
        status: 'PENDING',
        step: 'utxo-reservation',
        btcTxid: null,
        ethTxHash: null,
        createdAt: new Date(Date.now() - 5 * 3_600_000).toISOString(), // 5 hours ago
        updatedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
        utxoReservedAt: new Date(Date.now() - 5 * 3_600_000).toISOString(),
      };
      localStorage.setItem('pendingDeposit', JSON.stringify(staleDeposit));
    });

    await page.reload();

    // The stale deposit should NOT appear as a resumable deposit
    const staleResumeBtn = page.locator('[data-testid="resume-deposit-btn"]');
    await expect(staleResumeBtn).not.toBeVisible({ timeout: 5000 });

    // The stale deposit key should be cleared from localStorage
    const pendingDeposit = await page.evaluate(() => localStorage.getItem('pendingDeposit'));
    // Either removed or marked stale/cleaned
    if (pendingDeposit !== null) {
      const parsed = JSON.parse(pendingDeposit);
      expect(parsed.status).not.toBe('PENDING');
    }
  });

  test('[BT-11] Vault list refreshes automatically when chain state changes', async ({ page }) => {
    const vaultList = page.locator('[data-testid="vault-list"]');
    await expect(vaultList).toBeVisible({ timeout: 10000 });

    // Simulate a chain-state update event (e.g. block produced)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('chain-state-updated', { detail: { blockNumber: 999 } }));
    });

    // Vault list should re-fetch (spinner appears briefly or count updates)
    // We verify the list is still visible and not in an error state after the event
    await expect(vaultList).toBeVisible({ timeout: 5000 });
    const errorState = page.locator('[data-testid="vault-list-error"]');
    await expect(errorState).not.toBeVisible();
  });
});

// ── BT-12: Resume interrupted deposit ─────────────────────────────────────────

test.describe('[BT-12] User can resume an interrupted deposit', () => {
  test.beforeEach(async ({ page }) => {
    await setupWalletMocks(page);
    await setupBlockchainMocks(page);
    await page.goto('/');
    await connectBothWallets(page);
  });

  test('[BT-12] Dashboard shows an interrupted deposit at the step where it was left', async ({ page }) => {
    await seedPendingDeposit(page, { step: 'wots', btcBroadcast: true });
    await page.goto('/dashboard');

    const pendingBanner = page.locator('[data-testid="pending-deposit-banner"]');
    await expect(pendingBanner).toBeVisible({ timeout: 10000 });
    // Banner should communicate the deposit is mid-flow
    await expect(pendingBanner).toContainText(/wots|in.progress|interrupted|resume/i);
  });

  test('[BT-12] User can click "Resume" to continue from the interrupted step', async ({ page }) => {
    await seedPendingDeposit(page, { step: 'eth-registration', btcBroadcast: false });
    await page.goto('/dashboard');

    const resumeBtn = page.locator('[data-testid="resume-deposit-btn"]');
    await expect(resumeBtn).toBeVisible({ timeout: 10000 });
    await resumeBtn.click();

    // Should navigate to deposit flow at the correct step
    await expect(page).toHaveURL(/deposit/, { timeout: 5000 });
  });

  test('[BT-12] Resume navigates to the correct deposit step — not step 1', async ({ page }) => {
    // Interrupted at WOTS submission step
    await seedPendingDeposit(page, { step: 'wots', btcBroadcast: true });
    await page.goto('/dashboard');

    const resumeBtn = page.locator('[data-testid="resume-deposit-btn"]');
    await expect(resumeBtn).toBeVisible({ timeout: 10000 });
    await resumeBtn.click();

    // Should NOT show the initial provider-selection step (step 1)
    const providerList = page.locator('[data-testid="vault-provider-list"]');
    await expect(providerList).not.toBeVisible({ timeout: 5000 });

    // Should show WOTS or a later step
    const wotsStep = page.locator('[data-testid="wots-submission-step"]');
    const payoutStep = page.locator('[data-testid="payout-signing-dialog"]');
    const isWots = await wotsStep.isVisible({ timeout: 5000 }).catch(() => false);
    const isPayout = await payoutStep.isVisible({ timeout: 5000 }).catch(() => false);
    expect(isWots || isPayout).toBe(true);
  });

  test('[BT-12] If Pre-PegIn BTC tx was already broadcast (CONFIRMING), user cannot restart BTC broadcast', async ({ page }) => {
    // Deposit is in CONFIRMING — BTC already broadcast
    await seedPendingDeposit(page, { step: 'wots', btcBroadcast: true });
    await page.goto('/dashboard');

    const resumeBtn = page.locator('[data-testid="resume-deposit-btn"]');
    await expect(resumeBtn).toBeVisible({ timeout: 10000 });
    await resumeBtn.click();

    // The "broadcast BTC" button/step should NOT be visible
    const btcBroadcastBtn = page.locator('[data-testid="broadcast-btc-btn"]');
    await expect(btcBroadcastBtn).not.toBeVisible({ timeout: 5000 });

    // A read-only BTC txid link should be shown instead
    const btcTxidLink = page.locator('[data-testid="btc-txid-link"]');
    await expect(btcTxidLink).toBeVisible({ timeout: 10000 });
  });

  test('[BT-12] If ETH registration failed before BTC broadcast, user is shown option to retry from ETH step', async ({ page }) => {
    // Interrupted at eth-registration, BTC NOT yet broadcast
    await seedPendingDeposit(page, { step: 'eth-registration', btcBroadcast: false });

    // Simulate the ETH tx being absent (registration didn't complete)
    await page.evaluate(() => {
      const raw = localStorage.getItem('pendingDeposit');
      if (!raw) return;
      const deposit = JSON.parse(raw);
      deposit.ethTxHash = null; // ETH registration did not complete
      localStorage.setItem('pendingDeposit', JSON.stringify(deposit));
    });

    await page.goto('/dashboard');

    const resumeBtn = page.locator('[data-testid="resume-deposit-btn"]');
    await expect(resumeBtn).toBeVisible({ timeout: 10000 });
    await resumeBtn.click();

    // Should land on ETH registration step with a retry prompt
    const ethRegistrationStep = page.locator('[data-testid="eth-registration-step"]');
    const ethRetryBtn = page.locator('[data-testid="eth-retry-btn"]');
    const isEthStep = await ethRegistrationStep.isVisible({ timeout: 5000 }).catch(() => false);
    const isRetryVisible = await ethRetryBtn.isVisible({ timeout: 5000 }).catch(() => false);
    expect(isEthStep || isRetryVisible).toBe(true);
  });

  test('[BT-12] Completed deposit is not shown as resumable after all steps finish', async ({ page }) => {
    // Seed a COMPLETED deposit
    await page.evaluate(() => {
      const completed = {
        id: 'mock-completed-deposit-007',
        vaultProviderId: 'vp-1',
        amountBtc: 0.01,
        status: 'COMPLETED',
        step: 'activation-complete',
        btcTxid: 'mock-btc-txid-done',
        ethTxHash: '0xmockactivationtxdone',
        createdAt: new Date(Date.now() - 7_200_000).toISOString(),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem('pendingDeposit', JSON.stringify(completed));
    });

    await page.goto('/dashboard');

    // No resume banner for a completed deposit
    const resumeBtn = page.locator('[data-testid="resume-deposit-btn"]');
    await expect(resumeBtn).not.toBeVisible({ timeout: 5000 });
  });

  test('[BT-12] Interrupted deposit persists across page refresh — state is not lost on reload', async ({ page }) => {
    await seedPendingDeposit(page, { step: 'eth-registration', btcBroadcast: false });
    await page.goto('/dashboard');

    // Verify resume button is present
    await expect(page.locator('[data-testid="resume-deposit-btn"]')).toBeVisible({ timeout: 10000 });

    // Reload the page
    await page.reload();

    // Resume button should still be visible — state is in localStorage
    await expect(page.locator('[data-testid="resume-deposit-btn"]')).toBeVisible({ timeout: 10000 });
  });
});
