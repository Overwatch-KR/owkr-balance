# Upstash 우선 조회와 1코어·1GB 서버 장애 전환

모든 운영 클라이언트는 같은 인증 게이트웨이를 사용한다. Upstash가 정상이고 미반영 변경이 없으면 Upstash에서 우선 조회한다. 장애·복구 중에는 로컬 Redis를 사용하며, 복구 후 누락·수정·삭제를 병합한 다음 우선 조회를 재개한다. 2026-10-22 최초 전환 때는 사용자 요청대로 데이터 이전 없이 시작했으며, 이후 등록된 로컬 자료도 자동 동기화 대상이다.

## 구성

- `owkr-storage-redis`: Unix socket 전용 Redis, `/var/lib/owkr-storage`, 데이터 메모리 96MB 상한, `noeviction`, AOF everysec와 RDB 저장. 서비스 메모리 상한 224MB.
- `owkr-storage-gateway`: loopback `127.0.0.1:8790`의 Upstash REST 호환 어댑터. Python3와 Ubuntu `python3-redis`를 사용한다. 메모리 상한 96MB, 실행 동시성 16, Redis 연결 24, 요청 2MB·256명령 제한.
- Redis TCP 포트는 열지 않는다. Caddy의 `/storage`·`/storage/*`만 게이트웨이로 전달하고 다른 경로는 기존 밴픽 서버를 유지한다. 저장소 경로의 요청 상한은 2MB, 밴픽 경로는 기존 16KB다.
- 브라우저 Origin·무인증 요청은 거절한다. 인증값은 기존 서버 간 bridge secret으로부터 `HMAC-SHA256(secret, "owkr-local-storage-v1")`으로 유도하고 프런트엔드에 보내지 않는다. URL·인증 헤더는 접근 로그에 남기지 않는다.

## 설치와 확인

Ubuntu 공식 패키지의 `redis-server`, `python3-redis`를 설치한 뒤 `install-local-storage.sh`를 root로 실행한다. 기존 기본 Redis 인스턴스가 없는 새 설치에서는 패키지 기본 `redis-server` 서비스를 끄고 OWKR 전용 인스턴스만 사용한다.

이 설치 스크립트 자체는 기존 Caddy·밴픽 환경을 전환하지 않는다. 운영 파일을 백업한 뒤 Caddy 경로를 추가·validate·reload하고, 게이트웨이를 격리 시험한 다음 밴픽 서버의 `UPSTASH_REDIS_REST_URL`을 `http://127.0.0.1:8790`, 토큰을 위 유도값으로 설정해 재시작한다. 비밀값은 명령행·출력·Git에 넣지 않는다.

Vercel의 `getRedis()`는 bridge 설정이 있고 `OWKR_STORAGE_BACKEND`가 `upstash`가 아니면 `/storage`를 사용한다. bridge 설정이 없는 환경은 기존 Upstash 변수로 동작하며, 로컬 전용 데이터 모드는 원격 저장소를 만들지 않는다. 명시적 `upstash` 우회 설정은 자동 동기화를 거치지 않으므로 운영에서는 사용하지 않는다.

`storage-smoke.mjs`는 임시 UUID 키에서 REST 인증·JSON·TTL·Lua·pipeline·transaction 호환성을 확인하고 키를 삭제한다. `redis-smoke.mjs`는 별도 포트·네임스페이스에서 밴픽 저장·투표·소켓·복구 동작을 검사한다. 게이트웨이 토큰은 환경변수로만 공급한다.

## 지속성과 복귀

AOF는 정상 서비스 재시작 이후에도 유지된다. 전원 장애에서는 마지막 fsync 이후 약 1초 분량의 쓰기가 유실될 수 있다. 서버 자체 디스크 손실을 대비한 외부 백업을 대체하지 않는다. 96MB가 차면 기존 키를 임의 제거하지 않고 새 저장을 거절한다.

## 자동 동기화

