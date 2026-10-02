import { WORKER_URL, REPO, BRANCH } from "./site-config.js";

const MAX_BYTES = 25 * 1024 * 1024;
const THUMB_PX = 480;
const WEEK = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;

const S = { config: null, entries: [], view: null, filter: "all", mine: new Set(), busy: false, error: "" };
const $ = id => document.getElementById(id);

// ---------- 本机上传过的记录（只能删除自己在这台设备上传的） ----------
function loadMine() {
  try {
    const v = JSON.parse(localStorage.getItem("daily-mine") || "[]");
    if (Array.isArray(v)) S.mine = new Set(v);
  } catch {}
}
function saveMine() {
  try { localStorage.setItem("daily-mine", JSON.stringify([...S.mine])); } catch {}
}

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
const dayOf = no => addDays(start(), no - 1);
const md = s => { const d = parse(s); return `${d.getMonth() + 1}월 ${d.getDate()}일`; };
const longDate = s => `${md(s)} ${WEEK[parse(s).getDay()]}`;
const epLabel = no => `EP.${pad(no)}`;

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
    if (!S.config) S.error = "이야기를 불러오지 못했어요. 네트워크를 확인하고 새로고침해 주세요.";
  }
  render();
  openFromHash();
}

// ---------- 数据整理 ----------
// 观众先看到作品：视频 > 图片 > 其他，同类按上传时间
const rank = e => (e.type || "").startsWith("video/") ? 0 : (e.type || "").startsWith("image/") ? 1 : 2;
const byTime = (a, b) => rank(a) - rank(b) || ((a.time || "") < (b.time || "") ? -1 : 1);
const itemsOf = d => S.entries.filter(e => e.day === d).sort(byTime);
const coverOf = list => list[0];
const captionOf = list => (list.find(e => e.note) || {}).note || "";
const openDays = () => dayList().filter(d => d <= today() && S.entries.some(e => e.day === d));
const latestDay = () => openDays().pop() || null;

const sizeText = b => b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const isImg = e => e.kind !== "link" && (e.type || "").startsWith("image/");
const isVid = e => e.kind !== "link" && (e.type || "").startsWith("video/");
const extOf = e => e.kind === "link" ? "LINK" : ((e.name || "").split(".").pop() || "FILE").toUpperCase().slice(0, 5);
const hrefOf = e => e.kind === "link" ? e.url : fileUrl(e.path, e.time);

// 卡片用的小封面：图片用缩略图；视频只读开头一帧当封面
function smallCover(e) {
  if (e && isVid(e))
    return h("span", { class: "cv-vid" },
      withFallback(h("video", { src: hrefOf(e) + "#t=0.1", muted: true, playsinline: true, preload: "metadata", tabindex: "-1" }), e.path),
      h("span", { class: "cv-play" }, h("b", {}, "▶")));
  if (e && e.kind !== "link" && e.thumb)
    return withFallback(h("img", { src: fileUrl(e.thumb, e.time), alt: "", loading: "lazy", decoding: "async" }), e.thumb);
  if (e && isImg(e) && (e.size || 0) < 400 * 1024)
    return withFallback(h("img", { src: hrefOf(e), alt: "", loading: "lazy", decoding: "async" }), e.path);
  return h("span", { class: "cv-ext" }, e ? extOf(e) : "");
}

// 大图：原图，加载完之前先显示缩略图
function bigImage(e) {
  const img = withFallback(h("img", { src: hrefOf(e), alt: e.note || e.name || "", decoding: "async", loading: "lazy" }), e.path);
  if (e.thumb) img.style.backgroundImage = `url("${fileUrl(e.thumb, e.time)}")`;
  return img;
}
function bigVideo(e) {
  return withFallback(h("video", { src: hrefOf(e), controls: true, playsinline: true, preload: "metadata" }), e.path);
}
function media(e) {
  if (isImg(e)) return h("a", { class: "media", href: hrefOf(e), target: "_blank", rel: "noopener" }, bigImage(e));
  if (isVid(e)) return h("div", { class: "media" }, bigVideo(e));
  const isLink = e.kind === "link";
  return h("a", { class: "media file-link", href: hrefOf(e), target: "_blank", rel: "noopener" },
    h("span", { class: "cv-ext" }, extOf(e)),
    h("span", { class: "fl-name" }, e.name || (isLink ? e.url : "파일")),
    h("span", { class: "fl-go" }, isLink ? "링크 열기 ↗" : `열기 · ${sizeText(e.size || 0)}`));
}

