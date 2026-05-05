import type { Page } from '@playwright/test';

const MOCK_PROVIDERS = {
  data: {
    vaultProviders: [
      { id: 'vp-1', name: 'Babylon Vault Provider Alpha', minDeposit: 0.001, maxDeposit: 10, fee: 0.0005 },
      { id: 'vp-2', name: 'Babylon Vault Provider Beta', minDeposit: 0.005, maxDeposit: 5, fee: 0.0003 },
    ],
  },
};

const MOCK_APPLICATIONS = {
  data: {
    applications: [
      { id: 'aave', name: 'Aave', logo: '/logos/aave.png', description: 'Borrow against your vaultBTC', available: true },
    ],
  },
};

/**
 * Sets up route-level mocks for blockchain/API calls.
 * Intercepts GraphQL, geolocation, sanctions, pegin status, and BTC RPC.
 */
export async function setupBlockchainMocks(page: Page): Promise<void> {
  // ── GraphQL ─────────────────────────────────────────────────────────────
  await page.route('**/graphql', async (route) => {
    const req = route.request();
    const body = req.postDataJSON?.() as { query?: string } | null;
    const query = body?.query ?? '';

    if (query.includes('vaultProviders') || query.includes('VaultProviders')) {
      await route.fulfill({ json: MOCK_PROVIDERS });
    } else if (query.includes('getAllApplications') || query.includes('applications')) {
      await route.fulfill({ json: MOCK_APPLICATIONS });
    } else if (query.includes('peginStatus') || query.includes('getPeginStatus')) {
      await route.fulfill({
        json: { data: { peginStatus: { status: 'PendingDepositorWotsPK', txid: null } } },
      });
    } else if (query.includes('pegoutStatus') || query.includes('getPegoutStatus')) {
      await route.fulfill({
        json: { data: { pegoutStatus: { status: 'Initiated', btcTxid: null } } },
      });
    } else {
      await route.fulfill({ json: { data: {} } });
    }
  });

  // ── Geolocation ──────────────────────────────────────────────────────────
  await page.route('**/api/geolocation', async (route) => {
    await route.fulfill({
      json: { country: 'US', restricted: false, vpnDetected: false },
    });
  });

  // ── Sanctions screening ──────────────────────────────────────────────────
  await page.route('**/api/sanctions-check', async (route) => {
    await route.fulfill({
      json: { sanctioned: false, address: route.request().postDataJSON()?.address },
    });
  });

  // ── Pegin status REST (fallback) ─────────────────────────────────────────
  await page.route('**/api/pegin-status*', async (route) => {
    await route.fulfill({
      json: { status: 'PendingDepositorWotsPK', vaultId: 'mock-vault-id-001' },
    });
  });

  // ── Bitcoin RPC / broadcast ──────────────────────────────────────────────
  await page.route('**/btc/**', async (route) => {
    await route.fulfill({
      json: { txid: 'mock-btc-txid-' + Date.now(), confirmed: false },
    });
  });

  // ── WOTS key submission ──────────────────────────────────────────────────
  await page.route('**/api/wots**', async (route) => {
    await route.fulfill({ json: { success: true } });
  });

  // ── Artifact download ────────────────────────────────────────────────────
  await page.route('**/api/vault-artifact*', async (route) => {
    await route.fulfill({
      headers: { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="vault-artifact.json"' },
      body: JSON.stringify({ vaultId: 'mock-vault-id-001', createdAt: new Date().toISOString() }),
    });
  });

  // ── ETH vault registration contract ─────────────────────────────────────
  await page.route('**/api/submitPeginRequestBatch*', async (route) => {
    await route.fulfill({ json: { txHash: '0xmockpeginbatchtx' + Date.now() } });
  });

  // ── Activation service ───────────────────────────────────────────────────
  await page.route('**/api/vault-activation*', async (route) => {
    await route.fulfill({
      json: { success: true, txHash: '0xmockactivationtx' + Date.now() },
    });
  });
}

/**
 * Override geolocation to return a restricted jurisdiction.
 * Call inside individual tests that verify geofencing.
 */
export async function mockRestrictedJurisdiction(
  page: Page,
  options: { country?: string; vpnDetected?: boolean } = {}
): Promise<void> {
  const { country = 'KP', vpnDetected = false } = options;
  await page.route('**/api/geolocation', async (route) => {
    await route.fulfill({
      json: { country, restricted: true, vpnDetected },
    });
  });
}

/**
 * Override sanctions check to return a sanctioned address.
 */
export async function mockSanctionedAddress(page: Page): Promise<void> {
  await page.route('**/api/sanctions-check', async (route) => {
    await route.fulfill({
      json: { sanctioned: true },
    });
  });
}

/**
 * Override ETH registration to fail — used in BT-06 to verify BTC is NOT broadcast.
 */
export async function mockEthRegistrationFail(page: Page): Promise<void> {
  await page.route('**/api/submitPeginRequestBatch*', async (route) => {
    await route.fulfill({ status: 500, json: { error: 'Transaction reverted' } });
  });
}

/**
 * Override pegin status to return a state OTHER than PendingDepositorWotsPK —
 * used in BT-08 to verify WOTS submission is skipped when VP has already advanced.
 */
export async function mockPeginStatusAdvanced(page: Page): Promise<void> {
  await page.route('**/api/pegin-status*', async (route) => {
    await route.fulfill({ json: { status: 'PendingActivation', vaultId: 'mock-vault-id-001' } });
  });
  await page.route('**/graphql', async (route) => {
    await route.fulfill({
      json: { data: { peginStatus: { status: 'PendingActivation', txid: 'mock-btc-txid-confirmed' } } },
    });
  });
}

/**
 * Override vault activation to return a hash mismatch error —
 * used in BT-10 to verify activation is blocked when hash does not match.
 */
export async function mockActivationHashMismatch(page: Page): Promise<void> {
  await page.route('**/api/vault-activation*', async (route) => {
    await route.fulfill({
      status: 422,
      json: { error: 'HASH_MISMATCH', message: 'hash(secret) !== expectedHash; activation blocked' },
    });
  });
}
