import { WORKER_URL, REPO, BRANCH } from "./site-config.js";

const MAX_BYTES = 25 * 1024 * 1024;
const THUMB_PX = 480;
const WEEK = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const WK = ["일", "월", "화", "수", "목", "금", "토"];
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;

const S = { config: null, entries: [], sel: null, busy: false, error: "", view: null };
const $ = id => document.getElementById(id);

// ---------- 日期（按本地时间） ----------
const pad = n => String(n).padStart(2, "0");
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
const diff = (a, b) => Math.round((parse(a) - parse(b)) / 86400000);
const today = () => fmt(new Date());
const DAYS = () => (S.config && S.config.days) || 30;
const start = () => (S.config && S.config.startDate) || today();
const dayList = () => Array.from({ length: DAYS() }, (_, i) => addDays(start(), i));
const dayNo = s => diff(s, start()) + 1;
const md = s => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}`; };

// ---------- DOM 小工具（用户内容一律走 textContent） ----------
function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}

// 新文件刚提交时 Pages 还没更新（约 1 分钟），先从仓库直接读
function fileUrl(path, time) {
  const fresh = time && Date.now() - new Date(time).getTime() < 10 * 60 * 1000;
  return fresh ? RAW_BASE + encodePath(path) : encodePath(path);
}
const encodePath = p => p.split("/").map(encodeURIComponent).join("/");
function withFallback(el, path) {
  el.addEventListener("error", () => {
    if (!el.dataset.retried) { el.dataset.retried = "1"; el.src = RAW_BASE + encodePath(path); }
  });
  return el;
}

function applyManifest(m) {
  if (!m || !m.config) return;
  S.config = m.config;
  S.entries = Array.isArray(m.entries) ? m.entries : [];
  const no = S.sel ? dayNo(S.sel) : 0;
  if (no < 1 || no > DAYS()) {
    const t = today(), tn = dayNo(t);
    S.sel = tn < 1 ? start() : tn > DAYS() ? addDays(start(), DAYS() - 1) : t;
  }
  render();
}

async function loadManifest() {
  // 先读 Pages 上的静态文件（CDN，快），再向 Worker 要最新版本
  try {
    const r = await fetch("data/manifest.json", { cache: "no-cache" });
    if (r.ok) applyManifest(await r.json());
  } catch {}
  try {
    const r = await fetch(WORKER_URL + "/manifest", { cache: "no-store" });
    if (r.ok) { applyManifest(await r.json()); S.error = ""; }
    else throw new Error();
  } catch {
    if (!S.config) S.error = "데이터를 불러오지 못했어요. 네트워크를 확인하고 새로고침해 주세요.";
  }
  render();
}

// ---------- 渲染 ----------
function counts() {
  const m = new Map();
  for (const e of S.entries) m.set(e.day, (m.get(e.day) || 0) + 1);
  return m;
}
const sizeText = b => b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const timeText = iso => { if (!iso) return ""; const d = new Date(iso); return `${md(fmt(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const isImage = e => e.kind !== "link" && (e.thumb || (e.type || "").startsWith("image/"));
const isVideo = e => e.kind !== "link" && (e.type || "").startsWith("video/");
const dayEntries = d => S.entries.filter(e => e.day === d).sort((a, b) => (a.time || "") < (b.time || "") ? -1 : 1);

function render() {
  const t = today();
  const days = dayList();
  const c = counts();
  const nowNo = Math.min(Math.max(dayNo(t), 0), DAYS());

  if (S.config && S.config.title) document.title = S.config.title;
  $("range").textContent = S.config ? `${start()} → ${days[days.length - 1]}` : "불러오는 중…";
  const filled = days.filter(d => c.get(d)).length;
  $("progress").replaceChildren(
    h("div", { class: "big" }, h("span", {}, h("b", {}, nowNo), `일차 / ${DAYS()}일`), h("span", {}, `기록한 날 ${filled}일 · 파일 ${S.entries.length}개`)),
    h("div", { class: "bar" }, h("i", { style: `width:${nowNo / DAYS() * 100}%` })));

  const notice = $("notice");
  notice.hidden = !S.error;
  notice.textContent = S.error;
  notice.className = "notice err";

  // 30 天格子
  $("days").replaceChildren(...days.map(d => {
    const n = c.get(d) || 0;
    const cls = ["tile", n ? "has" : d < t ? "miss" : "", d > t ? "future" : "", d === t ? "today" : "", d === S.sel ? "sel" : ""].filter(Boolean).join(" ");
    return h("button", { class: cls, type: "button", title: `${d} ${WEEK[parse(d).getDay()]} · ${n}개`, "aria-pressed": d === S.sel ? "true" : "false", onclick: () => select(d) },
      h("span", { class: "no" }, dayNo(d)),
      h("span", { class: "dt" }, d === t ? "오늘" : md(d)),
      n ? h("span", { class: "cnt" }, n) : null);
  }));

  renderDay(t);
  renderSide(t);
}

function renderDay(t) {
  const main = $("dayMain");
  if (!S.sel) { main.replaceChildren(); return; }
  const sel = S.sel, no = dayNo(sel), d = parse(sel);
  const list = dayEntries(sel);
  const kids = [h("div", { class: "day-title" },
    h("span", { class: "n" }, `Day ${no}`),
    h("h2", {}, `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}`),
    h("span", { class: "d" }, sel === t ? "오늘" : sel > t ? `${diff(sel, t)}일 후` : `${diff(t, sel)}일 전`),
    h("div", { class: "nav" },
      h("button", { class: "btn icon", "aria-label": "이전 날", disabled: no <= 1, onclick: () => select(addDays(sel, -1)) }, "‹"),
      h("button", { class: "btn icon", "aria-label": "다음 날", disabled: no >= DAYS(), onclick: () => select(addDays(sel, 1)) }, "›")))];
  if (!list.length) {
    kids.push(h("div", { class: "empty" },
      h("b", {}, sel > t ? "아직 오지 않은 날이에요" : "이 날은 아직 비어 있어요"),
      h("span", {}, "오른쪽에서 파일이나 링크를 올려 보세요.")));
  } else {
    const viewable = list.filter(e => isImage(e) || isVideo(e));
    kids.push(h("div", { class: "files" }, list.map(e => fileCard(e, viewable))));
  }
  main.replaceChildren(...kids);
}

function fileCard(e, viewable) {
  const isLink = e.kind === "link";
  const href = isLink ? e.url : fileUrl(e.path, e.time);
  const open = viewable.includes(e) ? ev => { ev.preventDefault(); openViewer(viewable, viewable.indexOf(e)); } : null;
  let inner;
  if (isImage(e) && (e.thumb || (e.size || 0) < 400 * 1024)) {
    const src = e.thumb || e.path;
    inner = withFallback(h("img", { src: fileUrl(src, e.time), alt: e.name, loading: "lazy", decoding: "async" }), src);
  } else if (isVideo(e)) {
    inner = h("span", { class: "play" }, h("b", {}, "▶"), sizeText(e.size || 0));
  } else {
    const label = isLink ? "LINK" : (e.name.split(".").pop() || "FILE").toUpperCase().slice(0, 5);
    inner = h("span", { class: "ext" }, label);
  }
  const late = e.time && fmt(new Date(e.time)) > e.day;
  return h("figure", { class: "file" },
    h("a", { class: "thumb" + (isLink ? " link" : ""), href, target: "_blank", rel: "noopener", onclick: open, "aria-label": e.name }, inner),
    h("figcaption", {},
      h("div", { class: "name", title: e.name }, e.name || "이름 없음"),
      e.note ? h("p", {}, e.note) : null,
      h("div", { class: "row" },
        h("span", {}, timeText(e.time)),
        e.size ? h("span", {}, sizeText(e.size)) : null,
        late ? h("span", { class: "tag" }, "늦게 제출") : null,
        h("button", { class: "del", type: "button", onclick: ev => removeEntry(e, ev.currentTarget) }, "삭제"))));
}

function renderSide(t) {
  const sel = $("daySelect");
  const days = dayList();
  if (sel.options.length !== days.length || sel.options[0].value !== days[0]) {
    sel.replaceChildren(...days.map(d => h("option", { value: d },
      `Day ${dayNo(d)} · ${md(d)} (${WK[parse(d).getDay()]})${d === t ? " · 오늘" : ""}`)));
  }
  if (S.sel) sel.value = S.sel;
  $("submitBtn").textContent = S.sel ? `Day ${dayNo(S.sel)}에 올리기` : "올리기";
  $("submitBtn").disabled = S.busy || !S.sel;
  $("uploader").classList.toggle("busy", S.busy);
}

function select(d) {
  const no = dayNo(d);
  if (no < 1 || no > DAYS()) return;
  S.sel = d;
  render();
}

// ---------- 预览弹窗 ----------
function openViewer(list, i) {
  S.view = { list, i };
  showView();
  const dlg = $("viewer");
  if (!dlg.open) { dlg.showModal(); dlg.focus(); }
}
function showView() {
  const { list, i } = S.view;
  const e = list[i];
  const src = fileUrl(e.path, e.time);
  const media = isVideo(e)
    ? withFallback(h("video", { src, controls: true, autoplay: true, playsinline: true }), e.path)
    : withFallback(h("img", { src, alt: e.name, decoding: "async" }), e.path);
  $("viewerStage").replaceChildren(media);
  $("viewerOpen").href = src;
  $("viewerCount").textContent = list.length > 1 ? `${i + 1} / ${list.length}` : "";
  $("viewerCap").replaceChildren(h("b", {}, e.name), e.note ? h("span", {}, e.note) : null);
  $("viewerPrev").hidden = $("viewerNext").hidden = list.length < 2;
}
function stepView(n) {
  if (!S.view || S.view.list.length < 2) return;
  S.view.i = (S.view.i + n + S.view.list.length) % S.view.list.length;
  showView();
}
function closeViewer() { $("viewer").close(); }

// ---------- 和 Worker 通信 ----------
async function api(path, body) {
  const r = await fetch(WORKER_URL + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.message || data.error || r.status); e.code = data.error; e.status = r.status; throw e; }
  return data;
}
function errText(e) {
  if (e.code === "too_large") return "파일이 25MB를 넘어요. 압축하거나 링크로 올려 주세요.";
  if (e.code === "busy") return "동시에 올리는 사람이 많아요. 한 번 더 눌러 주세요.";
  if (e.code === "not_found") return "이미 삭제된 항목이에요.";
  return "작업에 실패했어요. 네트워크를 확인하고 다시 시도해 주세요.";
}

// 把文件读成 base64，拼成 GitHub blob 接口要的 JSON（不做大字符串拼接）
function blobBody(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const b64 = String(fr.result).split(",")[1] || "";
      resolve(new Blob(['{"encoding":"base64","content":"', b64, '"}'], { type: "application/json" }));
    };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
}

async function makeThumb(file) {
  if (!/^image\/(png|jpeg|webp|bmp)$/.test(file.type)) return null;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, THUMB_PX / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas");
    cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
    bmp.close && bmp.close();
    return await new Promise(r => cv.toBlob(r, "image/webp", 0.8));
  } catch { return null; }
}

