/**
 * Aave Integration E2E Tests
 * Derived from product intent specification — babylon-toolkit stories.yaml
 *
 * Stories covered:
 *   BT-13: User can supply vaultBTC as Aave collateral
 *   BT-14: User can borrow against Aave collateral
 *   BT-15: User can repay Aave debt
 *
 * Each test title is prefixed with [BT-XX] for deterministic mapping by the
 * Locus audit action (locus-audit-action@v1).
 */

import { test, expect } from '@playwright/test';
import {
  setupWalletMocks,
  mockEthTransactionFail,
} from '../../../mocks/wallet-providers';
import {
  setupBlockchainMocks,
} from '../../../mocks/blockchain';

// ── Shared mock data ──────────────────────────────────────────────────────────

const MOCK_AAVE_POSITION = {
  vaultBtcBalance: '0.05',           // vaultBTC available to supply
  suppliedCollateral: '0.03',        // already supplied
  collateralValueUsd: '1800',
  borrowCapacityUsd: '1260',         // 70% LTV
  borrowedUsd: '0',
  healthFactor: null,                // null means no borrow yet
  availableAssets: ['USDC', 'ETH'],
};

const MOCK_AAVE_POSITION_WITH_BORROW = {
  ...MOCK_AAVE_POSITION,
  borrowedUsd: '630',
  healthFactor: '2.0',
};

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Connect both wallets — required to access the Aave dashboard.
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
 * Intercept the Aave position endpoint and respond with the provided data.
 */
async function mockAavePosition(page: any, position: typeof MOCK_AAVE_POSITION) {
  await page.route('**/api/aave/position**', async (route: any) => {
    await route.fulfill({ json: position });
  });
  await page.route('**/graphql', async (route: any) => {
    const req = route.request();
    const body = req.postDataJSON?.() as { query?: string } | null;
    const query = body?.query ?? '';

    if (query.includes('aavePosition') || query.includes('getAavePosition')) {
      await route.fulfill({
        json: {
          data: {
            aavePosition: {
              vaultBtcBalance: position.vaultBtcBalance,
              suppliedCollateral: position.suppliedCollateral,
              collateralValueUsd: position.collateralValueUsd,
              borrowCapacityUsd: position.borrowCapacityUsd,
              borrowedUsd: position.borrowedUsd,
              healthFactor: position.healthFactor,
              availableAssets: position.availableAssets,
            },
          },
        },
      });
    } else {
      // Fall through to default blockchain mock handler
      await route.continue();
    }
  });
}

/**
 * Intercept the Aave supply transaction endpoint with a successful tx hash.
 */
async function mockAaveSupplySuccess(page: any) {
  await page.route('**/api/aave/supply', async (route: any) => {
    await route.fulfill({
      json: { txHash: '0xmockaavesupplytx0000001', status: 'submitted' },
    });
  });
}

/**
 * Intercept the Aave borrow transaction endpoint with a successful tx hash.
 */
async function mockAaveBorrowSuccess(page: any) {
  await page.route('**/api/aave/borrow', async (route: any) => {
    await route.fulfill({
      json: { txHash: '0xmockaaveborrowtx0000002', status: 'submitted' },
    });
  });
}

/**
 * Intercept the Aave repay transaction endpoint with a successful tx hash.
 */
async function mockAaveRepaySuccess(page: any) {
  await page.route('**/api/aave/repay', async (route: any) => {
    await route.fulfill({
      json: { txHash: '0xmockaaverepaytx0000003', status: 'submitted' },
    });
  });
}

// ── BT-13: Supply vaultBTC as Aave collateral ─────────────────────────────────

