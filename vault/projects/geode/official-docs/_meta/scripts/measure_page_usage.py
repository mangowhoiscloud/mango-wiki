"""measure_page_usage.py — 페이지별 priority score 산출.

3 신호 합성:
  - trace_hits_30d  (LangSmith) — w1=0.6  ← v0.65.0에서는 stub (user API key 필요)
  - git_commits_30d (mango-wiki repo) — w2=0.3
  - cross_link_count (wiki 내부 [[link]]) — w3=0.1

산출: _meta/page-priority.json (top/bottom listing 포함)

용법:
    python measure_page_usage.py                  # full run, output to _meta/page-priority.json
    python measure_page_usage.py --print-top 10   # 추가로 stdout에 top 10 출력
    python measure_page_usage.py --partial        # LangSmith skip, git+xlink만 (default)
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

DOCS_ROOT = Path(__file__).resolve().parents[2]
META_DIR = DOCS_ROOT / "_meta"
WIKI_REPO = Path("/Users/mango/workspace/mango-wiki")

WEIGHT_TRACE = 0.6
WEIGHT_GIT = 0.3
WEIGHT_XLINK = 0.1


def list_pages() -> list[Path]:
    version_dirs = [d for d in DOCS_ROOT.iterdir() if d.is_dir() and d.name.startswith("v")]
    pages: list[Path] = []
    for vd in version_dirs:
        pages.extend(vd.rglob("*.md"))
    return sorted(pages)


def git_commits_30d(rel_path: str) -> int:
    """mango-wiki 레포에서 해당 페이지의 30일 내 커밋 수."""
    try:
        out = subprocess.check_output(
            ["git", "log", "--oneline", "--since=30.days.ago", "--", rel_path],
            cwd=WIKI_REPO,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=10,
        )
        return len([l for l in out.splitlines() if l.strip()])
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        return 0


def cross_link_count(target_page: Path, all_pages: list[Path]) -> int:
    """다른 wiki 페이지가 target_page를 [[...]] 로 인용한 횟수."""
    # 페이지 이름 = 파일 stem (확장자 제외)
    stem = target_page.stem
    count = 0
    for p in all_pages:
        if p == target_page:
            continue
        try:
            text = p.read_text()
        except (OSError, UnicodeDecodeError):
            continue
        # [[stem]] 또는 [[stem|text]] 또는 [[path/to/stem]]
        if re.search(rf"\[\[(?:[^\]]+/)?{re.escape(stem)}(?:\|[^\]]+)?\]\]", text):
            count += 1
    return count


def trace_hits_30d(page: Path) -> int:
    """LangSmith trace 빈도 — v0.65.0 stub. user의 LANGSMITH_API_KEY 필요."""
    api_key = os.environ.get("LANGSMITH_API_KEY")
    if not api_key:
        return -1   # signal "not measured"
    # TODO: implement langsmith client query.
    # 의사 구현:
    #   from langsmith import Client
    #   client = Client()
    #   # page의 frontmatter code_refs 에서 모듈 path 추출
    #   # client.list_runs(filter='contains(metadata.code_path, "<module>")', start_time=30d_ago)
    #   # 반환된 run count = trace_hits
    return 0


def normalize(values: dict[Path, int]) -> dict[Path, float]:
    if not values:
        return {}
    valid = [v for v in values.values() if v >= 0]
    if not valid:
        return {p: 0.0 for p in values}
    max_v = max(valid)
    if max_v == 0:
        return {p: 0.0 for p in values}
    return {p: (v / max_v if v >= 0 else 0.0) for p, v in values.items()}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--print-top", type=int, default=0)
    parser.add_argument("--partial", action="store_true",
                        help="LangSmith skip (default if no API key)")
    args = parser.parse_args()

    pages = list_pages()
    print(f"Measuring {len(pages)} pages...")

    git_counts: dict[Path, int] = {}
    xlink_counts: dict[Path, int] = {}
    trace_counts: dict[Path, int] = {}

    for p in pages:
        rel = str(p.relative_to(WIKI_REPO))
        git_counts[p] = git_commits_30d(rel)
        xlink_counts[p] = cross_link_count(p, pages)
        trace_counts[p] = trace_hits_30d(p)

    # Normalize
    git_norm = normalize(git_counts)
    xlink_norm = normalize(xlink_counts)
    trace_norm = normalize(trace_counts) if not args.partial else {p: 0.0 for p in pages}

    # Combine
    page_data: list[dict] = []
    for p in pages:
        score = (
            WEIGHT_TRACE * trace_norm.get(p, 0.0)
            + WEIGHT_GIT * git_norm.get(p, 0.0)
            + WEIGHT_XLINK * xlink_norm.get(p, 0.0)
        )
        page_data.append({
            "path": str(p.relative_to(DOCS_ROOT)),
            "priority": round(score, 4),
            "trace_hits_30d": trace_counts[p] if trace_counts[p] >= 0 else None,
            "git_commits_30d": git_counts[p],
            "cross_link_count": xlink_counts[p],
        })

    # Rank
    page_data.sort(key=lambda x: x["priority"], reverse=True)
    for i, d in enumerate(page_data):
        d["rank"] = i + 1

    # Output
    output = {
        "computed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "weights": {
            "trace_hits": WEIGHT_TRACE,
            "git_commits": WEIGHT_GIT,
            "cross_links": WEIGHT_XLINK,
        },
        "trace_hits_measured": not args.partial and any(c >= 0 for c in trace_counts.values()),
        "page_count": len(pages),
        "pages": page_data,
    }
    out_path = META_DIR / "page-priority.json"
    out_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    print(f"\nWrote {out_path}")

    if args.print_top > 0:
        n = min(args.print_top, len(page_data))
        print(f"\n=== Top {n} ===")
        for d in page_data[:n]:
            print(f"  {d['rank']:2d}. {d['path']}")
            print(f"      priority={d['priority']:.3f} | git={d['git_commits_30d']} | xlink={d['cross_link_count']} | trace={d['trace_hits_30d']}")

        print(f"\n=== Bottom {n} ===")
        for d in page_data[-n:]:
            print(f"  {d['rank']:2d}. {d['path']}")
            print(f"      priority={d['priority']:.3f} | git={d['git_commits_30d']} | xlink={d['cross_link_count']} | trace={d['trace_hits_30d']}")

    return 0


if __name__ == "__main__":
    sys.exit(main())
