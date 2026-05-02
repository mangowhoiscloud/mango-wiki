"""verify_refs.py — official-docs frontmatter code_refs 무결성 검증.

각 .md의 frontmatter `code_refs` 항목이:
  - 파일 path가 실제 존재
  - 라인 범위 명시되었으면 그 라인 범위가 파일 내에 실재
  - regression: 인용된 파일이 git log 기준 최근 변경됐으면 outdated 후보 표시

용법:
    python _meta/scripts/verify_refs.py [--strict]
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path("/Users/mango/workspace/geode")
DOCS_ROOT = Path(__file__).resolve().parents[2]
VERSION_DIR = DOCS_ROOT / "v0.65.0"

LINE_RE = re.compile(r"^(?P<path>[^:]+)(?::(?P<lines>\d+(?:-\d+)?))?$")


def parse_frontmatter(text: str) -> tuple[dict, str]:
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---\n", 4)
    if end == -1:
        return {}, text
    raw = text[4:end]
    body = text[end + 5 :]
    fm: dict = {}
    cur_key = None
    cur_list: list = []
    for line in raw.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith("  -"):
            # list item
            item = line[3:].lstrip()
            if item.startswith("url:"):
                cur_list.append({"url": item[4:].strip().strip('"')})
            elif item.startswith("pattern:") and cur_list:
                cur_list[-1]["pattern"] = item[8:].strip().strip('"')
            else:
                cur_list.append(item.strip().strip('"'))
        elif ":" in line and not line.startswith("  "):
            if cur_key:
                fm[cur_key] = cur_list if cur_list else fm.get(cur_key)
            k, _, v = line.partition(":")
            cur_key = k.strip()
            v = v.strip()
            if v == "":
                cur_list = []
            else:
                fm[cur_key] = v.strip("'\"")
                cur_key = None
                cur_list = []
    if cur_key and cur_list:
        fm[cur_key] = cur_list
    return fm, body


def verify_code_ref(ref: str) -> tuple[bool, str]:
    m = LINE_RE.match(ref)
    if not m:
        return False, f"malformed ref: {ref}"
    rel = m.group("path")
    target = REPO_ROOT / rel
    if not target.exists():
        return False, f"path missing: {rel}"
    if m.group("lines"):
        try:
            content = target.read_text().splitlines()
        except (OSError, UnicodeDecodeError) as e:
            return False, f"read failed: {rel} ({e})"
        bounds = m.group("lines").split("-")
        try:
            start = int(bounds[0])
            end = int(bounds[1]) if len(bounds) == 2 else start
        except ValueError:
            return False, f"bad line range: {ref}"
        if start < 1 or end > len(content) or start > end:
            return False, f"line range out of bounds: {ref} (file has {len(content)} lines)"
    return True, ""


def find_recent_changes(rel_path: str, days: int = 30) -> bool:
    """git log -- <path> --since='X days ago' — outdated 후보 표시"""
    try:
        out = subprocess.check_output(
            ["git", "log", "--oneline", f"--since={days}.days.ago", "--", rel_path],
            cwd=REPO_ROOT,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return bool(out.strip())
    except subprocess.CalledProcessError:
        return False


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="exit nonzero on outdated warnings too")
    args = parser.parse_args()

    pages = sorted(VERSION_DIR.rglob("*.md"))
    failures: list[tuple[str, str]] = []
    outdated: list[tuple[str, str]] = []
    drafted_count = 0

    for page in pages:
        try:
            text = page.read_text()
        except (OSError, UnicodeDecodeError) as e:
            failures.append((str(page), f"read failed: {e}"))
            continue
        fm, _ = parse_frontmatter(text)
        status = fm.get("status", "stub")
        if status == "drafted":
            drafted_count += 1
        refs = fm.get("code_refs") or []
        if not isinstance(refs, list):
            continue
        for ref in refs:
            ok, msg = verify_code_ref(ref)
            if not ok:
                failures.append((str(page.relative_to(DOCS_ROOT)), msg))
            else:
                # outdated check
                rel = LINE_RE.match(ref).group("path")
                if find_recent_changes(rel, days=14):
                    outdated.append((str(page.relative_to(DOCS_ROOT)), ref))

    print(f"Pages scanned: {len(pages)}")
    print(f"  drafted: {drafted_count}")
    print(f"  stub:    {len(pages) - drafted_count}")
    print(f"Failures: {len(failures)}")
    print(f"Outdated candidates (14d): {len(outdated)}")
    if failures:
        print("\nFAILURES:")
        for page, msg in failures:
            print(f"  - {page} → {msg}")
    if outdated and args.strict:
        print("\nOUTDATED (--strict):")
        for page, ref in outdated[:20]:
            print(f"  - {page} → {ref}")

    return 1 if failures or (args.strict and outdated) else 0


if __name__ == "__main__":
    sys.exit(main())
