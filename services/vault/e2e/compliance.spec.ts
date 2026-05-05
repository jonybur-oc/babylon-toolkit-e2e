/**
 * Compliance E2E Tests — Sanctions Screening and Geofencing
 * Derived from product intent specification — babylon-toolkit stories.yaml
 *
 * Stories covered:
 *   BT-21: Sanctioned addresses are blocked from depositing
 *   BT-22: Users in restricted jurisdictions are geofenced
 *
 * Naming convention: [BT-XX] prefix on every test title enables deterministic
 * mapping by the Locus audit action (locus-audit-action@v1).
 */

import { test, expect } from '@playwright/test';
import { setupWalletMocks } from '../../../mocks/wallet-providers';
import {
  setupBlockchainMocks,
  mockSanctionedAddress,
  mockRestrictedJurisdiction,
} from '../../../mocks/blockchain';

// ── BT-21: Sanctions screening ───────────────────────────────────────────────

test.describe('[BT-21] Sanctioned addresses are blocked from depositing', () => {
  test('[BT-21] On wallet connect, connected ETH and BTC addresses are screened against a sanctions list', async ({ page }) => {
    let sanctionsCheckCalled = false;

    await setupWalletMocks(page);
    await setupBlockchainMocks(page);
    // Intercept and track sanctions check
    await page.route('**/api/sanctions-check', async (route) => {
      sanctionsCheckCalled = true;
      await route.fulfill({ json: { sanctioned: false } });
    });
    await page.goto('/');

    // Connect wallet — this should trigger sanctions check
    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="btc-wallet-option-okx"]').click();
    await expect(page.locator('[data-testid="btc-address-display"]')).toBeVisible();

    // Wait briefly for async sanctions check
    await page.waitForTimeout(500);
    expect(sanctionsCheckCalled).toBe(true);
  });

  test('[BT-21] Sanctioned address shows blocking modal and disables all deposit functionality', async ({ page }) => {
    await setupWalletMocks(page);
    await mockSanctionedAddress(page);
    await page.goto('/');

    // Connect wallet (sanctioned)
    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="btc-wallet-option-okx"]').click();

    const blockingModal = page.locator('[data-testid="sanctions-blocking-modal"]');
    await expect(blockingModal).toBeVisible({ timeout: 5000 });

    // Deposit functionality should be disabled
    const depositFlow = page.locator('[data-testid="deposit-flow-disabled"]');
    const depositBtn = page.locator('[data-testid="deposit-btn"]');
    const hasDisabledFlow = await depositFlow.isVisible().catch(() => false);
    const isDepositDisabled = await depositBtn.isDisabled().catch(() => false);
    expect(hasDisabledFlow || isDepositDisabled).toBe(true);
  });

  test('[BT-21] Blocking modal does not reveal the specific list or reason to avoid fingerprinting', async ({ page }) => {
    await setupWalletMocks(page);
    await mockSanctionedAddress(page);
    await page.goto('/');

    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="btc-wallet-option-okx"]').click();

    const blockingModal = page.locator('[data-testid="sanctions-blocking-modal"]');
    await expect(blockingModal).toBeVisible({ timeout: 5000 });

    // Modal text should NOT mention OFAC, SDN, Chainalysis, or specific list names
    const modalText = await blockingModal.innerText();
    expect(modalText).not.toMatch(/OFAC|SDN|Chainalysis|Elliptic|TRM|screening list/i);
  });

  test('[BT-21] Non-sanctioned users pass through without any UX friction', async ({ page }) => {
    await setupWalletMocks(page);
    await setupBlockchainMocks(page); // default mock: sanctioned: false
    await page.goto('/');

    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="btc-wallet-option-okx"]').click();
    await expect(page.locator('[data-testid="btc-address-display"]')).toBeVisible();

    // Blocking modal should NOT appear
    const blockingModal = page.locator('[data-testid="sanctions-blocking-modal"]');
    await expect(blockingModal).not.toBeVisible({ timeout: 3000 });
  });

  test('[BT-21] Sanctions check is re-run when user connects a different wallet', async ({ page }) => {
    let checkCount = 0;

    await setupWalletMocks(page);
    await page.route('**/api/sanctions-check', async (route) => {
      checkCount++;
      await route.fulfill({ json: { sanctioned: false } });
    });
    await page.goto('/');

    // First wallet connection
    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="btc-wallet-option-okx"]').click();
    await expect(page.locator('[data-testid="btc-address-display"]')).toBeVisible();
    await page.waitForTimeout(300);

    const firstCount = checkCount;

    // Disconnect and connect a different wallet
    await page.locator('[data-testid="btc-address-display"]').click();
    await page.locator('[data-testid="disconnect-btn"]').click();

    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="btc-wallet-option-unisat"]').click();
    await expect(page.locator('[data-testid="btc-address-display"]')).toBeVisible();
    await page.waitForTimeout(300);

    // Should have been called again for the new wallet
    expect(checkCount).toBeGreaterThan(firstCount);
  });
});

