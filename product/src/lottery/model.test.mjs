import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createActivity,
  draw,
  redraw,
  snapshot,
  validate,
  randomBelow,
  secureId,
} from "./model.mjs";

const config = JSON.parse(
  readFileSync(new URL("./config.json", import.meta.url)),
);
const id = () => crypto.randomUUID();

test("UUID fallback sets the required version/variant bits without a native randomUUID", () => {
  const source = {
    getRandomValues(bytes) {
      assert.equal(this, source);
      return bytes.fill(255);
    },
  };
  assert.equal(secureId(source), "ffffffff-ffff-4fff-bfff-ffffffffffff");
  assert.throws(() => secureId({}), { code: "BROWSER_UNSUPPORTED" });
});

test("an environment without randomUUID or structuredClone can initialize, draw all prizes, reload, and reset", () => {
  const cryptoDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "crypto",
  );
  const cloneDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    "structuredClone",
  );
  const provider = { getRandomValues: crypto.getRandomValues.bind(crypto) };
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: provider,
  });
  Object.defineProperty(globalThis, "structuredClone", {
    configurable: true,
    value: undefined,
  });
  try {
    let activity = createActivity(config);
    const activityId = activity.id;
    const ids = [activityId];
    for (const type of [4, 4, 4, 3, 3, 2, 2, 1]) {
      const requestId = secureId();
      ids.push(requestId);
      activity = draw(activity, config, type, requestId, activityId).activity;
    }
    assert.equal(new Set(ids).size, 9);
    assert(
      ids.every((value) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
          value,
        ),
      ),
    );
    assert.equal(new Set(activity.records.map((row) => row.number)).size, 8);
    const reloaded = snapshot(JSON.parse(JSON.stringify(activity)), config);
    assert.equal(reloaded.records.length, 8);
    reloaded.records[0].number = 999;
    assert.notEqual(activity.records[0].number, 999);
    assert.notEqual(createActivity(config).id, activityId);
  } finally {
    Object.defineProperty(globalThis, "crypto", cryptoDescriptor);
    Object.defineProperty(globalThis, "structuredClone", cloneDescriptor);
  }
});

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

test("redraw replaces exactly one slot in a fully drawn activity and excludes absentees across prizes", () => {
  let activity = createActivity(config);
  for (const type of [4, 4, 4, 3, 3, 2, 2, 1])
    activity = draw(
      activity,
      config,
      type,
      id(),
      activity.id,
      () => 0,
    ).activity;
  const original = activity.records[7];
  const replacement = redraw(
    activity,
    config,
    original.id,
    id(),
    activity.id,
    () => 0,
  );
  assert.equal(replacement.winner.number, 9);
  assert.equal(replacement.winner.type, 1);
  assert.deepEqual(
    replacement.activity.records.slice(0, 7),
    activity.records.slice(0, 7),
  );
  assert.equal(replacement.activity.records.length, 8);
  assert.equal(
    activity.absentRecords.length,
    0,
    "the input activity remains unchanged",
  );
  assert.equal(replacement.activity.absentRecords[0].number, 8);
  assert.equal(replacement.activity.revision, activity.revision + 1);
  const second = redraw(
    replacement.activity,
    config,
    activity.records[0].id,
    id(),
    activity.id,
    () => 0,
  );
  assert.equal(second.winner.number, 10);
  assert.equal(snapshot(second.activity, config).availableCount, 190);
  assert.equal(second.activity.records.length, 8);
});

