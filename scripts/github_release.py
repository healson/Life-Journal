#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
github_release.py —— 通过 GitHub Releases API 创建 GitHub Release。

用法：
    GH_PAT_FILE=gh_pat.txt [GH_REPO=owner/repo] python scripts/github_release.py <tag> [标题] [正文]

- tag  : 如 v0.5.2（须已存在，一般先运行 github_push_tag.py）
- 标题 : 默认用 tag
- 正文 : 可选，从参数或 stdin 读取
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
        sys.exit("usage: github_release.py <tag> [标题] [正文]")
    tag = sys.argv[1]
    name = sys.argv[2] if len(sys.argv) > 2 else tag
    body = sys.argv[3] if len(sys.argv) > 3 else ""
    if not sys.stdin.isatty():
        body += sys.stdin.read()
    slug = repo_slug()
    rel = api("/repos/%s/releases" % slug, "POST", {
        "tag_name": tag, "name": name, "body": body,
        "draft": False, "prerelease": False,
    })
    print("release created: %s (id=%s)" % (rel.get("html_url"), rel.get("id")))


if __name__ == "__main__":
    main()
