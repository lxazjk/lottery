// Shared, DOM-free rules. Storage must run draw/redraw/reset atomically.
export class LotteryError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// Some embedded browsers expose getRandomValues but not randomUUID. Keep IDs
// cryptographically random in both environments; never fall back to Math.random.
export function secureId(source = globalThis.crypto) {
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  if (typeof source?.getRandomValues !== "function") {
    throw new LotteryError(
      "当前浏览器不支持安全随机数，请使用新版 Chrome 或 Safari 打开",
      "BROWSER_UNSUPPORTED",
    );
  }
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

// Winner records contain only primitive fields. An explicit copy also supports
// browsers without the newer structuredClone global.
function copyRecords(records) {
  if (!Array.isArray(records))
    throw new LotteryError("中奖记录格式异常，请检查备份", "INVALID_DATA");
  return records.map((record) => ({ ...record }));
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
    (activity.absentRecords !== undefined &&
      !Array.isArray(activity.absentRecords)) ||
    typeof activity.id !== "string"
  ) {
    throw new LotteryError(
      "已保存的活动与配置不一致，请保留数据并检查配置",
      "INVALID_DATA",
    );
  }
  const numbers = new Set(),
    ids = new Set();
  const absent = activity.absentRecords || [];
  const allRecords = [...activity.records, ...absent];
  for (const row of allRecords) {
    const prize = config.prizes.find((p) => p.type === row?.type);
    if (
      !row ||
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
  for (const row of allRecords) {
    if (
      row.replaces !== undefined &&
      !absent.some(
        (old) =>
          old.id === row.replaces &&
          old.replacedBy === row.id &&
          old.type === row.type,
      )
    ) {
      throw new LotteryError("补抽记录异常，请检查备份", "INVALID_DATA");
    }
  }
  for (const row of absent) {
    if (
      !Number.isFinite(Date.parse(row.excludedAt)) ||
      !allRecords.some(
        (next) =>
          next.id === row.replacedBy &&
          next.replaces === row.id &&
          next.type === row.type,
      )
    ) {
      throw new LotteryError("缺席记录异常，请检查备份", "INVALID_DATA");
    }
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
    id: secureId(),
    revision: 0,
    createdAt: new Date().toISOString(),
    config: signature(config),
    records: copyRecords(records),
    absentRecords: [],
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
    records: copyRecords(activity.records),
    absentRecords: copyRecords(activity.absentRecords || []),
    availableCount:
      config.numberRange.end -
      config.numberRange.start +
      1 -
      activity.records.length -
      (activity.absentRecords || []).length,
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
  checkRequest(activity, requestId);
  const existing = activity.records.find((row) => row.id === requestId);
  if (existing) {
    if (existing.type !== type || existing.replaces)
      throw new LotteryError("抽奖请求与奖项不一致", "INVALID_REQUEST");
    return { activity, winner: existing };
  }
  const prize = config.prizes.find((p) => p.type === type);
  if (!prize) throw new LotteryError("奖项不存在", "INVALID_REQUEST");
  if (activity.records.filter((r) => r.type === type).length >= prize.count) {
    throw new LotteryError("该奖项已全部抽完，请选择下一奖项", "PRIZE_FULL");
  }
  const winner = {
    id: requestId,
    type,
    number: chooseNumber(activity, config, choose),
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

function checkRequest(activity, requestId) {
  if (
    typeof requestId !== "string" ||
    !/^[a-zA-Z0-9-]{12,80}$/.test(requestId)
  ) {
    throw new LotteryError("抽奖请求无效，请刷新页面", "INVALID_REQUEST");
  }
  if ((activity.absentRecords || []).some((row) => row.id === requestId)) {
    throw new LotteryError(
      "该中奖结果已因缺席被替换，已同步最新名单",
      "WINNER_REPLACED",
    );
  }
}

function chooseNumber(activity, config, choose) {
  const used = new Set(
    [...activity.records, ...(activity.absentRecords || [])].map(
      (r) => r.number,
    ),
  );
  const available = [];
  for (
    let number = config.numberRange.start;
    number <= config.numberRange.end;
    number++
  ) {
    if (!used.has(number)) available.push(number);
  }
  if (!available.length)
    throw new LotteryError(
      "当前已没有可参与的号码，无法继续抽取",
      "NO_CANDIDATES",
    );
  const index = choose(available.length);
  if (!Number.isInteger(index) || index < 0 || index >= available.length)
    throw new Error("随机数生成失败");
  return available[index];
}

// Excluding the absent winner and saving their replacement must commit together.
// A failed/retried request can never lose the old result or consume another slot.
export function redraw(
  activity,
  config,
  winnerId,
  requestId,
  expectedId,
  choose = randomBelow,
) {
  validate(activity, config);
  checkActivity(activity, expectedId);
  checkRequest(activity, requestId);
  if (typeof winnerId !== "string" || !/^[a-zA-Z0-9-]{12,80}$/.test(winnerId)) {
    throw new LotteryError("补抽请求缺少有效中奖记录", "INVALID_REQUEST");
  }
  const existing = activity.records.find((row) => row.id === requestId);
  if (existing) {
    if (existing.replaces !== winnerId)
      throw new LotteryError("补抽请求与中奖记录不一致", "INVALID_REQUEST");
    return { activity, winner: existing };
  }
  const previous = activity.records.find((row) => row.id === winnerId);
  if (!previous)
    throw new LotteryError(
      "该号码已在其他页面被替换，请查看最新中奖名单",
      "WINNER_REPLACED",
    );
  const at = new Date().toISOString();
  const winner = {
    id: requestId,
    type: previous.type,
    number: chooseNumber(activity, config, choose),
    at,
    replaces: winnerId,
  };
  const next = {
    ...activity,
    revision: activity.revision + 1,
    records: activity.records.map((row) =>
      row.id === winnerId ? winner : row,
    ),
    absentRecords: [
      ...(activity.absentRecords || []),
      { ...previous, excludedAt: at, replacedBy: requestId },
    ],
  };
  validate(next, config);
  return { activity: next, winner };
}
