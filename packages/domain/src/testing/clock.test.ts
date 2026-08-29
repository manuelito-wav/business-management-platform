import { describe, expect, it } from "vitest";
import { FixedClock } from "./clock";

describe("FixedClock", () => {
  it("returns the same instant until changed", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));

    expect(clock.now()).toEqual(new Date("2026-01-01T00:00:00.000Z"));
    expect(clock.now()).toEqual(new Date("2026-01-01T00:00:00.000Z"));
  });

  it("defaults to a fixed instant when none is given", () => {
    const clock = new FixedClock();
    expect(clock.now()).toBeInstanceOf(Date);
  });

  it("advances by the given number of milliseconds", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));

    clock.advanceMs(1000);

    expect(clock.now()).toEqual(new Date("2026-01-01T00:00:01.000Z"));
  });

  it("sets an arbitrary instant", () => {
    const clock = new FixedClock();
    const target = new Date("2030-06-15T12:30:00.000Z");

    clock.set(target);

    expect(clock.now()).toEqual(target);
  });
});
