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
  const statsReads: number[] = [];
  const hash = (number: number) => `0x${number.toString(16).padStart(64, '0')}`;
  page.on('request', (request) => {
    if (request.url().includes('/api/vibenet/explorer/blocks')) blockPolls.push(request.url());
  });
  await page.route('**/api/vibenet/chain-health', (route) => route.fulfill({ json: { healthy: true } }));
  await page.route('**/api/vibenet/explorer/stats', (route) => {
    statsReads.push(head);
    return route.fulfill({ json: { blocks: head, txs: head, addresses: 2 } });
  });
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
    fetched, blockPolls, statsReads,
    emit: (number: number) => {
      head = number;
      socket.send(JSON.stringify({
        method: 'eth_subscription',
        params: { subscription: 'heads', result: { hash: hash(number) } },
      }));
    },
  };
}

test('each table pauses only while hovered or focused, with no separate controls', async ({ page }) => {
  const stream = await mockStream(page);
  await page.goto('/vibenet/explorer');
  const region = page.getByRole('region', { name: 'Live explorer lists' });
  const blocks = page.getByRole('region', { name: 'Latest Blocks', exact: true });
  const txs = page.getByRole('region', { name: 'Latest Transactions', exact: true });
  const firstBlock = blocks.locator('tbody tr').first();
  const firstTxBlock = txs.locator('tbody tr').first().locator('td').last();
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 12');
  await expect(region.getByRole('button')).toHaveCount(0);
  stream.emit(13);
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 13');
  const initialY = (await firstBlock.boundingBox())!.y;
  await firstBlock.hover();
  await expect(blocks.getByRole('status')).toHaveText('Paused while hovering');
  await expect(txs.getByRole('status')).toHaveText('Hover to pause');
  const href = await firstBlock.getByRole('link').getAttribute('href');
  stream.emit(14);
  await expect(firstTxBlock).toHaveText('14');
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 13');
  await expect(firstBlock.getByRole('link')).toHaveAttribute('href', href!);
  expect((await firstBlock.boundingBox())!.y).toBe(initialY);
  // Switching tables resumes the first immediately, without a click.
  await firstTxBlock.hover();
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 14');
  await expect(txs.getByRole('status')).toHaveText('Paused while hovering');
  stream.emit(15);
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 15');
  await expect(firstTxBlock).toHaveText('14');
  await page.mouse.move(0, 0);
  await expect(firstTxBlock).toHaveText('15');
  await page.keyboard.press('Tab');
  await firstBlock.getByRole('link').focus();
  await expect(blocks.getByRole('status')).toHaveText('Paused while focused');
  stream.emit(16);
  await expect(firstTxBlock).toHaveText('16');
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 15');
  await page.getByRole('textbox').first().focus();
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 16');
  await expect(blocks.getByRole('status')).toHaveText('Hover to pause');
  expect(stream.blockPolls).toEqual([]);
});

test.describe('touch interactions', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('holds the touched table until release without pause/resume buttons', async ({ page }) => {
    const stream = await mockStream(page);
    await page.goto('/vibenet/explorer');
    const region = page.getByRole('region', { name: 'Live explorer lists' });
    const blocks = page.getByRole('region', { name: 'Latest Blocks', exact: true });
    const firstBlock = blocks.locator('tbody tr').first();
    await expect(firstBlock).toHaveAttribute('aria-label', 'Block 12');
    await expect(region.getByRole('button')).toHaveCount(0);
    await expect(blocks.getByRole('status')).toBeHidden();
    await firstBlock.dispatchEvent('pointerdown', { pointerType: 'touch' });
    await expect(blocks.getByRole('status')).toHaveText('Paused while touching');
    stream.emit(13);
    await expect.poll(() => stream.fetched.includes(13)).toBe(true);
    await expect(firstBlock).toHaveAttribute('aria-label', 'Block 12');
    await firstBlock.dispatchEvent('pointerup', { pointerType: 'touch' });
    await expect(firstBlock).toHaveAttribute('aria-label', 'Block 13');
    await firstBlock.dispatchEvent('pointerdown', { pointerType: 'touch' });
    stream.emit(14);
    await expect.poll(() => stream.fetched.includes(14)).toBe(true);
    await firstBlock.dispatchEvent('pointercancel', { pointerType: 'touch' });
    await expect(firstBlock).toHaveAttribute('aria-label', 'Block 14');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    await expect(blocks.getByRole('status')).toBeHidden();
    const href = await firstBlock.getByRole('link').getAttribute('href');
    await firstBlock.getByRole('link').tap();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
  });
});

test('indexed totals are throttled separately and are not frozen with table rows', async ({ page }) => {
  await page.clock.install();
  const stream = await mockStream(page);
  await page.goto('/vibenet/explorer');
  const blocks = page.getByRole('region', { name: 'Latest Blocks', exact: true });
  const firstBlock = blocks.locator('tbody tr').first();
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 12');
  await expect.poll(() => stream.statsReads.length).toBe(1);
  stream.emit(13);
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 13');
  expect(stream.statsReads).toEqual([12]);
  await page.clock.fastForward(10_000);
  expect(stream.statsReads).toEqual([12]); // No independent recurring stats timer.
  await firstBlock.hover();
  stream.emit(14);
  await expect.poll(() => stream.statsReads).toEqual([12, 14]);
  await expect(firstBlock).toHaveAttribute('aria-label', 'Block 13');
});
