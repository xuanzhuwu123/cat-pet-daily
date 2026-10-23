// 世界观层：달동네线稿 + 跟着鼠标走的灯光 + 猫的视线 + 开场
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const root = document.documentElement;

// ---------- 달동네线稿（固定种子，每次打开都是同一片街区） ----------
function rng(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 窗台上坐着的小猫（原点在脚下中间）
const SILL_CAT = "M-5 0 Q-6.5 -8 -4 -13 L-5 -19.5 L-1.8 -16 L1.8 -16 L5 -19.5 L4 -13 Q6.5 -8 5 0 Z M5 -1 Q11 -1 10 -7";

// 墙上和电线杆上的纸条：只有被灯照到才看得见
const NOTES = [
  ["이주 기한 안내", "11월 30일까지 이주 바랍니다"],
  ["원룸 보증금 500 / 월세 55", "역세권 · 즉시 입주"],
  ["이삿짐 센터", "당일 이사 가능"],
  ["전기요금 미납 안내", "납부 기한이 지났습니다"],
  ["무료 나눔", "책상, 의자 가져가세요"],
  ["공가 · 출입 금지", ""],
  ["세입자 대책 모임", "목요일 저녁 7시 · 경로당"],
  ["고양이 밥그릇", "치우지 말아 주세요"],
];

// 每一层分成两部分：不变的（房子、电线、台阶、아파트）只画一次，变成一张图片；
// 会变的（亮着的窗户、红叉、猫眼、窗台上的猫）放在上面一层很稀疏的 SVG 里。
// 这样熄灯时只重画几个小方块，滚动时也不用重画整片街区。
function townGeometry() {
  const R = rng(1987);
  const W = 1600, f = n => n.toFixed(1);
  const L = () => ({ st: [], dy: [] });
  const far = [0, 1, 2, 3].map(() => ({ st: [], hi: [] })), back = L(), mid = L(), front = L();
  const spots = [];
  // 山坡：越往右越高，带一点起伏
  const ground = (x, base, amp) => base - amp * (x / W) - 18 * Math.sin(x / 150) - 10 * Math.sin(x / 61);

  function house(out, x, w, base, amp, k, mark) {
    const g = ground(x + w / 2, base, amp);
    const h = (34 + R() * 52) * k;
    const y = g - h;
    // 房子往下多延伸一些：前排图层上移做视差时，底下不会露空
    let s = `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h + 260)}"/>`;
    const roof = R();
    if (roof < 0.3) {
      // 斜屋顶
      s += `<path d="M${f(x - 3)} ${f(y)} L${f(x + w / 2)} ${f(y - 14 * k)} L${f(x + w + 3)} ${f(y)}"/>`;
    } else {
      // 平屋顶的女儿墙；有一部分屋顶上放着水塔
      s += `<path d="M${f(x)} ${f(y - 4 * k)} H${f(x + w)}"/>`;
      if (roof > 0.72) {
        const tx = x + w * (0.2 + R() * 0.45), tw = 11 * k, th = 9 * k;
        s += `<rect x="${f(tx)}" y="${f(y - 4 * k - th)}" width="${f(tw)}" height="${f(th)}" rx="${f(3 * k)}"/>`;
      }
    }
    // 窗户：有的亮着灯（亮着的放进会变的那层）
    const n = 1 + Math.floor(R() * 3);
    for (let i = 0; i < n; i++) {
      const ww = (6 + R() * 4) * k, wh = (6 + R() * 3) * k;
      const wx = x + 5 * k + R() * Math.max(1, w - ww - 10 * k);
      const wy = y + 8 * k + R() * Math.max(1, h - wh - 16 * k);
      const rect = `x="${f(wx)}" y="${f(wy)}" width="${f(ww)}" height="${f(wh)}"`;
      // 猫眼和窗台猫不在这里画，用到的时候才加（见 extra），平时这层越少越好
      if (R() < 0.32) out.dy.push(`<rect class="win lit" ${rect} data-k="${f(k)}"/>`);
      else s += `<rect class="win" ${rect}/>`;
    }
    out.st.push(s);
    if (mark && w > 30 * k) spots.push({ out, x, y, w, h, k, front: out === front });
  }

  function row(out, base, amp, k, mark) {
    let x = -40 - R() * 30;
    while (x < W + 40) {
      const w = (38 + R() * 52) * k;
      house(out, x, w, base, amp, k, mark);
      x += w + (R() < 0.25 ? 8 + R() * 18 : 1) * k;
    }
  }

  // 远处的아파트：一样高、一样方的楼，窗户是整齐的格子。分成四组，每组整层升起。
  // hi 是窗户亮起来以后的样子，升到位时淡入
  for (let i = 0, x = 40 + R() * 60; x < W - 40; i++) {
    const w = 62 + R() * 26, h = 200 + R() * 100, base = ground(x + w / 2, 770, 120) + 10, g = (i * 3) % 4;
    const win = `x="${f(x + 6)}" y="${f(base - h + 14)}" width="${f(w - 12)}" height="${f(h - 20)}" fill="url(#aw)"`;
    far[g].st.push(`<rect x="${f(x)}" y="${f(base - h)}" width="${f(w)}" height="${f(h + 200)}"/>` +
      `<rect class="apt-win" ${win}/><text class="dong" x="${f(x + w / 2)}" y="${f(base - h + 10)}">${101 + i}동</text>`);
    far[g].hi.push(`<rect class="apt-win" ${win}/>`);
    x += w + 40 + R() * 90;
  }

  row(back, 770, 120, 0.55);
  row(mid, 830, 100, 0.72, true);

  // 电线杆和电线（挂在中间那排房子上方）
  const poles = [];
  for (let x = 90; x < W; x += 230 + R() * 90) {
    const g = ground(x, 830, 100), top = g - 150;
    poles.push([x, top]);
    mid.st.push(`<path d="M${f(x)} ${f(g)} V${f(top)} M${f(x - 16)} ${f(top + 10)} H${f(x + 16)} M${f(x - 11)} ${f(top + 22)} H${f(x + 11)}"/>`);
  }
  for (let i = 1; i < poles.length; i++) {
    const [x1, y1] = poles[i - 1], [x2, y2] = poles[i];
    for (const [o, sag] of [[10, 26], [10, 34], [22, 22]]) {
      const a = o === 22 ? 11 : 16;
      mid.st.push(`<path class="wire" d="M${f(x1 + a)} ${f(y1 + o)} Q${f((x1 + x2) / 2)} ${f((y1 + y2) / 2 + o + sag)} ${f(x2 - a)} ${f(y2 + o)}"/>`);
      mid.st.push(`<path class="wire" d="M${f(x1 - a)} ${f(y1 + o)} Q${f((x1 + x2) / 2)} ${f((y1 + y2) / 2 + o + sag + 4)} ${f(x2 - a - 32)} ${f(y2 + o)}" opacity=".5"/>`);
    }
  }

  row(front, 905, 70, 0.9, true);

  // 前排的台阶小路：之字形往上爬，旁边一条扶手
  for (const sx of [260, 760, 1250]) {
    let x = sx, y = ground(sx, 905, 70) + 30;
    let d = `M${f(x)} ${f(y)}`, rail = `M${f(x + 14)} ${f(y - 18)}`;
    for (let i = 0; i < 11; i++) { x -= 9; d += ` H${f(x)}`; y -= 7; d += ` V${f(y)}`; }
    rail += ` L${f(x + 14)} ${f(y - 18)}`;
    front.st.push(`<path class="stair" d="${d}"/><path class="stair" d="${rail}"/>`);
  }

  // 门上的红色「철거」叉号：先藏着，滚动到第 2 页时一个个出现
  for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
  // 纸条：一部分贴在前排的墙上，一部分贴在电线杆上（只在被照亮的那份里显示）
  const paper = (out, x, y, [a, b], rot) => out.st.push(
    `<g class="paper" transform="rotate(${f(rot)} ${f(x + 44)} ${f(y + 16)})"><rect x="${f(x)}" y="${f(y)}" width="88" height="${b ? 32 : 20}"/>` +
    `<text class="pa" x="${f(x + 6)}" y="${f(y + 13)}">${a}</text>` + (b ? `<text class="pb" x="${f(x + 6)}" y="${f(y + 25)}">${b}</text>` : "") + `</g>`);
  const walls = spots.slice(16).filter(sp => sp.front);
  NOTES.forEach((n, i) => {
    if (i < 3 && poles[i * 2 + 1]) {
      const [px, top] = poles[i * 2 + 1];
      paper(mid, px - 44, top + 44, n, (R() - 0.5) * 6);
    } else if (walls.length) {
      const sp = walls[(i * 3) % walls.length];
      paper(front, sp.x + 2, sp.y + 6, n, (R() - 0.5) * 8);
    }
  });
  spots.slice(0, 16).forEach(({ out, x, y, w, h, k }, i) => {
    const cx = x + w / 2, cy = y + Math.min(h, 60 * k) / 2 + 4 * k, r = Math.min(w, h) * 0.26;
    out.dy.push(`<path class="x" d="M${f(cx - r)} ${f(cy - r)} L${f(cx + r)} ${f(cy + r)} M${f(cx + r)} ${f(cy - r)} L${f(cx - r)} ${f(cy + r)}"/>`);
    if (i % 4 === 0) out.dy.push(`<text class="x x-text" x="${f(cx)}" y="${f(cy + r + 11 * k)}">철거</text>`);
  });

  return { far, back, mid, front };
}

// 图片里的 SVG 读不到网页的 CSS，所以把样式写进图片里；底下那份是冷色，灯照到的那份是暖色
const PALETTE = {
  base: { line: "rgba(143,166,191,.11)", aw: "rgba(170,195,225,.16)", awHi: "rgba(170,195,225,.3)", dong: "rgba(143,166,191,.35)", paper: false },
  lit: { line: "rgba(240,190,130,.4)", aw: "rgba(200,220,245,.35)", awHi: "rgba(200,220,245,.6)", dong: "rgba(240,200,150,.55)", paper: true },
};
function imageStyle(c, hi) {
  return `<style>rect,path{fill:#0A0C10;stroke:${c.line};stroke-width:1;vector-effect:non-scaling-stroke}` +
    `.wire,.stair,.win{fill:none}.back{opacity:.55}.mid{opacity:.8}.far{opacity:.6}text{stroke:none}` +
    `.dong{fill:${c.dong};font:8px Consolas,monospace;text-anchor:middle;letter-spacing:.08em}` +
    `.apt-win{fill:url(#aw);stroke:none;opacity:${hi ? 1 : 0.25}}.aw{fill:${hi ? c.awHi : c.aw};stroke:none}` +
    (c.paper ? `.paper rect{fill:rgba(236,226,206,.1);stroke:rgba(240,200,150,.4)}.paper text{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;letter-spacing:.02em}` +
      `.pa{fill:rgba(250,232,205,.95);font-size:9.5px;font-weight:700}.pb{fill:rgba(236,218,190,.75);font-size:7.5px}` : `.paper{display:none}`) +
    `</style>`;
}
const PATTERN = `<defs><pattern id="aw" width="9" height="11" patternUnits="userSpaceOnUse"><rect class="aw" x="1.5" y="3" width="5" height="4"/></pattern></defs>`;
let viewBox = "0 0 1600 1026";   // 900 × 1.14，和 .tl 的高度对应
const svgOpen = () => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="xMidYMax slice">`;
const dataUrl = body => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(body)}`;

const geo = townGeometry();
// 一份线稿的所有静态图片，顺序和 townHTML 里 img 的顺序一致
function staticImages(variant) {
  const c = PALETTE[variant];
  const img = (layer, inner, hi) => svgOpen() + imageStyle(c, hi) + PATTERN + `<g class="${layer}">${inner}</g></svg>`;
  return [...geo.far.flatMap(g => [img("far", g.st.join(""), false), img("far", g.hi.join(""), true)]),
    ...["back", "mid", "front"].map(r => img(r, geo[r].st.join(""), false))];
}
function townHTML(variant) {
  const src = staticImages(variant).map(dataUrl);
  const img = (cls, i) => `<img class="${cls}" alt="" decoding="async" src="${src[i]}">`;
  return geo.far.map((_, k) => `<div class="tl far g${k}">${img("st", k * 2)}${img("st hi", k * 2 + 1)}</div>`).join("") +
    ["back", "mid", "front"].map((r, i) => `<div class="tl ${r}">${img("st", 8 + i)}` +
      `${svgOpen()}<g class="layer ${r}">${geo[r].dy.join("")}</g></svg></div>`).join("");
}

const townEl = document.getElementById("town"), townLit = document.getElementById("townLit");
townEl.innerHTML = townHTML("base");
townLit.innerHTML = townHTML("lit");
// 加载后空闲时先把所有线稿图片解码好，第一次滑到时不用临时解码
const warm = () => document.querySelectorAll(".tl>img").forEach(img => img.decode?.().catch(() => {}));
"requestIdleCallback" in window ? requestIdleCallback(warm, { timeout: 1500 }) : setTimeout(warm, 300);

// ---------- 第 2 页：边读边熄灯，「철거」出现，아파트升起 ----------
// 两份线稿的结构完全一样，按下标成对处理
const pairs = sel => { const a = townEl.querySelectorAll(sel), b = townLit.querySelectorAll(sel); return [...a].map((el, i) => [el, b[i]]); };
const order = n => { const R = rng(42), idx = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } return idx; };
const lights = pairs(".win.lit"), marks = pairs(".x"), apts = pairs(".tl.far");
// 用到的时候才在窗户后面加上猫眼（只在灯照到的那份里）或窗台上的猫
const extra = (rect, kind) => {
  const x = +rect.getAttribute("x"), y = +rect.getAttribute("y"), w = +rect.getAttribute("width"), h = +rect.getAttribute("height"), k = +rect.dataset.k;
  const cx = (x + w / 2).toFixed(1), cy = (y + h / 2).toFixed(1);
  rect.insertAdjacentHTML("afterend", kind === "peek"
    ? `<g class="peek"><circle cx="${(cx - 1.3 * k).toFixed(1)}" cy="${cy}" r="${(0.8 * k).toFixed(2)}"/><circle cx="${(+cx + 1.3 * k).toFixed(1)}" cy="${cy}" r="${(0.8 * k).toFixed(2)}"/></g>`
    : `<path class="sill-cat" transform="translate(${cx} ${(y + h).toFixed(1)}) scale(${(0.62 * k).toFixed(2)})" d="${SILL_CAT}"/>`);
  return rect.nextElementSibling;
};
const peeks = [];
const relit = new Set();
// 窗户按随机顺序熄灭，最后留三盏
const lightAt = new Array(lights.length);
order(lights.length).forEach((k, n) => { lightAt[k] = n < 3 ? 2 : 0.08 + 0.8 * (n - 3) / Math.max(1, lights.length - 4); });
const markAt = order(marks.length).map(n => 0.3 + 0.6 * n / Math.max(1, marks.length - 1));
// 四组아파트依次升起
const aptAt = [0.12, 0.27, 0.42, 0.57];
const context = document.getElementById("context");
let lastP = -1;

