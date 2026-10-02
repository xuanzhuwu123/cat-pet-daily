import { WORKER_URL, REPO, BRANCH } from "./site-config.js";

const MAX_BYTES = 25 * 1024 * 1024;
const THUMB_PX = 480;
const WEEK = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
const COLORS = ["#E0741A", "#2F7ED8", "#1F9D6B", "#B04BC8", "#C9A21B", "#D2455A", "#4B8F99", "#7A6FD0"];
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;

const S = { config: null, entries: [], sel: null, me: null, busy: false, error: "" };
const $ = id => document.getElementById(id);

// ---------- 本机记住的身份 ----------
function loadLogin() {
  try {
    const v = JSON.parse(localStorage.getItem("daily-login") || "null");
    if (v && v.me) S.me = v.me;
  } catch {}
}
function saveLogin() {
  try { S.me ? localStorage.setItem("daily-login", JSON.stringify({ me: S.me })) : localStorage.removeItem("daily-login"); } catch {}
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

// ---------- 数据 ----------
const members = () => (S.config && S.config.members) || [];
const memberOf = id => members().find(m => m.id === id);
const colorOf = id => COLORS[Math.max(0, members().findIndex(m => m.id === id)) % COLORS.length];
const nameOf = id => (memberOf(id) || {}).name || id;

// 新文件刚提交时 Pages 还没更新（约 1 分钟），先从仓库直接读
function fileUrl(path, time) {
  const fresh = time && Date.now() - new Date(time).getTime() < 10 * 60 * 1000;
  return fresh ? RAW_BASE + encodePath(path) : encodePath(path);
}
const encodePath = p => p.split("/").map(encodeURIComponent).join("/");
function withFallback(img, path) {
  img.addEventListener("error", () => {
    if (!img.dataset.retried) { img.dataset.retried = "1"; img.src = RAW_BASE + encodePath(path); }
  });
  return img;
}

function applyManifest(m) {
  if (!m || !m.config) return;
  S.config = m.config;
  S.entries = Array.isArray(m.entries) ? m.entries : [];
  if (S.me && !memberOf(S.me)) { S.me = null; saveLogin(); }
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
    else S.error = S.error || "";
  }
  render();
}

