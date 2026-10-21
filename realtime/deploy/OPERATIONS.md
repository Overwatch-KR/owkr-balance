# civilwar.devbot.me 운영

2026-10-20 기준. 기존 Vercel 화면은 그대로 사용하고 이 호스트는 밴픽 HTTP/WebSocket API만 제공한다.

## 배치

- Ubuntu 서버의 접속 주소와 로그인 계정은 비공개로 관리한다. 서비스 실행 계정은 `owkr`다.
- 전용 Node.js 24 런타임: `/opt/owkr-runtime/bin/node`. 기존 `/usr/bin/node`와 다른 서비스는 유지한다.
- 릴리스: `/opt/owkr-draft/releases/<commit>`, 현재 링크 `/opt/owkr-draft/current`.
- 환경: `/etc/owkr-draft/server.env`, 참가자 Discord 앱: `/etc/owkr-draft/participant-oauth.env`.
- Caddy: `/etc/caddy/Caddyfile`, 공개 80/443, 내부 API `127.0.0.1:8787`.
- 기본 허용 사이트: `https://owkr-internal-balance.vercel.app`. 실제 사이트가 바뀌면 `DRAFT_APP_ORIGIN`도 변경한다. Preview 주소는 자동 허용하지 않는다.
- Redis는 기존 사이트와 같은 Upstash를 사용한다. 기존 운영 키는 읽고 밴픽 키만 쓴다.

## 최초 인증 설정과 시작

`participant-oauth.env`에 실제 참가자 전용 Discord 앱의 다음 두 값을 넣고 root 전용 600 권한으로 저장한다. 파일이 없으면 systemd는 시작을 건너뛴다. 가짜 OAuth 자격증명으로 서비스를 기동하지 않는다.

```ini
DRAFT_DISCORD_CLIENT_ID=<실제 앱 ID>
DRAFT_DISCORD_CLIENT_SECRET=<실제 앱 Secret>
```

Discord 개발자 포털 Redirect URI:

```text
https://civilwar.devbot.me/auth/discord/callback
```

Vercel Production에는 `DRAFT_REALTIME_URL`, `DRAFT_ADMIN_PRIVATE_KEY`, `DRAFT_BRIDGE_SECRET`을 등록한다. 서명용 비밀키는 Vercel에만, 대응 공개키만 새 서버에 둔다. 기존 관리자 OAuth/JWT 변수는 옮기지 않는다. Redis의 `KV_REST_API_URL/TOKEN`은 기존 사이트에서 호환되지만 새 서버에는 같은 값을 `UPSTASH_REDIS_REST_URL/TOKEN`으로 설정한다. 읽기 전용 토큰과 `REDIS_URL`은 이 서버에서 사용하지 않는다.

```sh
sudo systemctl start owkr-draft
sudo systemctl status owkr-draft --no-pager
curl --fail https://civilwar.devbot.me/health/ready
```

실제 참가자 로그인·기존 관리자 방 생성·실제 팀 명단 연결을 검증한 뒤 Vercel의 `VITE_ENABLE_REALTIME_DRAFT=true`를 적용하고 다시 빌드/배포한다. 현재 전달 파일의 플래그는 false다. 2026-10-20 참가자 앱 등록과 서버 가동을 완료했으며, Vercel의 해당 코드 배포와 실제 참가자 로그인 검증이 남았다. 참가자 전용 Discord OAuth와 Vercel 재배포 전까지 전체 운영 연결 완료로 간주하지 않는다. 기존 P0 미구현 항목은 `realtime/README.md`에 기록되어 있다.

## 재배포와 복구

개발 컴퓨터에서 `pnpm check`, `pnpm realtime:package`를 실행한다. 빌드한 `realtime-dist`만 새 릴리스 디렉터리에 전달하고, 전용 Node 런타임의 PATH로 `pnpm@11.9.0 install --prod --frozen-lockfile`을 실행한다. 서버에서 프런트엔드를 빌드하지 않는다.

기존 프로세스를 먼저 중지한 뒤 current 링크를 바꾸고 다시 시작한다. writer lease 때문에 두 인스턴스를 겹쳐 실행하지 않는다. 되돌릴 때도 같은 방법으로 이전 릴리스 링크를 복구한다. 강제 종료 후에는 writer lease가 만료될 때까지 최대 15초를 기다린다. 프로세스 복구 뒤 진행 중인 방은 운영자가 명시적으로 재개한다.

```sh
sudo systemctl stop owkr-draft
sudo ln -sfn /opt/owkr-draft/releases/<commit> /opt/owkr-draft/current
sudo systemctl start owkr-draft
sudo journalctl -u owkr-draft -n 50 --no-pager
sudo systemctl show owkr-draft -p MemoryCurrent -p MemoryPeak -p NRestarts
```

Caddy는 인증서를 자동 갱신한다. 설정 reload 시 기존 WebSocket은 최대 5분 동안 유지한다. 백엔드 프로세스 교체 시에는 클라이언트 재접속이 필요하다. 설정을 바꿀 때는 먼저 `sudo caddy validate --config /etc/caddy/Caddyfile`을 실행한 뒤 reload한다. 로그는 URL·Authorization·Cookie·Set-Cookie를 제거하며 OAuth 코드/state를 기록하지 않는다. 내부 API 포트는 외부에 열지 않는다. HTTPS 신규 TCP 연결은 IP당 초당 30회, 버스트 60회 제한이며 앱에도 소켓·명령 제한이 있다. 방화벽 규칙은 netfilter-persistent로 저장했다.

## 실제 Redis 통합·부하 시험

