"""bump_minor.py — wiki 디렉터리를 새 minor 버전으로 복사 + grounding 재검증 후보 마킹.

전제:
- 이전 버전(예: v0.65.0)이 frozen 직전 상태
- 새 minor 릴리스(예: v0.66.0)가 main에 머지됨
- pyproject.toml.version 이 신 버전으로 갱신됨

수행:
1. cp -r v<prev>/ v<next>/
2. _meta/version.json 의 current 갱신, supported 추가
3. v<next>/ 모든 페이지 frontmatter:
   - geode_version 갱신
   - last_grounded "STALE" 마킹 (실제 갱신 작업이 필요함을 명시)
4. CHANGELOG diff 분석 — 영향받는 페이지 후보 listing
5. v<prev>/ 는 frozen 으로 표시 (archive 이동은 사용자 결정)

용법:
    python bump_minor.py --next 0.66.0 [--prev 0.65.0]

Default --prev: version.json.current 자동 추출.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

DOCS_ROOT = Path(__file__).resolve().parents[2]
META_DIR = DOCS_ROOT / "_meta"
GEODE_REPO = Path("/Users/mango/workspace/geode")


def current_version() -> str:
    vj = META_DIR / "version.json"
    if vj.exists():
        return json.loads(vj.read_text()).get("current", "")
    return ""


def update_frontmatter(path: Path, next_version: str) -> bool:
    """페이지 frontmatter의 geode_version + last_grounded 갱신. 변경 시 True."""
    text = path.read_text()
    if not text.startswith("---\n"):
        return False
    end = text.find("\n---\n", 4)
    if end == -1:
        return False
    fm = text[4:end]
    body = text[end:]

    fm = re.sub(
        r"^geode_version:.*$",
        f"geode_version: {next_version}",
        fm,
        flags=re.M,
    )
    fm = re.sub(
        r"^last_grounded:.*$",
        f"last_grounded: STALE-bump-from-prev",
        fm,
        flags=re.M,
    )
    fm = re.sub(
        r"^status:.*$",
        f"status: needs-regrounding",
        fm,
        flags=re.M,
    )

    new_text = f"---\n{fm}{body}"
    if new_text != text:
        path.write_text(new_text)
        return True
    return False


def changelog_impact_candidates(prev_version: str) -> list[str]:
    """CHANGELOG에서 prev 이후 변경된 영역 → 영향 페이지 후보 추정."""
    changelog = GEODE_REPO / "CHANGELOG.md"
    if not changelog.exists():
        return []
    text = changelog.read_text()
    # prev_version 이후 entry 추출 (간단: [Unreleased] + [버전들] 첫 매치까지)
    impact_keywords: dict[str, str] = {
        "auth": "03-runtime/auth/",
        "login": "03-runtime/auth/",
        "manage_login": "04-harness/cli/manage-login.md",
        "anthropic": "03-runtime/llm/providers/anthropic.md",
        "openai-codex": "03-runtime/llm/providers/openai-codex.md",
        "codex": "03-runtime/llm/providers/openai-codex.md",
        "glm": "03-runtime/llm/providers/glm.md",
        "cache_control": "03-runtime/llm/prompt-caching.md",
        "prompt": "03-runtime/llm/prompt-system.md",
        "guardrails": "05-verification/guardrails-g1-g4.md",
        "biasbuster": "05-verification/biasbuster.md",
        "scheduler": "03-runtime/scheduler.md",
        "hooks": "04-harness/hooks/",
        "plugin": "06-plugins/",
        "skills": "07-skills/",
        "MCP": "03-runtime/tools/mcp.md",
        "mcp": "03-runtime/tools/mcp.md",
        "lifecycle": "04-harness/lifecycle.md",
        "policy": "04-harness/safety/policy-chain.md",
        "approval": "04-harness/safety/approval.md",
        "scoring": "06-plugins/game-ip/psm-scoring.md",
        "tier": "99-reference/glossary.md",
    }
    candidates: set[str] = set()
    # CHANGELOG 위쪽 부분 (최근 entry) 만 검사
    lines = text.splitlines()
    in_recent = False
    for line in lines:
        if re.match(r"^## \[", line):
            if in_recent:
                break
            in_recent = True
            continue
        if not in_recent:
            continue
        for kw, page in impact_keywords.items():
            if kw in line:
                candidates.add(page)
    return sorted(candidates)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--next", required=True, help="next minor version (e.g. 0.66.0)")
    parser.add_argument("--prev", default=None, help="previous version (default: from version.json)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    prev = args.prev or current_version()
    if not prev:
        print("ERROR: prev version not provided and version.json missing")
        return 1

    prev_dir = DOCS_ROOT / f"v{prev}"
    next_dir = DOCS_ROOT / f"v{args.next}"

    if not prev_dir.exists():
        print(f"ERROR: prev directory missing: {prev_dir}")
        return 1
    if next_dir.exists():
        print(f"ERROR: next directory already exists: {next_dir}")
        return 1

    print(f"=== Bump v{prev} → v{args.next} ===")

    if args.dry_run:
        print(f"[dry-run] copy {prev_dir} → {next_dir}")
    else:
        shutil.copytree(prev_dir, next_dir)
        print(f"copied: {next_dir}")

    # Update frontmatter on all .md files in next_dir
    if not args.dry_run:
        updated = 0
        for md in next_dir.rglob("*.md"):
            if update_frontmatter(md, args.next):
                updated += 1
        print(f"frontmatter updated: {updated} files")

    # Update version.json
    if not args.dry_run:
        vj_path = META_DIR / "version.json"
        vj = json.loads(vj_path.read_text())
        vj["current"] = args.next
        if args.next not in vj["supported"]:
            vj["supported"] = [args.next] + [v for v in vj["supported"] if v != prev]
        vj["frozen"] = vj.get("frozen", []) + ([prev] if prev not in vj.get("frozen", []) else [])
        vj["release_history"].insert(0, {
            "version": args.next,
            "date": "TBD",
            "summary": "TBD — fill from CHANGELOG",
            "merge_pr": "TBD",
        })
        vj_path.write_text(json.dumps(vj, indent=2, ensure_ascii=False) + "\n")
        print(f"version.json: current={args.next}, frozen+={prev}")

    # CHANGELOG impact candidates
    print(f"\n=== CHANGELOG impact candidates ===")
    candidates = changelog_impact_candidates(prev)
    if candidates:
        print("다음 페이지가 우선 재검증 대상 (CHANGELOG 키워드 매칭):")
        for c in candidates:
            print(f"  • v{args.next}/{c}")
    else:
        print("(CHANGELOG에서 명확한 영향 키워드 검출 안 됨 — 전 페이지 검토 필요)")

    print(f"\n=== Next steps ===")
    print(f"1. cd to v{args.next}/ and update last_grounded once each page is re-verified")
    print(f"2. Run verify_refs.py to confirm code_refs still resolve")
    print(f"3. Update changelog.md page with new release entry")
    print(f"4. Run portfolio-sync-checklist.md procedures")
    print(f"5. Optionally: mv v{prev} archive/ (frozen 처리)")

    return 0


if __name__ == "__main__":
    sys.exit(main())
