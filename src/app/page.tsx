"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { MeterBundleResponse, RejectedTransaction } from "@/lib/s3";
import type { BlockSummary, BlocksResponse } from "./api/blocks/route";
import type { RejectedTransactionsResponse } from "./api/rejected/route";

type Tab = "blocks" | "rejected";

const WEI_PER_GWEI = 10n ** 9n;
const WEI_PER_ETH = 10n ** 18n;

function formatBigInt(value: bigint, decimals: number, scale: bigint): string {
  const whole = value / scale;
  const frac = ((value % scale) * 10n ** BigInt(decimals)) / scale;
  return `${whole}.${frac.toString().padStart(decimals, "0")}`;
}

function formatHexValue(hex: string | undefined): string {
  if (!hex) return "—";
  const value = BigInt(hex);
  if (value >= WEI_PER_ETH / 10000n) {
    return `${formatBigInt(value, 6, WEI_PER_ETH)} ETH`;
  }
  if (value >= WEI_PER_GWEI / 100n) {
    return `${formatBigInt(value, 4, WEI_PER_GWEI)} Gwei`;
  }
  return `${value.toString()} Wei`;
}

function formatGasPrice(hex: string | undefined): string {
  if (!hex) return "—";
  const value = BigInt(hex);
  return `${formatBigInt(value, 2, WEI_PER_GWEI)} Gwei`;
}

function SearchBar({ onError }: { onError: (error: string | null) => void }) {
  const router = useRouter();
  const [searchHash, setSearchHash] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const hash = searchHash.trim();
    if (!hash) return;

    setLoading(true);
    onError(null);

    try {
      const response = await fetch(`/api/txn/${hash}`);
      if (!response.ok) {
        if (response.status === 404) {
          onError("Transaction not found");
        } else {
          onError("Failed to fetch transaction data");
        }
        return;
      }
      const result = await response.json();

      if (result.bundle_ids && result.bundle_ids.length > 0) {
        router.push(`/bundles/${result.bundle_ids[0]}`);
      } else {
        onError("No bundle found for this transaction");
      }
    } catch {
      onError("Failed to fetch transaction data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSearch} className="flex items-center gap-2">
      <input
        type="text"
        placeholder="Search by transaction hash..."
        value={searchHash}
        onChange={(e) => setSearchHash(e.target.value)}
        className="w-64 lg:w-80 px-3 py-1.5 text-sm border rounded-lg bg-white border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-400"
        disabled={loading}
      />
      <button
        type="submit"
        disabled={loading || !searchHash.trim()}
        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "..." : "Search"}
      </button>
    </form>
  );
}

