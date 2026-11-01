import rawConfig from "../lottery/config.json";
import {
  createActivity,
  snapshot,
  draw,
  validate,
  checkActivity,
} from "../lottery/model.mjs";

const config = {
  ...rawConfig,
  prizes: rawConfig.prizes.map((prize) => ({
    ...prize,
    image: import.meta.env.BASE_URL + prize.image.replace(/^\//, ""),
  })),
};
const DATABASE = "enterprise-lottery-v1";
const NOTIFICATION = "enterprise-lottery-updated";
let database, initializing;
const channel =
  typeof BroadcastChannel === "function"
    ? new BroadcastChannel(NOTIFICATION)
    : null;

function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("state");
        request.result.createObjectStore("backups", { keyPath: "id" });
      };
      request.onerror = () =>
        reject(new Error("无法打开本机存储，请检查浏览器是否允许保存网站数据"));
      request.onblocked = () =>
        reject(new Error("存储正在升级，请关闭其他抽奖页面后重试"));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          database = null;
        };
        resolve(db);
      };
    }).catch((error) => {
      database = null;
      throw error;
    });
  }
  return database;
}

// IndexedDB serializes read/write transactions across tabs. Candidate filtering,
// selection, and committing the result therefore form one indivisible operation.
async function transaction(update) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["state", "backups"], "readwrite");
    const store = tx.objectStore("state");
    const request = store.get("current");
    let result, failure;
    request.onsuccess = () => {
      try {
        const change = update(request.result);
        if (change.activity) store.put(change.activity, "current");
        if (change.backup) tx.objectStore("backups").put(change.backup);
        result = change.result;
      } catch (error) {
        failure = error;
        tx.abort();
      }
    };
    tx.oncomplete = () => resolve(result);
    tx.onabort = () =>
      reject(
        failure || new Error("结果未能保存，请检查本机存储空间后重试确认"),
      );
  });
}

// One-time compatibility with the existing localhost installation. Static hosting
// never needs this endpoint; no draw/reset is sent to the old backend.
async function legacyRecords() {
  if (
    !["127.0.0.1", "localhost"].includes(location.hostname) ||
    location.port !== "9018"
  )
    return [];
  const response = await fetch("/getTempData", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (
    response.status === 404 ||
    response.status === 405 ||
    !response.headers.get("content-type")?.includes("application/json")
  )
    return [];
  if (!response.ok) throw new Error("旧活动记录读取失败，请保留原文件后重试");
  const data = await response.json();
  if (!Array.isArray(data.records))
    throw new Error("旧活动记录格式异常，请检查原数据");
  return data.records;
}

async function ensureInitialized() {
  if (!initializing) {
    initializing = (async () => {
      const existing = await transaction((activity) => ({ result: activity }));
      if (existing) {
        validate(existing, config);
        return;
      }
      const records = await legacyRecords();
      await transaction((activity) =>
        activity
          ? { result: snapshot(activity, config) }
          : { activity: createActivity(config, records) },
      );
    })().catch((error) => {
      initializing = null;
      throw error;
    });
  }
  return initializing;
}

function notify() {
  channel?.postMessage("updated");
  // Storage events also cover browsers without BroadcastChannel. This is only
  // a notification; the source of truth remains the IndexedDB transaction.
  if (!channel) {
    try {
      localStorage.setItem(NOTIFICATION, crypto.randomUUID());
    } catch {
      /* optional */
    }
  }
}

export const api = {
  async getTempData() {
    await ensureInitialized();
    return transaction((activity) => ({ result: snapshot(activity, config) }));
  },
  async draw(type, requestId, activityId) {
    await ensureInitialized();
    const data = await transaction((activity) => {
      const change = draw(activity, config, type, requestId, activityId);
      return {
        activity: change.activity,
        result: { ...snapshot(change.activity, config), winner: change.winner },
      };
    });
    notify();
    return data;
  },
  async reset(activityId) {
    await ensureInitialized();
    const data = await transaction((activity) => {
      validate(activity, config);
      checkActivity(activity, activityId);
      const next = createActivity(config);
      return {
        activity: next,
        backup: activity.records.length
          ? { ...activity, archivedAt: new Date().toISOString() }
          : undefined,
        result: snapshot(next, config),
      };
    });
    notify();
    return data;
  },
  subscribe(listener) {
    const onStorage = (event) => {
      if (event.key === NOTIFICATION) listener();
    };
    channel?.addEventListener("message", listener);
    window.addEventListener("storage", onStorage);
    return () => {
      channel?.removeEventListener("message", listener);
      window.removeEventListener("storage", onStorage);
    };
  },
  async backup() {
    await ensureInitialized();
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["state", "backups"], "readonly");
      const current = tx.objectStore("state").get("current");
      const backups = tx.objectStore("backups").getAll();
      tx.oncomplete = () =>
        resolve({
          version: 1,
          config: rawConfig,
          current: current.result,
          backups: backups.result,
        });
      tx.onabort = () => reject(new Error("备份读取失败，请重试"));
    });
  },
};
