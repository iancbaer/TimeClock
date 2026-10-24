import { test } from "node:test";
import assert from "node:assert/strict";
import { createQueueSynchronizer, type SavedPunch } from "../src/offline-sync.ts";

const punch = (id: string, employeeId = "employee-a"): SavedPunch => ({ employeeId, idempotencyKey: id, type: "WORK_IN", occurredAt: "2026-09-09T12:00:00Z", offlineToken: "token" });

test("keeps a rejected original punch and its error, then removes only after acknowledgement", async () => {
  const original = punch("one");
  let queue = [original];
  let fail = true;
  const sync = createQueueSynchronizer({ read: () => queue, write: value => { queue = value; }, send: async () => { if (fail) throw new Error("Invalid clock state"); } });
  await sync();
  assert.deepEqual(queue, [{ ...original, syncError: "Invalid clock state" }]);
  fail = false;
  await sync();
  assert.deepEqual(queue, []);
});

test("serializes overlapping attempts and preserves punches appended during the request", async () => {
  let queue = [punch("one")];
  let release!: () => void;
  let calls = 0;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const sync = createQueueSynchronizer({ read: () => queue, write: value => { queue = value; }, send: async () => { calls++; await wait; } });
  const first = sync();
  const second = sync();
  queue.push(punch("two"));
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(queue, [punch("two")]);
});

test("a rejected punch blocks later punches for that employee but not another employee", async () => {
  let queue = [punch("one"), punch("two"), punch("three", "employee-b")];
  const attempted: string[] = [];
  const sync = createQueueSynchronizer({ read: () => queue, write: value => { queue = value; }, send: async item => { attempted.push(item.idempotencyKey); if (item.idempotencyKey === "one") throw new Error("Conflict"); } });
  await sync();
  assert.deepEqual(attempted, ["one", "three"]);
  assert.deepEqual(queue.map(item => item.idempotencyKey), ["one", "two"]);
});
