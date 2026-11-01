const fs = require("node:fs");
const path = require("node:path");
const { randomInt } = require("node:crypto");

// Synchronous atomic persistence serializes draws in this single-process service.
// A result is acknowledged only after its complete record has been written.
function createDrawStore(config, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, "draws.json");
  let records = fs.existsSync(filename)
    ? JSON.parse(fs.readFileSync(filename, "utf8")).records
    : [];
  const numbers = Array.from(
    { length: config.numberRange.end - config.numberRange.start + 1 },
    (_, i) => config.numberRange.start + i,
  );

  function validate(rows) {
    if (!Array.isArray(rows))
      throw new Error("中奖记录格式错误，请恢复备份后重启");
    const used = new Set();
    const ids = new Set();
    for (const row of rows) {
      const prize = config.prizes.find((p) => p.type === row.type);
      if (
        !prize ||
        !numbers.includes(row.number) ||
        used.has(row.number) ||
        ids.has(row.id)
      ) {
        throw new Error("中奖记录与活动配置不一致，请检查数据文件");
      }
      used.add(row.number);
      ids.add(row.id);
    }
    for (const prize of config.prizes) {
      if (rows.filter((r) => r.type === prize.type).length > prize.count) {
        throw new Error("中奖数量超过奖项名额，请检查数据文件");
      }
    }
  }
  validate(records);

  function commit(next) {
    validate(next);
    const temporary = filename + ".tmp";
    fs.writeFileSync(
      temporary,
      JSON.stringify({ version: 1, records: next }, null, 2),
      { mode: 0o600 },
    );
    fs.renameSync(temporary, filename);
    records = next;
  }

  function snapshot() {
    return {
      cfgData: config,
      records: records.map((row) => ({ ...row })),
      availableCount: numbers.length - records.length,
    };
  }

  function draw(type, id) {
    if (typeof id !== "string" || !/^[a-zA-Z0-9-]{12,80}$/.test(id)) {
      throw Object.assign(new Error("抽奖请求无效，请刷新页面"), {
        status: 400,
      });
    }
    const existing = records.find((row) => row.id === id);
    if (existing) {
      if (existing.type !== type)
        throw Object.assign(new Error("抽奖请求与奖项不一致"), { status: 409 });
      return { winner: { ...existing }, ...snapshot() };
    }
    const prize = config.prizes.find((p) => p.type === type);
    if (!prize) throw Object.assign(new Error("奖项不存在"), { status: 400 });
    if (records.filter((row) => row.type === type).length >= prize.count) {
      throw Object.assign(new Error("该奖项已全部抽完"), { status: 409 });
    }
    const used = new Set(records.map((row) => row.number));
    const available = numbers.filter((number) => !used.has(number));
    if (!available.length)
      throw Object.assign(new Error("没有可参与的号码"), { status: 409 });
    const winner = {
      id,
      type,
      number: available[randomInt(available.length)],
      at: new Date().toISOString(),
    };
    commit([...records, winner]);
    return { winner: { ...winner }, ...snapshot() };
  }

  function reset() {
    if (records.length) {
      fs.copyFileSync(
        filename,
        path.join(directory, "draws-backup-" + Date.now() + ".json"),
      );
    }
    commit([]);
    return snapshot();
  }
  return { snapshot, draw, reset, numbers };
}

module.exports = { createDrawStore };
