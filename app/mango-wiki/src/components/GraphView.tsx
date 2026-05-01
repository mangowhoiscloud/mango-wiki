"use client";

// In-app knowledge graph view. Force-directed layout in pure JS — small
// inline simulation (Velocity-Verlet + repulsion + spring + centring) so we
// don't pull in d3-force just for this. Renders to SVG with hover + click +
// drag. No persisted positions; layout converges in ~300 iterations.
//
// Mirrors the data model of the kiki-appmaker `wiki-export` skill: nodes
// have id/label/category/community/degree, edges are undirected wikilinks.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Graph, GraphNode, GraphLink } from "../lib/graph";

interface SimNode extends GraphNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean;
}

interface SimLink {
  source: SimNode;
  target: SimNode;
}

const COLORS = [
  "#2c7bb6", "#d7191c", "#ff7f00", "#33a02c", "#6a3d9a",
  "#b15928", "#1f78b4", "#e31a1c", "#fdbf6f", "#cab2d6",
];

function colorFor(node: SimNode): string {
  if (node.community < 0) return "#888";
  return COLORS[node.community % COLORS.length];
}

function radiusFor(node: SimNode): number {
  return 4 + Math.min(8, Math.sqrt(node.inDegree + node.outDegree) * 2);
}

export function GraphView({ graph }: { graph: Graph }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [tick, setTick] = useState(0);

  const { simNodes, simLinks } = useMemo(() => {
    const cx = 500;
    const cy = 350;
    const ns: SimNode[] = graph.nodes.map((n, i) => {
      const a = (i / graph.nodes.length) * 2 * Math.PI;
      return {
        ...n,
        x: cx + Math.cos(a) * 200,
        y: cy + Math.sin(a) * 200,
        vx: 0,
        vy: 0,
        fixed: false,
      };
    });
    const idx = new Map(ns.map((n) => [n.id, n]));
    const ls: SimLink[] = [];
    for (const l of graph.links) {
      const s = idx.get(l.source);
      const t = idx.get(l.target);
      if (s && t) ls.push({ source: s, target: t });
    }
    return { simNodes: ns, simLinks: ls };
  }, [graph]);

  // Force simulation loop. Step until cooled, then idle (re-run on filter
  // changes by re-mounting via key).
  useEffect(() => {
    let frame = 0;
    let alpha = 1.0;
    const iterate = () => {
      // Repulsion (Barnes-Hut would be overkill for ~100 nodes — n^2 fine).
      const k = 1500;
      for (const a of simNodes) {
        for (const b of simNodes) {
          if (a === b) continue;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy + 0.1;
          const f = (k / d2) * alpha;
          a.vx += (dx / Math.sqrt(d2)) * f;
          a.vy += (dy / Math.sqrt(d2)) * f;
        }
      }
      // Spring along links.
      for (const l of simLinks) {
        const dx = l.target.x - l.source.x;
        const dy = l.target.y - l.source.y;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.1;
        const f = (d - 80) * 0.05 * alpha;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        l.source.vx += fx;
        l.source.vy += fy;
        l.target.vx -= fx;
        l.target.vy -= fy;
      }
      // Centring.
      for (const n of simNodes) {
        n.vx += (500 - n.x) * 0.005 * alpha;
        n.vy += (350 - n.y) * 0.005 * alpha;
      }
      // Velocity-Verlet integration with friction.
      for (const n of simNodes) {
        if (n.fixed) {
          n.vx = 0;
          n.vy = 0;
          continue;
        }
        n.vx *= 0.85;
        n.vy *= 0.85;
        n.x += n.vx;
        n.y += n.vy;
      }
      alpha *= 0.99;
      setTick((t) => t + 1);
      if (alpha > 0.01 && frame < 600) {
        frame++;
        requestAnimationFrame(iterate);
      }
    };
    requestAnimationFrame(iterate);
    // intentionally empty cleanup; alpha cap halts the loop
  }, [simNodes, simLinks]);

  const filtered = filter.trim().toLowerCase();
  const matchesFilter = (n: SimNode) =>
    !filtered ||
    n.id.includes(filtered) ||
    n.label.toLowerCase().includes(filtered) ||
    n.tags.some((t) => t.toLowerCase().includes(filtered));

  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent, id: string) => {
    const node = simNodes.find((n) => n.id === id);
    if (!node) return;
    node.fixed = true;
    const pt = clientToSvg(svgRef.current!, e.clientX, e.clientY);
    dragRef.current = { id, offsetX: pt.x - node.x, offsetY: pt.y - node.y };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const node = simNodes.find((n) => n.id === dragRef.current!.id);
    if (!node) return;
    const pt = clientToSvg(svgRef.current!, e.clientX, e.clientY);
    node.x = pt.x - dragRef.current.offsetX;
    node.y = pt.y - dragRef.current.offsetY;
    setTick((t) => t + 1);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const node = simNodes.find((n) => n.id === dragRef.current!.id);
    if (node) node.fixed = false;
    dragRef.current = null;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };

  return (
    <div className="graph-view">
      <header className="graph-view__header">
        <h1>Knowledge graph</h1>
        <p>
          {graph.meta.totalNodes} pages · {graph.meta.totalEdges} links · drag
          nodes · click to open · hover to highlight
        </p>
        <input
          type="search"
          placeholder="filter by id / title / tag"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="graph-view__filter"
        />
      </header>
      <svg
        ref={svgRef}
        viewBox="0 0 1000 700"
        className="graph-view__svg"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <g className="links">
          {simLinks.map((l, i) => {
            const dim =
              filtered &&
              !matchesFilter(l.source) &&
              !matchesFilter(l.target);
            const hi =
              hovered &&
              (l.source.id === hovered || l.target.id === hovered);
            return (
              <line
                key={i}
                x1={l.source.x}
                y1={l.source.y}
                x2={l.target.x}
                y2={l.target.y}
                stroke={hi ? "#000" : "#bbb"}
                strokeOpacity={dim ? 0.05 : hi ? 0.9 : 0.35}
                strokeWidth={hi ? 1.5 : 0.7}
              />
            );
          })}
        </g>
        <g className="nodes">
          {simNodes.map((n) => {
            const dim = filtered && !matchesFilter(n);
            const hi = hovered === n.id;
            const r = radiusFor(n);
            return (
              <g
                key={n.id}
                transform={`translate(${n.x},${n.y})`}
                onPointerDown={(e) => onPointerDown(e, n.id)}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
                opacity={dim ? 0.15 : 1}
                style={{ cursor: "pointer" }}
              >
                <Link href={`/wiki/${n.id}`}>
                  <circle
                    r={r}
                    fill={colorFor(n)}
                    stroke={hi ? "#000" : "#fff"}
                    strokeWidth={hi ? 2 : 1}
                  />
                  {(hi || r > 8) && (
                    <text
                      x={r + 4}
                      y={3}
                      fontSize={hi ? 12 : 10}
                      fill="#222"
                      style={{ pointerEvents: "none" }}
                    >
                      {n.label}
                    </text>
                  )}
                </Link>
              </g>
            );
          })}
        </g>
      </svg>
      <aside className="graph-view__legend">
        <h3>Communities (top {Math.min(graph.meta.communities.length, 8)})</h3>
        <ul>
          {graph.meta.communities.slice(0, 8).map((c) => (
            <li key={c.id}>
              <span
                className="graph-view__swatch"
                style={{ background: COLORS[c.id % COLORS.length] }}
              />
              {c.tag} <small>({c.size})</small>
            </li>
          ))}
        </ul>
      </aside>
      {/* tick is wired to setState; consume it to silence unused var */}
      <span data-tick={tick} hidden />
    </div>
  );
}

function clientToSvg(svg: SVGSVGElement, cx: number, cy: number) {
  const pt = svg.createSVGPoint();
  pt.x = cx;
  pt.y = cy;
  return pt.matrixTransform(svg.getScreenCTM()!.inverse());
}
