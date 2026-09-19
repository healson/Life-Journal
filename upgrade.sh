#!/usr/bin/env bash
# Life Journal 一键升级脚本
# 用法：在 docker-compose.yml 所在目录执行  bash upgrade.sh
# 作用：拉取 GHCR 最新镜像 -> 重建容器 -> 清理被替换的旧（悬空）镜像
set -euo pipefail

echo "==> [1/3] 拉取最新镜像…"
docker compose pull

echo "==> [2/3] 使用新镜像重建容器…"
docker compose up -d

echo "==> [3/3] 清理悬空旧镜像…"
docker image prune -f

echo "✅ 升级完成，旧镜像已清理。"
docker compose ps
