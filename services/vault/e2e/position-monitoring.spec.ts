/**
 * Position Monitoring E2E Tests
 * Derived from product intent specification — babylon-toolkit stories.yaml
 *
 * Stories covered:
 *   BT-16: User can monitor their Aave position health
 *   BT-17: Cascade risk simulation
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

const MOCK_POSITION_HEALTHY = {
  healthFactor: '2.1',
  collateralValueUsd: '3000',
  borrowedUsd: '1000',
  ltv: '33',                  // 1000 / 3000
  liquidationThreshold: '80', // %
  liquidationPriceUsd: '1250',// BTC price at which position gets liquidated
  btcPriceUsd: '60000',
};

const MOCK_POSITION_WARNING = {
  ...MOCK_POSITION_HEALTHY,
  healthFactor: '1.2',
  borrowedUsd: '2400',
  ltv: '80',
  warningThreshold: '1.5',
};

const MOCK_POSITION_CRITICAL = {
  ...MOCK_POSITION_HEALTHY,
  healthFactor: '0.9',
  borrowedUsd: '2900',
  ltv: '96',
};

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * Connect both wallets — required to access the position dashboard.
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
 * Intercept position polling endpoint and return the given position data.
 */
async function mockPositionEndpoint(page: any, position: typeof MOCK_POSITION_HEALTHY) {
  await page.route('**/api/aave/position**', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(position),
    });
  });
}

/**
 * Navigate to the position monitoring dashboard.
 */
async function goToPositionDashboard(page: any) {
  await page.goto('/vault/position');
  await expect(page.locator('[data-testid="position-dashboard"]')).toBeVisible();
}

// ── BT-16: User can monitor their Aave position health ───────────────────────

test.describe('BT-16: Position health dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await setupWalletMocks(page);
    await setupBlockchainMocks(page);
  });

  test('[BT-16] health factor displayed with green colour coding when ≥ 1.5', async ({ page }) => {
    await mockPositionEndpoint(page, MOCK_POSITION_HEALTHY);
    await connectBothWallets(page);
    await goToPositionDashboard(page);

    const hfDisplay = page.locator('[data-testid="health-factor-display"]');
    await expect(hfDisplay).toBeVisible();
    await expect(hfDisplay).toContainText('2.1');

    // Colour coding: green class when health factor ≥ 1.5
    await expect(hfDisplay).toHaveAttribute('data-health-status', 'healthy');
    const className = await hfDisplay.getAttribute('class');
    expect(className).toMatch(/green|healthy/i);
  });

  test('[BT-16] health factor displayed with yellow colour coding when between 1.0 and 1.5', async ({ page }) => {
    await mockPositionEndpoint(page, MOCK_POSITION_WARNING);
    await connectBothWallets(page);
    await goToPositionDashboard(page);

    const hfDisplay = page.locator('[data-testid="health-factor-display"]');
    await expect(hfDisplay).toContainText('1.2');
    await expect(hfDisplay).toHaveAttribute('data-health-status', 'warning');
    const className = await hfDisplay.getAttribute('class');
    expect(className).toMatch(/yellow|warning/i);
  });

  test('[BT-16] health factor displayed with red colour coding when below 1.0', async ({ page }) => {
    await mockPositionEndpoint(page, MOCK_POSITION_CRITICAL);
    await connectBothWallets(page);
    await goToPositionDashboard(page);

    const hfDisplay = page.locator('[data-testid="health-factor-display"]');
    await expect(hfDisplay).toContainText('0.9');
    await expect(hfDisplay).toHaveAttribute('data-health-status', 'critical');
    const className = await hfDisplay.getAttribute('class');
    expect(className).toMatch(/red|critical/i);
  });

  test('[BT-16] collateral value, borrow balance, and LTV are all displayed', async ({ page }) => {
    await mockPositionEndpoint(page, MOCK_POSITION_HEALTHY);
    await connectBothWallets(page);
    await goToPositionDashboard(page);

    // Collateral value
    const collateralDisplay = page.locator('[data-testid="collateral-value-display"]');
    await expect(collateralDisplay).toBeVisible();
    await expect(collateralDisplay).toContainText('3,000');

    // Borrow balance
    const borrowDisplay = page.locator('[data-testid="borrow-balance-display"]');
    await expect(borrowDisplay).toBeVisible();
    await expect(borrowDisplay).toContainText('1,000');

    // LTV
    const ltvDisplay = page.locator('[data-testid="ltv-display"]');
    await expect(ltvDisplay).toBeVisible();
    await expect(ltvDisplay).toContainText('33%');
  });

  test('[BT-16] health factor updates at polling intervals without page refresh', async ({ page }) => {
    // Start with a healthy position
    let callCount = 0;
    const positions = [MOCK_POSITION_HEALTHY, MOCK_POSITION_WARNING];

    await page.route('**/api/aave/position**', async (route: any) => {
      const pos = positions[Math.min(callCount, positions.length - 1)];
      callCount++;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(pos),
      });
    });

    await connectBothWallets(page);
    await goToPositionDashboard(page);

    // First poll: healthy (2.1)
    const hfDisplay = page.locator('[data-testid="health-factor-display"]');
    await expect(hfDisplay).toContainText('2.1');

    // Wait for at least one automatic re-poll (UI polls every ~30s in prod;
    // in test env the polling interval is overridden via __TEST_POLL_INTERVAL_MS__)
    await page.waitForFunction(
      () => (window as any).__aavePositionPollCount >= 2,
      { timeout: 10000 }
    );

    // Second poll should reflect warning position (1.2)
    await expect(hfDisplay).toContainText('1.2');
    // Colour should have changed to yellow without a navigation
    await expect(hfDisplay).toHaveAttribute('data-health-status', 'warning');
  });

  test('[BT-16] warning banner shown when health factor falls below configurable threshold', async ({ page }) => {
    await mockPositionEndpoint(page, MOCK_POSITION_WARNING);
    await connectBothWallets(page);
    await goToPositionDashboard(page);

    // Warning banner should be visible when health factor (1.2) is below threshold (1.5)
    const warningBanner = page.locator('[data-testid="health-warning-banner"]');
    await expect(warningBanner).toBeVisible();
    await expect(warningBanner).toContainText(/health factor.*low|liquidation risk/i);
  });

  test('[BT-16] no warning banner shown when health factor is above threshold', async ({ page }) => {
    await mockPositionEndpoint(page, MOCK_POSITION_HEALTHY);
    await connectBothWallets(page);
    await goToPositionDashboard(page);

    // Health factor 2.1 is above the default threshold (1.5) — no banner
    const warningBanner = page.locator('[data-testid="health-warning-banner"]');
    await expect(warningBanner).not.toBeVisible();
  });
});

