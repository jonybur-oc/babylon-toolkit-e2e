/**
 * Activity Log E2E Tests
 * Derived from product intent specification — babylon-toolkit stories.yaml
 *
 * Stories covered:
 *   BT-20: User can view transaction activity log
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

const MOCK_ACTIVITY_EVENTS = [
  {
    id: 'event-001',
    type: 'deposit',
    status: 'Confirmed',
    amountBtc: 0.05,
    date: new Date(Date.now() - 3_600_000).toISOString(),       // 1 hour ago
    btcTxid: 'mock-deposit-txid-001',
    ethTxHash: '0xmockdeposittx001',
  },
  {
    id: 'event-002',
    type: 'withdrawal',
    status: 'Confirmed',
    amountBtc: 0.02,
    date: new Date(Date.now() - 7_200_000).toISOString(),       // 2 hours ago
    btcTxid: 'mock-withdrawal-txid-002',
    ethTxHash: '0xmockwithdrawaltx002',
  },
  {
    id: 'event-003',
    type: 'deposit',
    status: 'Pending',
    amountBtc: 0.01,
    date: new Date(Date.now() - 300_000).toISOString(),         // 5 minutes ago (most recent)
    btcTxid: 'mock-pending-deposit-txid-003',
    ethTxHash: '0xmockpendingtx003',
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

async function mockActivityEndpoint(page: any, events = MOCK_ACTIVITY_EVENTS) {
  await page.route('**/api/activity**', async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events }),
    });
  });
}

async function goToActivityPage(page: any) {
  await page.goto('/activity');
  await expect(page.locator('[data-testid="activity-page"]')).toBeVisible();
}

// ── BT-20: Activity log ───────────────────────────────────────────────────────

test.describe('BT-20: Transaction activity log', () => {
  test.beforeEach(async ({ page }) => {
    await setupWalletMocks(page);
    await setupBlockchainMocks(page);
    await page.goto('/');
    await connectBothWallets(page);
  });

  test('[BT-20] activity page lists all historical deposit and withdrawal events for the connected address pair', async ({ page }) => {
    await mockActivityEndpoint(page, MOCK_ACTIVITY_EVENTS);
    await goToActivityPage(page);

    const activityList = page.locator('[data-testid="activity-list"]');
    await expect(activityList).toBeVisible();

    // All 3 events should be listed
    const activityItems = page.locator('[data-testid="activity-item"]');
    await expect(activityItems).toHaveCount(3);
  });

  test('[BT-20] each activity entry shows event type, date, BTC amount, and status', async ({ page }) => {
    await mockActivityEndpoint(page, MOCK_ACTIVITY_EVENTS);
    await goToActivityPage(page);

    const firstItem = page.locator('[data-testid="activity-item"]').first();
    await expect(firstItem).toBeVisible();

    // Event type (deposit / withdrawal)
    const eventType = firstItem.locator('[data-testid="activity-event-type"]');
    await expect(eventType).toBeVisible();
    await expect(eventType).toContainText(/deposit|withdrawal/i);

    // Date
    const eventDate = firstItem.locator('[data-testid="activity-event-date"]');
    await expect(eventDate).toBeVisible();

    // BTC amount
    const eventAmount = firstItem.locator('[data-testid="activity-event-amount"]');
    await expect(eventAmount).toBeVisible();
    await expect(eventAmount).toContainText(/btc|0\.\d+/i);

    // Status
    const eventStatus = firstItem.locator('[data-testid="activity-event-status"]');
    await expect(eventStatus).toBeVisible();
    await expect(eventStatus).toContainText(/confirmed|pending/i);
  });

  test('[BT-20] events are sorted by date descending — most recent first', async ({ page }) => {
    await mockActivityEndpoint(page, MOCK_ACTIVITY_EVENTS);
    await goToActivityPage(page);

    const activityItems = page.locator('[data-testid="activity-item"]');
    await expect(activityItems).toHaveCount(3);

    // event-003 (5 min ago, Pending) should be first as it is most recent
    const firstItem = activityItems.first();
    const firstItemId = await firstItem.getAttribute('data-event-id');
    expect(firstItemId).toBe('event-003');

    // event-002 (2 hrs ago) should be last
    const lastItem = activityItems.last();
    const lastItemId = await lastItem.getAttribute('data-event-id');
    expect(lastItemId).toBe('event-002');
  });

  test('[BT-20] pending deposits appear in activity log with a Pending badge', async ({ page }) => {
    await mockActivityEndpoint(page, MOCK_ACTIVITY_EVENTS);
    await goToActivityPage(page);

    // event-003 is a Pending deposit
    const pendingItem = page.locator('[data-testid="activity-item"][data-event-id="event-003"]');
    await expect(pendingItem).toBeVisible();

    const pendingBadge = pendingItem.locator('[data-testid="activity-pending-badge"]');
    await expect(pendingBadge).toBeVisible();
    await expect(pendingBadge).toContainText(/pending/i);
  });

  test('[BT-20] clicking an activity entry shows transaction details including on-chain links', async ({ page }) => {
    await mockActivityEndpoint(page, MOCK_ACTIVITY_EVENTS);
    await goToActivityPage(page);

    const firstItem = page.locator('[data-testid="activity-item"]').first();
    await firstItem.click();

    // A detail panel or modal should open
    const detailPanel = page.locator('[data-testid="activity-detail-panel"], [data-testid="activity-detail-modal"]');
    await expect(detailPanel).toBeVisible({ timeout: 5000 });

    // BTC txid link
    const btcTxidLink = detailPanel.locator('a[href*="mempool.space"], a[href*="blockstream.info"]');
    await expect(btcTxidLink).toBeVisible();

    // ETH tx hash link
    const ethTxLink = detailPanel.locator('a[href*="etherscan.io"], a[href*="beaconcha.in"]');
    await expect(ethTxLink).toBeVisible();

    // Both links open in new tabs
    await expect(btcTxidLink).toHaveAttribute('target', '_blank');
    await expect(ethTxLink).toHaveAttribute('target', '_blank');
  });

  test('[BT-20] activity list is empty state when no historical transactions exist', async ({ page }) => {
    await mockActivityEndpoint(page, []); // no events
    await goToActivityPage(page);

    const activityItems = page.locator('[data-testid="activity-item"]');
    await expect(activityItems).toHaveCount(0);

    // Empty state message should be shown
    const emptyState = page.locator('[data-testid="activity-empty-state"]');
    await expect(emptyState).toBeVisible();
    await expect(emptyState).toContainText(/no transactions|no activity|nothing yet/i);
  });

  test('[BT-20] both deposit and withdrawal event types are distinguishable in the list', async ({ page }) => {
    await mockActivityEndpoint(page, MOCK_ACTIVITY_EVENTS);
    await goToActivityPage(page);

    // There should be items with both type labels
    const depositType = page.locator('[data-testid="activity-event-type"]:has-text("Deposit"), [data-testid="activity-event-type"]:has-text("deposit")');
    const withdrawalType = page.locator('[data-testid="activity-event-type"]:has-text("Withdrawal"), [data-testid="activity-event-type"]:has-text("withdrawal")');

    await expect(depositType.first()).toBeVisible();
    await expect(withdrawalType.first()).toBeVisible();
  });
});