// ---------- 渲染 ----------
function counts() {
  const m = new Map();
  for (const e of S.entries) { const k = e.member + "|" + e.day; m.set(k, (m.get(k) || 0) + 1); }
  return m;
}
function streak(id, c) {
  let d = today();
  if (!c.get(id + "|" + d)) d = addDays(d, -1);
  let n = 0;
  while (dayNo(d) >= 1 && c.get(id + "|" + d)) { n++; d = addDays(d, -1); }
  return n;
}
const sizeText = b => b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const timeText = iso => { if (!iso) return ""; const d = new Date(iso); return `${md(fmt(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function render() {
  const t = today();
  const days = dayList();
  const c = counts();
  const ids = members().map(m => m.id);
  const nowNo = Math.min(Math.max(dayNo(t), 0), DAYS());

  if (S.config && S.config.title) document.title = S.config.title;
  $("range").textContent = S.config ? `${start()} → ${days[days.length - 1]}` : "불러오는 중…";
  const done = ids.reduce((a, id) => a + days.filter(d => d <= t && c.get(id + "|" + d)).length, 0);
  const possible = ids.length * nowNo;
  $("progress").replaceChildren(
    h("div", { class: "big" }, h("span", {}, h("b", {}, nowNo), `일차 / ${DAYS()}일`), h("span", {}, possible ? `팀 달성률 ${Math.round(done / possible * 100)}%` : "")),
    h("div", { class: "bar" }, h("i", { style: `width:${nowNo / DAYS() * 100}%` })));

  const notice = $("notice");
  notice.hidden = !S.error;
  notice.textContent = S.error;
  notice.className = "notice err";

  // 打卡墙
  const grid = $("grid");
  const hr = h("tr", {}, h("th", { class: "who" }, "멤버"));
  for (const d of days) {
    const cls = [d === t ? "today" : "", d === S.sel ? "sel" : ""].join(" ").trim() || null;
    hr.append(h("th", { class: cls, title: `${d} ${WEEK[parse(d).getDay()]}` }, h("b", {}, dayNo(d)), md(d)));
  }
  const tb = h("tbody");
  for (const id of ids) {
    const nm = nameOf(id);
    const total = days.filter(d => c.get(id + "|" + d)).length;
    const tr = h("tr", {}, h("th", { class: "who" },
      h("div", { class: "nm" }, h("span", { class: "dot", style: `background:${colorOf(id)}` }), h("span", {}, nm + (id === S.me ? " (나)" : ""))),
      h("small", {}, `${total}일 · 연속 ${streak(id, c)}`)));
    for (const d of days) {
      const n = c.get(id + "|" + d) || 0;
      let cls = "cell";
      if (d > t) cls += " future";
      else if (!n) cls += d < t ? " miss" : "";
      else cls += n >= 3 ? " l3" : n === 2 ? " l2" : " l1";
      if (id === S.me && d === t && !n) cls += " me-today";
      tr.append(h("td", { class: d === S.sel ? "sel" : null },
        h("button", { class: cls, title: `${nm} · ${d} · ${n}개`, "aria-label": `${nm} ${d} ${n}개`, onclick: () => select(d) }, n || "")));
    }
    tb.append(tr);
  }
  grid.replaceChildren(h("thead", {}, hr), tb);

  renderDay(t, ids);
  renderSide(t);
}

function renderDay(t, ids) {
  const main = $("dayMain");
  if (!S.sel) { main.replaceChildren(); return; }
  const sel = S.sel, no = dayNo(sel), d = parse(sel);
  const list = S.entries.filter(e => e.day === sel).sort((a, b) => (a.time || "") < (b.time || "") ? -1 : 1);
  const kids = [h("div", { class: "day-title" },
    h("span", { class: "n" }, `Day ${no}`),
    h("h2", {}, `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEK[d.getDay()]}`),
    h("span", { class: "d" }, sel === t ? "오늘" : sel > t ? "아직 전" : `${diff(t, sel)}일 전`),
    h("div", { class: "nav" },
      h("button", { class: "btn", disabled: no <= 1, onclick: () => select(addDays(sel, -1)) }, "← 이전 날"),
      h("button", { class: "btn", disabled: no >= DAYS(), onclick: () => select(addDays(sel, 1)) }, "다음 날 →")))];
  if (!list.length) kids.push(h("p", { class: "empty" }, sel > t ? "아직 오지 않은 날이에요." : "이 날은 아직 아무도 올리지 않았어요."));
  for (const id of ids) {
    const mine = list.filter(e => e.member === id);
    if (!mine.length) continue;
    kids.push(h("div", { class: "group" },
      h("h3", {}, h("span", { class: "dot", style: `background:${colorOf(id)}` }), nameOf(id), h("em", {}, `${mine.length}개`)),
      h("div", { class: "files" }, mine.map(fileCard))));
  }
  const lazy = ids.filter(id => !list.some(e => e.member === id));
  if (list.length && lazy.length && sel <= t) kids.push(h("p", { class: "missing" }, "아직 안 올린 사람: " + lazy.map(nameOf).join(", ")));
  main.replaceChildren(...kids);
}

function fileCard(e) {
  const isLink = e.kind === "link";
  const href = isLink ? e.url : fileUrl(e.path, e.time);
  const type = e.type || "";
  let thumb;
  if (!isLink && e.thumb) {
    thumb = h("a", { class: "thumb", href, target: "_blank", rel: "noopener" },
      withFallback(h("img", { src: fileUrl(e.thumb, e.time), alt: e.name, loading: "lazy", decoding: "async" }), e.thumb));
  } else if (!isLink && type.startsWith("image/") && (e.size || 0) < 400 * 1024) {
    thumb = h("a", { class: "thumb", href, target: "_blank", rel: "noopener" },
      withFallback(h("img", { src: href, alt: e.name, loading: "lazy", decoding: "async" }), e.path));
  } else if (!isLink && type.startsWith("video/")) {
    // 视频只在点击后才加载
    thumb = h("button", { class: "thumb", type: "button", onclick: ev => {
      const v = h("video", { src: href, controls: true, autoplay: true, playsinline: true });
      v.addEventListener("error", () => { if (!v.dataset.retried) { v.dataset.retried = "1"; v.src = RAW_BASE + encodePath(e.path); } }, { once: true });
      ev.currentTarget.replaceChildren(v);
      ev.currentTarget.onclick = null;
    } }, h("span", { class: "play" }, h("b", {}, "▶"), `재생 · ${sizeText(e.size || 0)}`));
  } else {
    const ext = isLink ? "LINK" : (e.name.split(".").pop() || "FILE").toUpperCase().slice(0, 5);
    thumb = h("a", { class: "thumb", href, target: "_blank", rel: "noopener" }, h("span", { class: "ext" }, ext));
  }
  const late = e.time && fmt(new Date(e.time)) > e.day;
  const del = e.member === S.me ? h("button", { class: "del", type: "button", onclick: ev => removeEntry(e, ev.currentTarget) }, "삭제") : null;
  return h("div", { class: "file" }, thumb,
    h("div", { class: "meta" },
      h("a", { href, target: "_blank", rel: "noopener" }, e.name || "이름 없음"),
      e.note ? h("p", {}, e.note) : null,
      h("div", { class: "row" },
        h("span", {}, timeText(e.time)),
        e.size ? h("span", {}, sizeText(e.size)) : null,
        late ? h("span", { class: "tag late" }, "늦게 제출") : null,
        del)));
}

function renderSide(t) {
  const logged = !!S.me;
  $("loginForm").hidden = logged || !S.config;
  $("uploader").hidden = !logged;
  const sel = $("memberSelect");
  if (!logged && S.config && sel.options.length !== members().length + 1) {
    sel.replaceChildren(h("option", { value: "" }, "이름을 선택하세요"), ...members().map(m => h("option", { value: m.id }, m.name)));
  }
  if (logged) {
    $("whoami").textContent = `현재: ${nameOf(S.me)}`;
    const no = S.sel ? dayNo(S.sel) : 0;
    $("upTitle").textContent = S.sel === t ? "오늘 올리기" : S.sel > t ? "아직 오지 않은 날이에요" : `Day ${no}에 늦게 제출`;
    $("submitBtn").disabled = S.busy || !S.sel || S.sel > t;
  }
}

function select(d) {
  const no = dayNo(d);
  if (no < 1 || no > DAYS()) return;
  S.sel = d;
  render();
}

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
      const res = await api("/commit", JSON.stringify({ action: "add", kind: "file", member: S.me, day, name: f.name, type: f.type, size: f.size, ext, note, fileSha, thumbSha }));
      applyManifest(res.manifest);
      ok++;
    }
    if (link) {
      let name = link;
      try { const u = new URL(link); name = u.hostname + u.pathname.replace(/\/$/, ""); } catch {}
      const res = await api("/commit", JSON.stringify({ action: "add", kind: "link", member: S.me, day, url: link, name, note }));
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

// ---------- 选身份 ----------
function login(ev) {
  ev.preventDefault();
  const me = $("memberSelect").value;
  const st = $("loginStatus");
  if (!me) { st.textContent = "먼저 이름을 선택하세요."; st.className = "status err"; return; }
  st.textContent = "";
  S.me = me; saveLogin();
  render();
}
function logout() { S.me = null; saveLogin(); render(); }

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
$("loginForm").addEventListener("submit", login);
$("logoutBtn").addEventListener("click", logout);
// 回到页面时刷新一次，看到别人新传的
document.addEventListener("visibilitychange", () => { if (!document.hidden && !S.busy) loadManifest(); });

loadLogin();
render();
loadManifest();
