import { NextResponse } from 'next/server';

import { forwardJsonRpc } from '../forward';

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400 },
    );
  }
  try {
    const result = await forwardJsonRpc(payload);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RPC proxy failed';
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32603, message } },
      { status: 502 },
    );
  }
}