function demolish() {
  const r = context.getBoundingClientRect(), vh = innerHeight;
  const p = Math.min(1, Math.max(0, (vh * 0.95 - r.top) / (vh * 1.15)));
  if (Math.abs(p - lastP) < 0.004) return;
  lastP = p;
  lights.forEach((pair, i) => pair.forEach(el => el.classList.toggle("off", p > lightAt[i])));
  countHomes();
  marks.forEach((pair, i) => pair.forEach(el => el.classList.toggle("on", p > markAt[i])));
  apts.forEach((pair, i) => pair.forEach(el => el.classList.toggle("up", p > aptAt[i])));
}

// 视差：往下滑时老房子慢慢沉下去，越近的那排沉得越多。支持滚动驱动动画的浏览器在 CSS 里做（和手指完全同步），
// 不支持的在这里用 JS 移动图层
const cssParallax = !!(window.CSS && CSS.supports("animation-timeline: scroll()"));
const layers = [".back", ".mid", ".front"].map((c, i) => [[...document.querySelectorAll(`.tl${c}`)], [2, 4, 8][i]]);
function parallax() {
  if (cssParallax || reduce) return;
  const k = Math.min(1, scrollY / (innerHeight * 2.5));
  for (const [els, vh] of layers) for (const el of els) el.style.transform = `translate3d(0,${(k * vh).toFixed(2)}vh,0)`;
}
// 「불이 켜진 집」：灯全亮时是 312 户，最后剩 3 户；重新点亮的另外计数
const hhLit = document.getElementById("hhLit"), hhRelit = document.getElementById("hhRelit");
function countHomes() {
  const total = lights.length;
  const on = lights.filter(([a], i) => !a.classList.contains("off") || relit.has(i)).length - relit.size;
  hhLit.textContent = on >= total ? 312 : Math.max(3, Math.round(3 + 309 * (on - 3) / Math.max(1, total - 3)));
  hhRelit.hidden = !relit.size;
  hhRelit.textContent = ` · 다시 켜진 불 ${relit.size}`;
}