function BlockRow({ block, index }: { block: BlockSummary; index: number }) {
  const opacity = Math.max(0.3, 1 - index * 0.08);
  const timeSince = Math.floor(Date.now() / 1000 - block.timestamp);
  const timeAgo =
    timeSince <= 0
      ? "now"
      : timeSince < 60
        ? `${timeSince}s ago`
        : timeSince < 3600
          ? `${Math.floor(timeSince / 60)}m ago`
          : `${Math.floor(timeSince / 3600)}h ago`;

  return (
    <Link
      href={`/block/${block.hash}`}
      className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-all"
      style={{ opacity }}
    >
      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
        <svg
          className="w-5 h-5 text-blue-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <title>Block</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">
            #{block.number.toLocaleString()}
          </span>
          <span className="text-xs text-gray-400">{timeAgo}</span>
        </div>
        <div className="font-mono text-xs text-gray-500 truncate">
          {block.hash}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-medium text-gray-900">
          {block.transactionCount}
        </div>
        <div className="text-xs text-gray-500">txns</div>
      </div>
      <svg
        className="w-4 h-4 text-gray-400 shrink-0"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <title>View</title>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </Link>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

function MeteringCard({ meter }: { meter: MeterBundleResponse }) {
  const executionTimeUs = meter.results.reduce(
    (sum, r) => sum + r.executionTimeUs,
    0,
  );
  const totalTimeUs = executionTimeUs + meter.stateRootTimeUs;

  return (
    <Card>
      <div className="p-5">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div className="text-xs text-gray-500 mb-1">Execution</div>
            <div className="text-xl font-semibold text-gray-900">
              {executionTimeUs.toLocaleString()}μs
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">State Root</div>
            <div className="text-xl font-semibold text-gray-900">
              {meter.stateRootTimeUs.toLocaleString()}μs
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Total Time</div>
            <div className="text-xl font-semibold text-gray-900">
              {totalTimeUs.toLocaleString()}μs
            </div>
          </div>
        </div>
        {(meter.stateRootAccountNodeCount > 0 ||
          meter.stateRootStorageNodeCount > 0) && (
          <div className="grid grid-cols-2 gap-6 mt-4 pt-4 border-t border-gray-100">
            <div>
              <div className="text-xs text-gray-500 mb-1">
                Account Trie Nodes
              </div>
              <div className="text-xl font-semibold text-gray-900">
                {meter.stateRootAccountNodeCount.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">
                Storage Trie Nodes
              </div>
              <div className="text-xl font-semibold text-gray-900">
                {meter.stateRootStorageNodeCount.toLocaleString()}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-gray-100 px-5 py-3 bg-gray-50/50 grid grid-cols-5 gap-4 text-xs">
        <div>
          <span className="text-gray-500">Total Gas</span>
          <span className="ml-2 font-medium text-gray-900">
            {meter.totalGasUsed.toLocaleString()}
          </span>
        </div>
        <div>
          <span className="text-gray-500">Gas Price</span>
          <span className="ml-2 font-medium text-gray-900">
            {formatGasPrice(meter.bundleGasPrice)}
          </span>
        </div>
        <div>
          <span className="text-gray-500">Gas Fees</span>
          <span className="ml-2 font-medium text-gray-900">
            {formatHexValue(meter.gasFees)}
          </span>
        </div>
        <div>
          <span className="text-gray-500">Coinbase Diff</span>
          <span className="ml-2 font-medium text-gray-900">
            {formatHexValue(meter.coinbaseDiff)}
          </span>
        </div>
        <div>
          <span className="text-gray-500">State Block</span>
          <span className="ml-2 font-medium text-gray-900">
            #{meter.stateBlockNumber}
          </span>
        </div>
      </div>
    </Card>
  );
}

function RejectedTxRow({
  tx,
  expanded,
  onToggle,
}: {
  tx: RejectedTransaction;
  expanded: boolean;
  onToggle: () => void;
}) {
  const timeAgo = (() => {
    const timeSince = Math.floor(Date.now() / 1000 - tx.timestamp);
    if (timeSince <= 0) return "now";
    if (timeSince < 60) return `${timeSince}s ago`;
    if (timeSince < 3600) return `${Math.floor(timeSince / 60)}m ago`;
    if (timeSince < 86400) return `${Math.floor(timeSince / 3600)}h ago`;
    return `${Math.floor(timeSince / 86400)}d ago`;
  })();

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-all text-left"
      >
        <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
          <svg
            className="w-5 h-5 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Rejected</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-gray-900">
              {tx.txHash.slice(0, 10)}...{tx.txHash.slice(-8)}
            </span>
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20">
              Rejected
            </span>
            <span className="text-xs text-gray-400">{timeAgo}</span>
          </div>
          <div className="text-xs text-gray-500 mt-0.5 truncate">
            Block #{tx.blockNumber.toLocaleString()} — {tx.reason}
          </div>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <title>{expanded ? "Collapse" : "Expand"}</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <table className="w-full text-xs">
              <tbody>
                <tr className="border-b border-gray-200/60">
                  <td className="text-gray-500 py-2 w-28">Transaction</td>
                  <td className="py-2 font-mono text-gray-900 break-all">
                    {tx.txHash}
                  </td>
                </tr>
                <tr className="border-b border-gray-200/60">
                  <td className="text-gray-500 py-2">Block</td>
                  <td className="py-2 font-medium text-gray-900">
                    #{tx.blockNumber.toLocaleString()}
                  </td>
                </tr>
                <tr className="border-b border-gray-200/60">
                  <td className="text-gray-500 py-2">Reason</td>
                  <td className="py-2 text-red-700 font-medium">{tx.reason}</td>
                </tr>
                <tr>
                  <td className="text-gray-500 py-2">Rejected At</td>
                  <td className="py-2 text-gray-900">
                    {new Date(tx.timestamp * 1000).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
              Metering Results
            </h4>
            <MeteringCard meter={tx.metering} />
          </div>

          {tx.metering.results.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">
                Per-Transaction Breakdown
              </h4>
              <Card className="overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left text-gray-500 font-medium px-4 py-2">
                        Tx Hash
                      </th>
                      <th className="text-left text-gray-500 font-medium px-4 py-2">
                        From
                      </th>
                      <th className="text-right text-gray-500 font-medium px-4 py-2">
                        Gas Used
                      </th>
                      <th className="text-right text-gray-500 font-medium px-4 py-2">
                        Exec Time
                      </th>
                      <th className="text-right text-gray-500 font-medium px-4 py-2">
                        Gas Price
                      </th>
                      <th className="text-right text-gray-500 font-medium px-4 py-2">
                        Gas Fees
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {tx.metering.results.map((result) => (
                      <tr key={result.txHash} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono text-gray-900">
                          {result.txHash.slice(0, 10)}...
                          {result.txHash.slice(-6)}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-600">
                          {result.fromAddress.slice(0, 8)}...
                          {result.fromAddress.slice(-4)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                          {result.gasUsed.toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                          {result.executionTimeUs.toLocaleString()}μs
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700">
                          {formatGasPrice(result.gasPrice)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700">
                          {formatHexValue(result.gasFees)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RejectedTransactionsTab() {
  const [transactions, setTransactions] = useState<RejectedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  useEffect(() => {
    const fetchRejected = async () => {
      try {
        const response = await fetch("/api/rejected");
        if (response.ok) {
          const data: RejectedTransactionsResponse = await response.json();
          setTransactions(data.transactions);
        }
      } catch {
        console.error("Failed to fetch rejected transactions");
      } finally {
        setLoading(false);
      }
    };

    fetchRejected();
    const interval = setInterval(fetchRejected, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <section>
      <Card className="p-4 mb-6 border-amber-200 bg-amber-50">
        <div className="flex gap-3">
          <svg
            className="w-5 h-5 text-amber-600 shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <title>Info</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-sm text-amber-800">
            <span className="font-semibold">About rejected transactions:</span>{" "}
            These are transactions that violated per-transaction resource
            metering budgets (execution time or state root gas limits). They
            would have <span className="font-semibold">never</span> been
            considered for block inclusion and were rejected during the block
            building process.
          </div>
        </div>
      </Card>

      <h2 className="text-base font-semibold text-gray-900 mb-4">
        Rejected Transactions
      </h2>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="py-12 flex items-center justify-center">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-gray-600">
                Loading rejected transactions...
              </span>
            </div>
          </div>
        ) : transactions.length > 0 ? (
          <div>
            {transactions.map((tx, index) => (
              <RejectedTxRow
                key={`${tx.blockNumber}-${tx.txHash}`}
                tx={tx}
                expanded={expandedIdx === index}
                onToggle={() =>
                  setExpandedIdx(expandedIdx === index ? null : index)
                }
              />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center">
            <svg
              className="w-12 h-12 text-gray-300 mx-auto mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>No rejected transactions</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-gray-500 text-sm">
              No rejected transactions found
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Transactions that violate metering budgets will appear here
            </p>
          </div>
        )}
      </Card>
    </section>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("blocks");
  const [error, setError] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBlocks = useCallback(async () => {
    try {
      const response = await fetch("/api/blocks");
      if (response.ok) {
        const data: BlocksResponse = await response.json();
        setBlocks(data.blocks);
      }
    } catch {
      console.error("Failed to fetch blocks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlocks();
    const interval = setInterval(fetchBlocks, 2000);
    return () => clearInterval(interval);
  }, [fetchBlocks]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("blocks")}
              className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === "blocks"
                  ? "text-gray-900 bg-gray-100"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              TIPS
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("rejected")}
              className={`px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors ${
                activeTab === "rejected"
                  ? "text-red-700 bg-red-50"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
              }`}
            >
              Rejected Transactions
            </button>
          </div>
          {activeTab === "blocks" && <SearchBar onError={setError} />}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {error && activeTab === "blocks" && (
          <Card className="p-4 mb-6 border-red-200 bg-red-50">
            <div className="flex items-center gap-3">
              <svg
                className="w-5 h-5 text-red-600 shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <title>Error</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <span className="text-sm text-red-700">{error}</span>
              <button
                type="button"
                onClick={() => setError(null)}
                className="ml-auto text-red-600 hover:text-red-800"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <title>Dismiss</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </Card>
        )}

        {activeTab === "blocks" && (
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-4">
              Latest Blocks
            </h2>

            <Card className="overflow-hidden">
              {loading ? (
                <div className="py-12 flex items-center justify-center">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-gray-600">Loading blocks...</span>
                  </div>
                </div>
              ) : blocks.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {blocks.map((block, index) => (
                    <BlockRow key={block.hash} block={block} index={index} />
                  ))}
                </div>
              ) : (
                <div className="py-12 text-center text-gray-500">
                  No blocks available
                </div>
              )}
            </Card>
          </section>
        )}

        {activeTab === "rejected" && <RejectedTransactionsTab />}
      </main>
    </div>
  );
}
