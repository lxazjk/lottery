import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const branch = "codex/pages";
const proxy = process.env.LOTTERY_GIT_PROXY;
const gitArgs = proxy ? ["-c", "http.proxy=" + proxy] : [];
const git = (args, options = {}) =>
  execFileSync("git", [...gitArgs, ...args], {
    cwd: root,
    encoding: "utf8",
    ...options,
  }).trim();

if (git(["status", "--porcelain"])) {
  throw new Error("请先提交需要发布的源代码，再运行 npm run publish:pages");
}
const source = git(["rev-parse", "HEAD"]);
execFileSync("npm", ["test"], { cwd: root, stdio: "inherit" });
execFileSync("npm", ["run", "build"], { cwd: root, stdio: "inherit" });

// The isolated index creates a separate tree containing only build output.
// Source files, browser data, and the working index are never included.
const temporary = mkdtempSync(join(tmpdir(), "lottery-pages-"));
try {
  const indexEnvironment = {
    ...process.env,
    GIT_INDEX_FILE: join(temporary, "index"),
  };
  const gitDirectory = git(["rev-parse", "--absolute-git-dir"]);
  const buildDirectory = join(root, "product/dist");
  const staticGit = (args) =>
    git(
      ["--git-dir=" + gitDirectory, "--work-tree=" + buildDirectory, ...args],
      {
        cwd: buildDirectory,
        env: indexEnvironment,
      },
    );
  staticGit(["read-tree", "--empty"]);
  staticGit(["add", "--all", "--", "."]);
  const tree = staticGit(["write-tree"]);
  const ref = "refs/heads/" + branch;
  const remote = git(["ls-remote", "origin", ref]);
  const parents = [];
  if (remote) {
    git(["fetch", "--no-tags", "origin", ref]);
    parents.push("-p", git(["rev-parse", "FETCH_HEAD"]));
  }
  const commit = git(
    ["commit-tree", tree, ...parents, "-m", "Publish lottery from " + source],
    {
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: git(["log", "-1", "--format=%an"]),
        GIT_AUTHOR_EMAIL: git(["log", "-1", "--format=%ae"]),
        GIT_COMMITTER_NAME: git(["log", "-1", "--format=%an"]),
        GIT_COMMITTER_EMAIL: git(["log", "-1", "--format=%ae"]),
      },
    },
  );
  // A normal push rejects concurrent changes instead of overwriting a release.
  git(["push", "origin", commit + ":" + ref], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  console.log("已发布静态文件到 " + branch + "；源代码版本：" + source);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