// 滚动时每帧只算一次
let scrollTick = false;
addEventListener("scroll", () => {
  if (scrollTick) return;
  scrollTick = true;
  requestAnimationFrame(() => { scrollTick = false; demolish(); parallax(); });
}, { passive: true });
parallax();
addEventListener("resize", demolish);
demolish();

// ---------- 灯光：缓动跟随鼠标；没有鼠标的设备在画面里慢慢漂 ----------
// 只改 transform（交给合成器），不改样式变量，所以移动灯光时线稿不需要重画
const lens = document.getElementById("lens"), glow = document.getElementById("cursorLight");
const L = { x: innerWidth * 0.72, y: innerHeight * 0.62, tx: innerWidth * 0.72, ty: innerHeight * 0.62, r: 270 };
const gaze = document.getElementById("gaze");
const cat = document.querySelector(".cat");
let lightOn = false, raf = 0;

function sizeLight() {
  L.r = innerWidth < 700 ? 150 : 270;
  lens.style.width = lens.style.height = `${L.r * 2}px`;
  glow.style.width = glow.style.height = `${L.r * 3}px`;
}

function setLight() {
  lens.style.transform = `translate3d(${(L.x - L.r).toFixed(1)}px,${(L.y - L.r).toFixed(1)}px,0)`;
  townLit.style.transform = `translate3d(${(L.r - L.x).toFixed(1)}px,${(L.r - L.y).toFixed(1)}px,0)`;
  glow.style.transform = `translate3d(${(L.x - L.r * 1.5).toFixed(1)}px,${(L.y - L.r * 1.5).toFixed(1)}px,0)`;
}

