import { describe, it, expect } from "vitest";
import { formatPence } from "./format";

describe("formatPence", () => {
  it("formats pence as pounds with two decimals", () => {
    expect(formatPence(4500)).toBe("£45.00");
    expect(formatPence(805)).toBe("£8.05");
    expect(formatPence(0)).toBe("£0.00");
  });
});