// ---------- 渲染 ----------
function render() {
  const t = today();
  if (S.config && S.config.title) document.title = S.config.title;

  const notice = $("notice");
  notice.hidden = !S.error;
  notice.textContent = S.error;

  renderOnAir(t);
  renderFeature();
  renderEpisodes(t);
  renderStudioDays(t);
  if ($("viewer").open) renderViewer();
}

function renderOnAir(t) {
  const el = $("onair");
  if (!S.config) { el.textContent = "불러오는 중…"; return; }
  const no = dayNo(t), n = openDays().length;
  el.replaceChildren();
  if (no < 1) el.append(h("b", {}, `D-${1 - no}`), ` ${md(start())}에 1화가 시작돼요`);
  else if (no > DAYS()) el.append(h("b", {}, "완결"), ` 전체 ${n}화 공개`);
  else el.append(h("i", { class: "live" }), h("b", {}, `${no}일째 탈출 중`), ` · 지금까지 ${n}화 공개`);
}

let featSig = "";
function renderFeature() {
  const box = $("feature");
  const d = latestDay();
  const list = d ? itemsOf(d) : [];
  const sig = d + "|" + list.map(e => e.id).join(",");
  if (sig === featSig) return;
  featSig = sig;
  if (!d) {
    box.replaceChildren(h("div", { class: "feature-empty" },
      h("div", { class: "fe-cat", "aria-hidden": "true" }),
      h("h3", {}, "첫 번째 탈출 시도를 준비하고 있어요"),
      h("p", {}, "고양이가 아직 모니터 안에서 기지개를 켜는 중이에요. 곧 1화가 공개돼요.")));
    return;
  }
  const no = dayNo(d), cover = coverOf(list), cap = captionOf(list);
  let visual;
  if (isImg(cover)) visual = bigImage(cover);
  else if (isVid(cover)) {
    // 最新一话静音循环自动播放，点控制条可开声音
    visual = bigVideo(cover);
    Object.assign(visual, { muted: true, autoplay: true, loop: true });
    visual.setAttribute("muted", "");
  }
  else visual = smallCover(cover);
  box.replaceChildren(
    h("div", { class: "feature-media" + (isImg(cover) || isVid(cover) ? "" : " plain") }, visual),
    h("div", { class: "feature-text" },
      h("p", { class: "ft-ep" }, h("span", {}, epLabel(no)), d === today() ? h("em", {}, "NEW") : null),
      h("h3", {}, longDate(d)),
      cap ? h("p", { class: "ft-cap" }, cap) : h("p", { class: "ft-cap muted" }, "오늘의 탈출 기록을 확인해 보세요."),
      h("div", { class: "ft-actions" },
        h("button", { class: "btn primary big", type: "button", onclick: () => openViewer(d) },
          list.length > 1 ? `${list.length}개 모두 보기` : "자세히 보기"),
        no > 1 ? h("button", { class: "btn ghost big", type: "button", onclick: () => openViewer(prevOpen(d) || dayOf(1)) }, "지난 화") : null)));
}

function renderEpisodes(t) {
  const days = dayList();
  const nOpen = openDays().length;
  $("fAll").textContent = `전체 ${days.length}화`;
  $("fOpen").textContent = `공개된 화 ${nOpen}`;
  const shown = S.filter === "open" ? days.filter(d => d <= t && S.entries.some(e => e.day === d)) : days;
  if (!shown.length) {
    $("eps").replaceChildren(h("p", { class: "empty" }, "아직 공개된 에피소드가 없어요. 조금만 기다려 주세요!"));
    return;
  }
  $("eps").replaceChildren(...shown.map((d, i) => epCard(d, t, i)));
}

