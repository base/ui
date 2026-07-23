'use client';

import { use, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { Card } from '../../../../components/ui/Card';
import { Text } from '../../../../components/ui/Text';
import { DetailList, DetailRow } from '../../../components/DetailList';
import { ExplorerLink } from '../../../components/ExplorerLink';
import type { ExplorerAaCall, ExplorerTxLog, ExplorerTxResponse } from '../../../library/api-types';
import { vibenetApi, VibenetApiError } from '../../../library/client';
import type { DecodedCall } from '../../../library/explorer';
import {
  callSelector,
  decodeErc20TransferCalldata,
  decodeErc20TransferLog,
  decodeExecuteBatch,
  decodeMetadata,
  EXECUTE_BATCH_SELECTOR,
  fmtHexInt,
  hexToInt,
  phaseOk,
  scopeLabel,
  timeFromHex,
  txTypeLabel,
  weiToEth,
  weiToGwei,
} from '../../../library/explorer';

const BADGE =
  'inline-flex items-center rounded-md bg-bds-blue-0 px-2 py-1 text-[11px] leading-none text-bds-blue-60 dark:bg-bds-blue-100/40 dark:text-base-blue';
const RAW_PRE = 'mt-1 overflow-x-auto rounded bg-bds-gray-5 p-2 text-[11px] dark:bg-white/5';
const DIM = 'text-bds-gray-60 dark:text-bds-gray-40';
const ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

const STATUS_STYLE: Record<ExplorerTxResponse['status'], { label: string; className: string }> = {
  ok: { label: 'success', className: 'text-bds-green-70 dark:text-bds-green-20' },
  fail: { label: 'failed', className: 'text-bds-red-70 dark:text-bds-red-20' },
  pending: { label: 'pending', className: 'text-bds-yellow-70 dark:text-bds-yellow-20' },
};

function renderScalar(key: string, value: unknown): ReactNode {
  const text = value == null ? '—' : String(value);
  if (ADDR_RE.test(text)) {
    return <ExplorerLink kind="address" value={text} label={text} className="break-all" />;
  }
  if (key === 'scope' && value != null && text !== '—') {
    return (
      <code className="break-all font-mono">
        {text} <span className={DIM}>({scopeLabel(Number(value))})</span>
      </code>
    );
  }
  return <code className="break-all font-mono">{text}</code>;
}

function renderArgValue(key: string, value: unknown): ReactNode {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return (
      <DetailList className="mt-1">
        {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
          <DetailRow key={k} label={k}>
            {renderScalar(k, v)}
          </DetailRow>
        ))}
      </DetailList>
    );
  }
  return renderScalar(key, value);
}

type SubCallProps = {
  call: DecodedCall;
};

function SubCall({ call }: SubCallProps) {
  const selector = callSelector(call.data);
  const erc20 = decodeErc20TransferCalldata(call.data);
  const value = call.value ? BigInt(call.value) : 0n;
  const hasData = Boolean(call.data && call.data !== '0x');
  return (
    <DetailList className="mt-2 border-l border-bds-gray-10 pl-3 dark:border-white/10">
      <DetailRow label="→ to">
        {call.to ? (
          <ExplorerLink kind="address" value={call.to} label={call.to} className="break-all" />
        ) : (
          <em className={DIM}>(none)</em>
        )}
      </DetailRow>
      {value > 0n ? <DetailRow label="value">{weiToEth(call.value)}</DetailRow> : null}
      {selector ? (
        <DetailRow label="selector">
          <code className="font-mono">{selector}</code>
          {erc20 ? <span className={DIM}> · transfer</span> : null}
        </DetailRow>
      ) : null}
      {erc20 ? (
        <DetailRow label="recipient">
          <ExplorerLink
            kind="address"
            value={erc20.recipient}
            label={erc20.recipient}
            className="break-all"
          />
        </DetailRow>
      ) : null}
      {erc20 ? (
        <DetailRow label="amount">
          {/* The calldata shape identifies transfer(address,uint256) but not
              which token emitted it; the token is `call.to` (shown above). Show
              raw units rather than assuming a symbol/decimals. */}
          <code className="font-mono">{erc20.rawAmount.toString()}</code>{' '}
          <span className={DIM}>raw units</span>
        </DetailRow>
      ) : null}
      {!erc20 && hasData ? (
        <DetailRow label="data">
          <span className={DIM}>{(call.data.length - 2) / 2} bytes</span>
        </DetailRow>
      ) : null}
    </DetailList>
  );
}

type TxCallProps = {
  call: ExplorerAaCall;
};

