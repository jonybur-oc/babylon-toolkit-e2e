/**
 * Application Selection E2E Tests
 * Derived from product intent specification — babylon-toolkit stories.yaml
 *
 * Stories covered:
 *   BT-23: User can navigate between registered DeFi applications
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

const MOCK_APPLICATIONS = [
  {
    id: 'aave',
    name: 'Aave',
    description: 'Borrow and lend assets using your vaultBTC as collateral.',
    logoUrl: '/logos/aave.svg',
    available: true,
  },
  {
    id: 'compound',
    name: 'Compound',
    description: 'Supply assets to earn yield or borrow against collateral.',
    logoUrl: '/logos/compound.svg',
    available: false,          // paused by admin
    unavailableReason: 'Temporarily paused for maintenance.',
  },
  {
    id: 'uniswap',
    name: 'Uniswap',
    description: 'Swap tokens using your vaultBTC collateral.',
    logoUrl: '/logos/uniswap.svg',
    available: true,
  },
];

// ── Shared helpers ────────────────────────────────────────────────────────────

async function connectBothWallets(page: any) {
  await page.locator('[data-testid="connect-wallet-btn"]').click();
  await page.locator('[data-testid="btc-wallet-option-okx"]').click();
  await expect(page.locator('[data-testid="btc-address-display"]')).toBeVisible();

  await page.locator('[data-testid="connect-wallet-btn"]').click();
  await page.locator('[data-testid="eth-wallet-option-metamask"]').click();
  await expect(page.locator('[data-testid="eth-address-display"]')).toBeVisible();
}

async function mockApplicationRegistry(page: any, apps = MOCK_APPLICATIONS) {
  await page.route('**/api/applications**', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ applications: apps }),
    });
  });
}

async function goToApplicationDashboard(page: any) {
  await page.goto('/apps');
  await expect(page.locator('[data-testid="application-dashboard"]')).toBeVisible();
}

// ── BT-23: Application selection ─────────────────────────────────────────────

test.describe('BT-23: DeFi application navigation', () => {
  test.beforeEach(async ({ page }) => {
    await setupWalletMocks(page);
    await setupBlockchainMocks(page);
    await page.goto('/');
    await connectBothWallets(page);
  });

  test('[BT-23] dashboard lists all registered applications fetched from the application registry', async ({ page }) => {
    await mockApplicationRegistry(page, MOCK_APPLICATIONS);
    await goToApplicationDashboard(page);

    const appList = page.locator('[data-testid="application-list"]');
    await expect(appList).toBeVisible();

    const appItems = page.locator('[data-testid="application-item"]');
    await expect(appItems).toHaveCount(3);
  });

  test('[BT-23] each application entry shows its name, logo, and brief description', async ({ page }) => {
    await mockApplicationRegistry(page, MOCK_APPLICATIONS);
    await goToApplicationDashboard(page);

    const firstApp = page.locator('[data-testid="application-item"]').first();
    await expect(firstApp).toBeVisible();

    // Name
    const appName = firstApp.locator('[data-testid="application-name"]');
    await expect(appName).toBeVisible();
    await expect(appName).toContainText(/aave|compound|uniswap/i);

    // Logo (img or svg)
    const appLogo = firstApp.locator('[data-testid="application-logo"]');
    await expect(appLogo).toBeVisible();

    // Description
    const appDescription = firstApp.locator('[data-testid="application-description"]');
    await expect(appDescription).toBeVisible();
    const descText = await appDescription.textContent();
    expect(descText?.length).toBeGreaterThan(10); // non-empty meaningful description
  });

  test('[BT-23] clicking an available application navigates to /app/<appId>/* route', async ({ page }) => {
    await mockApplicationRegistry(page, MOCK_APPLICATIONS);
    await goToApplicationDashboard(page);

    // Click the first available app (Aave)
    const aaveItem = page.locator('[data-testid="application-item"][data-app-id="aave"]');
    await expect(aaveItem).toBeVisible();
    await aaveItem.click();

    // Should navigate to the Aave sub-route
    await expect(page).toHaveURL(/\/app\/aave/, { timeout: 5000 });
  });

  test('[BT-23] unavailable applications are shown as disabled with a tooltip', async ({ page }) => {
    await mockApplicationRegistry(page, MOCK_APPLICATIONS);
    await goToApplicationDashboard(page);

    // Compound is marked available: false in our mock
    const compoundItem = page.locator('[data-testid="application-item"][data-app-id="compound"]');
    await expect(compoundItem).toBeVisible();

    // It should appear visually disabled
    const isDisabled = await compoundItem.getAttribute('data-disabled');
    expect(isDisabled).toBe('true');

    // Hover to reveal tooltip explaining why it's disabled
    await compoundItem.hover();
    const tooltip = page.locator('[data-testid="application-unavailable-tooltip"], [role="tooltip"]');
    await expect(tooltip).toBeVisible({ timeout: 3000 });
    await expect(tooltip).toContainText(/paused|maintenance|unavailable/i);
  });

  test('[BT-23] clicking a disabled application does NOT navigate away', async ({ page }) => {
    await mockApplicationRegistry(page, MOCK_APPLICATIONS);
    await goToApplicationDashboard(page);

    const currentUrl = page.url();

    const compoundItem = page.locator('[data-testid="application-item"][data-app-id="compound"]');
    await compoundItem.click({ force: true }); // force=true clicks even if pointer-events: none

    // URL should remain on /apps — no navigation occurred
    await page.waitForTimeout(500);
    expect(page.url()).toBe(currentUrl);
  });

  test('[BT-23] application list is dynamically driven by getAllApplications() — multiple apps render without hardcoded routes', async ({ page }) => {
    // Swap in a completely different set of applications — not Aave or Compound
    const dynamicApps = [
      {
        id: 'morpho',
        name: 'Morpho',
        description: 'Optimised lending and borrowing on top of Aave and Compound.',
        logoUrl: '/logos/morpho.svg',
        available: true,
      },
      {
        id: 'spark',
        name: 'Spark',
        description: 'DAI-native lending protocol by MakerDAO.',
        logoUrl: '/logos/spark.svg',
        available: true,
      },
    ];

    await mockApplicationRegistry(page, dynamicApps);
    await goToApplicationDashboard(page);

    const appItems = page.locator('[data-testid="application-item"]');
    await expect(appItems).toHaveCount(2);

    // Names from the dynamic registry are rendered
    await expect(page.locator('[data-testid="application-name"]').nth(0)).toContainText('Morpho');
    await expect(page.locator('[data-testid="application-name"]').nth(1)).toContainText('Spark');

    // Clicking Morpho navigates to /app/morpho (no hardcoded route required)
    const morphoItem = page.locator('[data-testid="application-item"][data-app-id="morpho"]');
    await morphoItem.click();
    await expect(page).toHaveURL(/\/app\/morpho/, { timeout: 5000 });
  });

  test('[BT-23] available applications are visually distinct from disabled ones', async ({ page }) => {
    await mockApplicationRegistry(page, MOCK_APPLICATIONS);
    await goToApplicationDashboard(page);

    const availableItem = page.locator('[data-testid="application-item"][data-app-id="aave"]');
    const disabledItem = page.locator('[data-testid="application-item"][data-app-id="compound"]');

    await expect(availableItem).toBeVisible();
    await expect(disabledItem).toBeVisible();

    // data-disabled attribute distinguishes them
    await expect(availableItem).toHaveAttribute('data-disabled', 'false');
    await expect(disabledItem).toHaveAttribute('data-disabled', 'true');
  });
});
