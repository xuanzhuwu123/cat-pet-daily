// 纯界面效果：滚动进度、导航高亮、滚动出现、首屏背景视差和光点
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const bar = document.getElementById("scrollBar");
const nav = document.getElementById("topnav");
const photo = document.getElementById("heroPhoto");

// 背景图位移 = 滚动视差 + 鼠标视差（鼠标那部分做缓动，跟得软一点）
const P = { sy: 0, mx: 0, my: 0, tx: 0, ty: 0, raf: 0 };
function paintPhoto() {
  P.mx += (P.tx - P.mx) * 0.08;
  P.my += (P.ty - P.my) * 0.08;
  photo.style.transform = `translate3d(${P.mx * -18}px,${P.sy * 0.35 + P.my * -12}px,0)`;
  P.raf = Math.abs(P.tx - P.mx) + Math.abs(P.ty - P.my) > 0.002 ? requestAnimationFrame(paintPhoto) : 0;
}
const kick = () => { if (!P.raf) P.raf = requestAnimationFrame(paintPhoto); };

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    nav.classList.toggle("scrolled", y > 24);
    if (!reduce && photo && y < innerHeight * 1.2) { P.sy = y; kick(); }
    ticking = false;
  });
}
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", onScroll);
onScroll();

if (!reduce && photo && matchMedia("(pointer: fine)").matches) {
  addEventListener("pointermove", ev => {
    if (scrollY > innerHeight) return;
    P.tx = ev.clientX / innerWidth * 2 - 1;
    P.ty = ev.clientY / innerHeight * 2 - 1;
    kick();
  }, { passive: true });
}

// 金色光点：从猫和图标附近往上飘
const sparks = document.getElementById("sparks");
if (sparks && !reduce) {
  const n = innerWidth < 600 ? 14 : 26;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("i");
    const r = Math.random;
    s.style.cssText = `--x:${(20 + r() * 75).toFixed(1)}%;--y:${(r() * 45).toFixed(1)}%;--s:${(2 + r() * 4).toFixed(1)}px;` +
      `--dx:${((r() - 0.5) * 80).toFixed(0)}px;--t:${(7 + r() * 8).toFixed(1)}s;--delay:${(-r() * 15).toFixed(1)}s`;
    sparks.append(s);
  }
}

// 滚动到才出现
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add("in");
    io.unobserve(e.target);
    if (e.target.classList.contains("eps")) setTimeout(() => e.target.classList.add("settled"), 1600);
  }
}, { threshold: 0, rootMargin: "0px 0px -8% 0px" });
document.querySelectorAll(".reveal").forEach(el => io.observe(el));

// 导航高亮当前区块
const links = new Map([...document.querySelectorAll(".links a")].map(a => [a.dataset.sec, a]));
const spy = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    links.forEach(a => a.classList.remove("active"));
    links.get(e.target.id)?.classList.add("active");
  }
}, { rootMargin: "-45% 0px -50% 0px" });
["top", "latest", "episodes"].forEach(id => { const el = document.getElementById(id); if (el) spy.observe(el); });