function epCard(d, t, i) {
  const no = dayNo(d), list = d <= t ? itemsOf(d) : [];
  const style = `--i:${i}`;
  if (d > t) {
    return h("div", { class: "ep locked", style },
      h("div", { class: "cover" }, h("span", { class: "cv-lock" }, `D-${diff(d, t)}`)),
      h("div", { class: "info" }, h("p", { class: "ep-no" }, epLabel(no), h("span", {}, md(d))), h("p", { class: "ep-cap" }, "공개 예정")));
  }
  if (!list.length) {
    const isToday = d === t;
    return h("div", { class: "ep " + (isToday ? "soon" : "quiet"), style },
      h("div", { class: "cover" }, isToday
        ? h("span", { class: "cv-soon" }, h("i", { class: "live" }), "오늘 공개 예정")
        : pawSvg()),
      h("div", { class: "info" }, h("p", { class: "ep-no" }, epLabel(no), h("span", {}, md(d))),
        h("p", { class: "ep-cap" }, isToday ? "곧 올라와요" : "쉬어 가는 날")));
  }
  const cover = coverOf(list), cap = captionOf(list);
  const card = h("button", { class: "ep open" + (d === t ? " new" : ""), style, type: "button",
      "aria-label": `${epLabel(no)} ${longDate(d)} 보기`, onclick: () => openViewer(d) },
    h("div", { class: "cover" }, smallCover(cover),
      list.length > 1 ? h("span", { class: "cv-count" }, `+${list.length - 1}`) : null,
      d === t ? h("span", { class: "cv-new" }, "NEW") : null),
    h("div", { class: "info" }, h("p", { class: "ep-no" }, epLabel(no), h("span", {}, md(d))),
      h("p", { class: "ep-cap" }, cap || "기록 보기")));
  return card;
}
// 空的过去日子里放一个猫爪
function pawSvg() {
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg"), use = document.createElementNS(NS, "use");
  svg.setAttribute("class", "cv-paw"); svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", "#paw");
  svg.append(use);
  return svg;
}

// ---------- 观看弹窗 ----------
const prevOpen = d => openDays().filter(x => x < d).pop();
const nextOpen = d => openDays().find(x => x > d);

function openViewer(d) {
  S.view = d;
  vSig = "";
  renderViewer();
  const v = $("viewer");
  if (!v.open) v.showModal();
  $("vBody").scrollTop = 0;
  const hash = `#ep-${dayNo(d)}`;
  if (location.hash !== hash) history.replaceState(null, "", hash);
}

let vSig = "";
function renderViewer() {
  const d = S.view;
  if (!d) return;
  const t = today(), no = dayNo(d), list = d <= t ? itemsOf(d) : [];
  const sig = [d, list.map(e => e.id + (S.mine.has(e.id) ? "*" : "")).join(",")].join("|");
  $("vPrev").disabled = !prevOpen(d);
  $("vNext").disabled = !nextOpen(d);
  if (sig === vSig) return;
  vSig = sig;
  $("vNo").textContent = epLabel(no);
  $("vTitle").textContent = longDate(d);
  const body = $("vBody");
  if (!list.length) {
    body.replaceChildren(h("p", { class: "empty" }, d > t ? "아직 공개되지 않은 에피소드예요." : "이 날은 기록이 없어요."));
    return;
  }
  body.replaceChildren(...list.map((e, i) => h("figure", { class: "item", style: `--i:${i}` },
    media(e),
    (e.note || S.mine.has(e.id)) ? h("figcaption", {},
      e.note ? h("p", {}, e.note) : null,
      S.mine.has(e.id) ? h("button", { class: "del", type: "button", onclick: ev => removeEntry(e, ev.currentTarget) }, "삭제") : null) : null)));
}