function look() {
  // 猫的眼睛往灯光的方向看，最多偏 2.6 个单位（先读位置再写，避免强制重排）
  if (!gaze || !cat) return;
  const b = cat.getBoundingClientRect();
  if (b.bottom < 0 || b.top > innerHeight) return;
  const dx = L.x - (b.left + b.width * 0.45), dy = L.y - (b.top + b.height * 0.22);
  const d = Math.hypot(dx, dy) || 1, m = Math.min(1, d / 260) * 2.6;
  gaze.setAttribute("transform", `translate(${(dx / d * m).toFixed(2)} ${(dy / d * m).toFixed(2)})`);
}

function tick(t) {
  if (!finePointer) {
    L.tx = innerWidth * (0.5 + 0.32 * Math.sin(t / 5200));
    L.ty = innerHeight * (0.66 + 0.12 * Math.sin(t / 3700));
  }
  L.x += (L.tx - L.x) * 0.24;
  L.y += (L.ty - L.y) * 0.24;
  look();
  setLight();
  // 鼠标停下、灯也追上以后就不再每帧计算，等下一次移动
  const settled = finePointer && Math.abs(L.tx - L.x) + Math.abs(L.ty - L.y) < 0.5;
  raf = document.hidden || settled ? 0 : requestAnimationFrame(tick);
}
const kick = () => { if (lightOn && !raf && !reduce) raf = requestAnimationFrame(tick); };

