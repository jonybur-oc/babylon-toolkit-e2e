/**
 * Withdrawal & Pegout Monitoring E2E Tests
 * Derived from product intent specification — babylon-toolkit stories.yaml
 *
 * Stories covered:
 *   BT-18: User can initiate a vault withdrawal (pegout)
 *   BT-19: User can monitor pegout status
 *
 * Each test title is prefixed with [BT-XX] for deterministic mapping by the
 * Locus audit action (locus-audit-action@v1).
 */

import { test, expect } from '@playwright/test';
import {
  setupWalletMocks,
} from '../../../mocks/wallet-providers';
import {
  setupBlockchainMocks,
} from '../../../mocks/blockchain';

// ── Shared mock data ──────────────────────────────────────────────────────────

const MOCK_ACTIVE_VAULT = {
  id: 'vault-active-001',
  status: 'Active',
  amountBtc: 0.05,
  btcAddress: 'bc1qmockbtcaddress123',
  provider: { id: 'vp-1', name: 'Babylon Vault Provider Alpha' },
  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
};

const MOCK_WITHDRAWAL_ESTIMATE = {
  grossAmountBtc: 0.05,
  feesBtc: 0.0003,
  netAmountBtc: 0.047,         // gross - fees
  estimatedDurationMinutes: 30,
};

const MOCK_PEGOUT_INITIATED = {
  pegoutId: 'pegout-001',
  vaultId: 'vault-active-001',
  status: 'Initiated',
  btcAddress: 'bc1qmockbtcaddress123',
  requestedAmountBtc: 0.05,
  netAmountBtc: 0.047,
  initiatedAt: new Date().toISOString(),
  btcTxid: null,
};

const MOCK_PEGOUT_BROADCASTING = {
  ...MOCK_PEGOUT_INITIATED,
  status: 'BTC Broadcasting',
  btcTxid: null,
};

const MOCK_PEGOUT_CONFIRMED = {
  ...MOCK_PEGOUT_INITIATED,
  status: 'Confirmed',
  btcTxid: 'mock-btc-withdrawal-txid-abc123',
};

// ── Shared helpers ────────────────────────────────────────────────────────────

async function connectBothWallets(page: any) {
  await page.locator('[data-testid="connect-wallet-btn"]').click();
  await page.locator('[data-testid="btc-wallet-option-okx"]').click();
  await expect(page.locator('[data-testid="btc-address-display"]')).toBeVisible();

  await page.locator('[data-testid="connect-wallet-btn"]').click();
  await page.locator('[data-testid="eth-wallet-option-metamask"]').click();
  await expect(page.locator('[data-testid="eth-address-display"]')).toBeVisible();
}

async function setupVaultMock(page: any, vault = MOCK_ACTIVE_VAULT) {
  await page.route('**/graphql', async (route: any) => {
    const body = route.request().postDataJSON?.() as { query?: string } | null;
    const query = body?.query ?? '';

    if (query.includes('userVaults') || query.includes('getVaults') || query.includes('vaults')) {
      await route.fulfill({
        json: { data: { vaults: [vault] } },
      });
    } else if (query.includes('withdrawalEstimate') || query.includes('pegoutEstimate')) {
      await route.fulfill({
        json: { data: { withdrawalEstimate: MOCK_WITHDRAWAL_ESTIMATE } },
      });
    } else {
      await route.fulfill({ json: { data: {} } });
    }
  });
}

async function mockEthWalletTransaction(
  page: any,
  opts: { shouldSucceed?: boolean } = {}
) {
  const { shouldSucceed = true } = opts;
  await page.evaluate(
    ([succeed]: [boolean]) => {
      (window as any).__mockEthWallet = {
        sendTransaction: () =>
          succeed
            ? Promise.resolve({ hash: '0xmockwithdrawaltxhash' })
            : Promise.reject(new Error('User rejected the request.')),
      };
    },
    [shouldSucceed] as [boolean]
  );
}