// ── BT-17: Cascade risk simulation ───────────────────────────────────────────

test.describe('BT-17: Cascade risk simulation', () => {
  test.beforeEach(async ({ page }) => {
    await setupWalletMocks(page);
    await setupBlockchainMocks(page);
  });

  test('[BT-17] user can open the risk simulation panel', async ({ page }) => {
    await mockPositionEndpoint(page, MOCK_POSITION_HEALTHY);
    await connectBothWallets(page);
    await goToPositionDashboard(page);

    const simButton = page.locator('[data-testid="open-simulation-btn"]');
    await expect(simButton).toBeVisible();
    await simButton.click();

    const simPanel = page.locator('[data-testid="risk-simulation-panel"]');
    await expect(simPanel).toBeVisible();
  });

  test('[BT-17] simulation panel shows BTC price slider and current price', async ({ page }) => {
    await mockPositionEndpoint(page, MOCK_POSITION_HEALTHY);
    await connectBothWallets(page);
    await goToPositionDashboard(page);
    await page.locator('[data-testid="open-simulation-btn"]').click();

    const simPanel = page.locator('[data-testid="risk-simulation-panel"]');
    // Price slider
    const priceSlider = simPanel.locator('[data-testid="btc-price-slider"]');
    await expect(priceSlider).toBeVisible();

    // Current price pre-filled
    const priceInput = simPanel.locator('[data-testid="simulated-price-input"]');
    await expect(priceInput).toHaveValue('60000');
  });

  test('[BT-17] health factor updates in real time as simulated price is adjusted', async ({ page }) => {
    await mockPositionEndpoint(page, MOCK_POSITION_HEALTHY);
    await connectBothWallets(page);
    await goToPositionDashboard(page);
    await page.locator('[data-testid="open-simulation-btn"]').click();

    const simPanel = page.locator('[data-testid="risk-simulation-panel"]');
    const priceInput = simPanel.locator('[data-testid="simulated-price-input"]');
    const simHf = simPanel.locator('[data-testid="simulated-health-factor"]');

    // At current price 60000, health factor matches live position
    await expect(simHf).toContainText('2.1');

    // Drop price to 30000 — health factor should halve (collateral value halves)
    await priceInput.fill('30000');
    await priceInput.dispatchEvent('input');

    // Health factor should update immediately (client-side only)
    await expect(simHf).not.toContainText('2.1');
    const newHf = await simHf.textContent();
    const hfValue = parseFloat(newHf ?? '0');
    expect(hfValue).toBeGreaterThan(0);
    expect(hfValue).toBeLessThan(1.5); // price halved → health dropped significantly
  });

  test('[BT-17] simulation shows liquidation threshold and proximity', async ({ page }) => {
    await mockPositionEndpoint(page, MOCK_POSITION_HEALTHY);
    await connectBothWallets(page);
    await goToPositionDashboard(page);
    await page.locator('[data-testid="open-simulation-btn"]').click();

    const simPanel = page.locator('[data-testid="risk-simulation-panel"]');

    // Liquidation threshold should be displayed
    const liqThreshold = simPanel.locator('[data-testid="liquidation-threshold-display"]');
    await expect(liqThreshold).toBeVisible();
    await expect(liqThreshold).toContainText('80%');

    // Liquidation price should be shown
    const liqPrice = simPanel.locator('[data-testid="liquidation-price-display"]');
    await expect(liqPrice).toBeVisible();
    await expect(liqPrice).toContainText('1,250');
  });

  test('[BT-17] simulation is client-side only — no API calls triggered when adjusting price', async ({ page }) => {
    await mockPositionEndpoint(page, MOCK_POSITION_HEALTHY);
    await connectBothWallets(page);
    await goToPositionDashboard(page);
    await page.locator('[data-testid="open-simulation-btn"]').click();

    const simPanel = page.locator('[data-testid="risk-simulation-panel"]');
    const priceInput = simPanel.locator('[data-testid="simulated-price-input"]');

    // Track any POST/mutation calls while interacting with the simulator
    const mutationRequests: string[] = [];
    page.on('request', (req: any) => {
      if (['POST', 'PUT', 'PATCH'].includes(req.method())) {
        mutationRequests.push(req.url());
      }
    });

    // Adjust price multiple times
    for (const price of ['50000', '40000', '30000', '20000']) {
      await priceInput.fill(price);
      await priceInput.dispatchEvent('input');
    }

    // Allow any pending microtasks
    await page.waitForTimeout(500);

    // No mutation calls should have fired
    expect(mutationRequests).toHaveLength(0);
  });

  test('[BT-17] simulated health factor shows critical colour coding near liquidation', async ({ page }) => {
    await mockPositionEndpoint(page, MOCK_POSITION_HEALTHY);
    await connectBothWallets(page);
    await goToPositionDashboard(page);
    await page.locator('[data-testid="open-simulation-btn"]').click();

    const simPanel = page.locator('[data-testid="risk-simulation-panel"]');
    const priceInput = simPanel.locator('[data-testid="simulated-price-input"]');
    const simHf = simPanel.locator('[data-testid="simulated-health-factor"]');

    // Drop price far enough to push health factor below 1.0
    await priceInput.fill('20000');
    await priceInput.dispatchEvent('input');

    await expect(simHf).toHaveAttribute('data-health-status', 'critical');
  });

  test('[BT-17] slider adjusts simulated price and health factor updates in sync', async ({ page }) => {
    await mockPositionEndpoint(page, MOCK_POSITION_HEALTHY);
    await connectBothWallets(page);
    await goToPositionDashboard(page);
    await page.locator('[data-testid="open-simulation-btn"]').click();

    const simPanel = page.locator('[data-testid="risk-simulation-panel"]');
    const priceSlider = simPanel.locator('[data-testid="btc-price-slider"]');
    const simHf = simPanel.locator('[data-testid="simulated-health-factor"]');

    // Move slider to minimum value (simulate maximum price drop)
    await priceSlider.evaluate((el: HTMLInputElement) => {
      el.value = el.min;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Health factor should reflect the minimum price scenario
    const hfText = await simHf.textContent();
    const hf = parseFloat(hfText ?? '999');
    expect(hf).toBeGreaterThanOrEqual(0);
    expect(hf).toBeLessThan(2.1); // must have changed from initial
  });
});
