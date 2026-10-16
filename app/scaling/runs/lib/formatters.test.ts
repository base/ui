import { describe, expect, it } from "vitest";

import {
  formatLoadTestTimestamp,
  parseLoadTestTimestamp,
} from "./formatters";

describe("parseLoadTestTimestamp", () => {
  it("parses the all-dash spelling as UTC", () => {
    expect(parseLoadTestTimestamp("2026-08-12-00-01-28")?.toISOString()).toBe(
      "2026-08-12T00:01:28.000Z",
    );
  });

  it("parses the T-separated spelling the report-api serves", () => {
    expect(parseLoadTestTimestamp("2026-08-12T00-01-28")?.toISOString()).toBe(
      "2026-08-12T00:01:28.000Z",
    );
  });

  it("returns null for anything else", () => {
    expect(parseLoadTestTimestamp("2026-08-12")).toBeNull();
    expect(parseLoadTestTimestamp("not-a-timestamp")).toBeNull();
  });
});

describe("formatLoadTestTimestamp", () => {
  it("formats both spellings identically", () => {
    const dashed = formatLoadTestTimestamp("2026-08-12-00-01-28");
    expect(dashed).toBe(formatLoadTestTimestamp("2026-08-12T00-01-28"));
    expect(dashed).toContain("2026");
  });

  it("falls back to the raw string when it cannot parse", () => {
    expect(formatLoadTestTimestamp("whenever")).toBe("whenever");
  });
});