test.describe('[BT-13] User can supply vaultBTC as Aave collateral', () => {
  test.beforeEach(async ({ page }) => {
    await setupWalletMocks(page);
    await setupBlockchainMocks(page);
    await mockAavePosition(page, MOCK_AAVE_POSITION);
    await mockAaveSupplySuccess(page);
    await page.goto('/');
    await connectBothWallets(page);
    await page.goto('/aave');
  });

  test('[BT-13] Dashboard shows the user\'s vaultBTC balance available for Aave collateral', async ({ page }) => {
    const balanceDisplay = page.locator('[data-testid="vaultbtc-available-balance"]');
    await expect(balanceDisplay).toBeVisible();
    await expect(balanceDisplay).toContainText('0.05');
  });

  test('[BT-13] User can select a supply amount and sees the updated health factor preview', async ({ page }) => {
    await page.locator('[data-testid="supply-collateral-btn"]').click();
    const supplyDialog = page.locator('[data-testid="supply-dialog"]');
    await expect(supplyDialog).toBeVisible();

    // Enter a supply amount
    const amountInput = supplyDialog.locator('[data-testid="supply-amount-input"]');
    await amountInput.fill('0.02');

    // Health factor preview should appear/update
    const healthPreview = supplyDialog.locator('[data-testid="health-factor-preview"]');
    await expect(healthPreview).toBeVisible();
    // With no existing borrow, health factor preview should show a high/safe value
    const previewText = await healthPreview.textContent();
    expect(previewText).not.toBeNull();
  });

  test('[BT-13] Supplying triggers an ETH wallet transaction prompt', async ({ page }) => {
    await page.locator('[data-testid="supply-collateral-btn"]').click();
    const supplyDialog = page.locator('[data-testid="supply-dialog"]');
    await expect(supplyDialog).toBeVisible();

    await supplyDialog.locator('[data-testid="supply-amount-input"]').fill('0.02');
    await supplyDialog.locator('[data-testid="supply-confirm-btn"]').click();

    // ETH wallet prompt indicator
    const walletPrompt = page.locator('[data-testid="eth-wallet-tx-prompt"]');
    await expect(walletPrompt).toBeVisible();
  });

  test('[BT-13] On supply success, collateral balance updates without page refresh', async ({ page }) => {
    // Mock the updated position after supply
    await page.route('**/api/aave/position**', async (route: any) => {
      await route.fulfill({
        json: {
          ...MOCK_AAVE_POSITION,
          suppliedCollateral: '0.05',     // increased by 0.02
          collateralValueUsd: '3000',
          borrowCapacityUsd: '2100',
          vaultBtcBalance: '0.03',        // reduced by 0.02
        },
      });
    });

    await page.locator('[data-testid="supply-collateral-btn"]').click();
    const supplyDialog = page.locator('[data-testid="supply-dialog"]');
    await supplyDialog.locator('[data-testid="supply-amount-input"]').fill('0.02');
    await supplyDialog.locator('[data-testid="supply-confirm-btn"]').click();

    // Wait for the tx to succeed (dialog closes)
    await expect(supplyDialog).not.toBeVisible({ timeout: 5_000 });

    // Collateral balance should have updated in the UI without reload
    const collateralDisplay = page.locator('[data-testid="supplied-collateral-display"]');
    await expect(collateralDisplay).toContainText('0.05');
  });

  test('[BT-13] FF_DISABLE_BORROW flag disables borrow UI with "Borrowing Unavailable"', async ({ page }) => {
    // Inject feature flag via localStorage before navigation
    await page.addInitScript(() => {
      localStorage.setItem('featureFlags', JSON.stringify({ FF_DISABLE_BORROW: true }));
    });
    await page.goto('/aave');

    const borrowBtn = page.locator('[data-testid="borrow-btn"]');
    await expect(borrowBtn).toBeDisabled();
    await expect(borrowBtn).toContainText('Borrowing Unavailable');
  });
});

// ── BT-14: Borrow against Aave collateral ────────────────────────────────────

