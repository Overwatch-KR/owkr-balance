# civilwar.devbot.me 운영

2026-10-20 기준. 기존 Vercel 화면은 그대로 사용하고 이 호스트는 밴픽 HTTP/WebSocket API만 제공한다.

## 배치

- Ubuntu 서버의 접속 주소와 배포 계정은 GitHub Actions Secrets `REALTIME_SSH_HOST`·`REALTIME_SSH_USER`에서 관리한다. 서비스 실행 계정은 `owkr`다.
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

## main 자동 배포 (2026-10-21)

`.github/workflows/deploy-realtime.yml`은 **원격 `main`에 push된 경우에만** 실행한다. 로컬 커밋만으로는 실행되지 않으며 PR·다른 브랜치·수동 실행 트리거는 없다. 기존 Vercel 배포와 별도로 이 워크플로는 실시간 서버만 배포한다.

1. GitHub의 Ubuntu 실행기에서 Node.js 24 / pnpm 11.9.0으로 `pnpm check`를 통과한다.
2. `pnpm realtime:package` 후 서버 전용 의존성 3개만 설치하고 실행 코드·`node_modules`·커밋 식별자를 압축한다. 서버에서는 설치·빌드하지 않는다.
3. 서버 호스트키를 저장소의 `realtime/deploy/known_hosts`와 대조한 SSH 연결로 임시 디렉터리에 전달한다.
4. SHA-256을 확인하고 `/opt/owkr-draft/releases/<전체 커밋 SHA>`에 준비한다. 기존 서비스가 실행되는 동안 새 패키지의 문법·의존성을 검사한다.
5. 기존 프로세스 종료 → `current` 링크 원자 교체 → 새 프로세스 시작 순서로 실행한다. GitHub concurrency와 서버 flock으로 중복 배포·writer 중첩을 막으며 진행 중 배포는 취소하지 않는다.
6. systemd 실행 상태, 내부 `/health/ready`, 공개 HTTPS `/health/ready`가 모두 `ready` / `redis`인지 확인한다. 실패하면 새 프로세스를 중지하고 직전 링크·서비스를 복구한 후 워크플로를 실패 처리한다. 동일 커밋이 이미 정상 실행 중이면 재시작을 생략한다.

서버의 `/etc/owkr-draft` 인증·Redis 환경과 Caddy 설정, 다른 서비스는 변경하지 않는다. 과거 릴리스는 자동 삭제하지 않으므로 디스크 사용량을 확인하며 필요 시 `current`와 직전 릴리스를 제외한 이전 릴리스를 정리한다.

### 저장소에 등록할 값

저장소 **Settings → Secrets and variables → Actions → Secrets → New repository secret**에서 아래 세 개를 등록한다.

| 이름 | 값 |
| --- | --- |
| `REALTIME_SSH_HOST` | 운영 서버의 SSH 접속 주소 |
| `REALTIME_SSH_USER` | 운영 서버의 SSH 로그인 계정 |
| `REALTIME_SSH_PRIVATE_KEY` | `ubuntu.pem` 파일의 전체 원문. BEGIN/END 줄을 포함한 여러 줄 PEM 문자열 |

**Base64 인코딩하지 않는다.** macOS에서 저장소 루트의 `pbcopy < ubuntu.pem`으로 복사하고 Secret의 Value에 붙여넣는다. 워크플로가 원문을 임시 파일로 작성해 600 권한으로 사용하고 종료 시 삭제한다. 암호문으로 잠긴 키는 지원하지 않으며 현재 제공된 키로 비대화형 접속을 확인했다.

주소와 로그인 계정도 Secret으로만 전달하고 워크플로·문서·호스트키 파일에 실제 값을 기록하지 않는다. Redis·Discord·RSA 설정을 GitHub로 복사할 필요는 없다. 배포 계정의 기존 비밀번호 없는 sudo 권한으로 스크립트를 실행한다.

