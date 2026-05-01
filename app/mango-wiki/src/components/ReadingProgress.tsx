"use client";

import { useEffect, useState } from "react";

export function ReadingProgress() {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    let raf = 0;
    function update() {
      const h = document.documentElement;
      const scrolled = h.scrollTop || document.body.scrollTop;
      const height = h.scrollHeight - h.clientHeight;
      const p = height > 0 ? Math.min(100, (scrolled / height) * 100) : 0;
      setPct(p);
      raf = 0;
    }
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(update);
    }
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return <div className="reading-progress" style={{ width: `${pct}%` }} aria-hidden="true" />;
}
