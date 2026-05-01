"use client";

import { useEffect, useRef, useState } from "react";

interface Hover {
  title: string;
  cat: string;
  summary: string;
  x: number;
  y: number;
}

const DELAY_SHOW = 380;
const DELAY_HIDE = 120;

export function HoverTransclude() {
  const [h, setH] = useState<Hover | null>(null);
  const [visible, setVisible] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const enterTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);

  useEffect(() => {
    function isWikilink(target: EventTarget | null): HTMLElement | null {
      if (!(target instanceof HTMLElement)) return null;
      const el = target.closest("[data-wikilink]") as HTMLElement | null;
      return el;
    }

    function showFor(el: HTMLElement) {
      const rect = el.getBoundingClientRect();
      const title = el.dataset.wikilinkTitle ?? el.textContent ?? "";
      const cat = el.dataset.wikilinkCat ?? "";
      const summary = el.dataset.wikilinkSummary ?? "";
      const x = rect.left + window.scrollX;
      const y = rect.bottom + window.scrollY + 6;
      setH({ title, cat, summary, x, y });
      requestAnimationFrame(() => setVisible(true));
    }

    function hide() {
      setVisible(false);
      window.setTimeout(() => setH(null), 220);
    }

    function onOver(e: MouseEvent) {
      const el = isWikilink(e.target);
      if (!el) return;
      if (leaveTimer.current) {
        window.clearTimeout(leaveTimer.current);
        leaveTimer.current = null;
      }
      if (enterTimer.current) window.clearTimeout(enterTimer.current);
      enterTimer.current = window.setTimeout(() => showFor(el), DELAY_SHOW);
    }

    function onOut(e: MouseEvent) {
      const el = isWikilink(e.target);
      if (!el) return;
      if (enterTimer.current) {
        window.clearTimeout(enterTimer.current);
        enterTimer.current = null;
      }
      leaveTimer.current = window.setTimeout(hide, DELAY_HIDE);
    }

    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      if (enterTimer.current) window.clearTimeout(enterTimer.current);
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
    };
  }, []);

  if (!h) return null;
  const maxX = (typeof window !== "undefined" ? window.innerWidth : 1200) - 380;
  const leftPx = Math.min(h.x, Math.max(16, maxX));
  return (
    <div
      ref={cardRef}
      className={`hover-card${visible ? " hover-card--visible" : ""}`}
      style={{ left: `${leftPx}px`, top: `${h.y}px` }}
      role="tooltip"
    >
      <div className="hover-card__cat">{h.cat}</div>
      <div className="hover-card__title">{h.title}</div>
      {h.summary ? <div className="hover-card__summary">{h.summary}</div> : null}
    </div>
  );
}