function setStatus(text, kind) { const s = $("status"); s.textContent = text; s.className = "status" + (kind ? " " + kind : ""); }

async function submit() {
  if (S.busy) return;
  const files = [...$("fileInput").files];
  const link = $("linkInput").value.trim();
  const note = $("noteInput").value.trim().slice(0, 500);
  if (!files.length && !link) return setStatus("파일을 고르거나 링크를 입력해 주세요.", "err");
  if (link && !/^https?:\/\/\S+$/i.test(link)) return setStatus("링크는 http:// 또는 https:// 로 시작해야 해요.", "err");
  const big = files.find(f => f.size > MAX_BYTES);
  if (big) return setStatus(`${big.name}: 25MB를 넘어요. 압축하거나 클라우드에 올린 뒤 링크를 붙여 주세요.`, "err");
  const empty = files.find(f => !f.size);
  if (empty) return setStatus(`${empty.name}: 빈 파일이에요.`, "err");

  S.busy = true; render();
  const day = S.sel;
  let ok = 0;
  try {
    for (const f of files) {
      setStatus(`${f.name} 올리는 중… (${ok + 1}/${files.length})`);
      const { sha: fileSha } = await api("/blob", await blobBody(f));
      const th = await makeThumb(f);
      const thumbSha = th ? (await api("/blob", await blobBody(th))).sha : null;
      const ext = (f.name.includes(".") ? f.name.split(".").pop() : "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
      const res = await api("/commit", JSON.stringify({ action: "add", kind: "file", day, name: f.name, type: f.type, size: f.size, ext, note, fileSha, thumbSha }));
      applyManifest(res.manifest);
      ok++;
    }
    if (link) {
      let name = link;
      try { const u = new URL(link); name = u.hostname + u.pathname.replace(/\/$/, ""); } catch {}
      const res = await api("/commit", JSON.stringify({ action: "add", kind: "link", day, url: link, name, note }));
      applyManifest(res.manifest);
      ok++;
    }
    $("fileInput").value = ""; $("linkInput").value = ""; $("noteInput").value = "";
    $("picked").hidden = true;
    setStatus(`Day ${dayNo(day)}에 ${ok}개를 올렸어요.`, "ok");
  } catch (e) {
    setStatus((ok ? `${ok}개는 올렸지만 나머지는 실패했어요: ` : "") + errText(e), "err");
  } finally {
    S.busy = false; render();
  }
}

async function removeEntry(e, btn) {
  if (!btn.classList.contains("armed")) {
    btn.classList.add("armed"); btn.textContent = "정말 삭제할까요?";
    setTimeout(() => { if (btn.isConnected) { btn.classList.remove("armed"); btn.textContent = "삭제"; } }, 3000);
    return;
  }
  btn.disabled = true; btn.textContent = "삭제 중…";
  try {
    const res = await api("/commit", JSON.stringify({ action: "delete", id: e.id }));
    applyManifest(res.manifest);
  } catch (err) {
    btn.disabled = false; btn.textContent = errText(err);
  }
}

// ---------- 事件 ----------
const drop = $("drop"), fileInput = $("fileInput");
function showPicked() {
  const fs = [...fileInput.files];
  $("picked").hidden = !fs.length;
  $("picked").textContent = fs.map(f => `${f.name} · ${sizeText(f.size)}`).join("\n");
  setStatus("");
}
drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); } });
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => {
  e.preventDefault(); drop.classList.remove("over");
  if (e.dataTransfer.files.length) { fileInput.files = e.dataTransfer.files; showPicked(); }
});
fileInput.addEventListener("change", showPicked);
$("daySelect").addEventListener("change", e => select(e.target.value));
$("submitBtn").addEventListener("click", submit);

const viewer = $("viewer");
$("viewerClose").addEventListener("click", closeViewer);
$("viewerPrev").addEventListener("click", () => stepView(-1));
$("viewerNext").addEventListener("click", () => stepView(1));
viewer.addEventListener("click", e => { if (e.target === viewer || e.target === $("viewerStage")) closeViewer(); });
viewer.addEventListener("keydown", e => { if (e.key === "ArrowLeft") stepView(-1); if (e.key === "ArrowRight") stepView(1); });
viewer.addEventListener("close", () => { $("viewerStage").replaceChildren(); S.view = null; });
// 回到页面时刷新一次，看到别人新传的
document.addEventListener("visibilitychange", () => { if (!document.hidden && !S.busy) loadManifest(); });

render();
loadManifest();