function turnOnLight() {
  if (lightOn) return;
  lightOn = true;
  root.classList.add("light-on");
  if (reduce) { setLight(); look(); return; }
  kick();
}

if (finePointer) {
  addEventListener("pointermove", e => {
    L.tx = e.clientX; L.ty = e.clientY;
    if (reduce) { L.x = L.tx; L.y = L.ty; setLight(); look(); } else kick();
  }, { passive: true });
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
addEventListener("resize", () => { sizeLight(); setLight(); });
sizeLight();
setLight();

// 窄屏上把달동네缩小一些：加高 viewBox，让街区只占画面底部
let fitW = 0;
function fitTown() {
  if (innerWidth === fitW) return;   // 手机滚动时地址栏伸缩只改高度，不重新排
  fitW = innerWidth;
  const s = innerWidth < 700 ? 0.6 : 1;
  const vbH = Math.max(900, townEl.clientHeight / s);
  // 图层比窗口高 14%（见 style.css 的 .tl），viewBox 也加高 14%，顶部不变，房子的位置和大小就和原来一样
  const next = `0 ${(900 - vbH).toFixed(0)} 1600 ${(vbH * 1.14).toFixed(0)}`;
  if (next === viewBox) return;
  viewBox = next;
  for (const svg of document.querySelectorAll(".tl > svg")) svg.setAttribute("viewBox", viewBox);
  for (const [el, variant] of [[townEl, "base"], [townLit, "lit"]]) {
    const src = staticImages(variant);
    el.querySelectorAll("img.st").forEach((img, i) => { img.src = dataUrl(src[i]); });
  }
}
fitTown();
addEventListener("resize", fitTown);

// ---------- 开场 ----------
const intro = document.getElementById("intro");
const line = document.getElementById("introLine");
const TEXT = "비가 오고 있었다.";
let timers = [];
const later = (ms, fn) => timers.push(setTimeout(fn, ms));

function finishIntro() {
  if (!root.classList.contains("intro")) return;
  timers.forEach(clearTimeout); timers = [];
  try { localStorage.setItem("intro-seen", "1"); } catch {}
  root.classList.remove("intro");
  root.classList.add("lamp-on");
  intro.classList.add("gone");
  turnOnLight();
  setTimeout(() => { root.classList.remove("lamp-on"); intro.hidden = true; }, 1800);
}

if (root.classList.contains("intro")) {
  // 一个字一个字打出来 → 停一下 → 字淡出 → 台灯闪两下亮起
  [...TEXT].forEach((ch, i) => later(500 + i * 95, () => { line.textContent += ch; }));
  const typed = 500 + TEXT.length * 95;
  later(typed + 1100, () => line.classList.add("fade"));
  later(typed + 1900, finishIntro);
  document.getElementById("introSkip").addEventListener("click", finishIntro);
  addEventListener("keydown", finishIntro, { once: true });
  addEventListener("wheel", finishIntro, { once: true, passive: true });
  addEventListener("touchmove", finishIntro, { once: true, passive: true });
} else {
  intro.hidden = true;
  turnOnLight();
}

// ---------- 熄灭的窗户里还有猫：移上去会看到一对眼睛，点一下重新亮灯 ----------
const INTERACTIVE = "a,button,input,textarea,select,label,video,dialog,.ep,.sheet,.feature";
let hoverWin = -1;

function darkWindowAt(x, y) {
  const tol = finePointer ? 6 : 16;   // 手指比鼠标粗，放宽一点
  for (let i = 0; i < lights.length; i++) {
    const el = lights[i][0];
    if (!el.classList.contains("off") || relit.has(i)) continue;
    const b = el.getBoundingClientRect();
    if (x > b.left - tol && x < b.right + tol && y > b.top - tol && y < b.bottom + tol) return i;
  }
  return -1;
}

function setHover(i) {
  if (i === hoverWin) return;
  if (hoverWin >= 0) peeks[hoverWin].classList.remove("on");
  hoverWin = i;
  if (i >= 0) {
    const p = peeks[i] || (peeks[i] = extra(lights[i][1], "peek"));
    requestAnimationFrame(() => p.classList.add("on"));
  }
  root.classList.toggle("over-win", i >= 0);
}

function relight(i) {
  relit.add(i);
  lights[i].forEach(el => el.classList.add("relit"));
  lights[i].forEach(el => { const c = extra(el, "sill"); requestAnimationFrame(() => c.classList.add("on")); });
  setHover(-1);
  countHomes();
  if (sound.on) sound.chime();
}

if (finePointer) {
  let pending = false, px = 0, py = 0;
  addEventListener("pointermove", e => {
    px = e.clientX; py = e.clientY;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const blocked = document.elementFromPoint(px, py)?.closest(INTERACTIVE);
      setHover(lastP > 0.05 && !blocked ? darkWindowAt(px, py) : -1);
    });
  }, { passive: true });
}
addEventListener("click", e => {
  if (e.target.closest(INTERACTIVE) || root.classList.contains("intro")) return;
  const i = hoverWin >= 0 ? hoverWin : darkWindowAt(e.clientX, e.clientY);
  if (i >= 0) relight(i);
});

