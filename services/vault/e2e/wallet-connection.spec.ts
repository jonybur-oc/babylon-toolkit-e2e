/**
 * Wallet Connection E2E Tests
 * Derived from product intent specification — babylon-toolkit stories.yaml
 *
 * Stories covered:
 *   BT-01: User can connect a Bitcoin wallet
 *   BT-02: User can connect an Ethereum wallet
 *   BT-03: User can disconnect wallets
 *
 * Naming convention: [BT-XX] prefix on every test title enables deterministic
 * mapping by the Locus audit action (locus-audit-action@v1).
 */

import { test, expect } from '@playwright/test';
import {
  setupWalletMocks,
  mockOkxWalletReject,
  mockWrongNetwork,
} from '../../../mocks/wallet-providers';
import { setupBlockchainMocks } from '../../../mocks/blockchain';

test.beforeEach(async ({ page }) => {
  await setupWalletMocks(page);
  await setupBlockchainMocks(page);
  await page.goto('/');
});

// ── BT-01: Bitcoin wallet connection ────────────────────────────────────────

test.describe('[BT-01] User can connect a Bitcoin wallet', () => {
  test('[BT-01] Wallet connect dialog opens when user clicks Connect Wallet', async ({ page }) => {
    const connectBtn = page.locator('[data-testid="connect-wallet-btn"]');
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();

    const dialog = page.locator('[data-testid="wallet-dialog"]');
    await expect(dialog).toBeVisible();
  });

  test('[BT-01] OKX Wallet, Unisat, and Xverse are listed as Bitcoin wallet options', async ({ page }) => {
    await page.locator('[data-testid="connect-wallet-btn"]').click();
    const dialog = page.locator('[data-testid="wallet-dialog"]');
    await expect(dialog).toBeVisible();

    await expect(page.locator('[data-testid="btc-wallet-option-okx"]')).toBeVisible();
    await expect(page.locator('[data-testid="btc-wallet-option-unisat"]')).toBeVisible();
    await expect(page.locator('[data-testid="btc-wallet-option-xverse"]')).toBeVisible();
  });

  test('[BT-01] Selecting OKX wallet triggers native connect prompt and shows BTC address in header', async ({ page }) => {
    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="btc-wallet-option-okx"]').click();

    // After connect, dialog should close and BTC address should appear in header
    await expect(page.locator('[data-testid="wallet-dialog"]')).not.toBeVisible();
    const btcDisplay = page.locator('[data-testid="btc-address-display"]');
    await expect(btcDisplay).toBeVisible();
    await expect(btcDisplay).toContainText('bc1q');
  });

  test('[BT-01] Selecting Unisat wallet triggers native connect prompt and shows BTC address in header', async ({ page }) => {
    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="btc-wallet-option-unisat"]').click();

    await expect(page.locator('[data-testid="wallet-dialog"]')).not.toBeVisible();
    const btcDisplay = page.locator('[data-testid="btc-address-display"]');
    await expect(btcDisplay).toBeVisible();
    await expect(btcDisplay).toContainText('bc1q');
  });

  test('[BT-01] If wallet rejects connection, error message is shown and dialog remains open', async ({ page }) => {
    await page.locator('[data-testid="connect-wallet-btn"]').click();
    // Override OKX to reject before clicking
    await mockOkxWalletReject(page);
    await page.locator('[data-testid="btc-wallet-option-okx"]').click();

    // Dialog should stay open with an error message
    const dialog = page.locator('[data-testid="wallet-dialog"]');
    await expect(dialog).toBeVisible();
    const errorMsg = page.locator('[data-testid="wallet-connect-error"]');
    await expect(errorMsg).toBeVisible();
  });

  test('[BT-01] Connected wallet persists across page refresh via localStorage', async ({ page }) => {
    // Connect OKX wallet
    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="btc-wallet-option-okx"]').click();
    await expect(page.locator('[data-testid="btc-address-display"]')).toBeVisible();

    // Reload the page
    await page.reload();

    // BTC address should still be displayed (loaded from localStorage)
    const btcDisplay = page.locator('[data-testid="btc-address-display"]');
    await expect(btcDisplay).toBeVisible({ timeout: 5000 });
  });
});

// ── BT-02: Ethereum wallet connection ───────────────────────────────────────

