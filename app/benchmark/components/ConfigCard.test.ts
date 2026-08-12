import { describe, expect, it } from "vitest";

import { buildRows, formatTransactions } from "./ConfigCard";
import { LoadTestConfig } from "../types";

describe("formatTransactions", () => {
  it("formats a weighted transaction mix", () => {
    expect(
      formatTransactions({
        transactions: [
          { type: "uniswap_v3", weight: 50 },
          { type: "aerodrome_cl", weight: 50 },
        ],
      }),
    ).toBe("uniswap_v3 (50%) · aerodrome_cl (50%)");
  });

  it("labels full fresh-recipient transfers as account-create", () => {
    expect(
      formatTransactions({
        fresh_recipient_ratio: 1,
        transactions: [{ type: "transfer", weight: 100 }],
      }),
    ).toBe("account-create (100%)");
  });

  it("keeps partial fresh-recipient transfer ratios visible", () => {
    expect(
      formatTransactions({
        fresh_recipient_ratio: 0.25,
        transactions: [{ type: "transfer", weight: 100 }],
      }),
    ).toBe("transfer (100%, 25% account-create)");
  });
});

const baseConfig: LoadTestConfig = {
  funding_amount: "1000000000000000000",
  sender_count: 1000,
  sender_offset: 0,
  in_flight_per_sender: 4,
  duration: "10m",
  target_gps: 5e7,
  seed: 42,
  chain_id: null,
  transactions: [{ type: "transfer", weight: 100 }],
  looper_contract: null,
  swap_token_amount: "0",
};

const labels = (config: LoadTestConfig): string[] =>
  buildRows(config)
    .flat()
    .map((r) => r.label);

describe("buildRows", () => {
  it("shows the batching rows when the run recorded them", () => {
    const rows = buildRows({
      ...baseConfig,
      batch_size: 2500,
      batch_timeout: "50ms",
    }).flat();

    expect(rows).toContainEqual({ label: "Batch size", value: "2,500" });
    expect(rows).toContainEqual({ label: "Batch timeout", value: "50ms" });
  });

  it("omits the batching rows on runs that predate them", () => {
    // 11 of the sepolia runs carry a `config` with no batching knobs at all.
    // Reading them unguarded threw on `undefined.toLocaleString()`.
    expect(() => buildRows(baseConfig)).not.toThrow();
    expect(labels(baseConfig)).not.toContain("Batch size");
    expect(labels(baseConfig)).not.toContain("Batch timeout");
  });

  it("still renders the rows that are always present", () => {
    expect(labels(baseConfig)).toEqual([
      "Senders",
      "In-flight / sender",
      "Duration",
      "Target gas/s",
      "Funding / sender",
      "Seed",
    ]);
  });
});