// ---------- 首页的猫：停在它身上一会儿，它会慢慢眨眼，脚下的光变暖 ----------
const desk = document.querySelector(".desk");
const eyes = document.querySelector(".cat .eyes");
let dwell = 0;
function slowBlink() {
  if (!eyes || eyes.classList.contains("slow")) return;
  eyes.classList.add("slow");
  desk.classList.add("warm");
  if (sound.on) sound.purr();
  setTimeout(() => { eyes.classList.remove("slow"); desk.classList.remove("warm"); }, 2600);
}
if (cat) {
  cat.style.pointerEvents = "all";
  cat.addEventListener("pointerenter", () => { dwell = setTimeout(slowBlink, 650); });
  cat.addEventListener("pointerleave", () => clearTimeout(dwell));
  cat.addEventListener("click", slowBlink);
}

// ---------- 声音：默认关；打开后有雨声，猫眨眼时有呼噜声（都是程序生成的） ----------
const sound = {
  on: false, ctx: null, rain: null,
  start() {
    const ctx = this.ctx || (this.ctx = new AudioContext());
    ctx.resume();
    const noise = (sec) => {
      const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    };
    this.noise = this.noise || noise(3);
    // 雨：白噪声去掉低频和刺耳的高频
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 500;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 5200;
    const g = ctx.createGain(); g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.05 * rainLevel(), ctx.currentTime + 1.5);
    src.connect(hp).connect(lp).connect(g).connect(ctx.destination);
    src.start();
    this.rain = { src, g };
  },
  stop() {
    if (!this.rain) return;
    const { src, g } = this.rain, t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.6);
    src.stop(t + 0.7);
    this.rain = null;
  },
  level(v) { if (this.rain) this.rain.g.gain.setTargetAtTime(0.05 * v, this.ctx.currentTime, 0.4); },
  // 呼噜：低沉的噪声，每秒 26 下起伏，配合一吸一呼
  purr() {
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 260;
    const am = ctx.createGain(); am.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 26;
    const depth = ctx.createGain(); depth.gain.value = 0.5;
    lfo.connect(depth).connect(am.gain);
    const env = ctx.createGain(); env.gain.value = 0;
    for (const [a, b] of [[0, 1.1], [1.25, 2.4]]) {
      env.gain.linearRampToValueAtTime(0, t + a);
      env.gain.linearRampToValueAtTime(0.5, t + a + 0.3);
      env.gain.linearRampToValueAtTime(0.35, t + b - 0.2);
      env.gain.linearRampToValueAtTime(0, t + b);
    }
    src.connect(lp).connect(am).connect(env).connect(ctx.destination);
    src.start(t); lfo.start(t); src.stop(t + 2.6); lfo.stop(t + 2.6);
  },
  // 重新亮灯：很轻的一声
  chime() {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 660;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 1.3);
  },
};
// 雨量由 ui.js 根据结尾页的位置写到 <html data-rain>
const rainLevel = () => Number(root.dataset.rain || 1);
new MutationObserver(() => sound.level(rainLevel())).observe(root, { attributes: true, attributeFilter: ["data-rain"] });

const soundBtn = document.getElementById("sound");
soundBtn.addEventListener("click", () => {
  sound.on = !sound.on;
  sound.on ? sound.start() : sound.stop();
  soundBtn.setAttribute("aria-pressed", String(sound.on));
  soundBtn.textContent = sound.on ? "소리 끄기" : "소리 켜기";
});
