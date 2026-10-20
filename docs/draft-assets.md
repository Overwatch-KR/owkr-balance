# 실시간 밴픽 이미지 수집

2026-10-20에 영웅 초상화 54개와 기본 모드 맵 이미지 31개를 `public/draft-assets/`에 수집했다. 영웅 이미지는 기존 `public/hero/{tank,damage,support}/{id}.webp` 양식을 공유한다. 기존 초상화를 우선 보존하고 누락된 영웅만 수집 이미지로 채웠으며 중복 사본은 제거했다. 맵은 `public/draft-assets/maps/{id}.webp`에 둔다. 새 화면은 카탈로그의 영웅/맵 ID를 이미지 manifest와 연결하며 이미지가 없거나 실패해도 이름과 선택 버튼을 유지한다.

실제 URL·수집 시각·콘텐츠 형식·바이트 수·SHA-256은 `public/draft-assets/manifest.json`에 있다. 이미지 저작권은 Blizzard Entertainment에 있다.

## 수집 경로

- 공식 영웅 HTML은 이 환경에서 403 또는 연결 차단으로 접근할 수 없었다. [OverFast의 공개 색인](https://github.com/TeKrop/overfast-api)을 보조로 사용해 각 초상화 CDN URL과 기본 모드 맵 스크린샷 URL을 수집했다. 이 색인은 비공식이며 공식 승인 자료로 취급하지 않는다.
- 기본 모드는 control / escort / hybrid / push / flashpoint이고 `uses: standard`인 맵만 수집했다. 이미지 수집이 해당 맵의 실제 경쟁전 활성 여부를 확정하지 않는다.
- OverFast에서 404였던 `grimsvotn`과 `neon-junction`은 Blizzard 발표에 연결된 원본 `bnetcmsus-a.akamaihd.net` 이미지를 수집했다. 주소와 탐색 경로는 `scripts/overwatch-asset-overrides.json`에 있다.
- [Grímsvötn 발표](https://news.blizzard.com/en-us/article/24294376/sink-your-teeth-into-overwatch-s-blizzcon-reveals)와 [Neon Junction 발표](https://news.blizzard.com/it-it/article/24271881/preparati-a-sfoderare-gli-artigli-per-il-regno-di-talon-stagione-3-nella-tana-della-tigre)를 출처로 남겼다.

## 갱신

```sh
pnpm assets:overwatch
```

이 작업은 개발 컴퓨터에서만 한다. 1GB 실시간 서버에서 수행하지 않는다. 색인은 두 번만 조회하고 이미지는 동시에 세 개씩 받는다. 허용된 이미지 호스트·HTTPS·최대 20MB·MIME·파일 서명을 검사한 뒤 저장하며 실패가 있으면 완료 manifest를 갱신하지 않고 실패 목록을 반환한다.

갱신 후에는 변경된 ID·이름·역할·이미지와 기본 모드 범위를 확인한다. ID가 같아도 역할·맵 풀은 출시용 카탈로그 승인 절차에서 별도로 확인한다. 새 영웅/맵을 운영 중인 방의 고정 카탈로그에 자동 추가하지 않는다. 새 이미지 호스트는 출처를 검토한 뒤 수집 스크립트의 허용 목록에 추가한다.

## 이미지 최적화와 예제 화면

`pnpm assets:optimize`는 public의 PNG·JPEG를 WebP로 변환하고 원본 파일을 제거한다. 아이콘·티어는 무손실, 초상화는 최대 256px/품질 68, 맵은 최대 1280px/품질 62, 배경은 최대 1920px/품질 62로 저장하며 투명도를 유지하고 메타데이터를 제거한다. 재수집도 같은 인코더를 사용하고 기존 역할별 영웅 파일은 덮어쓰지 않는다. manifest의 source 필드는 수집 원본, bytes/sha256/localPath는 실제 제공하는 파일 기준이다.

2026-10-20 변환 시 전체 PNG·JPEG 151개(중복 영웅 포함) 25,520,197바이트를 WebP 100개 2,944,174바이트로 줄였다(88.5% 감소). 사용처·favicon·검증 기대값을 함께 변경했다.

개발 서버의 `http://localhost:5173/__preview/draft?screen=login`에서 login/lobby/map/preference/ban/result/operator 예제를 확인할 수 있다. 실제 공용 컴포넌트와 가상 참가자를 사용하며 실시간 명령·인증 요청은 보내지 않는다. 이 경로는 개발 모드의 로컬 호스트에서만 열리고 운영 빌드에는 포함되지 않는다. 이미지 수집 목록은 운영용 승인 카탈로그로 쓰지 않는다.
