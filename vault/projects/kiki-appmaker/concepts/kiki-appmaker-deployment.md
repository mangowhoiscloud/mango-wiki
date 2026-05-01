---
title: Kiki AppMaker Deployment Requirements
category: concepts
tags: [kiki-appmaker, deployment, ec2, nginx, devops, infrastructure, certbot]
sources:
  - "kiki-appmaker/docs/deployment-requirements.md"
created: 2026-04-30T11:30:00Z
updated: 2026-04-30T11:30:00Z
---

# Kiki AppMaker Deployment Requirements

> 활성 (2026-04-15 초안, 2026-04-23 DevOps migration, 2026-04-24 DNS 재확인). 로드밸런서/TargetGroup/Route53 호스트 라우팅 사용 중단 → 직접 A-record + nginx 리버스 프록시 + Certbot SSL 패턴.

PDCA 하네스 **Deploy 단계 (DevOps Lead → DevOps 1/2 FIFO)** 가 따르는 인프라 패턴. D-1..D-9 protocol이 이 런북 참조. Squad Infra 1/2는 로컬 빌드 검증 전용, cloud deploy 안 함 (PR #44 이후).

## ⛔ 두 번 조사하지 말 것 (확정 사실)

DevOps/Infra agent가 배포 때마다 반복 조사하는 걸 막기 위한 확정 사실:

1. **AWS credentials는 신규 서브도메인 배포에 불필요**
   - `*.needlup.com` 와일드카드 A-record가 Route53에 이미 설정 완료
   - 신규 프로젝트는 nginx `server_name` 매칭으로 라우팅 — 레코드 추가 불필요
   - `~/.aws/credentials` 없어도 D-1..D-9 전부 성공
   - AWS creds는 post-deploy verify (자동 `dig` 크로스체크) 용도만
   - `infra-1-probe.sh`의 AC-4 실패는 **블로커 아님** — 건너뛸 것

2. **로드밸런서 / Target Group / ALB 사용 안 함**
   - 단일 EC2 → 단일 nginx로 모든 서브도메인 처리
   - LB 리스너/대상그룹 생성 금지
   - 기존 stale 문서(예: 구버전 `dev-lead.md`)의 ALB 절차는 무시 — 이 문서가 우선

3. **GitHub Actions workflow는 선택사항**
   - D-3는 CI 자동화 레인. 레포 이름 미확정 또는 PAT 없으면 생략 가능
   - 대신 **manual SSH deploy**: `rsync` tarball → symlink swap → `pm2 restart`
   - 컨테이너에 `rsync / pm2 / mysql / mysqldump / ssh` 멱등 install (`install/lib/02e-container-tools.sh`)

4. **EC2에서 `npm install` 실행 금지**
   - EC2 RAM 1.9 GB → OOM
   - 로컬/CI에서 Next.js standalone build → tarball scp만

5. **Prisma migration은 로컬 SSH 터널로 원격 DB 실행**
   - EC2에 prisma CLI 없음 + OOM
   - 자세한 절차는 원본 문서 §"DB 초기화" 참조

## 인프라 패턴

```
사용자 브라우저
   ↓ HTTPS
[Cloudflare DNS *.needlup.com → A-record]
   ↓
[EC2 (단일 인스턴스)]
   ├── nginx (port 443/80)
   │     server_name <project>.needlup.com → upstream localhost:<port>
   │     server_name <other>.needlup.com   → upstream localhost:<other-port>
   │     [Certbot SSL 자동 갱신]
   │
   └── pm2 (Node.js process manager)
         ├── <project> (Next.js standalone, port 3001)
         ├── <other>   (Next.js standalone, port 3002)
         └── ...
```

## D-1..D-9 배포 런북 (요약)

DevOps Worker가 따르는 9-step canonical 절차 ([[kiki-appmaker-agent-roles|infra-lead.md]]가 SOT):

| Step | 작업 | 주체 | 출력 |
|---|---|---|---|
| D-1 | 환경 진단 (probe) | DevOps Worker | 배포 가능 여부 판단 |
| D-2 | EC2 인스턴스 + nginx config 준비 | DevOps Worker | nginx server_name 추가 |
| D-3 | (선택) GitHub Actions workflow 설치 | DevOps Worker | CI 자동 deploy |
| D-4 | 로컬 build → tarball | DevOps Worker | `<project>.tar.gz` |
| D-5 | rsync → EC2 | DevOps Worker | 새 release 디렉터리 |
| D-6 | symlink swap (current → new release) | DevOps Worker | atomic deploy |
| D-7 | pm2 restart `<project>` | DevOps Worker | 새 process 가동 |
| D-8 | smoke test (HTTP 200, key endpoint) | DevOps Worker | 통과 확인 |
| D-9 | (선택) Cloudfront / DNS / TLS verify | DevOps Worker | post-deploy 확인 |

## 시크릿 참조 규칙

원문 IP / PEM / 비밀번호를 이 런북에 **기록 금지**. env var 참조만:

| env var | 의미 | 주입 경로 |
|---|---|---|
| `EC2_HOST` | 인스턴스 IP | `.env` 또는 bind mount |
| `EC2_USER` | SSH user | 동상 |
| `EC2_PEM` | PEM 경로 | `install/lib/02b-deploy-secrets.sh` |
| `RDS_HOST` | DB 호스트 | 동상 |
| `RDS_USER`, `RDS_PASSWORD` | DB creds | 동상 |
| `NEXT_PUBLIC_*` | 빌드타임 환경변수 | tarball 안에 포함 |

`install/lib/02b-deploy-secrets.sh`가 substrate 세팅.

## 기존 문서 무효화

다음 문서들의 ALB / TargetGroup / Route53 호스트 라우팅 절차는 stale — 이 문서가 우선:
- 구버전 `dev-lead.md` (ALB 절차)
- 구버전 `infra-lead.md` (Route53 host 라우팅)

## See also

- [[kiki-appmaker]] — Hub
- [[kiki-appmaker-agent-roles]] — DevOps Lead / DevOps Worker / Infra Lead role
- [[kiki-appmaker-superpowers]] — autonomous-deploy-guards spec
- [[index]]
