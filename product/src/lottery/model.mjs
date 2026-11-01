// Shared, DOM-free rules. Storage must run draw/reset in one atomic transaction.
export class LotteryError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function signature(config) {
  return JSON.stringify([
    config.numberRange,
    config.prizes.map(({ type, count }) => ({ type, count })),
  ]);
}

export function validate(activity, config) {
  if (
    !activity ||
    activity.config !== signature(config) ||
    !Array.isArray(activity.records) ||
    typeof activity.id !== "string"
  ) {
    throw new LotteryError(
      "已保存的活动与配置不一致，请保留数据并检查配置",
      "INVALID_DATA",
    );
  }
  const numbers = new Set(),
    ids = new Set();
  for (const row of activity.records) {
    const prize = config.prizes.find((p) => p.type === row.type);
    if (
      !prize ||
      !Number.isInteger(row.number) ||
      row.number < config.numberRange.start ||
      row.number > config.numberRange.end ||
      numbers.has(row.number) ||
      ids.has(row.id) ||
      typeof row.id !== "string" ||
      !/^[a-zA-Z0-9-]{12,80}$/.test(row.id) ||
      !Number.isFinite(Date.parse(row.at))
    ) {
      throw new LotteryError(
        "中奖记录异常，已停止抽奖以避免重复，请检查备份",
        "INVALID_DATA",
      );
    }
    numbers.add(row.number);
    ids.add(row.id);
  }
  for (const prize of config.prizes) {
    if (
      activity.records.filter((r) => r.type === prize.type).length > prize.count
    ) {
      throw new LotteryError(
        "中奖记录超过奖项名额，请检查备份",
        "INVALID_DATA",
      );
    }
  }
}

export function createActivity(config, records = []) {
  const activity = {
    id: crypto.randomUUID(),
    revision: 0,
    createdAt: new Date().toISOString(),
    config: signature(config),
    records: structuredClone(records),
  };
  validate(activity, config);
  return activity;
}

export function snapshot(activity, config) {
  validate(activity, config);
  return {
    activityId: activity.id,
    revision: activity.revision,
    cfgData: config,
    records: structuredClone(activity.records),
    availableCount:
      config.numberRange.end -
      config.numberRange.start +
      1 -
      activity.records.length,
  };
}

// Rejection sampling keeps every remaining number equally likely.
export function randomBelow(max) {
  if (!Number.isInteger(max) || max < 1 || max > 0x100000000)
    throw new RangeError("无效随机范围");
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

export function checkActivity(activity, expectedId) {
  if (activity.id !== expectedId) {
    throw new LotteryError(
      "其他页面已开始新活动，请重新开始本次抽取",
      "ACTIVITY_CHANGED",
    );
  }
}

export function draw(
  activity,
  config,
  type,
  requestId,
  expectedId,
  choose = randomBelow,
) {
  validate(activity, config);
  checkActivity(activity, expectedId);
  if (
    typeof requestId !== "string" ||
    !/^[a-zA-Z0-9-]{12,80}$/.test(requestId)
  ) {
    throw new LotteryError("抽奖请求无效，请刷新页面", "INVALID_REQUEST");
  }
  const existing = activity.records.find((row) => row.id === requestId);
  if (existing) {
    if (existing.type !== type)
      throw new LotteryError("抽奖请求与奖项不一致", "INVALID_REQUEST");
    return { activity, winner: existing };
  }
  const prize = config.prizes.find((p) => p.type === type);
  if (!prize) throw new LotteryError("奖项不存在", "INVALID_REQUEST");
  if (activity.records.filter((r) => r.type === type).length >= prize.count) {
    throw new LotteryError("该奖项已全部抽完，请选择下一奖项", "PRIZE_FULL");
  }
  const used = new Set(activity.records.map((r) => r.number));
  const available = [];
  for (
    let number = config.numberRange.start;
    number <= config.numberRange.end;
    number++
  ) {
    if (!used.has(number)) available.push(number);
  }
  if (!available.length)
    throw new LotteryError("没有可参与的号码", "PRIZE_FULL");
  const index = choose(available.length);
  if (!Number.isInteger(index) || index < 0 || index >= available.length)
    throw new Error("随机数生成失败");
  const winner = {
    id: requestId,
    type,
    number: available[index],
    at: new Date().toISOString(),
  };
  const next = {
    ...activity,
    revision: activity.revision + 1,
    records: [...activity.records, winner],
  };
  validate(next, config);
  return { activity: next, winner };
}