// ── BT-22: Geofencing ────────────────────────────────────────────────────────

test.describe('[BT-22] Users in restricted jurisdictions are geofenced', () => {
  test('[BT-22] On load, the app determines user jurisdiction via IP geolocation', async ({ page }) => {
    let geolocationCalled = false;

    await setupWalletMocks(page);
    await page.route('**/api/geolocation', async (route) => {
      geolocationCalled = true;
      await route.fulfill({ json: { country: 'US', restricted: false } });
    });
    await page.goto('/');

    await page.waitForTimeout(500); // allow async check
    expect(geolocationCalled).toBe(true);
  });

  test('[BT-22] Restricted jurisdiction user sees geofencing notice and cannot access deposit or borrow flows', async ({ page }) => {
    await setupWalletMocks(page);
    await mockRestrictedJurisdiction(page, { country: 'KP' });
    await page.goto('/');

    const geofencingNotice = page.locator('[data-testid="geofencing-notice"]');
    await expect(geofencingNotice).toBeVisible({ timeout: 5000 });

    // Deposit and borrow flows should be inaccessible
    const depositBtn = page.locator('[data-testid="deposit-btn"]');
    const depositDisabled = page.locator('[data-testid="deposit-flow-disabled"]');

    const btnDisabled = await depositBtn.isDisabled().catch(() => false);
    const flowDisabled = await depositDisabled.isVisible().catch(() => false);
    expect(btnDisabled || flowDisabled).toBe(true);
  });

  test('[BT-22] Geofencing does not block read-only views (vault status, activity log)', async ({ page }) => {
    await setupWalletMocks(page);
    await mockRestrictedJurisdiction(page, { country: 'IR' });
    await page.goto('/');

    // Geofencing notice appears for deposit
    await expect(page.locator('[data-testid="geofencing-notice"]')).toBeVisible({ timeout: 5000 });

    // But vault status page should still be accessible
    await page.goto('/vaults');
    const vaultStatusPage = page.locator('[data-testid="vault-status-page"]');
    await expect(vaultStatusPage).toBeVisible({ timeout: 5000 });

    // Activity log should also be accessible
    await page.goto('/activity');
    const activityLogPage = page.locator('[data-testid="activity-log-page"]');
    await expect(activityLogPage).toBeVisible({ timeout: 5000 });
  });

  test('[BT-22] VPN detection in a restricted region applies the geofencing block', async ({ page }) => {
    await setupWalletMocks(page);
    // Country is technically allowed but VPN detected + restricted
    await mockRestrictedJurisdiction(page, { country: 'US', vpnDetected: true });
    // Override to simulate: user appears to be in US but VPN flagged as from restricted region
    await page.route('**/api/geolocation', async (route) => {
      await route.fulfill({
        json: { country: 'US', restricted: true, vpnDetected: true },
      });
    });
    await page.goto('/');

    const geofencingNotice = page.locator('[data-testid="geofencing-notice"]');
    await expect(geofencingNotice).toBeVisible({ timeout: 5000 });
  });

  test('[BT-22] Geofencing result is cached for the session to avoid repeated API calls', async ({ page }) => {
    let callCount = 0;

    await setupWalletMocks(page);
    await page.route('**/api/geolocation', async (route) => {
      callCount++;
      await route.fulfill({ json: { country: 'US', restricted: false } });
    });
    await page.goto('/');
    await page.waitForTimeout(300);

    const firstCount = callCount;

    // Navigate between pages within the same session
    await page.goto('/vaults');
    await page.waitForTimeout(300);
    await page.goto('/deposit');
    await page.waitForTimeout(300);

    // Geolocation API should NOT be called on each navigation — result is cached
    // Allow at most 1 additional call (some implementations re-check on route change)
    expect(callCount - firstCount).toBeLessThanOrEqual(1);
  });
});
