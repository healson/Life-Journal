#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
github_push_tag.py —— 通过 GitHub Git Data API 创建并推送 tag（轻量 tag，指向指定提交），
触发 tag 推送 CI（tags: v**）。

用法：
    GH_PAT_FILE=gh_pat.txt [GH_REPO=owner/repo] python scripts/github_push_tag.py <tag> [commit_sha]

- tag        : 如 v0.5.2
- commit_sha : 默认本地 HEAD
"""
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


def main():
    if len(sys.argv) < 2:
        sys.exit("usage: github_push_tag.py <tag> [commit_sha]")
    tag = sys.argv[1]
    sha = sys.argv[2] if len(sys.argv) > 2 else subprocess.check_output(
        ["git", "rev-parse", "HEAD"], text=True).strip()
    slug = repo_slug()
    api("/repos/%s/git/refs" % slug, "POST", {"ref": "refs/tags/%s" % tag, "sha": sha})
    print("tag pushed: %s -> %s" % (tag, sha[:7]))


if __name__ == "__main__":
    main()
