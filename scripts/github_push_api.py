#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
github_push_api.py —— 通过 GitHub Git Data API 推送本地提交到 main（绕过 git push 的 HTTPS 端口）。

用法：
    GH_PAT_FILE=gh_pat.txt [GH_REPO=owner/repo] python scripts/github_push_api.py [base_ref] [commit_sha]

- base_ref    : 远端目标 ref（默认 refs/heads/main，实际 SHA 从 API 实时读取，不依赖本地 origin/main）
- commit_sha  : 要推送的本地提交（默认 HEAD）
- 过程：读远端 ref → 本地 diff-tree 计算变更文件 → 上传 blob → 建树 → 建提交 → PATCH ref（非强推，远端已前进则失败）
"""
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request


def api_token():
    path = os.environ.get("GH_PAT_FILE", "gh_pat.txt")
    with open(path, encoding="utf-8") as f:
        return f.read().strip()


def repo_slug():
    env = os.environ.get("GH_REPO")
    if env:
        return env.strip().strip("/")
    out = subprocess.check_output(["git", "remote", "get-url", "origin"], text=True).strip()
    if out.endswith(".git"):
        out = out[:-4]
    if out.startswith("git@"):
        out = out.split(":", 1)[1]
    elif "github.com/" in out:
        out = out.split("github.com/", 1)[1]
    return out


def api(path, method="GET", payload=None):
    url = "https://api.github.com" + path
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", "Bearer " + api_token())
    req.add_header("Accept", "application/vnd.github+json")
    req.add_header("User-Agent", "life-journal-release")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read()
            return json.loads(body) if body else None
    except urllib.error.HTTPError as e:
        sys.stderr.write("API %s %s -> %s: %s\n" % (method, path, e.code, e.read().decode(errors="replace")))
        sys.exit(1)


def sh(*args):
    return subprocess.check_output(args, text=True).strip()


def main():
    base_ref = sys.argv[1] if len(sys.argv) > 1 else "refs/heads/main"
    target = sys.argv[2] if len(sys.argv) > 2 else sh("git", "rev-parse", "HEAD")
    slug = repo_slug()
    ref_path = base_ref[len("refs/"):] if base_ref.startswith("refs/") else base_ref

    # 1. 远端当前 ref SHA（实时读取，不依赖本地跟踪分支）
    ref = api("/repos/%s/git/refs/%s" % (slug, ref_path))
    base = ref["object"]["sha"]
    print("base : %s (%s)" % (base[:7], base_ref))

    # 校验 base 与 target 都在本地
    subprocess.check_call(["git", "cat-file", "-e", base + "^{commit}"])
    subprocess.check_call(["git", "cat-file", "-e", target + "^{commit}"])
    if base == target:
        print("already up-to-date: %s" % base[:7])
        return

    # 2. base 的树
    meta = sh("git", "cat-file", "-p", base)
    base_tree = next(l.split()[1] for l in meta.splitlines() if l.startswith("tree "))
    print("tree : %s" % base_tree[:7])

    # 3. 计算变更文件并上传 blob / 建树条目
    changes = sh("git", "diff-tree", "-r", "--no-commit-id", "--name-status", base, target).splitlines()
    entries = []
    for line in changes:
        parts = line.split("\t")
        status = parts[0]
        if status == "R":
            paths = parts[1:]  # old\tnew
            entries.append({"path": paths[0], "mode": "100644", "type": "blob", "sha": None})
            new_path = paths[1]
        else:
            new_path = parts[-1]
        if status.startswith("D"):
            entries.append({"path": new_path, "mode": "100644", "type": "blob", "sha": None})
            continue
        ls = sh("git", "ls-tree", target, new_path).split()
        if not ls:
            continue
        mode, typ, blob_sha = ls[0], ls[1], ls[2]
        content = subprocess.check_output(["git", "cat-file", "blob", blob_sha])
        uploaded = api("/repos/%s/git/blobs" % slug, "POST",
                       {"content": base64.b64encode(content).decode("ascii"), "encoding": "base64"})
        entries.append({"path": new_path, "mode": mode, "type": typ, "sha": uploaded["sha"]})
        print("blob : %s %s" % (uploaded["sha"][:7], new_path))

    # 4. 建树
    tree = api("/repos/%s/git/trees" % slug, "POST", {"base_tree": base_tree, "tree": entries})
    print("tree : %s" % tree["sha"][:7])

    # 5. 建提交
    message = sh("git", "log", "-1", "--format=%B", target)
    name, email, date = sh("git", "log", "-1", "--format=%an|%ae|%aI").split("|")
    commit = api("/repos/%s/git/commits" % slug, "POST", {
        "message": message,
        "tree": tree["sha"],
        "parents": [base],
        "author": {"name": name, "email": email, "date": date},
        "committer": {"name": name, "email": email, "date": date},
    })
    print("commit: %s" % commit["sha"])

    # 6. 更新 ref（非强推：远端已前进则 409 失败，安全）
    api("/repos/%s/git/refs/%s" % (slug, ref_path), "PATCH", {"sha": commit["sha"], "force": False})
    print("pushed %s -> %s" % (commit["sha"][:7], base_ref))


if __name__ == "__main__":
    main()
