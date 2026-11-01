import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createActivity,
  draw,
  snapshot,
  validate,
  randomBelow,
} from "./model.mjs";

const config = JSON.parse(
  readFileSync(new URL("./config.json", import.meta.url)),
);
const id = () => crypto.randomUUID();

test("all 8 winners are distinct across prizes, even when the RNG always picks index zero", () => {
  let activity = createActivity(config);
  const order = [4, 4, 4, 3, 3, 2, 2, 1];
  for (const type of order)
    activity = draw(
      activity,
      config,
      type,
      id(),
      activity.id,
      () => 0,
    ).activity;
  assert.deepEqual(
    activity.records.map((r) => r.number),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.deepEqual(
    activity.records.map((r) => r.type),
    order,
  );
  assert.equal(snapshot(activity, config).availableCount, 192);
  for (const type of [1, 2, 3, 4]) {
    assert.throws(() => draw(activity, config, type, id(), activity.id), {
      code: "PRIZE_FULL",
    });
  }
});

test("the entire 200-number pool can be exhausted without replacement", () => {
  const settings = { ...config, prizes: [{ type: 1, count: 200 }] };
  let activity = createActivity(settings);
  for (let i = 0; i < 200; i++) {
    activity = draw(
      activity,
      settings,
      1,
      id(),
      activity.id,
      (size) => size - 1,
    ).activity;
  }
  assert.equal(new Set(activity.records.map((r) => r.number)).size, 200);
  assert.deepEqual(
    activity.records.map((r) => r.number),
    Array.from({ length: 200 }, (_, i) => 200 - i),
  );
});

test("repeated requests confirm the same winner, including after reload and when the prize is full", () => {
  const activity = createActivity(config),
    request = id();
  const first = draw(activity, config, 1, request, activity.id);
  const reloaded = JSON.parse(JSON.stringify(first.activity));
  const retry = draw(reloaded, config, 1, request, activity.id, () => {
    throw new Error("must not redraw");
  });
  assert.deepEqual(retry.winner, first.winner);
  assert.equal(retry.activity.records.length, 1);
  assert.throws(() => draw(reloaded, config, 2, request, activity.id), {
    code: "INVALID_REQUEST",
  });
});

test("old pending draws cannot enter a newly reset activity", () => {
  const old = createActivity(config),
    next = createActivity(config);
  assert.throws(() => draw(next, config, 4, id(), old.id), {
    code: "ACTIVITY_CHANGED",
  });
  assert.equal(next.records.length, 0);
  const a = draw(old, config, 4, id(), old.id, () => 0);
  const b = draw(next, config, 4, id(), next.id, () => 0);
  assert.equal(
    a.winner.number,
    b.winner.number,
    "an explicit new activity re-enables the number",
  );
});

test("corrupt, duplicate, out-of-range, and changed-config data stop drawing", () => {
  const initial = createActivity(config);
  const first = draw(initial, config, 4, id(), initial.id).activity;
  for (const number of [first.records[0].number, 0, 201]) {
    const corrupt = {
      ...first,
      records: [...first.records, { ...first.records[0], id: id(), number }],
    };
    assert.throws(() => validate(corrupt, config), { code: "INVALID_DATA" });
  }
  assert.throws(
    () => validate(first, { ...config, numberRange: { start: 1, end: 199 } }),
    { code: "INVALID_DATA" },
  );
  assert.throws(() => draw(first, config, 4, "bad", initial.id), {
    code: "INVALID_REQUEST",
  });
});

test("secure random indices respect pool bounds, including a single remaining number", () => {
  for (const size of [1, 2, 8, 199, 200]) {
    for (let i = 0; i < 100; i++) {
      const value = randomBelow(size);
      assert(Number.isInteger(value) && value >= 0 && value < size);
    }
  }
  assert.throws(() => randomBelow(0), RangeError);
});