test("replacement chains survive reload; retries never replace twice or resurrect an absent winner", () => {
  const initial = createActivity(config);
  const first = draw(initial, config, 4, id(), initial.id, () => 0);
  const requestId = id();
  assert.throws(
    () =>
      redraw(first.activity, config, undefined, first.winner.id, initial.id),
    { code: "INVALID_REQUEST" },
  );
  const second = redraw(
    first.activity,
    config,
    first.winner.id,
    requestId,
    initial.id,
    () => 0,
  );
  const reloaded = JSON.parse(JSON.stringify(second.activity));
  const retry = redraw(
    reloaded,
    config,
    first.winner.id,
    requestId,
    initial.id,
    () => {
      throw new Error("must not redraw");
    },
  );
  assert.deepEqual(retry.activity, reloaded);
  assert.equal(retry.winner.number, 2);
  assert.throws(
    () => redraw(reloaded, config, first.winner.id, id(), initial.id),
    { code: "WINNER_REPLACED" },
  );
  assert.throws(() => draw(reloaded, config, 4, first.winner.id, initial.id), {
    code: "WINNER_REPLACED",
  });
  assert.throws(() => redraw(reloaded, config, id(), requestId, initial.id), {
    code: "INVALID_REQUEST",
  });
  const third = redraw(
    reloaded,
    config,
    second.winner.id,
    id(),
    initial.id,
    () => 0,
  );
  assert.equal(third.winner.number, 3);
  assert.deepEqual(
    third.activity.absentRecords.map((row) => row.number),
    [1, 2],
  );
  assert.throws(
    () =>
      redraw(third.activity, config, first.winner.id, requestId, initial.id),
    { code: "WINNER_REPLACED" },
  );
  const otherPrize = draw(third.activity, config, 3, id(), initial.id, () => 0);
  assert.equal(otherPrize.winner.number, 4);
  const saved = snapshot(third.activity, config);
  saved.absentRecords[0].number = 999;
  assert.equal(third.activity.absentRecords[0].number, 1);
});

test("old stored activities without absence history remain usable; reset re-enables excluded numbers", () => {
  let legacy = createActivity(config);
  delete legacy.absentRecords;
  legacy = draw(legacy, config, 1, id(), legacy.id, () => 0).activity;
  assert.deepEqual(snapshot(legacy, config).absentRecords, []);
  const replaced = redraw(
    legacy,
    config,
    legacy.records[0].id,
    id(),
    legacy.id,
    () => 0,
  );
  const next = createActivity(config);
  assert.equal(draw(next, config, 1, id(), next.id, () => 0).winner.number, 1);
  assert.throws(
    () => redraw(next, config, replaced.winner.id, id(), legacy.id),
    { code: "ACTIVITY_CHANGED" },
  );
});

test("exhausted pools and failed random selection preserve the original winner and quota", () => {
  const settings = {
    numberRange: { start: 1, end: 2 },
    prizes: [{ type: 1, count: 1 }],
  };
  const initial = createActivity(settings);
  const first = draw(initial, settings, 1, id(), initial.id, () => 0);
  assert.throws(
    () =>
      redraw(
        first.activity,
        settings,
        first.winner.id,
        id(),
        initial.id,
        () => 99,
      ),
    /随机数生成失败/,
  );
  assert.equal(first.activity.absentRecords.length, 0);
  const second = redraw(
    first.activity,
    settings,
    first.winner.id,
    id(),
    initial.id,
    () => 0,
  );
  const before = JSON.stringify(second.activity);
  assert.throws(
    () => redraw(second.activity, settings, second.winner.id, id(), initial.id),
    { code: "NO_CANDIDATES" },
  );
  assert.equal(JSON.stringify(second.activity), before);
  assert.equal(snapshot(second.activity, settings).availableCount, 0);
});

test("corrupt absence history cannot re-enable an excluded number or sever its replacement link", () => {
  const initial = createActivity(config);
  const first = draw(initial, config, 4, id(), initial.id, () => 0);
  const second = redraw(
    first.activity,
    config,
    first.winner.id,
    id(),
    initial.id,
    () => 0,
  );
  for (const corrupt of [
    { ...second.activity, absentRecords: null },
    { ...second.activity, absentRecords: [null] },
    {
      ...second.activity,
      absentRecords: [
        { ...second.activity.absentRecords[0], number: second.winner.number },
      ],
    },
    {
      ...second.activity,
      absentRecords: [
        { ...second.activity.absentRecords[0], replacedBy: id() },
      ],
    },
    { ...second.activity, records: [{ ...second.winner, replaces: id() }] },
  ])
    assert.throws(() => validate(corrupt, config), { code: "INVALID_DATA" });
});
