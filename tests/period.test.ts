import { describe, it, expect } from "vitest";
import { periodBounds } from "../src/lib/period.js";

describe("periodBounds", () => {
  it("monthly: mes calendario UTC", () => {
    const ref = new Date(Date.UTC(2026, 3, 15));
    const { start, end } = periodBounds("monthly", ref);
    expect(start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("yearly: año UTC", () => {
    const ref = new Date(Date.UTC(2026, 6, 4));
    const { start, end } = periodBounds("year", ref);
    expect(start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});