- 쓰기·Lua·트랜잭션은 로컬에서 한 번 실행한다. SQLite WAL/FULL 저널에 실행 전 상태와 실행 후 키 이미지를 기록하고 백그라운드에서 Upstash에 반영한다. 응답 시점에 Upstash까지 반영되었다는 보장은 없으며 `/status`의 `pendingKeys=0`, `backend=upstash`가 반영 완료 기준이다. 불확실한 응답 뒤 INCR·GETDEL·Lua를 재실행하지 않고 멱등적인 상태 이미지만 재전송한다.
- 저널은 `/var/lib/owkr-storage-gateway/sync.sqlite3`, 소유자 `owkr-storage`, 디렉터리 0700이다. 게이트웨이를 재시작해도 미반영 변경과 삭제 표식을 복구한다. 기존 로컬 키도 처음 실행 시 등록한다. Redis·저널·Upstash를 독립적으로 삭제하거나 복원하지 않는다.
- `STORAGE_UPSTREAM_URL`, `STORAGE_UPSTREAM_TOKEN`은 `/etc/owkr-storage/gateway.env`에서만 읽는다. 설치 스크립트는 기존 값을 보존하며, 아직 없으면 `/etc/owkr-draft/server.env.before-local-storage`에 보관한 HTTPS Upstash 설정을 가져온다. 클라이언트의 로컬 게이트웨이 주소는 바꾸지 않는다. 업스트림 설정을 제거하면 기존 로컬 전용 모드로 돌아가며 자료는 남는다.
- 최초 동기화와 장애 복구 때 양쪽 키를 조사한다. 정상 상태의 외부 변경·누락 보충은 15분 간격이며, 게이트웨이 쓰기는 즉시 작업을 깨운다. 실패 시 2초부터 최대 256초까지 재시도 간격을 늘린다. 업스트림 단일 요청 제한은 0.7초이며 감지 후에는 요청마다 실패한 Upstash를 다시 호출하지 않는다. 복구가 감지되어도 병합이 끝날 때까지 로컬을 유지한다.
- 대상은 `user-sheet:`, `scrims:`, `events:`, `match-live:`, `match-shares:`, `player-note:`, `draft:v1:`다. 다른 서비스 키는 가져오지 않는다. 단일 작성자 잠금 `draft:v1:writer`, 시험용 `draft:v1:deploytest:`와 헬스 PING/TIME은 로컬에서만 처리하여 유휴 Upstash 호출을 줄인다. 시험 `storage-smoke:` 키도 로컬 전용이다.
- 해시 필드·내전 기록 ID·이벤트 참가자 ID별로 없는 항목을 보충한다. 값이 다르면 마지막 수정 시간, 같으면 Upstash를 택한다. 기존 자료는 `updatedAt`, `lastActivityAt`, `createdAt` 순으로 추정하며 수정 시간이 없는 기존 값끼리는 Upstash가 우선한다. 이후 게이트웨이 수정·삭제는 저널 시간이 남는다. 양쪽에서 독립 생성한 같은 기록 ID의 충돌도 같은 규칙을 적용하며 별도 ID를 자동 생성하지 않는다. 충돌 원본 최근 1,000건은 비공개 SQLite에 보관한다.
- 유저 시트는 구형 배열도 v2로 보충하며 Discord ID·BattleTag 중복을 정리하고 BattleTag 인덱스를 다시 만든다. 병합으로 행이 바뀌면 양쪽보다 큰 버전으로 낡은 전체 교체를 거부한다. 버전·기록 번호 카운터는 더 큰 값을 유지한다.
- 삭제 표식으로 삭제된 키·해시 필드·기록이 재등장하지 않도록 한다. 만료는 절대 시각으로 전달하므로 복구 시 세션·방 수명을 새로 늘리지 않는다. 동일 값의 작성자 잠금 갱신은 최신 만료 시각을 따른다.
- 인증된 POST `/storage/status`는 백엔드, 미반영 키 수, 최근 완료 시각과 정제된 업스트림 상태만 제공한다. 토큰·데이터·업스트림 주소는 응답·로그에 넣지 않는다.

