// 纯界面效果：滚动进度、翻页、页码高亮、滚动出现、整页的雨
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const bar = document.getElementById("scrollBar");
const nav = document.getElementById("topnav");
const pages = [...document.querySelectorAll(".page")];

// 翻页：离开的那一页向后倒下去（以底边为轴后仰、缩小、变暗），下一页从下面盖上来
function turnPages() {
  const vh = innerHeight;
  for (const p of pages) {
    const inner = p.querySelector(".page-inner");
    const r = p.getBoundingClientRect();
    // 只对一屏高的页做“倒下”，长页（30 天列表）正常滚动
    const k = r.height <= vh * 1.15 ? Math.min(1, Math.max(0, -r.top / vh)) : 0;
    inner.style.transform = k ? `perspective(1400px) rotateX(${k * 14}deg) scale(${1 - k * 0.12}) translateY(${k * -6}vh)` : "";
    inner.style.opacity = k ? String(1 - k * 0.9) : "";
    inner.style.filter = k ? `blur(${k * 3}px)` : "";
  }
}

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    nav.classList.toggle("scrolled", y > 24);
    if (!reduce) turnPages();
    // 雨量：结尾页从下面升上来时，雨一点点停下
    const end = document.getElementById("end");
    if (end) {
      const lvl = Math.min(1, Math.max(0, end.getBoundingClientRect().top / innerHeight));
      document.documentElement.dataset.rain = lvl.toFixed(2);
    }
    ticking = false;
  });
}
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", onScroll);
onScroll();

// 雨：细的斜线，冷色；固定在整个窗口后面，切到别的标签页时停掉
// 落到底的雨滴按当前雨量决定要不要重新落下，雨停时就慢慢变少
const cv = document.getElementById("rain");
if (cv && !reduce) {
  const ctx = cv.getContext("2d");
  const drops = [];
  let w = 0, h = 0, raf = 0;
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(w * h / 9000);
    drops.length = 0;
    for (let i = 0; i < n; i++) drops.push(drop(true));
  }
  function drop(anywhere) {
    const z = Math.random();
    return { x: Math.random() * (w + 200) - 100, y: anywhere ? Math.random() * h : -40,
      len: 10 + z * 22, v: 5 + z * 9, a: 0.05 + z * 0.16 };
  }
  function frame() {
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    for (const d of drops) {
      ctx.strokeStyle = `rgba(150,175,205,${d.a})`;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.len * 0.18, d.y + d.len);
      ctx.stroke();
      d.y += d.v; d.x -= d.v * 0.18;
      if (d.y > h) {
        const lvl = Number(document.documentElement.dataset.rain || 1);
        if (Math.random() < lvl) Object.assign(d, drop(false));
        else Object.assign(d, { y: h + 1e4, v: 0 });
      }
      if (d.v === 0 && Math.random() < 0.01 * Number(document.documentElement.dataset.rain || 1)) Object.assign(d, drop(false));
    }
    raf = document.hidden ? 0 : requestAnimationFrame(frame);
  }
  size();
  addEventListener("resize", size);
  raf = requestAnimationFrame(frame);
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !raf) raf = requestAnimationFrame(frame); });
}

// 滚动到才出现（新的一页翻上来）
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add("in");
    io.unobserve(e.target);
    if (e.target.classList.contains("eps")) setTimeout(() => e.target.classList.add("settled"), 1600);
  }
}, { threshold: 0, rootMargin: "0px 0px -8% 0px" });
document.querySelectorAll(".reveal").forEach(el => io.observe(el));

// 导航和页码高亮当前页
const marks = [...document.querySelectorAll(".links a, .pager a")];
const spy = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    marks.forEach(a => a.classList.toggle("active", a.dataset.sec === e.target.id));
  }
}, { rootMargin: "-45% 0px -50% 0px" });
pages.forEach(p => spy.observe(p));
