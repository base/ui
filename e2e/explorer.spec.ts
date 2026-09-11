import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';

// The explorer streams the live vibenet chain, which is reset from time to time, so
// these tests assert that blocks and transactions are present in general and can
// be opened — never that a specific block or transaction exists. Right after a
// reset there may be no transactions yet, so the transaction cases tolerate the
// empty state rather than flaking.
const ROW_TIMEOUT = 20_000;

test('explorer page loads with latest blocks and transactions', async ({ page }) => {
  await page.goto('/vibenet/explorer');

  await expect(page).toHaveTitle(/Explorer · Vibenet/);
  await expect(page.getByText('Latest Blocks')).toBeVisible();
  await expect(page.getByText('Latest Transactions')).toBeVisible();

  // A running chain always has blocks; transactions can be momentarily empty
  // after a reset, so accept the empty state there.
  await expect(page.locator('tr[aria-label^="Block "]').first()).toBeVisible({
    timeout: ROW_TIMEOUT,
  });
  const txRow = page.locator('tr[aria-label^="Transaction "]').first();
  await expect(txRow.or(page.getByText('No transactions in the latest blocks'))).toBeVisible({
    timeout: ROW_TIMEOUT,
  });
});

test('explorer opens the latest block', async ({ page }) => {
  await page.goto('/vibenet/explorer');

  const latestBlock = page.locator('tr[aria-label^="Block "]').first();
  await expect(latestBlock).toBeVisible({ timeout: ROW_TIMEOUT });
  await latestBlock.getByRole('link').first().click();

  await expect(page).toHaveURL(/\/vibenet\/explorer\/block\//);
  await expect(page.getByText('Gas Limit')).toBeVisible({ timeout: ROW_TIMEOUT });
});

test('explorer opens the latest transaction', async ({ page }) => {
  await page.goto('/vibenet/explorer');

  const latestTx = page.locator('tr[aria-label^="Transaction "]').first();
  await expect(latestTx.or(page.getByText('No transactions in the latest blocks'))).toBeVisible({
    timeout: ROW_TIMEOUT,
  });
  // Nothing to open right after a reset — skip rather than fail.
  test.skip(
    await page.getByText('No transactions in the latest blocks').isVisible(),
    'no transactions on vibenet yet',
  );

  await latestTx.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/vibenet\/explorer\/tx\//);
  await expect(page.getByText(/^Logs \(/)).toBeVisible({ timeout: ROW_TIMEOUT });
});

// Deterministic interaction tests: the live smoke journeys above exercise the
// actual network; these drive exact heads to prove paused rows cannot move.
async function mockStream(page: Page) {
  let socket: WebSocketRoute;
  let head = 12;
  const fetched: number[] = [];
  const blockPolls: string[] = [];
  const hash = (number: number) => `0x${number.toString(16).padStart(64, '0')}`;
  page.on('request', (request) => {
    if (request.url().includes('/api/vibenet/explorer/blocks')) blockPolls.push(request.url());
  });
  await page.route('**/api/vibenet/chain-health', (route) => route.fulfill({ json: { healthy: true } }));
  await page.route('**/api/vibenet/explorer/stats', (route) => route.fulfill({
    json: { blocks: 12, txs: 12, addresses: 2 },
  }));
  await page.routeWebSocket(/\/ws$/, (ws) => {
    socket = ws;
    ws.onMessage((message) => {
      const request = JSON.parse(String(message));
      let result: unknown;
      if (request.method === 'eth_subscribe') result = 'heads';
      else if (request.method === 'eth_getBlockByNumber') result = { hash: hash(head) };
      else if (request.method === 'eth_getBlockByHash') {
        const number = Number(BigInt(request.params[0]));
        fetched.push(number);
        result = {
          hash: hash(number), parentHash: hash(Math.max(0, number - 1)),
          number: `0x${number.toString(16)}`, timestamp: '0x6553f100',
          transactions: [{ hash: hash(number + 1000), from: hash(100).slice(0, 42), to: null }],
        };
      } else result = '0x1';
      ws.send(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }));
    });
  });
  return {
    fetched, blockPolls,
    emit: (number: number) => {
      head = number;
      socket.send(JSON.stringify({
        method: 'eth_subscription',
        params: { subscription: 'heads', result: { hash: hash(number) } },
      }));
    },
  };
}

test('streaming rows freeze on hover and keyboard focus, then resume without polling', async ({ page }) => {
  const stream = await mockStream(page);
  await page.goto('/vibenet/explorer');
  const region = page.getByRole('region', { name: 'Live explorer lists' });
  const firstBlock = region.locator('tr[aria-label^="Block "]').first();
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 12');
  stream.emit(13);
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 13');
  await firstBlock.hover();
  await expect(region.getByRole('status')).toHaveText('Paused');
  const href = await firstBlock.getByRole('link').getAttribute('href');
  stream.emit(14);
  await expect.poll(() => stream.fetched.includes(14)).toBe(true);
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 13');
  await expect(firstBlock.getByRole('link')).toHaveAttribute('href', href!);
  await region.getByRole('button', { name: 'Resume live' }).click();
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 14');
  await expect(region.getByRole('status')).toHaveText('Live');
  // Explicit resume survives the pointer still being in the list region.
  stream.emit(15);
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 15');
  await page.mouse.move(0, 0);
  await page.keyboard.press('Tab');
  await expect(region.getByRole('status')).toHaveText('Paused');
  stream.emit(16);
  await expect.poll(() => stream.fetched.includes(16)).toBe(true);
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 15');
  await region.getByRole('button', { name: 'Resume live' }).focus();
  await page.keyboard.press('Enter');
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 16');
  expect(stream.blockPolls).toEqual([]);
});

test.describe('touch stream controls', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('pause and resume without hover or pointer-induced focus toggling the action', async ({ page }) => {
    const stream = await mockStream(page);
    await page.goto('/vibenet/explorer');
    const region = page.getByRole('region', { name: 'Live explorer lists' });
    const firstBlock = region.locator('tr[aria-label^="Block "]').first();
    await expect(firstBlock).toHaveAttribute('aria-label', 'Block 12');
    await region.getByRole('button', { name: 'Pause updates' }).tap();
    await expect(region.getByRole('status')).toHaveText('Paused');
    stream.emit(13);
    await expect.poll(() => stream.fetched.includes(13)).toBe(true);
    await expect(firstBlock).toHaveAttribute('aria-label', 'Block 12');
    await region.getByRole('button', { name: 'Resume live' }).tap();
    await expect(firstBlock).toHaveAttribute('aria-label', 'Block 13');
    await expect(region.getByRole('status')).toHaveText('Live');
  });
});