게이트웨이와 실시간 서버는 같은 1코어·1GB 서버에 있다. 이 구성은 Upstash 장애를 처리하며 해당 서버 자체의 장애까지 견디는 별도 호스트 이중화는 아니다. 정상 쓰기도 로컬 실행·저널에 의존한다. 두 저장소에 게이트웨이를 우회한 동시 작성자는 두지 않는다. 최초 병합 중 과거 자료의 수정 시각이 없으면 마지막 변경을 재구성할 수 없어 위 추정 규칙을 사용한다.

`python3 realtime/deploy/storage-sync-test.py`는 Redis·python3-redis가 설치된 Linux에서 임시 Unix socket 인스턴스 두 개만 생성한다. 운영 Redis·Upstash에는 연결하지 않는다. 장애·재시작·모호한 응답·삭제·TTL·Lua·트랜잭션·목록 병합·레거시 시트·REST 인코딩을 검사한다. Verify CI에도 같은 검사를 포함한다.

## 2026-10-22 운영 전환 확인

사용자가 데이터 이전 없이 임시로 운영하도록 지정했다. 기존 Upstash 데이터와 비밀값은 보존했으며, 밴픽 서버 환경과 Caddy 설정은 전환 전 파일을 별도로 보관했다. Redis·게이트웨이·밴픽 서비스 모두 자동 시작 enabled, active와 비정상 재시작 0회를 확인했다.

- `fc62c90`의 Vercel Production version.json 일치와 Verify·실시간 서버 자동 배포 성공을 확인했다. 서버 current도 같은 커밋이다.
- 공개 `/health/ready`는 503에서 200 ready/redis로 복구했다. 실제 Vercel 공개 참여 API에서 저장소를 조회한 뒤 정상적인 미등록 링크 404를 반환했다.
- 공개 HTTPS 게이트웨이에 서버 전용 유도 토큰으로 PING·JSON/UTF-8·36KB 이상의 본문·TTL 유지·NX·hash·sorted set·Lua·pipeline·transaction·GETDEL을 검사했다. 무인증·브라우저 Origin·설정 명령은 거절했다. 시험 UUID 키는 삭제했다.
- 새 저장소 재시작 후 보존된 키를 확인하고 시험 키를 삭제했다. 운영 데이터가 없는 전환 전 단계에서 수행했다.
- 별도 loopback 8788 포트와 UUID 네임스페이스에서 합성 10인 소켓·투표·맵 확정·밴·경기 진행·복구·만료·충돌·명단 변경·방 닫기·유휴 종료를 검증했다. `soakSeconds=0`이며 장시간 부하 시험은 아니다.
- 전체 508개 테스트·타입·린트·경계·프런트·서버 빌드를 통과했다. 확인 시 Redis 서비스 약 7MB, 게이트웨이 약 19MB를 사용했다. 실제 부하에 따라 달라질 수 있다.

## 2026-10-23 운영 적용 확인

`cbf6df7`·`f8cbd78`의 게이트웨이를 운영에 적용했다. 설치 전 Redis RDB·게이트웨이 코드·환경·서비스 파일은 root 전용 `/var/backups/owkr-storage-before-sync-20261023/`에 보관했다. 기존 Redis 서비스와 자료를 유지하면서 게이트웨이만 갱신했다. SQLite 저널은 실제 자료 41개 키를 등록했고 인증된 상태 응답은 `local`, `upstream_quota`였다. 숫자는 확인 시점 기준이다.

격리 통합 시험 22개와 운영 REST 호환성·합성 10인 별도 네임스페이스 검사가 통과했다. 전체 앱 520개 테스트와 타입·린트·경계·빌드도 통과했다. 실제 Upstash는 여전히 요청 한도 초과이므로 운영 자료의 최초 양방향 병합과 Upstash 조회 복귀는 대기 중이다. 자동 복구 전환은 독립 시험 저장소에서 검증했다.
