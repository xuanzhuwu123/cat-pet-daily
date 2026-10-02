# 橘猫组每日打卡

3D 桌宠小组 30 天每日上传墙。文件保存在这个 GitHub 仓库里，网页用 GitHub Pages 发布，任何设备都能打开；上传和删除通过一个 Cloudflare Worker 完成。不需要密码，也不用选名字，拿到网页链接的人打开就能上传。

```
浏览器 ──读取──> GitHub Pages（网页 + data/manifest.json + daily/ 里的文件）
   │
   └──上传/删除──> Cloudflare Worker ──GitHub 密钥──> 本仓库（每次一个 commit）
```

## 目录

| 路径 | 说明 |
|---|---|
| `index.html` `style.css` `app.js` | 网页 |
| `site-config.js` | Worker 地址、仓库名 |
| `data/manifest.json` | 设置（标题、开始日期、天数）+ 所有上传记录。网页打开时只读这个文件 |
| `daily/<日期>/` | 上传的文件；图片会多一个 `.thumb.webp` 缩略图 |
| `worker/` | Cloudflare Worker 代码和配置 |

## 为什么打开快

- 打开页面只下载网页本身和 `manifest.json`（几十 KB）。
- 只显示当前选中那一天的文件；图片显示 480px 缩略图，并且滚动到才加载；视频点“播放”才加载。

## 第一次部署（只需要做一次，由组长做）

### 1. 建 GitHub 仓库并开启 Pages

1. 在 GitHub 新建**公开**仓库 `cat-pet-daily`（不要勾选 README）。
2. 在本文件夹里：
   ```bash
   git init -b main
   git add .
   git commit -m "初始化打卡网站"
   git remote add origin https://github.com/xuanzhuwu123/cat-pet-daily.git
   git push -u origin main
   ```
3. 仓库 **Settings → Pages**：Source 选 “Deploy from a branch”，Branch 选 `main` / `(root)`，保存。
   约 1 分钟后网页地址是 `https://xuanzhuwu123.github.io/cat-pet-daily/`。

> 公开仓库里的文件任何人都能看到。私有仓库开 Pages 需要 GitHub Pro（学生可以通过 GitHub Education 免费申请），而且 Pages 网站本身仍然是公开的。

### 2. 生成 GitHub 密钥（给 Worker 用）

GitHub 头像 → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**：
- Repository access：**Only select repositories** → 只选 `cat-pet-daily`
- Permissions → Repository permissions → **Contents：Read and write**
- 过期时间：选到课程结束之后

复制生成的 `github_pat_...`，下一步要用。**不要发到群里，也不要写进任何文件。**

### 3. 部署 Cloudflare Worker

需要一个免费的 Cloudflare 账号。

```bash
cd worker
npx wrangler login                      # 浏览器里登录 Cloudflare
npx wrangler secret put GITHUB_TOKEN    # 粘贴上一步的 github_pat_...
npx wrangler deploy
```

`deploy` 最后会输出类似 `https://cat-pet-daily.xxx.workers.dev` 的地址。

如果 GitHub 用户名或仓库名不一样，先改 `worker/wrangler.toml` 里的 `REPO_OWNER`、`REPO_NAME`、`ALLOWED_ORIGINS`。

### 4. 填好配置并推送

- `site-config.js`：`WORKER_URL` 改成上一步的地址。
- `data/manifest.json`：需要的话改 `startDate`。

```bash
git add .
git commit -m "填写 Worker 地址"
git push
```

然后把网页地址发给组员。

## 组员怎么用

1. 打开网页，右侧（手机在上方）就是上传框，不用选名字。
2. 点打卡墙上的格子选日期（默认今天），选文件或贴链接，写备注，点“上传”。
3. 过去的日期可以补交，会标“补交”；只能删除在同一台设备、同一个浏览器上传的文件。

## 限制和注意

- 单个文件最多 25 MB。更大的 `.blend`、视频请放网盘，贴链接。
- 没有密码也不记名：任何拿到链接的人都能上传，靠大家自觉。链接不要公开发到群外。
- 删除只是从最新版本里移除，文件仍留在 git 历史里。上传前确认没有隐私内容。
- 刚上传的文件，Pages 需要约 1 分钟才更新；这段时间网页会直接从仓库读取，不影响查看。
- 想改开始日期：直接在 GitHub 上编辑 `data/manifest.json` 的 `config` 部分，**不要动 `entries`**。

## 本地预览

```bash
npx serve .
```

打开输出的地址即可（能看到打卡墙；要上传需要 Worker 已经部署）。
