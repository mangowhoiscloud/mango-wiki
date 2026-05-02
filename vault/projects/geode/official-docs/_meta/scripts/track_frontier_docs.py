"""track_frontier_docs.py — frontier-comparison 페이지 외부 docs 변경 추적.

OpenClaw / Hermes / Claude Code / Codex 공식 문서 키 페이지를 fetch + hash 저장.
다음 실행 시 hash 변경 검출 → frontier-comparison.md 재검증 후보 알림.

snapshot 저장: _meta/frontier-snapshots/<source>.json
  {"url": "...", "fetched_at": "...", "content_hash": "...", "title": "...", "len": N}

용법:
    python track_frontier_docs.py snapshot   # 현재 hash 저장
    python track_frontier_docs.py check      # 마지막 snapshot 대비 변경 검출
    python track_frontier_docs.py list       # 추적 대상 listing
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DOCS_ROOT = Path(__file__).resolve().parents[2]
SNAPSHOTS_DIR = DOCS_ROOT / "_meta" / "frontier-snapshots"
SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)

TARGETS = {
    # OpenClaw — .md 직접 노출, hash 안정적
    "openclaw_index": "https://docs.openclaw.ai/llms.txt",
    "openclaw_architecture": "https://docs.openclaw.ai/concepts/architecture.md",
    "openclaw_hooks": "https://docs.openclaw.ai/automation/hooks.md",
    "openclaw_policy": "https://docs.openclaw.ai/auth-credential-semantics.md",
    "openclaw_oauth": "https://docs.openclaw.ai/concepts/oauth.md",
    "openclaw_agent_loop": "https://docs.openclaw.ai/concepts/agent-loop.md",
    "openclaw_memory": "https://docs.openclaw.ai/concepts/memory.md",
    "openclaw_failover": "https://docs.openclaw.ai/concepts/model-failover.md",
    "openclaw_skills": "https://docs.openclaw.ai/tools/skills.md",
    "openclaw_plugins_sdk": "https://docs.openclaw.ai/plugins/sdk-overview.md",

    # Hermes — HTML 만 노출. dynamic 요소 있어 false positive 가능 — 대신 메인 페이지만 추적,
    # 변화 시 사람이 manual 검토 후 결정.
    "hermes_overview": "https://hermes-agent.nousresearch.com/docs/",
    "hermes_features": "https://hermes-agent.nousresearch.com/docs/user-guide/features/overview",

    # Claude Code, Anthropic API — HTML page 1MB+ 이상 dynamic 요소 너무 많아 hash 추적 의미 없음.
    # 변경 추적은 manual / 다른 방식 필요.
}

USER_AGENT = "GEODE-frontier-tracker/0.65.0 (+https://github.com/mangowhoiscloud/geode)"


def fetch(url: str) -> tuple[bytes | None, str | None]:
    """반환: (content_bytes, error_msg)."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read(), None
    except (urllib.error.URLError, urllib.error.HTTPError, OSError) as e:
        return None, str(e)


def extract_title(content: bytes) -> str:
    text = content.decode("utf-8", errors="replace")
    m = re.search(r"<title>([^<]+)</title>", text, flags=re.I)
    if m:
        return m.group(1).strip()
    m = re.search(r"^# (.+)$", text, flags=re.M)
    if m:
        return m.group(1).strip()
    return ""


def content_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()[:16]


def snapshot_path(name: str) -> Path:
    return SNAPSHOTS_DIR / f"{name}.json"


def cmd_snapshot() -> int:
    print(f"Snapshotting {len(TARGETS)} frontier docs sources...")
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    success, failure = 0, 0
    for name, url in TARGETS.items():
        content, err = fetch(url)
        if err is not None:
            print(f"  ⚠ {name}: FAIL — {err}")
            failure += 1
            continue
        snap = {
            "name": name,
            "url": url,
            "fetched_at": now,
            "content_hash": content_hash(content),
            "title": extract_title(content),
            "len": len(content),
        }
        snapshot_path(name).write_text(json.dumps(snap, ensure_ascii=False, indent=2) + "\n")
        print(f"  ✓ {name}: hash={snap['content_hash']}, {snap['len']} bytes")
        success += 1
    print(f"\nDone: {success} ok, {failure} failed")
    return 0 if failure == 0 else 1


def cmd_check() -> int:
    print(f"Checking {len(TARGETS)} frontier docs sources...")
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    changes: list[dict] = []
    for name, url in TARGETS.items():
        prev_path = snapshot_path(name)
        if not prev_path.exists():
            print(f"  ? {name}: no snapshot yet — run 'snapshot' first")
            continue
        prev = json.loads(prev_path.read_text())
        content, err = fetch(url)
        if err is not None:
            print(f"  ⚠ {name}: fetch FAIL — {err}")
            continue
        new_hash = content_hash(content)
        if new_hash != prev["content_hash"]:
            change = {
                "name": name,
                "url": url,
                "prev_hash": prev["content_hash"],
                "new_hash": new_hash,
                "prev_fetched_at": prev["fetched_at"],
                "now": now,
                "title": extract_title(content),
            }
            changes.append(change)
            print(f"  ⚠ CHANGED: {name}")
            print(f"      {prev['content_hash']} → {new_hash}")
        else:
            print(f"  ✓ {name}: unchanged")
    if not changes:
        print("\nNo changes detected.")
        return 0
    print(f"\n=== {len(changes)} sources changed ===")
    print("frontier-comparison.md 재검증 권장:")
    print("  - 본문 외부 출처 인용 갱신")
    print("  - 새 패턴 등장 여부 확인")
    print("  - last_grounded 갱신 후 'snapshot' 재실행")
    return 1


def cmd_list() -> int:
    print(f"=== Frontier docs tracked ({len(TARGETS)} sources) ===")
    for name, url in TARGETS.items():
        sp = snapshot_path(name)
        if sp.exists():
            snap = json.loads(sp.read_text())
            print(f"  {name}")
            print(f"    url:        {url}")
            print(f"    last hash:  {snap['content_hash']}")
            print(f"    fetched:    {snap['fetched_at']}")
        else:
            print(f"  {name}  (no snapshot)")
            print(f"    url: {url}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["snapshot", "check", "list"])
    args = parser.parse_args()
    if args.command == "snapshot":
        return cmd_snapshot()
    elif args.command == "check":
        return cmd_check()
    elif args.command == "list":
        return cmd_list()
    return 1


if __name__ == "__main__":
    sys.exit(main())
