/**
 * Playwright global setup for Babylon Vault E2E suite.
 * All wallet providers (OKX, Unisat, MetaMask) and blockchain calls
 * are mocked — tests run in CI without a live chain connection.
 */
export default async function globalSetup() {
  console.log('[babylon-toolkit-e2e] Running with mocked wallet providers and blockchain calls');
  console.log('[babylon-toolkit-e2e] Coverage: BT-01 to BT-10, BT-21 to BT-22');
  console.log('[babylon-toolkit-e2e] Stories spec: stories.yaml (23 stories, BT-01 to BT-23)');
}