function TxCall({ call }: TxCallProps) {
  const selector = callSelector(call.data);
  const isExecuteBatch = selector === EXECUTE_BATCH_SELECTOR;
  const innerCalls = isExecuteBatch ? decodeExecuteBatch(call.data) : null;
  const erc20 = isExecuteBatch ? null : decodeErc20TransferCalldata(call.data);
  const hasData = Boolean(call.data && call.data !== '0x');

  let decoded: ReactNode = null;
  if (erc20) {
    decoded = (
      <DetailRow label="Decoded">
        <DetailList>
          <DetailRow label="recipient">
            <ExplorerLink
              kind="address"
              value={erc20.recipient}
              label={erc20.recipient}
              className="break-all"
            />
          </DetailRow>
          <DetailRow label="amount">
            {/* Token is `call.to` (the "To" row above); the calldata does not
                encode a symbol/decimals, so show raw units, not a hardcoded one. */}
            <code className="font-mono">{erc20.rawAmount.toString()}</code>{' '}
            <span className={DIM}>raw units</span>
          </DetailRow>
        </DetailList>
      </DetailRow>
    );
  } else if (innerCalls) {
    decoded = (
      <DetailRow
        label={`Decoded (${innerCalls.length} sub-call${innerCalls.length === 1 ? '' : 's'})`}
      >
        {innerCalls.map((inner, index) => (
          // eslint-disable-next-line react/no-array-index-key -- decoded sub-calls have no stable id
          <SubCall key={index} call={inner} />
        ))}
      </DetailRow>
    );
  } else if (hasData) {
    decoded = (
      <DetailRow label="Data">
        <span className={DIM}>{(call.data.length - 2) / 2} bytes</span>
      </DetailRow>
    );
  }

  return (
    <DetailList className="border-t border-bds-gray-10 pt-3 first:border-0 first:pt-0 dark:border-white/10">
      <DetailRow label="To">
        {call.to ? (
          <ExplorerLink kind="address" value={call.to} label={call.to} className="break-all" />
        ) : (
          <em className={DIM}>(none)</em>
        )}
      </DetailRow>
      <DetailRow label="Value">{weiToEth(call.value)}</DetailRow>
      {selector ? (
        <DetailRow label="Selector">
          <code className="font-mono">{selector}</code>
          {isExecuteBatch ? <span className={DIM}> · executeBatch</span> : null}
          {erc20 ? <span className={DIM}> · transfer(address,uint256)</span> : null}
        </DetailRow>
      ) : null}
      {decoded}
    </DetailList>
  );
}

type LogViewProps = {
  log: ExplorerTxLog;
};

function LogView({ log }: LogViewProps) {
  const transfer = decodeErc20TransferLog(log);
  const hasData = Boolean(log.data && log.data !== '0x');
  return (
    <Card className="bg-white p-4 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[12px] ${DIM}`}>#{log.logIndex}</span>
        <ExplorerLink kind="address" value={log.address} />
        {transfer ? <span className={BADGE}>Transfer</span> : null}
        {log.decoded ? <span className={BADGE}>{log.decoded.eventName}</span> : null}
      </div>
      {log.decoded ? (
        <DetailList className="mt-2">
          {Object.entries(log.decoded.args).map(([k, v]) => (
            <DetailRow key={k} label={k}>
              {renderArgValue(k, v)}
            </DetailRow>
          ))}
        </DetailList>
      ) : null}
      {transfer ? (
        <DetailList className="mt-2">
          <DetailRow label="Token">
            <ExplorerLink
              kind="address"
              value={transfer.token}
              label={transfer.token}
              className="break-all"
            />
          </DetailRow>
          <DetailRow label="From">
            <ExplorerLink
              kind="address"
              value={transfer.from}
              label={transfer.from}
              className="break-all"
            />
          </DetailRow>
          <DetailRow label="To">
            <ExplorerLink
              kind="address"
              value={transfer.to}
              label={transfer.to}
              className="break-all"
            />
          </DetailRow>
          <DetailRow label="Amount">
            <code className="font-mono">{transfer.amount}</code>{' '}
            <span className={DIM}>raw units</span>
          </DetailRow>
        </DetailList>
      ) : null}
      <ul className="mt-2 flex flex-col gap-1">
        {log.topics.map((topic) => (
          <li key={topic}>
            <code className={`break-all font-mono text-[11px] ${DIM}`}>{topic}</code>
          </li>
        ))}
      </ul>
      {hasData ? (
        <div className="mt-2">
          <span className={`text-[11px] ${DIM}`}>Data ({(log.data.length - 2) / 2} bytes)</span>
          <pre className={RAW_PRE}>
            <code className="break-all font-mono">{log.data}</code>
          </pre>
        </div>
      ) : null}
    </Card>
  );
}

type TxBodyProps = {
  tx: ExplorerTxResponse;
};