test.describe('[BT-02] User can connect an Ethereum wallet', () => {
  test('[BT-02] MetaMask and WalletConnect are listed as Ethereum wallet options', async ({ page }) => {
    await page.locator('[data-testid="connect-wallet-btn"]').click();
    const dialog = page.locator('[data-testid="wallet-dialog"]');
    await expect(dialog).toBeVisible();

    await expect(page.locator('[data-testid="eth-wallet-option-metamask"]')).toBeVisible();
    await expect(page.locator('[data-testid="eth-wallet-option-walletconnect"]')).toBeVisible();
  });

  test('[BT-02] Selecting MetaMask triggers connect prompt and shows ETH address in header', async ({ page }) => {
    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="eth-wallet-option-metamask"]').click();

    await expect(page.locator('[data-testid="wallet-dialog"]')).not.toBeVisible();
    const ethDisplay = page.locator('[data-testid="eth-address-display"]');
    await expect(ethDisplay).toBeVisible();
    await expect(ethDisplay).toContainText('0x');
  });

  test('[BT-02] If ETH wallet rejects the connection, error message is shown', async ({ page }) => {
    await page.locator('[data-testid="connect-wallet-btn"]').click();

    // Override MetaMask to reject
    await page.evaluate(() => {
      (window as any).ethereum.request = async ({ method }: { method: string }) => {
        if (method === 'eth_requestAccounts') {
          throw new Error('MetaMask: User denied account access');
        }
        return null;
      };
    });

    await page.locator('[data-testid="eth-wallet-option-metamask"]').click();

    const dialog = page.locator('[data-testid="wallet-dialog"]');
    await expect(dialog).toBeVisible();
    await expect(page.locator('[data-testid="wallet-connect-error"]')).toBeVisible();
  });

  test('[BT-02] Connected ETH wallet persists across page refresh', async ({ page }) => {
    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="eth-wallet-option-metamask"]').click();
    await expect(page.locator('[data-testid="eth-address-display"]')).toBeVisible();

    await page.reload();
    await expect(page.locator('[data-testid="eth-address-display"]')).toBeVisible({ timeout: 5000 });
  });

  test('[BT-02] Wrong network warning is shown when user is not on expected Ethereum chain', async ({ page }) => {
    await setupWalletMocks(page); // reset mocks (beforeEach already ran but this ensures clean state)
    await mockWrongNetwork(page, '0x89'); // Polygon — wrong network

    await page.goto('/'); // navigate again to pick up new mock
    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="eth-wallet-option-metamask"]').click();

    const warning = page.locator('[data-testid="wrong-network-warning"]');
    await expect(warning).toBeVisible();
  });
});

// ── BT-03: Wallet disconnection ──────────────────────────────────────────────

test.describe('[BT-03] User can disconnect wallets', () => {
  // Helper: connect both wallets before each disconnect test
  async function connectBothWallets(page: any) {
    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="btc-wallet-option-okx"]').click();
    await expect(page.locator('[data-testid="btc-address-display"]')).toBeVisible();

    await page.locator('[data-testid="connect-wallet-btn"]').click();
    await page.locator('[data-testid="eth-wallet-option-metamask"]').click();
    await expect(page.locator('[data-testid="eth-address-display"]')).toBeVisible();
  }

  test('[BT-03] Disconnect option is accessible from wallet address display in the header', async ({ page }) => {
    await connectBothWallets(page);
    // Clicking BTC address should reveal disconnect button
    await page.locator('[data-testid="btc-address-display"]').click();
    await expect(page.locator('[data-testid="disconnect-btn"]')).toBeVisible();
  });

  test('[BT-03] Disconnecting BTC wallet clears BTC address from UI and resets wallet state', async ({ page }) => {
    await connectBothWallets(page);
    await page.locator('[data-testid="btc-address-display"]').click();
    await page.locator('[data-testid="disconnect-btn"]').click();

    // BTC address display should be gone
    await expect(page.locator('[data-testid="btc-address-display"]')).not.toBeVisible();
  });

  test('[BT-03] Disconnecting ETH wallet clears ETH address from UI', async ({ page }) => {
    await connectBothWallets(page);
    await page.locator('[data-testid="eth-address-display"]').click();
    await page.locator('[data-testid="disconnect-btn"]').click();

    await expect(page.locator('[data-testid="eth-address-display"]')).not.toBeVisible();
  });

  test('[BT-03] After disconnecting, user is returned to unauthenticated state', async ({ page }) => {
    await connectBothWallets(page);
    // Disconnect BTC
    await page.locator('[data-testid="btc-address-display"]').click();
    await page.locator('[data-testid="disconnect-btn"]').click();
    // Connect button should reappear
    await expect(page.locator('[data-testid="connect-wallet-btn"]')).toBeVisible();
  });

  test('[BT-03] Disconnect removes wallet from localStorage so it does not auto-reconnect on refresh', async ({ page }) => {
    await connectBothWallets(page);
    await page.locator('[data-testid="btc-address-display"]').click();
    await page.locator('[data-testid="disconnect-btn"]').click();

    // Verify localStorage key is cleared
    const storedWallet = await page.evaluate(() =>
      localStorage.getItem('connectedBtcWallet') ?? localStorage.getItem('btcWallet')
    );
    expect(storedWallet).toBeNull();

    // Reload — should not auto-reconnect
    await page.reload();
    await expect(page.locator('[data-testid="btc-address-display"]')).not.toBeVisible({ timeout: 3000 });
  });
});
