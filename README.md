# 📓 人生记趣录 (Life Journal)

一款自托管的「治愈系」日记 + 待办应用。用温暖的配色、手绘风格主题和一个小小的信封动画，让记录日常变成一件轻松有仪式感的事。

前端为 React 19 + Vite + Tailwind CSS v4，后端为 FastAPI + SQLite，支持多用户、数据备份与 Docker 一键部署。

---

## ✨ 功能特性

### 📝 日记
- **Markdown 富文本编辑**（Tiptap）：标题、加粗、斜体、下划线、删除线、引用、代码块、任务列表、对齐
- **文字颜色 / 高亮背景** 自定义
- **字号调节**：快速切换常用字号
- **插入图片**：上传到服务器，随日记持久化
- **表情面板**：心情 / 自然 / 爱心 / 陪伴 / 日常 五类 OpenMoji 治愈系 emoji
- **自定义日记日期** + 选择未来日期时触发「信封飞往未来」小动画
- **标签系统**：为日记打标，侧栏生成标签云
- **搜索高亮**：按关键词搜索，卡片中关键词高亮并显示上下文片段
- **导出**：一键导出为 **Markdown(.md) / Word(.doc) / PDF**（PDF 走浏览器打印另存）
- **置顶** 重要日记
- **回忆**：浏览同一天往年写下的日记

### ✅ 待办
- 增 / 删 / **改**（编辑标题、备注、优先级、截止日期、提醒时间）
- 优先级（高 / 中 / 低）+ 状态（待处理 / 进行中 / 已完成）
- 截止日期逾期高亮
- 由日记一键转为待办并关联回原文

### 🎨 主题
- 内置 **4 套治愈系主题**：鼠尾草之晨 / 蜜桃奶茶 / 薰衣草午后 / 手绘小本子
- 主题在设置页切换并持久化

### 👥 多用户
- 用户名 + 密码登录
- **管理员**：增删用户、重置密码、修改用户名
- 各用户数据相互隔离

### 💾 数据备份
- 一键**导出**全部数据（JSON），**导入**覆盖恢复，管理员可**清空**全部数据
- 所有数据存储在 SQLite，便于随 Docker 卷整体备份

### 📅 成就统计
- 日记总计 / 日均 / 待办总计 / 完成率

---

## 🚀 快速部署（Docker Compose）

镜像托管在 GitHub Container Registry：`ghcr.io/healson/life-journal:api` 与 `:web`。

### 1. 获取 GHCR 访问 Token
- Settings → Developer settings → **Personal access tokens** → Generate
- 勾选权限 **`read:packages`**

### 2. 创建项目目录并填写 `.env`

```bash
mkdir life-journal && cd life-journal
```

创建 `.env`：

```env
# 后端
JWT_SECRET=请改为足够长的随机字符串
ACCESS_TOKEN_EXPIRE_MINUTES=1440
DATABASE_URL=sqlite:////data/app.db
# 图片上传目录（持久化到数据卷）
UPLOAD_DIR=/data/uploads
```

### 3. 编写 `docker-compose.yml`

```yaml
services:
  api:
    image: ghcr.io/healson/life-journal:api
    pull_policy: always
    container_name: life-journal-api
    env_file: .env
    environment:
      - DATABASE_URL=sqlite:////data/app.db
      - UPLOAD_DIR=/data/uploads
    volumes:
      - ./data:/data
    restart: unless-stopped
    expose:
      - "8000"

  web:
    image: ghcr.io/healson/life-journal:web
    pull_policy: always
    container_name: life-journal-web
    depends_on:
      - api
    restart: unless-stopped
    ports:
      - "8080:80"
```

### 4. 登录 GHCR 并拉取启动

```bash
docker login ghcr.io       # 用户名填 GitHub 账号，密码填上面生成的 Token
docker compose pull
docker compose up -d
```

访问 `http://<NAS 或服务器 IP>:8080` 即可开始使用。

> 首次使用：可直接注册新账号，第一个注册的账号会成为管理员。

---

## 🔄 升级版本

```bash
cd life-journal
docker compose pull && docker compose up -d
```

如遇到网络地址池耗尽导致容器无法启动，可先执行 `docker network prune -f` 清理。

---

## 🔐 初始化 / 恢复管理员密码

升级后若旧账号无法登录，可通过环境变量强制为某个账号重置为管理员并设新密码（启用一次后建议移除）：

```env
BOOTSTRAP_ADMIN_USERNAME=default
BOOTSTRAP_ADMIN_PASSWORD=新密码
```

---

## 💻 本地开发

```bash
# 前端 (http://localhost:5173，代理 /api 到 127.0.0.1:8000)
cd diary-app
npm install
npm run dev

# 后端 (http://localhost:8000)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

前端构建：`npm run build`（`tsc -b && vite build`），产物输出到 `dist/`。

---

## 🛠 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 · Vite · Tailwind CSS v4 · Tiptap · lucide-react |
| 后端 | FastAPI · SQLAlchemy |
| 存储 | SQLite |
| 认证 | JWT（python-jose） |
| 部署 | Docker · Docker Compose · nginx 静态托管 + 反代 |

---

## 🐦 CI/CD

推送到 `main` 分支后，GitHub Actions 自动构建 `:api` 与 `:web` 镜像并发布到 GHCR。