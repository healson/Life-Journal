/**
 * push-release.cjs —— 用 GitHub Git Data API 推送本地提交（绕过 github.com:443 被封锁的环境）。
 * 与 scripts/github_push_api.py 功能相同，改用 Node 实现（本机 Python 被 Application Control 拦截）。
 *
 * 用法：
 *   node scripts/push-release.cjs push                 # 推送 HEAD 到 main
 *   node scripts/push-release.cjs tag <sha> <vX.Y.Z>   # 在指定提交上打 tag
 *   node scripts/push-release.cjs release <tag> <apk> [正文文件]  # 建 Release 并上传附件
 *
 * PAT 查找顺序：环境变量 LJ_PAT_FILE → %USERPROFILE%\.lj-secrets\gh_pat.txt → 仓库根目录 gh_pat.txt
 * 注意：API 建出的提交时区按账户时区（+0800），与本地提交 SHA 不同，推送后用
 *       scripts/rebuild-commit.cjs <远端sha> 对齐，否则后续 git push 会非快进。
 */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const REPO_DIR = path.resolve(__dirname, "..");
const SLUG = process.env.GH_REPO || "healson/Life-Journal";
const BRANCH = process.env.GH_BRANCH || "main";

function token() {
  const candidates = [
    process.env.LJ_PAT_FILE,
    path.join(os.homedir(), ".lj-secrets", "gh_pat.txt"),
    path.join(REPO_DIR, "gh_pat.txt"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
  }
  throw new Error("未找到 GitHub PAT：设置 LJ_PAT_FILE 或放到 ~/.lj-secrets/gh_pat.txt");
}
const TOKEN = token();

const git = (args) => execSync(`git -C "${REPO_DIR}" ${args}`, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

async function api(p, method = "GET", body) {
  const res = await fetch("https://api.github.com" + p, {
    method,
    headers: {
      Authorization: "Bearer " + TOKEN,
      Accept: "application/vnd.github+json",
      "User-Agent": "life-journal-release",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`API ${method} ${p} -> ${res.status}: ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : null;
}

/** 把 HEAD 相对远端 ref 的差异通过 API 推送上去，返回远端新提交 SHA */
async function push() {
  const head = git("rev-parse HEAD").trim();
  const remote = await api(`/repos/${SLUG}/git/ref/heads/${BRANCH}`);
  const remoteSha = remote.object.sha;
  if (remoteSha === head) {
    console.log("远端已与本地一致:", head);
    return head;
  }
  try {
    git(`cat-file -t ${remoteSha}`);
  } catch {
    throw new Error("本地缺少远端提交对象 " + remoteSha + "，无法计算差异（先运行 rebuild-commit.cjs）");
  }

  const diff = git(`diff-tree -r --no-renames --name-status ${remoteSha} ${head}`).trim();
  const entries = [];
  for (const line of diff.split("\n").filter(Boolean)) {
    const [status, p] = line.split("\t");
    if (status === "D") {
      entries.push({ path: p, mode: "100644", type: "blob", sha: null });
      continue;
    }
    const mode = git(`ls-tree ${head} -- "${p}"`).trim().split(/\s+/)[0];
    const content = execSync(`git -C "${REPO_DIR}" show ${head}:"${p}"`, { maxBuffer: 64 * 1024 * 1024 });
    const blob = await api(`/repos/${SLUG}/git/blobs`, "POST", {
      content: content.toString("base64"),
      encoding: "base64",
    });
    entries.push({ path: p, mode, type: "blob", sha: blob.sha });
    console.log("blob", p, blob.sha.slice(0, 8));
  }

  const remoteCommit = await api(`/repos/${SLUG}/git/commits/${remoteSha}`);
  const tree = await api(`/repos/${SLUG}/git/trees`, "POST", { base_tree: remoteCommit.tree.sha, tree: entries });
  const message = git("log -1 --format=%B").trim();
  const commit = await api(`/repos/${SLUG}/git/commits`, "POST", { message, tree: tree.sha, parents: [remoteSha] });
  await api(`/repos/${SLUG}/git/refs/heads/${BRANCH}`, "PATCH", { sha: commit.sha, force: false });
  console.log("pushed:", commit.sha);
  console.log("下一步对齐本地 SHA: node scripts/rebuild-commit.cjs " + commit.sha);
  return commit.sha;
}

async function tag(sha, tagName) {
  await api(`/repos/${SLUG}/git/refs`, "POST", { ref: `refs/tags/${tagName}`, sha });
  console.log("tag created:", tagName, "->", sha);
}

async function uploadAsset(releaseId, file) {
  const data = fs.readFileSync(file);
  const name = path.basename(file);
  const res = await fetch(
    `https://uploads.github.com/repos/${SLUG}/releases/${releaseId}/assets?name=${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: {
        Authorization: "Bearer " + TOKEN,
        Accept: "application/vnd.github+json",
        "User-Agent": "life-journal-release",
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Length": String(data.length),
      },
      body: data,
    },
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`upload asset -> ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

async function release(tagName, apk, bodyFile) {
  const body = bodyFile && fs.existsSync(bodyFile) ? fs.readFileSync(bodyFile, "utf8") : "";
  let rel;
  try {
    rel = await api(`/repos/${SLUG}/releases/tags/${tagName}`);
    console.log("release already exists:", rel.html_url);
  } catch {
    rel = await api(`/repos/${SLUG}/releases`, "POST", {
      tag_name: tagName, name: tagName, body, draft: false, prerelease: false,
    });
    console.log("release created:", rel.html_url);
  }
  if (apk && fs.existsSync(apk)) {
    const assets = (await api(`/repos/${SLUG}/releases/${rel.id}/assets`)).map((a) => a.name);
    if (assets.includes(path.basename(apk))) {
      console.log("asset exists, skip:", path.basename(apk));
    } else {
      const a = await uploadAsset(rel.id, apk);
      console.log("asset uploaded:", a.name, a.size, "bytes");
    }
  }
  return rel;
}

(async () => {
  const [cmd, ...args] = process.argv.slice(2);
  if (cmd === "push") await push();
  else if (cmd === "tag") await tag(args[0], args[1]);
  else if (cmd === "release") await release(args[0], args[1], args[2]);
  else {
    console.error("用法: node scripts/push-release.cjs push|tag|release ...");
    process.exit(2);
  }
})().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
