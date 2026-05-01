"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    setTheme(attr === "dark" ? "dark" : "light");
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("mango-theme", next);
    } catch {
      /* ignore */
    }
  };

  return (
    <button className="theme-toggle" onClick={toggle} aria-label="Toggle color theme">
      {theme === "dark" ? "☀ light" : "☾ dark"}
    </button>
  );
}
