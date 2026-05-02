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


_TRACE_HITS_CACHE: dict[Path, int] | None = None


def _load_trace_mapping() -> dict:
    """_meta/trace-page-mapping.yml 단순 로드."""
    p = META_DIR / "trace-page-mapping.yml"
    if not p.exists():
        return {}
    text = p.read_text()
    out: dict = {
        "exact_tool_name": {},
        "tool_prefix": {},
        "run_name_prefix": {},
        "metadata_match": [],
        "projects": [],
    }
    section = None
    pending_meta: dict = {}
    for line in text.splitlines():
        if line.startswith("#") or not line.strip():
            continue
        # top-level keys
        if not line.startswith(" "):
            k = line.rstrip(":").strip()
            if k in out:
                section = k
                continue
            else:
                section = None
                continue
        # values inside section
        if section in ("exact_tool_name", "tool_prefix", "run_name_prefix"):
            stripped = line.strip()
            if ":" in stripped:
                k, _, v = stripped.partition(":")
                out[section][k.strip().strip('"')] = v.strip().strip('"')
        elif section == "projects":
            stripped = line.strip()
            if stripped.startswith("- "):
                out["projects"].append(stripped[2:].strip())
        elif section == "metadata_match":
            stripped = line.strip()
            if stripped.startswith("- key:"):
                if pending_meta:
                    out["metadata_match"].append(pending_meta)
                pending_meta = {"key": stripped[6:].strip()}
            elif stripped.startswith("value:"):
                pending_meta["value"] = stripped[6:].strip().strip('"')
            elif stripped.startswith("page:"):
                pending_meta["page"] = stripped[5:].strip()
    if pending_meta:
        out["metadata_match"].append(pending_meta)
    return out


def _query_langsmith_runs(api_key: str, project: str, days: int = 30) -> list[dict]:
    """langsmith client 로 최근 N일 trace 수집. 실패 시 [].

    안전 장치: 너무 많은 trace 가져오지 않도록 limit=1000.
    """
    try:
        from langsmith import Client
    except ImportError:
        return []
    try:
        client = Client(api_key=api_key)
        from datetime import datetime, timezone, timedelta
        start = datetime.now(timezone.utc) - timedelta(days=days)
        # langsmith API 단일 요청 limit=100. client iterator가 자동 pagination.
        # 안전 장치: 최대 5000 (50 페이지) 까지 — 그 이상은 분석 비용/시간 증가.
        runs: list = []
        for i, run in enumerate(client.list_runs(
            project_name=project,
            start_time=start,
            limit=100,
        )):
            runs.append(run)
            if i + 1 >= 5000:
                print(f"  [langsmith] truncating at 5000 runs (project={project!r})", file=sys.stderr)
                break
        return runs
    except Exception as e:
        print(f"  [langsmith] query failed for project={project!r}: {e}", file=sys.stderr)
        return []


def _classify_run_to_pages(run, mapping: dict) -> list[Path]:
    """run을 mapping config 따라 wiki page에 매칭. tool_use 블록당 별도 hit.

    한 LLM 응답에 여러 tool_use 블록이 있으면 페이지별로 *각각* count.
    이는 정확한 사용 신호 — 한 turn에 web_fetch 3번 호출하면 protocol.md 3 hit.
    """
    name = getattr(run, "name", "") or ""
    extra = getattr(run, "extra", {}) or {}
    metadata = extra.get("metadata", {}) if isinstance(extra, dict) else {}

    pages: list[Path] = []

    # 1. tool_use blocks in outputs (가장 강한 신호)
    out = getattr(run, "outputs", None) or {}
    raw_output = out.get("output") if isinstance(out, dict) else None
    if isinstance(raw_output, dict):
        content = raw_output.get("content")
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "tool_use":
                    tool_name = block.get("name", "")
                    if tool_name in mapping.get("exact_tool_name", {}):
                        pages.append(Path(mapping["exact_tool_name"][tool_name]))
                        continue
                    for pfx, page in mapping.get("tool_prefix", {}).items():
                        if tool_name.startswith(pfx):
                            pages.append(Path(page))
                            break
        # 모델 ID → provider page
        model = raw_output.get("model")
        if isinstance(model, str) and model:
            # heuristic: claude-* → anthropic, gpt-* → openai-*, glm-* → glm
            ml = model.lower()
            if ml.startswith("claude"):
                pages.append(Path("03-runtime/llm/providers/anthropic.md"))
            elif "codex" in ml or "gpt-5" in ml:
                pages.append(Path("03-runtime/llm/providers/openai-codex.md"))
            elif ml.startswith("glm"):
                pages.append(Path("03-runtime/llm/providers/glm.md"))

    # 2. run name (exact 또는 prefix)
    if name in mapping.get("exact_tool_name", {}):
        pages.append(Path(mapping["exact_tool_name"][name]))
    for pfx, page in mapping.get("tool_prefix", {}).items():
        if name.startswith(pfx):
            pages.append(Path(page))
    for pfx, page in mapping.get("run_name_prefix", {}).items():
        if name.startswith(pfx):
            pages.append(Path(page))

    # 3. AgenticLoop level — agentic-loop page 가산
    if name.startswith("AgenticLoop"):
        pages.append(Path("02-architecture/agentic-loop.md"))
        if name == "AgenticLoop._call_llm":
            pages.append(Path("03-runtime/llm/prompt-system.md"))

    # 4. metadata_match
    for rule in mapping.get("metadata_match", []):
        k, v, page = rule.get("key"), rule.get("value"), rule.get("page")
        if k and metadata.get(k) == v:
            pages.append(Path(page))

    return pages


def _build_trace_hits_index(pages: list[Path]) -> dict[Path, int]:
    """LangSmith trace 30일 누적 → 페이지별 hit count."""
    api_key = os.environ.get("LANGSMITH_API_KEY") or os.environ.get("LANGCHAIN_API_KEY")
    if not api_key:
        return {p: -1 for p in pages}

    mapping = _load_trace_mapping()
    if not mapping or not mapping.get("projects"):
        return {p: -1 for p in pages}

    counts: dict[Path, int] = {p: 0 for p in pages}
    page_index: dict[str, Path] = {}
    for p in pages:
        # 매핑 페이지 path 는 v<version>/ prefix 없는 상대 path
        rel = "/".join(p.relative_to(DOCS_ROOT).parts[1:])  # strip "v0.65.0/"
        page_index[rel] = p

    for project in mapping["projects"]:
        runs = _query_langsmith_runs(api_key, project, days=30)
        for run in runs:
            targets = _classify_run_to_pages(run, mapping)
            for target in targets:
                real_page = page_index.get(str(target))
                if real_page is not None:
                    counts[real_page] += 1
    return counts


def trace_hits_30d(page: Path) -> int:
    """LangSmith trace 빈도. _build_trace_hits_index 결과 캐시."""
    global _TRACE_HITS_CACHE
    if _TRACE_HITS_CACHE is None:
        return -1   # 호출 순서 보호 — main()에서 prefetch 필요
    return _TRACE_HITS_CACHE.get(page, 0)


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

    # Prefetch trace hits index (single LangSmith query, batch all pages)
    global _TRACE_HITS_CACHE
    if not args.partial:
        print("Querying LangSmith for last 30d trace data...")
        _TRACE_HITS_CACHE = _build_trace_hits_index(pages)
        measured = sum(1 for v in _TRACE_HITS_CACHE.values() if v >= 0)
        if measured == 0:
            print("  (no trace data — check LANGSMITH_API_KEY env var or project name)")
    else:
        _TRACE_HITS_CACHE = {p: -1 for p in pages}

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
