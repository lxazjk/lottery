const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createDrawStore } = require("./draw-store");
const config = require("./config");

function temporary(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lottery-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("200 distinct candidates, exact 1/2/2/3 quotas, no repeat winners, and no extra draw", (t) => {
  const store = createDrawStore(config, temporary(t));
  assert.deepEqual(
    store.numbers,
    Array.from({ length: 200 }, (_, i) => i + 1),
  );
  for (const prize of [...config.prizes].reverse()) {
    for (let i = 0; i < prize.count; i++) store.draw(prize.type, randomUUID());
    assert.throws(() => store.draw(prize.type, randomUUID()), { status: 409 });
  }
  const { records, availableCount } = store.snapshot();
  assert.equal(records.length, 8);
  assert.equal(new Set(records.map((r) => r.number)).size, 8);
  assert.equal(availableCount, 192);
  for (const prize of config.prizes)
    assert.equal(
      records.filter((r) => r.type === prize.type).length,
      prize.count,
    );
});

test("retries return the same persisted winner, including after a server restart", (t) => {
  const directory = temporary(t);
  const store = createDrawStore(config, directory);
  const id = randomUUID();
  const original = store.draw(4, id);
  assert.deepEqual(store.draw(4, id), original);
  const restarted = createDrawStore(config, directory);
  assert.deepEqual(restarted.draw(4, id), original);
  assert.equal(restarted.snapshot().records.length, 1);
  assert.throws(() => restarted.draw(1, id), { status: 409 });
});

test("reset backs up the exact old result before clearing all winners", (t) => {
  const directory = temporary(t);
  const store = createDrawStore(config, directory);
  const record = store.draw(1, randomUUID()).winner;
  store.reset();
  assert.deepEqual(store.snapshot().records, []);
  assert.equal(store.snapshot().availableCount, 200);
  const backups = fs
    .readdirSync(directory)
    .filter((name) => name.startsWith("draws-backup-"));
  assert.equal(backups.length, 1);
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(directory, backups[0]), "utf8"))
      .records,
    [record],
  );
});

test("bad requests and damaged persisted state are rejected instead of silently reset", (t) => {
  const directory = temporary(t);
  const store = createDrawStore(config, directory);
  assert.throws(() => store.draw(9, randomUUID()), { status: 400 });
  assert.throws(() => store.draw(1, "bad"), { status: 400 });
  fs.writeFileSync(
    path.join(directory, "draws.json"),
    '{"records":[{"type":1,"number":201,"id":"invalid-number"}]}',
  );
  assert.throws(() => createDrawStore(config, directory), /不一致/);
});
