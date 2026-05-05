import type { Page } from '@playwright/test';

/**
 * Injects mock wallet providers (OKX, Unisat, MetaMask) into the browser window.
 * Call this in test.beforeEach before page.goto() to ensure mocks are present
 * before any page scripts run.
 *
 * All providers resolve successfully by default. Override specific methods
 * within individual tests to simulate rejections or errors.
 */
export async function setupWalletMocks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // ── OKX Wallet (Bitcoin) ────────────────────────────────────────────────
    (window as any).okxwallet = {
      bitcoin: {
        connect: async () => ({
          address: 'bc1qmockbtcaddress1234567890abcdef',
          publicKey: '02mock0btcpubkey1234567890abcdef0123456789abcdef01234567890abcdef01',
        }),
        disconnect: async () => undefined,
        signMessage: async (msg: string) => 'mock-bip322-okx-sig-' + msg.slice(0, 8),
        getAccounts: async () => ['bc1qmockbtcaddress1234567890abcdef'],
        sendBitcoin: async (toAddress: string, satoshis: number) => ({
          txid: 'mock-btc-txid-okx-' + Date.now(),
        }),
      },
      // Track broadcast calls for BT-06 test
      _broadcastCalled: false,
    };

    // ── Unisat (Bitcoin) ────────────────────────────────────────────────────
    (window as any).unisat = {
      requestAccounts: async () => ['bc1qmockuisataddress0987654321'],
      getAccounts: async () => ['bc1qmockuisataddress0987654321'],
      signMessage: async (msg: string) => 'mock-bip322-signature-' + msg.slice(0, 8),
      disconnect: async () => undefined,
      sendBitcoin: async (toAddress: string, satoshis: number) => ({
        txid: 'mock-btc-txid-unisat-' + Date.now(),
      }),
    };

    // ── MetaMask / EIP-1193 Ethereum provider ───────────────────────────────
    (window as any).ethereum = {
      isMetaMask: true,
      selectedAddress: null as string | null,
      chainId: '0x1',
      _listeners: {} as Record<string, Function[]>,

      request: async ({ method, params }: { method: string; params?: any[] }) => {
        switch (method) {
          case 'eth_requestAccounts': {
            (window as any).ethereum.selectedAddress = '0xMockEthAddress1234567890abcdef1234567890';
            return ['0xMockEthAddress1234567890abcdef1234567890'];
          }
          case 'eth_accounts': {
            return (window as any).ethereum.selectedAddress
              ? [(window as any).ethereum.selectedAddress]
              : [];
          }
          case 'eth_chainId': {
            return '0x1'; // mainnet
          }
          case 'net_version': {
            return '1';
          }
          case 'eth_sendTransaction': {
            // Track BTC broadcast guard for BT-06
            return '0xmocktxhash' + Date.now();
          }
          case 'eth_getBalance': {
            return '0x1BC16D674EC80000'; // 2 ETH
          }
          case 'eth_call': {
            return '0x0000000000000000000000000000000000000000000000000000000000000001';
          }
          case 'wallet_switchEthereumChain': {
            (window as any).ethereum.chainId = (params?.[0] as any)?.chainId ?? '0x1';
            return null;
          }
          default: {
            throw new Error(`[mock] Unhandled ETH method: ${method}`);
          }
        }
      },

      on: (event: string, listener: Function) => {
        const eth = (window as any).ethereum;
        if (!eth._listeners[event]) eth._listeners[event] = [];
        eth._listeners[event].push(listener);
      },

      removeListener: (event: string, listener: Function) => {
        const eth = (window as any).ethereum;
        if (eth._listeners[event]) {
          eth._listeners[event] = eth._listeners[event].filter((l: Function) => l !== listener);
        }
      },
    };

    // Global flag for BT-06: tracks if BTC broadcast was attempted
    (window as any).btcBroadcastCalled = false;
  });
}

/**
 * Override OKX wallet to reject connection — simulates user declining the prompt.
 * Call this inside a specific test after setupWalletMocks() and page.goto().
 */
export async function mockOkxWalletReject(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as any).okxwallet.bitcoin.connect = async () => {
      throw new Error('User rejected the request');
    };
  });
}

/**
 * Override MetaMask to return wrong chainId — triggers wrong-network warning.
 */
export async function mockWrongNetwork(page: Page, chainId: string = '0x89'): Promise<void> {
  await page.evaluate((cid) => {
    (window as any).ethereum.chainId = cid;
    (window as any).ethereum.request = async ({ method }: { method: string }) => {
      if (method === 'eth_chainId') return cid;
      if (method === 'eth_requestAccounts') return ['0xMockEthAddress1234567890abcdef1234567890'];
      return null;
    };
  }, chainId);
}

/**
 * Override ETH wallet to fail sendTransaction — used in BT-06.
 */
export async function mockEthTransactionFail(page: Page): Promise<void> {
  await page.evaluate(() => {
    const orig = (window as any).ethereum.request.bind((window as any).ethereum);
    (window as any).ethereum.request = async ({ method, params }: { method: string; params?: any[] }) => {
      if (method === 'eth_sendTransaction') {
        throw new Error('MetaMask: Transaction rejected by user');
      }
      return orig({ method, params });
    };
  });
}
