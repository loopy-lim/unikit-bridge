# rustra 소개 사이트

Cloudflare Pages 시크릿이 있는 **UniKit (`unikit-ui`)** 쪽에서 빌드·배포합니다.

| 항목    | 위치                                                                                        |
| ------- | ------------------------------------------------------------------------------------------- |
| 앱      | `UniKit/apps/rustra` (브랜치 worktree: `../UniKit-rustra-site`)                             |
| 검증 CI | `unikit-ui` → `.github/workflows/ci.yml` (`apps/rustra` 빌드)                               |
| 배포 CI | `unikit-ui` → `.github/workflows/deploy-rustra.yml` → Pages `rustra-site` / `rustra.ll3.kr` |
| UI      | workspace `@unikit-bridge/ui`                                                               |

`unikit.ll3.kr/rustra` hub 라우트는 나중에 연결.
