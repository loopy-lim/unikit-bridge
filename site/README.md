# rustra 소개 사이트 — rustra.ll3.kr

Next.js 정적 익스포트(`next build` → `out/`)를 Workers Static Assets로
직접 서빙한다. UI 킷은 npm 게시판의 `@unikit-bridge/ui`를 소비한다.

| 항목    | 위치 |
| ------- | ---- |
| 배포    | `.github/workflows/site.yml` → 워커 `rustra-site` + 커스텀 도메인 `rustra.ll3.kr` |
| 로컬    | `bun install && bun run dev` |
| 수동 배포 | `bun x wrangler@latest deploy` (CI와 동일 구성 — `wrangler.toml`) |

기존에는 unikit-ui `apps/rustra`에서 빌드·배포했으나 2026-11-14 이 저장소로
이전했다. 허브 alias `unikit.ll3.kr/rustra`가 이 사이트로 연결된다.
