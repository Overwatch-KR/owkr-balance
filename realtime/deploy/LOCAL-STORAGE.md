# 1코어·1GB 서버 임시 저장소

Upstash 요청 한도 장애 시 같은 운영 서버의 Redis를 별도 저장소로 사용한다. 기존 Upstash 데이터는 이전·삭제하지 않는다. 사용자 동의에 따라 빈 저장소로 시작하므로 유저 시트·명단·이벤트·내전 기록은 임시 저장소에서 따로 등록한다. 기존 방 링크는 임시 저장소에 없다.

## 구성

- `owkr-storage-redis`: Unix socket 전용 Redis, `/var/lib/owkr-storage`, 데이터 메모리 96MB 상한, `noeviction`, AOF everysec와 RDB 저장. 서비스 메모리 상한 224MB.
- `owkr-storage-gateway`: loopback `127.0.0.1:8790`의 Upstash REST 호환 어댑터. Python3와 Ubuntu `python3-redis`를 사용한다. 메모리 상한 96MB, 실행 동시성 16, Redis 연결 24, 요청 2MB·256명령 제한.
- Redis TCP 포트는 열지 않는다. Caddy의 `/storage`·`/storage/*`만 게이트웨이로 전달하고 다른 경로는 기존 밴픽 서버를 유지한다. 저장소 경로의 요청 상한은 2MB, 밴픽 경로는 기존 16KB다.
- 브라우저 Origin·무인증 요청은 거절한다. 인증값은 기존 서버 간 bridge secret으로부터 `HMAC-SHA256(secret, "owkr-local-storage-v1")`으로 유도하고 프런트엔드에 보내지 않는다. URL·인증 헤더는 접근 로그에 남기지 않는다.

## 설치와 확인

Ubuntu 공식 패키지의 `redis-server`, `python3-redis`를 설치한 뒤 `install-local-storage.sh`를 root로 실행한다. 기존 기본 Redis 인스턴스가 없는 새 설치에서는 패키지 기본 `redis-server` 서비스를 끄고 OWKR 전용 인스턴스만 사용한다.

이 설치 스크립트 자체는 기존 Caddy·밴픽 환경을 전환하지 않는다. 운영 파일을 백업한 뒤 Caddy 경로를 추가·validate·reload하고, 게이트웨이를 격리 시험한 다음 밴픽 서버의 `UPSTASH_REDIS_REST_URL`을 `http://127.0.0.1:8790`, 토큰을 위 유도값으로 설정해 재시작한다. 비밀값은 명령행·출력·Git에 넣지 않는다.

Vercel의 `getRedis()`는 bridge 설정이 있고 `OWKR_STORAGE_BACKEND`가 `upstash`가 아니면 `/storage`를 사용한다. bridge 설정이 없는 환경은 기존 Upstash 변수로 동작하며, 로컬 전용 데이터 모드는 원격 저장소를 만들지 않는다. 저장소 장애 때 자동으로 다른 저장소에 쓰지 않는다.

`storage-smoke.mjs`는 임시 UUID 키에서 REST 인증·JSON·TTL·Lua·pipeline·transaction 호환성을 확인하고 키를 삭제한다. `redis-smoke.mjs`는 별도 포트·네임스페이스에서 밴픽 저장·투표·소켓·복구 동작을 검사한다. 게이트웨이 토큰은 환경변수로만 공급한다.

## 지속성과 복귀

AOF는 정상 서비스 재시작 이후에도 유지된다. 전원 장애에서는 마지막 fsync 이후 약 1초 분량의 쓰기가 유실될 수 있다. 서버 자체 디스크 손실을 대비한 외부 백업을 대체하지 않는다. 96MB가 차면 기존 키를 임의 제거하지 않고 새 저장을 거절한다.

Upstash 복귀 시 임시 저장소에 생긴 자료의 병합·이전 범위를 먼저 정한다. Vercel에 `OWKR_STORAGE_BACKEND=upstash`를 설정해 재배포하고, 밴픽 서버의 보관된 이전 Redis 환경을 복원한 뒤 재시작한다. 복귀가 확인될 때까지 임시 Redis 데이터·AOF를 삭제하지 않는다.

## 2026-10-22 운영 전환 확인

사용자가 데이터 이전 없이 임시로 운영하도록 지정했다. 기존 Upstash 데이터와 비밀값은 보존했으며, 밴픽 서버 환경과 Caddy 설정은 전환 전 파일을 별도로 보관했다. Redis·게이트웨이·밴픽 서비스 모두 자동 시작 enabled, active와 비정상 재시작 0회를 확인했다.

- `fc62c90`의 Vercel Production version.json 일치와 Verify·실시간 서버 자동 배포 성공을 확인했다. 서버 current도 같은 커밋이다.
- 공개 `/health/ready`는 503에서 200 ready/redis로 복구했다. 실제 Vercel 공개 참여 API에서 저장소를 조회한 뒤 정상적인 미등록 링크 404를 반환했다.
- 공개 HTTPS 게이트웨이에 서버 전용 유도 토큰으로 PING·JSON/UTF-8·36KB 이상의 본문·TTL 유지·NX·hash·sorted set·Lua·pipeline·transaction·GETDEL을 검사했다. 무인증·브라우저 Origin·설정 명령은 거절했다. 시험 UUID 키는 삭제했다.
- 새 저장소 재시작 후 보존된 키를 확인하고 시험 키를 삭제했다. 운영 데이터가 없는 전환 전 단계에서 수행했다.
- 별도 loopback 8788 포트와 UUID 네임스페이스에서 합성 10인 소켓·투표·맵 확정·밴·경기 진행·복구·만료·충돌·명단 변경·방 닫기·유휴 종료를 검증했다. `soakSeconds=0`이며 장시간 부하 시험은 아니다.
- 전체 508개 테스트·타입·린트·경계·프런트·서버 빌드를 통과했다. 확인 시 Redis 서비스 약 7MB, 게이트웨이 약 19MB를 사용했다. 실제 부하에 따라 달라질 수 있다.
