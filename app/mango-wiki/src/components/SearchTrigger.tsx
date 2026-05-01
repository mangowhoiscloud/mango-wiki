"use client";

import { useEffect, useState } from "react";

export function SearchTrigger() {
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/mac/i.test(navigator.platform));
  }, []);
  const open = () => {
    window.dispatchEvent(new CustomEvent("kiki-wiki:open-search"));
  };
  return (
    <button type="button" className="sidebar__search" onClick={open}>
      <svg
        className="sidebar__search-icon"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <span className="sidebar__search-placeholder">Search the wiki…</span>
      <kbd className="sidebar__search-kbd">{isMac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}
