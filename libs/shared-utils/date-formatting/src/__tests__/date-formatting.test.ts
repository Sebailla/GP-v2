import { describe, expect, it } from "vitest";

import { formatDate, parseIsoDate, toIsoString } from "../index";

/**
 * TDD contract for @shared-utils/date-formatting.
 *
 *  - RED:    formatDate emits the ISO date in a fixed locale.
 *  - GREEN:  formatDate accepts a locale and a time zone; falls
 *            back to en-US / UTC when omitted.
 *  - TRIANGULATE: parseIsoDate accepts the canonical ISO shape and
 *            rejects malformed input; toIsoString emits a stable
 *            UTC ISO 8601 string regardless of input timezone.
 */

describe("formatDate", () => {
  // 02:00 UTC on 2026-07-05 is still 2026-07-04 in America/New_York
  // (EDT is UTC-4), which gives us a deterministic locale / time-zone
  // divergence to assert on.
  const FIXED = new Date("2026-07-05T02:00:00.000Z");

  it("formats an ISO date in en-US by default", () => {
    const out = formatDate(FIXED);
    expect(out).toMatch(/2026/);
    expect(out.length).toBeGreaterThan(0);
  });

  it("respects an explicit locale", () => {
    const en = formatDate(FIXED, { locale: "en-US" });
    const es = formatDate(FIXED, { locale: "es-AR" });
    expect(en).not.toBe(es);
    expect(en).toContain("2026");
  });

  it("respects an explicit time zone (different day across zones)", () => {
    const utc = formatDate(FIXED, { timeZone: "UTC" });
    const ny = formatDate(FIXED, { timeZone: "America/New_York" });
    expect(utc).not.toBe(ny);
    expect(utc).toMatch(/05/); // 5 July in UTC
    expect(ny).toMatch(/04/); // 4 July in NY
  });

  it("emits a non-empty string", () => {
    expect(formatDate(FIXED)).toBeTypeOf("string");
    expect(formatDate(FIXED).length).toBeGreaterThan(0);
  });
});

describe("parseIsoDate", () => {
  it("parses an ISO 8601 string into a Date", () => {
    const date = parseIsoDate("2026-07-05T14:30:00.000Z");
    expect(date).toBeInstanceOf(Date);
    expect(date.toISOString()).toBe("2026-07-05T14:30:00.000Z");
  });

  it("rejects malformed input", () => {
    expect(() => parseIsoDate("not-a-date")).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => parseIsoDate("")).toThrow();
  });

  it("preserves an ISO string with a non-UTC offset", () => {
    const date = parseIsoDate("2026-07-05T11:30:00.000-03:00");
    expect(date.toISOString()).toBe("2026-07-05T14:30:00.000Z");
  });
});

describe("toIsoString", () => {
  it("emits the canonical UTC ISO 8601 shape", () => {
    const date = new Date("2026-07-05T11:30:00.000-03:00");
    expect(toIsoString(date)).toBe("2026-07-05T14:30:00.000Z");
  });

  it("round-trips through parseIsoDate", () => {
    const original = "2026-07-05T14:30:00.000Z";
    expect(toIsoString(parseIsoDate(original))).toBe(original);
  });
});
