// Cloudflare Worker：代替前端写入 GitHub 仓库。不需要密码，有网页链接的人都能上传。
// 密钥（wrangler secret put）：GITHUB_TOKEN
// 变量（wrangler.toml [vars]）：REPO_OWNER、REPO_NAME、BRANCH、ALLOWED_ORIGINS

const MANIFEST_PATH = "data/manifest.json";
const MAX_BLOB_BODY = 36 * 1024 * 1024; // 25 MB 文件 base64 后约 34 MB
const MAX_NOTE = 500;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const EXT_RE = /^[a-z0-9]{1,8}$/;
const SHA_RE = /^[0-9a-f]{40}$/;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/manifest") {
        const { manifest } = await readManifest(env, env.BRANCH);
        return json(manifest, 200, cors);
      }
      if (request.method === "POST") {
        if (url.pathname === "/blob") return await createBlob(request, env, cors);
        if (url.pathname === "/commit") return await commit(request, env, cors);
      }
      return json({ error: "not_found" }, 404, cors);
    } catch (e) {
      console.error(`${request.method} ${url.pathname} → ${e.code || "server_error"}: ${e.message || e}`);
      return json({ error: e.code || "server_error", message: String(e.message || e) }, e.status || 500, cors);
    }
  },
};

// ---------- 工具 ----------
function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : allowed[0] || "",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function fail(status, code, message) {
  const e = new Error(message || code);
  e.status = status;
  e.code = code;
  return e;
}

function gh(env, path, init = {}) {
  return fetch(`https://api.github.com/repos/${env.REPO_OWNER}/${env.REPO_NAME}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "cat-pet-daily-worker",
      ...(init.headers || {}),
    },
  });
}

async function ghJson(env, path, init) {
  const r = await gh(env, path, init);
  if (!r.ok) throw fail(r.status === 422 || r.status === 409 ? 409 : 502, "github_error", `${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function readManifest(env, ref) {
  const r = await gh(env, `/contents/${MANIFEST_PATH}?ref=${encodeURIComponent(ref)}`, {
    headers: { Accept: "application/vnd.github.raw+json" },
  });
  if (!r.ok) throw fail(502, "manifest_missing", `读不到 ${MANIFEST_PATH}：${r.status}`);
  return { manifest: JSON.parse(await r.text()) };
}

// ---------- /blob：把前端发来的 {content, encoding:"base64"} 直接转发给 GitHub ----------
async function createBlob(request, env, cors) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (!len) throw fail(411, "length_required", "缺少 Content-Length");
  if (len > MAX_BLOB_BODY) throw fail(413, "too_large", "文件超过 25 MB");
  const r = await gh(env, "/git/blobs", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": String(len) },
    body: request.body,
  });
  if (!r.ok) throw fail(502, "github_error", `blob → ${r.status} ${await r.text()}`);
  const { sha } = await r.json();
  return json({ sha }, 200, cors);
}

// ---------- /commit：新增或删除一条记录，文件和 manifest 在同一个 commit 里 ----------
async function commit(request, env, cors) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") throw fail(400, "bad_request", "请求格式不对");

  for (let attempt = 0; attempt < 4; attempt++) {
    const ref = await ghJson(env, `/git/ref/heads/${env.BRANCH}`);
    const headSha = ref.object.sha;
    const head = await ghJson(env, `/git/commits/${headSha}`);
    const { manifest } = await readManifest(env, headSha);
    manifest.entries = Array.isArray(manifest.entries) ? manifest.entries : [];

    const { tree, message, entry } =
      body.action === "delete" ? planDelete(manifest, body) : planAdd(manifest, body);

    tree.push({ path: MANIFEST_PATH, mode: "100644", type: "blob", content: JSON.stringify(manifest, null, 1) + "\n" });
    const newTree = await ghJson(env, "/git/trees", {
      method: "POST",
      body: JSON.stringify({ base_tree: head.tree.sha, tree }),
    });
    const newCommit = await ghJson(env, "/git/commits", {
      method: "POST",
      body: JSON.stringify({ message, tree: newTree.sha, parents: [headSha] }),
    });
    const upd = await gh(env, `/git/refs/heads/${env.BRANCH}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });
    if (upd.ok) return json({ ok: true, entry, manifest }, 200, cors);
    if (upd.status !== 422 && upd.status !== 409) throw fail(502, "github_error", `ref → ${upd.status} ${await upd.text()}`);
    // 别人同时提交了，重新读最新的 manifest 再来一次
  }
  throw fail(409, "busy", "同时上传的人太多，请重试");
}

function planAdd(manifest, b) {
  if (!DAY_RE.test(b.day || "")) throw fail(400, "bad_day", "日期格式不对");
  const note = String(b.note || "").slice(0, MAX_NOTE);
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const entry = { id, day: b.day, note, time: new Date().toISOString() };
  const tree = [];

  if (b.kind === "link") {
    if (!/^https?:\/\/\S{3,2000}$/i.test(b.url || "")) throw fail(400, "bad_url", "链接格式不对");
    Object.assign(entry, { kind: "link", url: b.url, name: String(b.name || b.url).slice(0, 200) });
  } else {
    if (!SHA_RE.test(b.fileSha || "")) throw fail(400, "bad_blob", "缺少文件");
    const ext = String(b.ext || "").toLowerCase();
    if (!EXT_RE.test(ext)) throw fail(400, "bad_ext", "文件扩展名不对");
    const base = `daily/${b.day}/${id}`;
    Object.assign(entry, {
      kind: "file",
      name: String(b.name || `file.${ext}`).slice(0, 200),
      type: String(b.type || "").slice(0, 100),
      size: Number(b.size) || 0,
      path: `${base}.${ext}`,
    });
    tree.push({ path: entry.path, mode: "100644", type: "blob", sha: b.fileSha });
    if (b.thumbSha) {
      if (!SHA_RE.test(b.thumbSha)) throw fail(400, "bad_blob", "缩略图不对");
      entry.thumb = `${base}.thumb.webp`;
      tree.push({ path: entry.thumb, mode: "100644", type: "blob", sha: b.thumbSha });
    }
  }
  manifest.entries.push(entry);
  return { tree, entry, message: `${b.day}：${entry.name}` };
}

function planDelete(manifest, b) {
  const i = manifest.entries.findIndex(e => e.id === b.id);
  if (i < 0) throw fail(404, "not_found", "这条记录已经不在了");
  const [entry] = manifest.entries.splice(i, 1);
  const tree = [];
  for (const p of [entry.path, entry.thumb]) if (p) tree.push({ path: p, mode: "100644", type: "blob", sha: null });
  return { tree, entry, message: `删除 ${entry.day}：${entry.name}` };
}