function closeViewer() {
  $("viewer").querySelectorAll("video").forEach(v => v.pause());
  S.view = null;
  if (/^#ep-\d+$/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search);
}

function openFromHash() {
  const m = /^#ep-(\d+)$/.exec(location.hash);
  if (m && S.config) { const no = Number(m[1]); if (no >= 1 && no <= DAYS()) openViewer(dayOf(no)); }
  if (location.hash === "#studio") openStudio();
}

// ---------- 制作者上传 ----------
function renderStudioDays(t) {
  const sel = $("daySelect");
  const days = dayList().filter(d => d <= t);
  const keep = sel.value;
  const sig = days.join(",");
  if (sel.dataset.sig !== sig) {
    sel.dataset.sig = sig;
    sel.replaceChildren(...days.slice().reverse().map(d =>
      h("option", { value: d }, `${epLabel(dayNo(d))} · ${longDate(d)}${d === t ? " (오늘)" : ""}`)));
    if (keep && days.includes(keep)) sel.value = keep;
  }
  sel.disabled = !days.length;
  $("submitBtn").disabled = S.busy || !days.length;
  if (!days.length && S.config) setStatus(`${md(start())}부터 올릴 수 있어요.`);
}
function openStudio() { const s = $("studio"); if (!s.open) s.showModal(); }

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
  const day = $("daySelect").value;
  if (!day) return setStatus("올릴 화를 골라 주세요.", "err");
  if (!files.length && !link) return setStatus("파일을 고르거나 링크를 입력해 주세요.", "err");
  if (link && !/^https?:\/\/\S+$/i.test(link)) return setStatus("링크는 http:// 또는 https:// 로 시작해야 해요.", "err");
  const big = files.find(f => f.size > MAX_BYTES);
  if (big) return setStatus(`${big.name}: 25MB를 넘어요. 압축하거나 클라우드에 올린 뒤 링크를 붙여 주세요.`, "err");
  const empty = files.find(f => !f.size);
  if (empty) return setStatus(`${empty.name}: 빈 파일이에요.`, "err");

  S.busy = true; render();
  let ok = 0;
  try {
    for (const f of files) {
      setStatus(`${f.name} 올리는 중… (${ok + 1}/${files.length})`);
      const { sha: fileSha } = await api("/blob", await blobBody(f));
      const th = await makeThumb(f);
      const thumbSha = th ? (await api("/blob", await blobBody(th))).sha : null;
      const ext = (f.name.includes(".") ? f.name.split(".").pop() : "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
      const res = await api("/commit", JSON.stringify({ action: "add", kind: "file", day, name: f.name, type: f.type, size: f.size, ext, note, fileSha, thumbSha }));
      S.mine.add(res.entry.id); saveMine();
      applyManifest(res.manifest);
      ok++;
    }
    if (link) {
      let name = link;
      try { const u = new URL(link); name = u.hostname + u.pathname.replace(/\/$/, ""); } catch {}
      const res = await api("/commit", JSON.stringify({ action: "add", kind: "link", day, url: link, name, note }));
      S.mine.add(res.entry.id); saveMine();
      applyManifest(res.manifest);
      ok++;
    }
    $("fileInput").value = ""; $("linkInput").value = ""; $("noteInput").value = "";
    $("picked").hidden = true;
    setStatus(`${epLabel(dayNo(day))}에 ${ok}개를 올렸어요.`, "ok");
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
    S.mine.delete(e.id); saveMine();
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
$("submitBtn").addEventListener("click", submit);

document.querySelectorAll("[data-open-studio]").forEach(b => b.addEventListener("click", openStudio));
document.querySelectorAll("dialog").forEach(dlg => {
  dlg.querySelectorAll("[data-close]").forEach(b => b.addEventListener("click", () => dlg.close()));
  // 点遮罩关闭
  dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
});
$("viewer").addEventListener("close", closeViewer);
$("vPrev").addEventListener("click", () => { const d = prevOpen(S.view); if (d) openViewer(d); });
$("vNext").addEventListener("click", () => { const d = nextOpen(S.view); if (d) openViewer(d); });
$("viewer").addEventListener("keydown", e => {
  if (e.target.closest("video")) return;
  if (e.key === "ArrowLeft") $("vPrev").click();
  if (e.key === "ArrowRight") $("vNext").click();
});

$("ctaLatest").addEventListener("click", () => {
  const d = latestDay();
  if (d) openViewer(d); else $("latest").scrollIntoView({ behavior: "smooth" });
});
$("ctaFirst").addEventListener("click", () => {
  const d = openDays()[0];
  if (d) openViewer(d); else $("episodes").scrollIntoView({ behavior: "smooth" });
});
document.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
  S.filter = c.dataset.filter;
  document.querySelectorAll(".chip").forEach(x => x.classList.toggle("on", x === c));
  renderEpisodes(today());
}));
addEventListener("hashchange", openFromHash);
// 回到页面时刷新一次，看到新公开的内容
document.addEventListener("visibilitychange", () => { if (!document.hidden && !S.busy) loadManifest(); });

loadMine();
render();
loadManifest();