Actions가 비활성화되어 있으면 저장소 Actions 사용을 켠다. 조직 정책에서 `actions/checkout`, `actions/setup-node`, `pnpm/action-setup` 사용을 허용해야 한다. `GITHUB_TOKEN`에는 기본 읽기 권한만 필요하다.

호스트키는 주소 대신 `owkr-realtime-production` 별칭에 인증된 기존 SSH 연결로 읽은 공개 ED25519 키를 고정했다. 확인한 지문은 `SHA256:yVmNeZ1gfyaJzROz2MP+nt03a1pbse4/ZAyGwGwP/g0`이다. 서버 재설치로 키가 바뀌면 서버 콘솔 등 신뢰할 수 있는 경로에서 새 지문을 확인한 뒤 `known_hosts`를 갱신한다. 워크플로에서 호스트 검증을 끄거나 실행할 때마다 무조건 신뢰하지 않는다.

### 운영 영향과 확인

백엔드 교체 시 잠시 연결이 끊기며 브라우저가 재접속한다. 저장된 방·투표는 Redis에 남고, 진행 중인 방은 기존 서버 복구 정책에 따라 `RECOVERY_PAUSED`가 되므로 운영자가 재개한다. Caddy는 계속 실행된다.

Actions의 **Deploy realtime server** 실행과 요약에서 커밋·결과를 확인한다. 롤백에 성공해도 원래 배포는 실패로 표시된다. 롤백도 실패하면 서버의 `systemctl status owkr-draft`와 journal을 확인하고 이전 릴리스로 복구한다. 배포 SSH가 끊기거나 GitHub 작업이 강제 종료되면 실행 결과를 서버에서 확인한 뒤 재실행한다.

설정 후 이 변경을 포함한 커밋을 `main`에 push하면 최초 자동 배포가 시작된다. 작성 시점에는 운영 프로세스 교체 없이 SSH·sudo·경로·Node 버전·로컬/공개 Redis readiness만 사전 검사했다.


## 내전 종료와 방 닫기

운영 화면의 **내전 종료·방 닫기**는 일반 경기 종료와 별개다. 확인 창에서 승인하면 방을 다시 열 수 없고, 모든 연결과 공유 링크의 입장·투표·인증 갱신을 차단한다. 진행 중인 경기는 먼저 종료 또는 중단을 기록한다. 일시정지·명단 변경·원본 소실 상태에서도 운영자가 방을 정리할 수 있다.

종료 상태와 감사 기록은 방의 기존 고정 만료 시각까지 유지하고, 경기·맵 사용 기록은 기존 이력 만료 정책을 따른다. 원본 팀 편성과 유저 시트는 변경하지 않는다. 활성 방 목록에서는 종료와 함께 제거하므로 동시 방 슬롯을 즉시 반환한다. 참가자 화면은 종료 안내를 표시하고 재접속을 멈추며, 운영자의 기억된 방 코드는 해제해 대진표에서 새 방을 만들 수 있다.


### 2시간 유휴 자동 종료

마지막으로 저장된 준비·맵 선택·투표·운영 명령 이후 2시간이 지나면 자동으로 방을 닫는다. 한 번도 조작하지 않은 방은 생성 시점부터 계산한다. 접속·상태 조회·ping/pong·재접속·인증 갱신·동일 명령 재전송·자동 단계 전환은 시간을 갱신하지 않는다. 활동 시각은 저장소의 실제 승인 시각으로 기록하며 기존 방은 저장된 감사·투표 기록과 생성 시각으로 계산한다.

일시정지·명단 변경·경기 진행 표시가 남아 있어도 유휴 종료는 적용한다. 실제 경기를 끝냈다고 기록하지 않고 기존 경기 기록은 보존한다. 서버가 켜져 있으면 약 1초 주기로 검사하고, 방 접근이나 서버 복구 시에도 먼저 확인한다. 자동 종료도 수동 종료와 같이 연결·공유 링크를 차단한다. 생성 후 최대 3시간 및 원본 만료 시각은 늘리지 않는다.