`redis-smoke.mjs`는 **릴리스 디렉터리의 deploy/** 안에서 실행한다. 모든 Redis 키를 `draft:v1:deploytest:<UUID>:` 아래로 치환한다. 실제 원본·유저 시트·운영 writer lease를 변경하지 않는다. 임시 원본은 합성 10명이며 운영 OAuth/쿠키를 사용하지 않는다. 시험 키는 종료 시 삭제하고 잔존 가능한 원본 키에도 만료를 둔다. 운영 데이터 흐름이나 실제 Discord 로그인 시험을 대체하지 않는다.

시험 프로세스는 독립 내부 포트에서 실행하고 검증용 TLS 프록시를 해당 포트로 연결해야 한다. 운영 서비스와 같은 포트를 함께 사용할 수 없다. 배포 최초 시험에서는 운영 인증 설정 전 8787을 임시 사용했다. `DRAFT_SMOKE_URL` 기본값은 이 공개 도메인이므로 운영 중인 호스트를 대상으로 무조건 실행하지 않는다.

```sh
DRAFT_SMOKE_PORT=8788 DRAFT_SMOKE_URL=https://<검증용 TLS 도메인> \
DRAFT_SMOKE_SECONDS=120 node deploy/redis-smoke.mjs
```

`UPSTASH_REDIS_REST_URL/TOKEN`, `DRAFT_APP_ORIGIN`은 시험 프로세스 환경으로 공급한다. 토큰·RSA 키·OAuth Secret은 명령줄 인수나 저장소에 넣지 않는다. 이 시험은 실제 Lua, 10소켓, 동시 투표, 맵 확인, 선호/밴, 시작/종료, 다음 경기, 만료, 충돌, 재시작 복구를 검사한다. 10방/240소켓 또는 장시간 최대 부하 검증과는 다르다.

설정 참고: [Caddy 설치](https://caddyserver.com/docs/install), [로그 필터](https://caddyserver.com/docs/caddyfile/directives/log), [Discord OAuth2](https://docs.discord.com/developers/topics/oauth2).

## 2026-10-20 인증 등록 후 가동

사용자가 기존 Vercel 주소를 확인했다. 참가자 전용 OAuth 환경 파일을 설치하고 서비스를 시작했으며 외부 readiness 200/redis, Origin preflight 204, Discord 클라이언트 자격증명 검증 200, 관리자 RSA/bridge secret 검증에 성공했다. 비밀값은 저장소에 포함하지 않는다.

당시 기존 Vercel 사이트의 `/api/draft-participant`는 404였다. 담당자는 `codex/realtime-draft`의 밴픽 코드와 환경변수를 함께 배포해야 한다. 환경값만 등록하면 새 API 경로는 생성되지 않는다. 실제 Discord authorization-code 로그인과 콜백 등록 상태는 이 자격증명 시험으로 확인한 것이 아니다.

## 2026-10-20 Production 연결 완료

main 병합 커밋 63d2ce1이 Vercel Production에 배포되었고 version.json으로 확인했다. 참가자 API 404는 해소되었다. 이후 참가자 인증의 공용 비밀값 불일치를 서버에서 수정하여 실제 Discord 콜백·쿠키 교환·재접속까지 검증했다. Vercel 계정에 로그인하거나 Vercel 설정을 변경하지 않았다. 현재 로컬 비밀 전달 파일은 실제 Vercel 등록값에 맞춰 갱신했으므로 초기 전달본을 다시 적용하지 않는다. 자세한 범위는 VERIFICATION.md의 마지막 검증 기록을 따른다.


## 인증·Redis 지연 최적화 운영 기준

방 조회는 방·경기 이력·원본 명단·관련 유저 식별·Redis 시각을 하나의 Lua 읽기에서 얻는다. 프로세스에는 최대 10개의 방 코드→세션/원본 키 위치만 기억하며 상태·자격·명단은 캐시하지 않는다. 최초 조회와 프로세스 재시작 직후에는 키 위치 발견을 위한 GET이 한 번 추가된다. Lua는 실제 방의 세션/원본 위치를 다시 대조하며 모든 접근 키를 KEYS로 전달한다. 저장 Lua의 writer lease·revision·명단·유효기간·마감 시각 검사는 유지한다.

참가 코드 교환은 HttpOnly 복구 쿠키와 함께 최대 5분의 첫 접속 티켓을 반환한다. 쿠키의 방 만료 시각과 티켓 만료 시각은 분리한다. 재접속은 기존 refresh 경로로 최신 자격을 검사한다. 신버전 서버를 먼저 배포하고 Vercel 코드를 후속 배포한다. 이전 프런트는 추가 필드를 무시하고 신버전 프런트는 이전 서버 응답에 refresh로 호환된다.

`redis-smoke.mjs`는 인증 코드 교환→첫 티켓까지의 Redis 요청 수와 시간, 방 조회 10회, 동시 명령 지연을 함께 출력한다. 인증 측정은 Discord 외부 통신을 합성 응답으로 대체하므로 Discord 승인 시간·인터넷·Vercel 왕복은 포함하지 않는다. 같은 서버/같은 Redis/같은 내부 포트의 변경 전후 결과를 비교한다. 내부 시험은 `DRAFT_SMOKE_PORT=8788 DRAFT_SMOKE_URL=http://127.0.0.1:8788`로 격리해 실행할 수 있다. 동시 시험은 같은 포트를 공유할 수 없다.

2026-10-20 23:15 KST 최적화 실행 코드 81a2d16을 Oracle current에 적용했다. Vercel 같은 코드의 main 자동 배포 success/version.json 일치 및 실제 Discord 참가 로그인·준비 저장·새로고침 복구를 확인했다. 최신 수치와 검증 범위는 VERIFICATION.md의 인증·Redis 왕복 최적화 항목을 참고한다.
