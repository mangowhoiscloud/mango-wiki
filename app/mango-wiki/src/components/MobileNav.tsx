"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open) document.body.classList.add("no-scroll");
    else document.body.classList.remove("no-scroll");
    return () => document.body.classList.remove("no-scroll");
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const openSearch = () => {
    window.dispatchEvent(new CustomEvent("kiki-wiki:open-search"));
  };

  return (
    <>
      <div className="mobile-nav-bar">
        <button
          type="button"
          className="mobile-nav-bar__hamb"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <Link href="/" className="mobile-nav-bar__brand">mango·wiki</Link>
        <button type="button" className="mobile-nav-bar__search" onClick={openSearch}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          Search…
        </button>
      </div>
      <div
        className={`mobile-drawer-backdrop${open ? " mobile-drawer-backdrop--open" : ""}`}
        onClick={() => setOpen(false)}
      />
      <aside className={`mobile-drawer${open ? " mobile-drawer--open" : ""}`} onClick={() => setOpen(false)}>
        {children}
      </aside>
    </>
  );
}
