// 纯界面效果：滚动进度、导航高亮、滚动出现、视差、猫眼跟随
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const bar = document.getElementById("scrollBar");
const nav = document.getElementById("topnav");
const blobs = [...document.querySelectorAll(".blob")];

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const y = scrollY, max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    nav.classList.toggle("scrolled", y > 24);
    if (!reduce && y < innerHeight * 1.2) {
      for (const b of blobs) b.style.transform = `translate3d(0,${y * Number(b.dataset.depth)}px,0)`;
    }
    ticking = false;
  });
}
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", onScroll);
onScroll();

// 滚动到才出现
const io = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.classList.add("in");
    io.unobserve(e.target);
    if (e.target.classList.contains("tiles")) setTimeout(() => e.target.classList.add("settled"), 1600);
  }
}, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
document.querySelectorAll(".reveal").forEach(el => io.observe(el));

// 导航高亮当前区块
const links = new Map([...document.querySelectorAll(".links a")].map(a => [a.dataset.sec, a]));
const spy = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    links.forEach(a => a.classList.remove("active"));
    const id = e.target.id === "upload" && innerWidth > 860 ? "day" : e.target.id;
    links.get(id)?.classList.add("active");
  }
}, { rootMargin: "-45% 0px -50% 0px" });
["top", "board", "day", "upload"].forEach(id => { const el = document.getElementById(id); if (el) spy.observe(el); });

// 猫眼跟着鼠标
const pupils = [...document.querySelectorAll(".eye i")];
const cat = document.getElementById("cat");
if (!reduce && cat && matchMedia("(pointer: fine)").matches) {
  addEventListener("pointermove", ev => {
    const r = cat.getBoundingClientRect();
    if (r.bottom < 0) return;
    const dx = (ev.clientX - (r.left + r.width / 2)) / innerWidth;
    const dy = (ev.clientY - (r.top + r.height / 2)) / innerHeight;
    for (const p of pupils) p.style.transform = `translate(${Math.max(-1, Math.min(1, dx * 2)) * 70}%,${Math.max(-1, Math.min(1, dy * 2)) * 60}%)`;
  }, { passive: true });
}
