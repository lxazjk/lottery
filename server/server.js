const express = require("express");
const path = require("node:path");
const xlsx = require("node-xlsx").default;
const config = require("./config");
const { createDrawStore } = require("./draw-store");

function createApp(
  directory = process.env.LOTTERY_DATA_DIR || path.join(__dirname, "cache"),
) {
  const app = express();
  const store = createDrawStore(config, directory);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "16kb" }));
  app.use((req, res, next) => {
    if (req.method === "POST") res.set("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (
      req.method === "POST" &&
      origin &&
      new URL(origin).host !== req.headers.host
    ) {
      return res.status(403).json({ error: "请从活动页面操作" });
    }
    next();
  });
  app.post("/getTempData", (_req, res) => res.json(store.snapshot()));
  app.post("/getUsers", (_req, res) => res.json(store.numbers));
  app.post("/draw", (req, res, next) => {
    try {
      res.json(store.draw(req.body.type, req.body.requestId));
    } catch (error) {
      next(error);
    }
  });
  app.post("/reset", (_req, res, next) => {
    try {
      res.json(store.reset());
    } catch (error) {
      next(error);
    }
  });
  app.get("/export", (_req, res) => {
    const { records } = store.snapshot();
    const data = [["奖项", "中奖号码", "开奖时间"]];
    for (const prize of config.prizes) {
      for (const record of records.filter((row) => row.type === prize.type)) {
        data.push([
          prize.text,
          String(record.number).padStart(3, "0"),
          new Date(record.at).toLocaleString("zh-CN", {
            timeZone: "Asia/Shanghai",
            hour12: false,
          }),
        ]);
      }
    }
    const file = xlsx.build([{ name: "中奖名单", data }]);
    res.set(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.set(
      "Content-Disposition",
      "attachment; filename*=UTF-8''" +
        encodeURIComponent("幸运盛典-中奖名单.xlsx"),
    );
    res.send(file);
  });
  app.use(express.static(path.join(__dirname, "../product/dist")));
  app.use((error, _req, res, _next) => {
    console.error("[lottery]", error.message);
    res
      .status(error.status || 500)
      .json({
        error: error.status
          ? error.message
          : "保存未完成，请重试确认结果；请勿关闭页面",
      });
  });
  return app;
}

function run(port = 8888) {
  const app = createApp();
  app
    .listen(Number(port), "127.0.0.1", () => {
      console.log("lottery server listening at http://127.0.0.1:" + port);
    })
    .on("error", (error) => {
      console.error("[lottery] 服务启动失败：", error.message);
      process.exit(1);
    });
}

module.exports = { createApp, run };