test.describe('[BT-14] User can borrow against Aave collateral', () => {
  test.beforeEach(async ({ page }) => {
    await setupWalletMocks(page);
    await setupBlockchainMocks(page);
    // Seed with existing collateral so borrowing is possible
    await mockAavePosition(page, MOCK_AAVE_POSITION);
    await mockAaveBorrowSuccess(page);
    await page.goto('/');
    await connectBothWallets(page);
    await page.goto('/aave');
  });

  test('[BT-14] Borrow dialog shows available borrow capacity based on collateral and LTV', async ({ page }) => {
    await page.locator('[data-testid="borrow-btn"]').click();
    const borrowDialog = page.locator('[data-testid="borrow-dialog"]');
    await expect(borrowDialog).toBeVisible();

    const capacityDisplay = borrowDialog.locator('[data-testid="borrow-capacity-display"]');
    await expect(capacityDisplay).toBeVisible();
    await expect(capacityDisplay).toContainText('1260'); // mocked capacity
  });

  test('[BT-14] User can select borrow amount and asset', async ({ page }) => {
    await page.locator('[data-testid="borrow-btn"]').click();
    const borrowDialog = page.locator('[data-testid="borrow-dialog"]');

    // Asset selector should list USDC and ETH
    const assetSelector = borrowDialog.locator('[data-testid="borrow-asset-selector"]');
    await expect(assetSelector).toBeVisible();
    await assetSelector.selectOption('USDC');

    const amountInput = borrowDialog.locator('[data-testid="borrow-amount-input"]');
    await amountInput.fill('500');

    // Confirm both are accepted
    await expect(assetSelector).toHaveValue('USDC');
    await expect(amountInput).toHaveValue('500');
  });

  test('[BT-14] Health factor updates in real-time as user adjusts borrow amount', async ({ page }) => {
    await page.locator('[data-testid="borrow-btn"]').click();
    const borrowDialog = page.locator('[data-testid="borrow-dialog"]');

    const amountInput = borrowDialog.locator('[data-testid="borrow-amount-input"]');
    const healthPreview = borrowDialog.locator('[data-testid="health-factor-preview"]');

    // Initial: no amount, health factor may not be shown or shows safe
    await amountInput.fill('100');
    await expect(healthPreview).toBeVisible();
    const firstValue = await healthPreview.textContent();

    await amountInput.fill('1000');
    const secondValue = await healthPreview.textContent();

    // Health factor should decrease as borrow amount increases
    // We rely on the mock returning a lower value or the UI computing it client-side
    expect(firstValue).not.toBeNull();
    expect(secondValue).not.toBeNull();
    // The two values should differ (real-time update)
    expect(firstValue).not.toEqual(secondValue);
  });

  test('[BT-14] Amounts causing health factor < 1.0 are blocked with a warning', async ({ page }) => {
    await page.locator('[data-testid="borrow-btn"]').click();
    const borrowDialog = page.locator('[data-testid="borrow-dialog"]');

    // Enter an amount that would exceed safe borrow capacity
    const amountInput = borrowDialog.locator('[data-testid="borrow-amount-input"]');
    await amountInput.fill('9999'); // well over capacity

    const warningBanner = borrowDialog.locator('[data-testid="health-factor-warning"]');
    await expect(warningBanner).toBeVisible();
    await expect(warningBanner).toContainText(/health factor/i);

    // Confirm button should be disabled
    const confirmBtn = borrowDialog.locator('[data-testid="borrow-confirm-btn"]');
    await expect(confirmBtn).toBeDisabled();
  });

  test('[BT-14] Borrowing triggers an ETH wallet transaction', async ({ page }) => {
    await page.locator('[data-testid="borrow-btn"]').click();
    const borrowDialog = page.locator('[data-testid="borrow-dialog"]');

    await borrowDialog.locator('[data-testid="borrow-asset-selector"]').selectOption('USDC');
    await borrowDialog.locator('[data-testid="borrow-amount-input"]').fill('300');
    await borrowDialog.locator('[data-testid="borrow-confirm-btn"]').click();

    const walletPrompt = page.locator('[data-testid="eth-wallet-tx-prompt"]');
    await expect(walletPrompt).toBeVisible();
  });

  test('[BT-14] On borrow success, borrow balance and health factor update in the UI', async ({ page }) => {
    // Override position to reflect the new borrow after success
    await page.route('**/api/aave/position**', async (route: any) => {
      await route.fulfill({ json: MOCK_AAVE_POSITION_WITH_BORROW });
    });

    await page.locator('[data-testid="borrow-btn"]').click();
    const borrowDialog = page.locator('[data-testid="borrow-dialog"]');
    await borrowDialog.locator('[data-testid="borrow-asset-selector"]').selectOption('USDC');
    await borrowDialog.locator('[data-testid="borrow-amount-input"]').fill('630');
    await borrowDialog.locator('[data-testid="borrow-confirm-btn"]').click();

    // Dialog should close on success
    await expect(borrowDialog).not.toBeVisible({ timeout: 5_000 });

    // Borrow balance and health factor should update without reload
    const borrowDisplay = page.locator('[data-testid="borrow-balance-display"]');
    await expect(borrowDisplay).toContainText('630');

    const healthDisplay = page.locator('[data-testid="health-factor-display"]');
    await expect(healthDisplay).toBeVisible();
    await expect(healthDisplay).toContainText('2.0');
  });
});

// ── BT-15: Repay Aave debt ────────────────────────────────────────────────────