async function goToWithdrawalPage(page: any, vaultId = MOCK_ACTIVE_VAULT.id) {
  await page.goto(`/vault/${vaultId}/withdraw`);
  await expect(page.locator('[data-testid="withdrawal-page"]')).toBeVisible();
}

// ── BT-18: User can initiate a vault withdrawal (pegout) ──────────────────────

test.describe('BT-18: Vault withdrawal initiation', () => {
  test.beforeEach(async ({ page }) => {
    await setupWalletMocks(page);
    await setupBlockchainMocks(page);
    await setupVaultMock(page);
    await page.goto('/');
    await connectBothWallets(page);
  });

  test('[BT-18] user can request withdrawal from an active vault', async ({ page }) => {
    await goToWithdrawalPage(page);

    // The withdrawal page is visible and shows vault details
    const withdrawalPage = page.locator('[data-testid="withdrawal-page"]');
    await expect(withdrawalPage).toBeVisible();

    // Withdraw button is present
    const withdrawBtn = page.locator('[data-testid="initiate-withdrawal-btn"]');
    await expect(withdrawBtn).toBeVisible();
    await expect(withdrawBtn).not.toBeDisabled();
  });

  test('[BT-18] withdrawal flow shows expected BTC amount after fees', async ({ page }) => {
    await goToWithdrawalPage(page);

    // Gross amount (what was deposited)
    const grossAmount = page.locator('[data-testid="withdrawal-gross-amount"]');
    await expect(grossAmount).toBeVisible();
    await expect(grossAmount).toContainText('0.05');

    // Fee breakdown
    const feeDisplay = page.locator('[data-testid="withdrawal-fee-display"]');
    await expect(feeDisplay).toBeVisible();
    await expect(feeDisplay).toContainText('0.0003');

    // Net amount user will receive
    const netAmount = page.locator('[data-testid="withdrawal-net-amount"]');
    await expect(netAmount).toBeVisible();
    await expect(netAmount).toContainText('0.047');
  });

  test('[BT-18] initiating withdrawal triggers an ETH wallet transaction', async ({ page }) => {
    await mockEthWalletTransaction(page, { shouldSucceed: true });
    await goToWithdrawalPage(page);

    const ethTxRequests: string[] = [];
    page.on('request', (req: any) => {
      if (req.method() === 'POST' && req.url().includes('eth')) {
        ethTxRequests.push(req.url());
      }
    });

    // Accept the irreversible-warning confirmation
    page.once('dialog', (dialog: any) => dialog.accept());

    const withdrawBtn = page.locator('[data-testid="initiate-withdrawal-btn"]');
    await withdrawBtn.click();

    // ETH wallet prompt should appear — accept it
    const ethPrompt = page.locator('[data-testid="eth-wallet-transaction-prompt"]');
    await expect(ethPrompt).toBeVisible({ timeout: 5000 });
    const confirmBtn = ethPrompt.locator('[data-testid="confirm-eth-tx-btn"]');
    await confirmBtn.click();

    // After confirming, an ETH transaction hash should be stored/displayed
    const ethTxHash = page.locator('[data-testid="eth-tx-hash-display"]');
    await expect(ethTxHash).toBeVisible({ timeout: 10000 });
    await expect(ethTxHash).toContainText(/0x/i);
  });

  test('[BT-18] on success vault status changes to Redeeming', async ({ page }) => {
    await mockEthWalletTransaction(page, { shouldSucceed: true });

    // Mock the withdrawal initiation endpoint to return a pegout record
    await page.route('**/api/vault/*/withdraw', async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pegout: MOCK_PEGOUT_INITIATED }),
      });
    });

    await goToWithdrawalPage(page);
    page.once('dialog', (dialog: any) => dialog.accept());

    const withdrawBtn = page.locator('[data-testid="initiate-withdrawal-btn"]');
    await withdrawBtn.click();

    const ethPrompt = page.locator('[data-testid="eth-wallet-transaction-prompt"]');
    await expect(ethPrompt).toBeVisible({ timeout: 5000 });
    await ethPrompt.locator('[data-testid="confirm-eth-tx-btn"]').click();

    // After successful submission the vault status should show Redeeming
    const vaultStatus = page.locator('[data-testid="vault-status"]');
    await expect(vaultStatus).toContainText(/redeeming/i, { timeout: 10000 });
  });

  test('[BT-18] user sees a clear irreversibility warning before submission', async ({ page }) => {
    await goToWithdrawalPage(page);

    const withdrawBtn = page.locator('[data-testid="initiate-withdrawal-btn"]');
    await withdrawBtn.click();

    // An explicit warning about irreversibility must be shown before ETH tx prompt
    const warningModal = page.locator('[data-testid="withdrawal-irreversible-warning"]');
    await expect(warningModal).toBeVisible({ timeout: 5000 });
    await expect(warningModal).toContainText(/irreversible|cannot be undone|confirm withdrawal/i);

    // Cancel button allows user to back out
    const cancelBtn = warningModal.locator('[data-testid="cancel-withdrawal-btn"]');
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    // After cancelling, withdrawal page is still shown (no ETH tx fired)
    await expect(page.locator('[data-testid="withdrawal-page"]')).toBeVisible();
    await expect(warningModal).not.toBeVisible();
  });

  test('[BT-18] user can cancel the irreversibility warning without submitting', async ({ page }) => {
    await goToWithdrawalPage(page);

    const mutationRequests: string[] = [];
    page.on('request', (req: any) => {
      if (['POST', 'PUT'].includes(req.method()) && req.url().includes('withdraw')) {
        mutationRequests.push(req.url());
      }
    });

    const withdrawBtn = page.locator('[data-testid="initiate-withdrawal-btn"]');
    await withdrawBtn.click();

    const warningModal = page.locator('[data-testid="withdrawal-irreversible-warning"]');
    await expect(warningModal).toBeVisible({ timeout: 5000 });

    const cancelBtn = warningModal.locator('[data-testid="cancel-withdrawal-btn"]');
    await cancelBtn.click();

    // No withdrawal API call should have been made
    await page.waitForTimeout(500);
    expect(mutationRequests).toHaveLength(0);
  });
});

