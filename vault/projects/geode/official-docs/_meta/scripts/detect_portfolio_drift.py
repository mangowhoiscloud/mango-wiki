"""detect_portfolio_drift.py — wiki ↔ portfolio TSX drift 검출.

매 minor 릴리스 prep 시점 또는 CI에서 실행.

검사:
  1. 메트릭 drift — portfolio page.tsx 헤더의 (version, tests, hooks, tools)
     값이 wiki/_meta/version.json + 코드 측정과 일치하는가
  2. 1:1 매핑 페이지 mtime drift — wiki .md가 portfolio .tsx보다 더 최근에
     수정됐는가 (wiki forward, portfolio stale 신호)
  3. wiki-only 페이지 — portfolio에 *없는데* portfolio_mapping.yml에서
     "추가 검토 권장" 표시된 페이지 listing

용법:
    python detect_portfolio_drift.py [--strict]
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

DOCS_ROOT = Path(__file__).resolve().parents[2]
WIKI_VERSION_DIR = DOCS_ROOT / "v0.65.0"
META_DIR = DOCS_ROOT / "_meta"
PORTFOLIO_DOCS = Path("/Users/mango/workspace/portfolio/src/app/geode/docs")
GEODE_REPO = Path("/Users/mango/workspace/geode")


def read_yaml_simple(path: Path) -> dict:
    """source-map / portfolio-mapping을 위한 미니 YAML 파서. 외부 의존성 회피."""
    if not path.exists():
        return {}
    text = path.read_text()
    out: dict = {"mappings": []}
    cur: dict = {}
    in_mappings = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("#") or not stripped:
            continue
        if stripped == "mappings:":
            in_mappings = True
            continue
        if in_mappings:
            if line.startswith("  - "):
                if cur:
                    out["mappings"].append(cur)
                cur = {}
                kv = stripped[2:]  # remove "- "
                if ":" in kv:
                    k, _, v = kv.partition(":")
                    cur[k.strip()] = v.strip().strip('"')
            elif line.startswith("    "):
                kv = stripped
                if ":" in kv:
                    k, _, v = kv.partition(":")
                    cur[k.strip()] = v.strip().strip('"')
        else:
            if ":" in stripped:
                k, _, v = stripped.partition(":")
                if v.strip():
                    out[k.strip()] = v.strip().strip('"')
    if cur:
        out["mappings"].append(cur)
    return out


def measure_geode_metrics() -> dict:
    """현재 코드베이스에서 메트릭 측정."""
    pyproject = (GEODE_REPO / "pyproject.toml").read_text()
    version_match = re.search(r'^version\s*=\s*"([^"]+)"', pyproject, re.M)
    version = version_match.group(1) if version_match else "unknown"

    core_count = sum(1 for _ in (GEODE_REPO / "core").rglob("*.py"))
    plugins_count = sum(1 for _ in (GEODE_REPO / "plugins").rglob("*.py"))

    # Hook event count from enum
    hooks_path = GEODE_REPO / "core" / "hooks" / "system.py"
    hook_count = 0
    if hooks_path.exists():
        text = hooks_path.read_text()
        # HookEvent enum 시작점부터 다음 class/def 또는 EOF 까지의 블록
        m = re.search(r"class HookEvent\(.*?\):\s*\n((?:.|\n)*?)(?=\n(?:class\s|def\s|\S))", text)
        if m:
            hook_count = len(re.findall(r'^\s+[A-Z_]+\s*=\s*"', m.group(1), re.M))

    # Tools count from definitions.json
    tools_path = GEODE_REPO / "core" / "tools" / "definitions.json"
    tools_count = 0
    if tools_path.exists():
        try:
            data = json.loads(tools_path.read_text())
            tools_count = len(data) if isinstance(data, list) else 0
        except json.JSONDecodeError:
            pass

    # Tests count via pytest collect-only (cached for performance — skip if user disables)
    tests_count = "?"
    try:
        out = subprocess.check_output(
            ["uv", "run", "pytest", "tests/", "-m", "not live", "--collect-only", "-q"],
            cwd=GEODE_REPO,
            stderr=subprocess.DEVNULL,
            text=True,
            timeout=60,
        )
        m = re.search(r"(\d+)\s+tests collected", out)
        if m:
            tests_count = m.group(1)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired, FileNotFoundError):
        pass

    return {
        "version": version,
        "core": core_count,
        "plugins": plugins_count,
        "hooks": hook_count,
        "tools": tools_count,
        "tests": tests_count,
    }


def parse_portfolio_metrics() -> dict:
    """portfolio page.tsx 헤더에서 현재 표시 중인 메트릭 추출."""
    page = PORTFOLIO_DOCS / "page.tsx"
    if not page.exists():
        return {}
    text = page.read_text()
    summary_match = re.search(r'summary="([^"]+)"', text)
    if not summary_match:
        return {}
    summary = summary_match.group(1)
    metrics: dict = {}
    for label, key, pat in [
        ("version", "version", r"v(\d+\.\d+\.\d+)"),
        ("core", "core", r"(\d+)\s*core"),
        ("plugins", "plugins", r"\+\s*(\d+)\s*plugins"),
        ("tests", "tests", r"(\d+)\s*tests"),
        ("hooks", "hooks", r"(\d+)\s*hooks"),
        ("tools", "tools", r"(\d+)\s*tools"),
    ]:
        m = re.search(pat, summary)
        if m:
            metrics[key] = m.group(1)
    return metrics


def check_metric_drift(actual: dict, portfolio: dict) -> list[tuple[str, str, str]]:
    """반환: [(metric, actual, portfolio)]"""
    drifts = []
    for k in ("version", "core", "plugins", "tests", "hooks", "tools"):
        a = str(actual.get(k, "?"))
        p = str(portfolio.get(k, "?"))
        # tests는 대략 일치하면 OK (4380 ≈ 4379 → drift 표시)
        if a != p and not (a == "?" or p == "?"):
            drifts.append((k, a, p))
    return drifts


def check_mapping_mtime_drift(mappings: list[dict]) -> list[dict]:
    """1:1 매핑 페이지 중 wiki .md > portfolio .tsx mtime인 항목."""
    drifts = []
    for m in mappings:
        if m.get("mode") != "1:1":
            continue
        wiki_path = WIKI_VERSION_DIR / m.get("wiki", "").replace("v0.65.0/", "")
        portfolio_rel = m.get("portfolio") or ""
        if portfolio_rel == "null" or not portfolio_rel:
            continue
        portfolio_path = PORTFOLIO_DOCS / portfolio_rel
        if not wiki_path.exists() or not portfolio_path.exists():
            continue
        wiki_mtime = wiki_path.stat().st_mtime
        portfolio_mtime = portfolio_path.stat().st_mtime
        if wiki_mtime > portfolio_mtime + 60:  # 1분 이상 차이
            drifts.append({
                "wiki": str(wiki_path.relative_to(DOCS_ROOT)),
                "portfolio": str(portfolio_path.relative_to(PORTFOLIO_DOCS)),
                "wiki_newer_by_seconds": int(wiki_mtime - portfolio_mtime),
            })
    return drifts


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true",
                        help="exit nonzero on any drift")
    args = parser.parse_args()

    print("=" * 60)
    print("Portfolio Drift Detector")
    print("=" * 60)

    # 1. Metric drift
    actual = measure_geode_metrics()
    portfolio = parse_portfolio_metrics()
    metric_drifts = check_metric_drift(actual, portfolio)

    print("\n[1] Metric Drift (page.tsx 헤더)")
    print(f"  Actual    : {actual}")
    print(f"  Portfolio : {portfolio}")
    if metric_drifts:
        for k, a, p in metric_drifts:
            print(f"  ⚠ {k}: actual={a}, portfolio={p}")
    else:
        print("  ✓ 모든 메트릭 일치")

    # 2. mtime drift
    mapping = read_yaml_simple(META_DIR / "portfolio-mapping.yml")
    mtime_drifts = check_mapping_mtime_drift(mapping.get("mappings", []))

    print(f"\n[2] mtime Drift (1:1 매핑 페이지, wiki > portfolio + 60s)")
    if mtime_drifts:
        for d in mtime_drifts:
            print(f"  ⚠ {d['wiki']} → {d['portfolio']}")
            print(f"    wiki newer by {d['wiki_newer_by_seconds']}s")
    else:
        print("  ✓ 1:1 매핑 모두 portfolio가 최신 또는 동기")

    # 3. wiki-only with "검토 권장" notes
    print(f"\n[3] Portfolio 추가 검토 권장 (wiki-only 중)")
    review_candidates = [
        m for m in mapping.get("mappings", [])
        if m.get("mode") == "wiki-only"
        and "권장" in str(m.get("notes", ""))
    ]
    if review_candidates:
        for m in review_candidates:
            print(f"  • {m['wiki']}")
            print(f"    {m['notes']}")
    else:
        print("  (없음)")

    total = len(metric_drifts) + len(mtime_drifts)
    print(f"\n=== Summary ===")
    print(f"Metric drifts : {len(metric_drifts)}")
    print(f"mtime drifts  : {len(mtime_drifts)}")
    print(f"Review hints  : {len(review_candidates)}")
    print(f"Total drift   : {total}")

    return 1 if (args.strict and total > 0) else 0


if __name__ == "__main__":
    sys.exit(main())