test.describe('[BT-15] User can repay Aave debt', () => {
  test.beforeEach(async ({ page }) => {
    await setupWalletMocks(page);
    await setupBlockchainMocks(page);
    // Pre-seed with an existing borrow position
    await mockAavePosition(page, MOCK_AAVE_POSITION_WITH_BORROW);
    await mockAaveRepaySuccess(page);
    await page.goto('/');
    await connectBothWallets(page);
    await page.goto('/aave');
  });

  test('[BT-15] Repay dialog shows current debt per asset', async ({ page }) => {
    await page.locator('[data-testid="repay-btn"]').click();
    const repayDialog = page.locator('[data-testid="repay-dialog"]');
    await expect(repayDialog).toBeVisible();

    const debtDisplay = repayDialog.locator('[data-testid="current-debt-display"]');
    await expect(debtDisplay).toBeVisible();
    // Should show the mocked borrow balance
    await expect(debtDisplay).toContainText('630');
  });

  test('[BT-15] User can select full or partial repayment', async ({ page }) => {
    await page.locator('[data-testid="repay-btn"]').click();
    const repayDialog = page.locator('[data-testid="repay-dialog"]');

    // Partial repayment
    const amountInput = repayDialog.locator('[data-testid="repay-amount-input"]');
    await amountInput.fill('200');
    await expect(amountInput).toHaveValue('200');

    // Full repayment shortcut
    const repayMaxBtn = repayDialog.locator('[data-testid="repay-max-btn"]');
    await repayMaxBtn.click();
    await expect(amountInput).toHaveValue('630');
  });

  test('[BT-15] Repayment triggers approval and repay transaction in ETH wallet', async ({ page }) => {
    await page.locator('[data-testid="repay-btn"]').click();
    const repayDialog = page.locator('[data-testid="repay-dialog"]');

    await repayDialog.locator('[data-testid="repay-max-btn"]').click();
    await repayDialog.locator('[data-testid="repay-confirm-btn"]').click();

    // Expect approval step first (ERC-20 allowance), then repay
    const approvalStep = page.locator('[data-testid="token-approval-prompt"]');
    await expect(approvalStep).toBeVisible();

    // After approval, the wallet repay prompt should follow
    // Simulate approval confirmed by mocking the approval route
    await page.route('**/api/aave/approve', async (route: any) => {
      await route.fulfill({ json: { txHash: '0xmockapprovetx', status: 'submitted' } });
    });
    // The repay transaction prompt should appear after approval
    const walletPrompt = page.locator('[data-testid="eth-wallet-tx-prompt"]');
    await expect(walletPrompt).toBeVisible({ timeout: 8_000 });
  });

  test('[BT-15] On repay success, debt decreases and health factor improves in the UI', async ({ page }) => {
    // After repayment, position shows no debt and null health factor
    await page.route('**/api/aave/position**', async (route: any) => {
      await route.fulfill({
        json: {
          ...MOCK_AAVE_POSITION_WITH_BORROW,
          borrowedUsd: '330',
          healthFactor: '3.6',
        },
      });
    });

    await page.locator('[data-testid="repay-btn"]').click();
    const repayDialog = page.locator('[data-testid="repay-dialog"]');
    await repayDialog.locator('[data-testid="repay-amount-input"]').fill('300');
    await repayDialog.locator('[data-testid="repay-confirm-btn"]').click();

    // Dialog should close
    await expect(repayDialog).not.toBeVisible({ timeout: 5_000 });

    // Borrow balance decreases
    const borrowDisplay = page.locator('[data-testid="borrow-balance-display"]');
    await expect(borrowDisplay).toContainText('330');

    // Health factor improves
    const healthDisplay = page.locator('[data-testid="health-factor-display"]');
    await expect(healthDisplay).toContainText('3.6');
  });

  test('[BT-15] Warning is shown if token balance is insufficient for full repayment', async ({ page }) => {
    // Mock position where user's wallet USDC balance is less than total debt
    await page.route('**/api/aave/position**', async (route: any) => {
      await route.fulfill({
        json: {
          ...MOCK_AAVE_POSITION_WITH_BORROW,
          userTokenBalances: { USDC: '100', ETH: '0.01' }, // only $100 USDC but $630 debt
        },
      });
    });
    await page.reload();

    await page.locator('[data-testid="repay-btn"]').click();
    const repayDialog = page.locator('[data-testid="repay-dialog"]');
    await repayDialog.locator('[data-testid="repay-max-btn"]').click();

    const insufficientWarning = repayDialog.locator('[data-testid="insufficient-balance-warning"]');
    await expect(insufficientWarning).toBeVisible();
    await expect(insufficientWarning).toContainText(/insufficient/i);

    // Repay confirm button should be disabled
    await expect(repayDialog.locator('[data-testid="repay-confirm-btn"]')).toBeDisabled();
  });
});