// ── BT-19: User can monitor pegout status ─────────────────────────────────────

test.describe('BT-19: Pegout status monitoring', () => {
  test.beforeEach(async ({ page }) => {
    await setupWalletMocks(page);
    await setupBlockchainMocks(page);
    await page.goto('/');
    await connectBothWallets(page);
  });

  async function mockPegoutEndpoint(page: any, pegout: typeof MOCK_PEGOUT_INITIATED) {
    await page.route('**/api/pegout/**', async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pegout }),
      });
    });
  }

  async function goToPegoutMonitor(page: any) {
    await page.goto('/vault/pegout');
    await expect(page.locator('[data-testid="pegout-monitor-page"]')).toBeVisible();
  }

  test('[BT-19] active pegouts are listed with current status', async ({ page }) => {
    await mockPegoutEndpoint(page, MOCK_PEGOUT_INITIATED);
    await page.route('**/api/pegouts', async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pegouts: [MOCK_PEGOUT_INITIATED] }),
      });
    });

    await goToPegoutMonitor(page);

    const pegoutList = page.locator('[data-testid="pegout-list"]');
    await expect(pegoutList).toBeVisible();

    const pegoutItem = page.locator('[data-testid="pegout-item"]').first();
    await expect(pegoutItem).toBeVisible();
    await expect(pegoutItem.locator('[data-testid="pegout-status"]')).toContainText(/initiated/i);
  });

  test('[BT-19] pegout shows "BTC Broadcasting" status when in intermediate state', async ({ page }) => {
    await page.route('**/api/pegouts', async (route: any) => {
      await route.fulfill({
        json: { pegouts: [MOCK_PEGOUT_BROADCASTING] },
      });
    });

    await goToPegoutMonitor(page);

    const pegoutItem = page.locator('[data-testid="pegout-item"]').first();
    await expect(pegoutItem.locator('[data-testid="pegout-status"]')).toContainText(/btc broadcasting/i, { timeout: 5000 });
  });

  test('[BT-19] app polls pegout status at regular intervals without page refresh', async ({ page }) => {
    let pollCount = 0;
    const statuses = [MOCK_PEGOUT_INITIATED, MOCK_PEGOUT_BROADCASTING, MOCK_PEGOUT_CONFIRMED];

    await page.route('**/api/pegouts', async (route: any) => {
      const pegout = statuses[Math.min(pollCount, statuses.length - 1)];
      pollCount++;
      await route.fulfill({ json: { pegouts: [pegout] } });
    });

    await goToPegoutMonitor(page);

    const pegoutStatus = page.locator('[data-testid="pegout-item"]').first()
      .locator('[data-testid="pegout-status"]');

    // Wait for multiple polls to occur (uses __TEST_POLL_INTERVAL_MS__ override)
    await page.waitForFunction(
      () => (window as any).__pegoutPollCount >= 2,
      { timeout: 10000 }
    );

    // After enough polls, status should have progressed
    await expect(pegoutStatus).not.toContainText(/^initiated$/i, { timeout: 5000 });
  });

  test('[BT-19] confirmed pegout shows BTC txid', async ({ page }) => {
    await page.route('**/api/pegouts', async (route: any) => {
      await route.fulfill({ json: { pegouts: [MOCK_PEGOUT_CONFIRMED] } });
    });

    await goToPegoutMonitor(page);

    const pegoutItem = page.locator('[data-testid="pegout-item"]').first();
    await expect(pegoutItem.locator('[data-testid="pegout-status"]')).toContainText(/confirmed/i, { timeout: 5000 });

    // BTC txid must be visible once confirmed
    const btcTxid = pegoutItem.locator('[data-testid="pegout-btc-txid"]');
    await expect(btcTxid).toBeVisible();
    await expect(btcTxid).toContainText('mock-btc-withdrawal-txid-abc123');
  });

  test('[BT-19] user can click BTC txid to open block explorer', async ({ page }) => {
    await page.route('**/api/pegouts', async (route: any) => {
      await route.fulfill({ json: { pegouts: [MOCK_PEGOUT_CONFIRMED] } });
    });

    await goToPegoutMonitor(page);

    const pegoutItem = page.locator('[data-testid="pegout-item"]').first();
    const btcTxid = pegoutItem.locator('[data-testid="pegout-btc-txid"]');
    await expect(btcTxid).toBeVisible({ timeout: 5000 });

    // The txid should be wrapped in an anchor pointing to a block explorer
    const txidLink = pegoutItem.locator('a[href*="mempool.space"], a[href*="blockstream.info"]');
    await expect(txidLink).toBeVisible();
    const href = await txidLink.getAttribute('href');
    expect(href).toContain('mock-btc-withdrawal-txid-abc123');

    // Link opens in a new tab
    await expect(txidLink).toHaveAttribute('target', '_blank');
  });

  test('[BT-19] completed pegouts are moved to the activity log', async ({ page }) => {
    // Pegout is confirmed — should not appear in active pegout list but in activity
    await page.route('**/api/pegouts', async (route: any) => {
      // Confirmed pegouts are archived: active list is empty
      await route.fulfill({ json: { pegouts: [] } });
    });
    await page.route('**/api/activity', async (route: any) => {
      await route.fulfill({
        json: {
          events: [
            {
              id: 'activity-pegout-001',
              type: 'withdrawal',
              status: 'Confirmed',
              amountBtc: 0.047,
              date: new Date().toISOString(),
              btcTxid: 'mock-btc-withdrawal-txid-abc123',
            },
          ],
        },
      });
    });

    await goToPegoutMonitor(page);

    // No active pegout items
    const pegoutList = page.locator('[data-testid="pegout-list"]');
    const pegoutItems = page.locator('[data-testid="pegout-item"]');
    const count = await pegoutItems.count();
    expect(count).toBe(0);

    // Navigate to activity — the completed pegout should appear there
    await page.goto('/activity');
    const activityList = page.locator('[data-testid="activity-list"]');
    await expect(activityList).toBeVisible();
    await expect(activityList).toContainText(/withdrawal|confirmed/i);
  });
});
