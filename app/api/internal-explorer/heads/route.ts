import { resolveExplorerChainFromRequest } from '../chain';
import { getRpcUrl, getWsUrl } from '../config';
import { explorerDisabledResponse } from '../guard';
import { subscribeToHeads } from '../head-stream';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Comment frames keep idle proxies from closing the stream between heads.
const KEEPALIVE_MS = 15_000;
// EventSource waits this long before reconnecting after the stream ends.
const RECONNECT_MS = 3_000;

// Server-Sent Events stream of new canonical blocks (BlockSummary JSON per
// `data:` frame), fed by the chain's newHeads WebSocket. 404 when the chain
// has no TIPS_<CHAIN>_WS_URL, so the client falls back to polling /blocks.
export async function GET(request: Request) {
  const disabled = explorerDisabledResponse();
  if (disabled) return disabled;
  const chain = resolveExplorerChainFromRequest(request);
  const wsUrl = getWsUrl(chain);
  if (!wsUrl) {
    return Response.json({ error: 'Head stream not configured' }, { status: 404 });
  }
  const encoder = new TextEncoder();
  let finish = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let done = false;
      let unsubscribe = () => {};
      const send = (frame: string) => {
        if (!done) controller.enqueue(encoder.encode(frame));
      };

      const keepalive = setInterval(() => send(': keepalive\n\n'), KEEPALIVE_MS);
      finish = () => {
        if (done) return;
        done = true;
        clearInterval(keepalive);
        request.signal.removeEventListener('abort', finish);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      };

      send(`retry: ${RECONNECT_MS}\n\n`);
      request.signal.addEventListener('abort', finish);
      unsubscribe = subscribeToHeads(wsUrl, getRpcUrl(chain), {
        onBlock: (block) => send(`data: ${JSON.stringify(block)}\n\n`),
        onEnd: () => finish(),
      });
    },
    cancel() {
      finish();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