function TxBody({ tx }: TxBodyProps) {
  const blockNum = hexToInt(tx.blockNumber);
  const ts = timeFromHex(tx.timestamp);
  const typeInfo = txTypeLabel(tx.type, tx.typeHex ?? null);
  const status = STATUS_STYLE[tx.status];
  const memo = decodeMetadata(tx.metadata);
  const hasMetadata = Boolean(tx.metadata && tx.metadata !== '0x');
  const selector = tx.input && tx.input.length >= 10 ? tx.input.slice(0, 10) : null;
  const inputBytes = tx.input && tx.input !== '0x' ? (tx.input.length - 2) / 2 : 0;
  const callCount = (tx.aa?.calls ?? []).reduce((sum, phase) => sum + phase.length, 0);
  const phaseCount = tx.aa?.calls.length ?? 0;

  let gasUsedNote: string | null = null;
  if (tx.gasUsed && tx.gas) {
    const used = Number.parseInt(tx.gasUsed, 16);
    const limit = Number.parseInt(tx.gas, 16);
    if (limit) gasUsedNote = `${((used / limit) * 100).toFixed(1)}% of limit`;
  }

  let toBody: ReactNode;
  if (tx.isAa) {
    toBody = (
      <span className={DIM}>
        EIP-8130 batch · {callCount} call{callCount === 1 ? '' : 's'}
        {phaseCount > 1 ? ` across ${phaseCount} phases` : ''}
      </span>
    );
  } else if (tx.to) {
    toBody = <ExplorerLink kind="address" value={tx.to} label={tx.to} className="break-all" />;
  } else if (tx.contractAddress) {
    toBody = (
      <span>
        <em>contract created:</em>{' '}
        <ExplorerLink
          kind="address"
          value={tx.contractAddress}
          label={tx.contractAddress}
          className="break-all"
        />
      </span>
    );
  } else {
    toBody = <em className={DIM}>(contract create, not yet mined)</em>;
  }

  let nonceBody: ReactNode = '—';
  if (tx.isAa && tx.aa) {
    nonceBody = (
      <code className="font-mono">
        key {tx.aa.nonceKey} · seq {Number.parseInt(tx.aa.nonceSequence, 16).toString()}
      </code>
    );
  } else if (tx.nonce != null) {
    nonceBody = Number.parseInt(tx.nonce, 16).toString();
  }

  const selfPay = Boolean(tx.payer && tx.payer.toLowerCase() === tx.from.toLowerCase());

  return (
    <>
      <Card className="bg-white p-6 dark:bg-white/5">
        <DetailList>
          <DetailRow label="Block">
            <ExplorerLink
              kind="block"
              value={tx.blockHash}
              label={blockNum !== null ? blockNum.toLocaleString() : tx.blockHash}
            />
          </DetailRow>
          {ts ? (
            <DetailRow label="Timestamp">
              {ts.human} <span className={DIM}>({ts.age})</span>
            </DetailRow>
          ) : null}
          <DetailRow label="Status">
            <span className={`font-medium ${status.className}`}>{status.label}</span>
          </DetailRow>
          {typeInfo ? (
            <DetailRow label="Type">
              <code className="font-mono">{typeInfo.hex}</code>{' '}
              <span className={DIM}>({typeInfo.label})</span>
            </DetailRow>
          ) : null}
          <DetailRow label="From">
            <ExplorerLink kind="address" value={tx.from} label={tx.from} className="break-all" />
          </DetailRow>
          <DetailRow label="To">{toBody}</DetailRow>
          {tx.payer ? (
            <DetailRow label="Payer">
              <ExplorerLink
                kind="address"
                value={tx.payer}
                label={tx.payer}
                className="break-all"
              />{' '}
              {selfPay ? (
                <span className={DIM}>(self-pay)</span>
              ) : (
                <span className={BADGE}>sponsored</span>
              )}
            </DetailRow>
          ) : null}
          {!tx.isAa ? <DetailRow label="Value">{weiToEth(tx.value)}</DetailRow> : null}
          <DetailRow label="Nonce">{nonceBody}</DetailRow>
          {tx.fee ? <DetailRow label="Fee">{weiToEth(tx.fee)}</DetailRow> : null}
          <DetailRow label="Gas limit">{fmtHexInt(tx.gas)}</DetailRow>
          {tx.gasUsed ? (
            <DetailRow label="Gas used">
              {fmtHexInt(tx.gasUsed)}
              {gasUsedNote ? <span className={DIM}> ({gasUsedNote})</span> : null}
            </DetailRow>
          ) : null}
          {tx.effectiveGasPrice ? (
            <DetailRow label="Effective gas price">{weiToGwei(tx.effectiveGasPrice)}</DetailRow>
          ) : null}
          {hasMetadata ? (
            <DetailRow label="Metadata">
              {memo ? (
                <span>
                  {memo} <span className={DIM}>(decoded memo)</span>
                </span>
              ) : (
                <code className="break-all font-mono">{tx.metadata}</code>
              )}
            </DetailRow>
          ) : null}
          {!tx.isAa && selector ? (
            <DetailRow label="Selector">
              <code className="font-mono">{selector}</code>
            </DetailRow>
          ) : null}
          {!tx.isAa ? (
            <DetailRow label="Input">
              {inputBytes === 0 ? (
                <em className={DIM}>(empty)</em>
              ) : (
                <div>
                  <span className={`text-[11px] ${DIM}`}>{inputBytes} bytes</span>
                  <pre className={RAW_PRE}>
                    <code className="break-all font-mono">{tx.input}</code>
                  </pre>
                </div>
              )}
            </DetailRow>
          ) : null}
        </DetailList>
      </Card>

      {tx.isAa && tx.aa ? (
        <>
          {tx.aa.accountChanges.length > 0 ? (
            <section className="flex flex-col gap-2">
              <Text variant="title3">Account changes ({tx.aa.accountChanges.length})</Text>
              <Text variant="footnote" tone="muted">
                Owner / authenticator updates applied atomically before the calls run.
              </Text>
              <Card className="bg-white p-4 dark:bg-white/5">
                <pre className="overflow-x-auto text-[11px]">
                  <code className="font-mono">{JSON.stringify(tx.aa.accountChanges, null, 2)}</code>
                </pre>
              </Card>
            </section>
          ) : null}

          <section className="flex flex-col gap-2">
            <Text variant="title3">Calls ({callCount})</Text>
            <Text variant="footnote" tone="muted">
              Each phase is an atomic batch executed in order from the AA account.
            </Text>
            {tx.aa.calls.map((phase, phaseIndex) => (
              // eslint-disable-next-line react/no-array-index-key -- phases are positional
              <Card key={phaseIndex} className="bg-white p-4 dark:bg-white/5">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-[12px] font-medium">phase {phaseIndex}</span>
                  <span className={`text-[11px] ${DIM}`}>
                    {phase.length} call{phase.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex flex-col gap-3">
                  {phase.map((call, callIndex) => (
                    // eslint-disable-next-line react/no-array-index-key -- calls are positional
                    <TxCall key={`${phaseIndex}-${callIndex}`} call={call} />
                  ))}
                </div>
              </Card>
            ))}
          </section>
        </>
      ) : null}

      {tx.phaseStatuses && tx.phaseStatuses.length > 0 ? (
        <section className="flex flex-col gap-2">
          <Text variant="title3">Call phases ({tx.phaseStatuses.length})</Text>
          <div className="flex flex-wrap gap-2">
            {tx.phaseStatuses.map((phaseStatus, index) => {
              const ok = phaseOk(phaseStatus);
              return (
                <span
                  // eslint-disable-next-line react/no-array-index-key -- phases are positional
                  key={index}
                  className={
                    ok
                      ? 'inline-flex items-center rounded-full border border-bds-green-20 bg-bds-green-0 px-2.5 py-0.5 text-[11px] text-bds-green-70 dark:border-bds-green-80 dark:bg-bds-green-100/40 dark:text-bds-green-20'
                      : 'inline-flex items-center rounded-full border border-bds-red-20 bg-bds-red-0 px-2.5 py-0.5 text-[11px] text-bds-red-70 dark:border-bds-red-80 dark:bg-bds-red-100/40 dark:text-bds-red-20'
                  }
                >
                  phase {index}: {ok ? 'success' : 'reverted'}
                </span>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <Text variant="title3">Logs ({tx.logs.length})</Text>
        {tx.logs.length === 0 ? (
          <Card className="bg-white p-4 dark:bg-white/5">
            <Text variant="label.regular" tone="muted">
              No logs emitted.
            </Text>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {tx.logs.map((log) => (
              <LogView key={log.logIndex} log={log} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

type PageProps = {
  params: Promise<{ hash: string }>;
};

export default function ExplorerTxPage({ params }: PageProps) {
  const { hash } = use(params);
  const [tx, setTx] = useState<ExplorerTxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    vibenetApi.explorer
      .tx(hash)
      .then((next) => {
        if (!cancelled) setTx(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof VibenetApiError && err.status === 404
              ? 'Transaction not found'
              : 'Failed to fetch transaction',
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hash]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Text variant="title2">Transaction</Text>
        {tx ? (
          <code className="mt-1 block break-all font-mono text-[13px] text-bds-gray-60 dark:text-bds-gray-40">
            {tx.hash}
          </code>
        ) : null}
      </div>

      {loading ? (
        <Text variant="label.regular" tone="muted">
          Loading…
        </Text>
      ) : null}
      {error ? (
        <Card className="bg-white p-4 dark:bg-white/5">
          <Text variant="label.regular" tone="muted">
            {error}
          </Text>
        </Card>
      ) : null}

      {tx ? <TxBody tx={tx} /> : null}
    </div>
  );
}
