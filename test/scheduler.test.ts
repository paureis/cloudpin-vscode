import { describe, expect, it } from "vitest";
import { RefreshScheduler } from "../src/scheduler";

/** A run function whose calls stay pending until the test finishes them. */
function controlledRun() {
  const pending: (() => void)[] = [];
  let calls = 0;
  let active = 0;
  let maxActive = 0;
  const run = () =>
    new Promise<void>((resolve) => {
      calls++;
      active++;
      maxActive = Math.max(maxActive, active);
      pending.push(() => {
        active--;
        resolve();
      });
    });
  const finish = async () => {
    pending.shift()?.();
    // Let the scheduler's promise chain settle.
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };
  return { run, finish, calls: () => calls, maxActive: () => maxActive, waiting: () => pending.length };
}

describe("RefreshScheduler", () => {
  it("runs a request straight away", async () => {
    const c = controlledRun();
    const s = new RefreshScheduler(c.run, () => 0);
    const done = s.request();
    expect(c.calls()).toBe(1);
    await c.finish();
    await done;
    expect(s.running).toBe(false);
  });

  it("coalesces requests made while a check runs into one more check", async () => {
    const c = controlledRun();
    const s = new RefreshScheduler(c.run, () => 0);
    void s.request();
    const a = s.request();
    const b = s.request();
    const d = s.request();
    expect(a).toBe(b);
    expect(b).toBe(d);
    expect(c.calls()).toBe(1);
    await c.finish();
    expect(c.calls()).toBe(2);
    await c.finish();
    await a;
    expect(c.calls()).toBe(2);
    expect(c.maxActive()).toBe(1);
  });

  it("a request after the rerun started queues another rerun", async () => {
    const c = controlledRun();
    const s = new RefreshScheduler(c.run, () => 0);
    void s.request();
    void s.request();
    await c.finish();
    expect(c.calls()).toBe(2);
    void s.request();
    await c.finish();
    expect(c.calls()).toBe(3);
    await c.finish();
    expect(c.calls()).toBe(3);
    expect(c.maxActive()).toBe(1);
  });

  it("drops a focus refresh within 30 s of the last check, whatever started it", async () => {
    let now = 1_000_000;
    const c = controlledRun();
    const s = new RefreshScheduler(c.run, () => now);

    void s.requestOnFocus(); // first focus with no earlier check: runs
    expect(c.calls()).toBe(1);
    await c.finish();

    now += 10_000;
    await s.requestOnFocus();
    expect(c.calls()).toBe(1);

    now += 19_999; // 29.999 s after the check started
    await s.requestOnFocus();
    expect(c.calls()).toBe(1);

    now += 1; // 30 s
    void s.requestOnFocus();
    expect(c.calls()).toBe(2);
    await c.finish();

    now += 40_000;
    void s.request(); // a file change refreshes regardless
    expect(c.calls()).toBe(3);
    await c.finish();
    now += 5_000;
    await s.requestOnFocus();
    expect(c.calls()).toBe(3);
  });

  it("keeps working after a run throws", async () => {
    let calls = 0;
    const s = new RefreshScheduler(async () => {
      calls++;
      if (calls === 1) throw new Error("boom");
    }, () => 0);
    await s.request();
    await s.request();
    expect(calls).toBe(2);
  });

  it("runs nothing after dispose", async () => {
    const c = controlledRun();
    const s = new RefreshScheduler(c.run, () => 0);
    void s.request();
    const queued = s.request();
    s.dispose();
    await c.finish();
    await queued;
    expect(c.calls()).toBe(1);
    await s.request();
    expect(c.calls()).toBe(1);
  });
});
