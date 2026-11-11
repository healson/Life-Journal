/**
 * rebuild-commit.cjs —— 在本地重建远端提交对象，修正 API 推送造成的本地/远端 SHA 不一致。
 *
 * 背景：GitHub Git Data API 建提交时按账户时区（healson 为 +0800）记录时间戳，
 *       因此同一份内容在本地与远端的 commit SHA 不同。若不修正，下次正常 git push 会非快进。
 * 做法：经 API 读取远端提交元数据（tree/parent/author/committer/message），
 *       用 git hash-object 重建出完全相同的对象，再把本地分支指过去。
 *
 * 用法：node scripts/rebuild-commit.cjs <remote-sha>
 * 安全：重建前校验远端 tree 与本地 tree 一致，不一致直接退出，绝不覆盖内容不同的提交。
 */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_DIR = path.resolve(__dirname, "..");
const SLUG = process.env.GH_REPO || "healson/Life-Journal";
const TARGET = process.argv[2];

function token() {
  const candidates = [
    process.env.LJ_PAT_FILE,
    path.join(os.homedir(), ".lj-secrets", "gh_pat.txt"),
    path.join(REPO_DIR, "gh_pat.txt"),
  ].filter(Boolean);
  for (const p of candidates) if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  throw new Error("未找到 GitHub PAT：设置 LJ_PAT_FILE 或放到 ~/.lj-secrets/gh_pat.txt");
}

const git = (args, input) =>
  execSync(`git -C "${REPO_DIR}" ${args}`, { input, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

(async () => {
  if (!TARGET) {
    console.error("用法: node scripts/rebuild-commit.cjs <remote-sha>");
    process.exit(2);
  }
  const res = await fetch(`https://api.github.com/repos/${SLUG}/git/commits/${TARGET}`, {
    headers: { Authorization: "Bearer " + token(), Accept: "application/vnd.github+json", "User-Agent": "life-journal-release" },
  });
  if (!res.ok) throw new Error("获取远端提交失败: " + res.status);
  const c = await res.json();
  if ((c.parents || []).length !== 1) throw new Error("仅支持单父提交");

  const localHead = git("rev-parse HEAD").trim();
  // 注意：不能裸写 rev-parse <sha>^{tree} —— execSync 在 Windows 走 cmd.exe，^ 会被当转义符吞掉；
  // 加引号后 cmd 不再解释 ^（cat-file tree 输出的是树内容而非 SHA，不能替代）
  const localTree = git(`rev-parse "${localHead}^{tree}"`).trim();
  if (localTree !== c.tree.sha) {
    throw new Error(`tree 不一致，拒绝重置。远端=${c.tree.sha} 本地=${localTree}`);
  }

  const ts = (iso) => Math.floor(new Date(iso).getTime() / 1000);
  const header =
    `tree ${c.tree.sha}\nparent ${c.parents[0].sha}\n` +
    `author ${c.author.name} <${c.author.email}> ${ts(c.author.date)} +0800\n` +
    `committer ${c.committer.name} <${c.committer.email}> ${ts(c.committer.date)} +0800\n\n`;

  let sha = null;
  for (const body of new Set([c.message.endsWith("\n") ? c.message : c.message + "\n", c.message])) {
    const s = git("hash-object -t commit -w --stdin", Buffer.from(header + body, "utf8")).trim();
    if (s === TARGET) { sha = s; break; }
  }
  if (!sha) throw new Error("未能重建出与远端相同的 commit SHA（时区或作者信息可能不同）");

  git(`update-ref refs/remotes/origin/${process.env.GH_BRANCH || "main"} ${TARGET}`);
  git(`reset --hard ${TARGET}`);
  console.log("已对齐：HEAD =", git("rev-parse HEAD").trim());
  console.log(git("status --short"));
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
