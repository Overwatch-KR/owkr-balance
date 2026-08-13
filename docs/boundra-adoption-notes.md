# Boundra 도입 인수 메모

## 적용 범위

- `scrim` 도메인을 Boundra 파일럿으로 추가했습니다.
- 공개 참여 조회, 영웅 밴 투표, 만족도 제출의 입력과 응답을 Zod 계약으로 검증합니다.
- 기존 REST 엔드포인트를 유지하기 위해 custom transport를 사용합니다.
- Vite 개발 overlay와 `pnpm boundaries` 경계 검사를 연결했습니다.
- `pnpm check`가 타입 검사, 린트, 테스트, 경계 검사, production build를 순서대로 실행합니다.

## Boundra 저장소로 넘길 이슈

### 1. 생성된 shared contract가 BR-003을 위반함

우선순위: 높음

재현:

```bash
boundra init --name owkr-match
boundra create-domain scrim
boundra generate query scrim/get-public-participation
boundra check-boundaries --root . --format json
```

단일 앱 저장소를 검사하기 위해 `paths.apps`를 `.`으로 지정하면 생성된 계약의 `boundra`, `zod` import가 모두 BR-003으로 보고됩니다. `shared/contracts`가 Boundra가 권장하고 생성하는 위치이며 두 import도 생성기가 직접 추가하므로, 생성 결과와 기본 규칙이 서로 충돌합니다.

기대 동작:

- `boundra` runtime과 선택한 schema provider는 shared contract에서 허용하거나,
- BR-003에 package allowlist를 제공해야 합니다.

현재 우회:

- `boundra.config.json`에서 파일럿의 계약 및 schema model 파일만 검사 제외했습니다.
- 따라서 현재 `scrim/shared`의 순수성은 TypeScript와 코드 리뷰로만 보호됩니다.

### 2. 기본 `paths.apps`에서는 실제 도메인 파일이 검사되지 않음

우선순위: 높음

`init`이 생성한 `paths.apps: "apps"`를 그대로 두고 루트에 `domains/scrim`을 생성하면, 위 BR-003 위반이 있는 상태에서도 `check-boundaries`가 위반 0건으로 성공했습니다. `paths.apps`를 `.`으로 바꾼 뒤에야 도메인 파일이 분석됐습니다.

기대 동작:

- `paths.domains`는 `paths.apps`와 독립적으로 항상 scan root에 포함되어야 합니다.
- 검사 대상 파일이 0개이거나 도메인이 하나도 분석되지 않았다면 성공 대신 메타 정보나 경고를 제공하는 편이 안전합니다.

현재 우회:

- `paths.apps`를 `.`으로 설정했습니다.

### 3. generator가 client public API export를 갱신하지 않음

우선순위: 중간

`generate query`와 `generate mutation`은 client adapter 파일을 만들지만 `domains/<domain>/client/public.ts`는 `export {};` 상태로 남습니다. 앱이 BR-005를 지키면서 생성된 adapter를 사용하려면 export를 수동으로 추가해야 합니다.

기대 동작:

- shared contract와 마찬가지로 client adapter도 `client/public.ts`에 idempotent export를 추가해야 합니다.

### 4. 기본 HTTP transport가 기존 API 오류 의미를 잃음

우선순위: 중간

`createHttpTransport`는 non-2xx 응답을 `Error("HTTP ...")`로 바꾸고, `createBoundraClient`가 다시 `RUNTIME-003`으로 감쌉니다. HTTP status, 안전한 서버 메시지, 오류 code와 body가 사라져 404 전용 UI, 재시도 판단, 충돌 병합 같은 처리가 어렵습니다.

기대 동작 후보:

- transport error factory 또는 `onResponseError` hook 제공
- status, headers, 안전하게 파싱된 body를 포함하는 표준 transport error 제공
- 기존 오류를 보존하는 opt-in 설정 제공

현재 우회:

- OWKR의 `requestJson`을 사용하는 custom transport를 만들었습니다.
- `getErrorMessage`와 `findApiError`가 `Error.cause` 체인을 따라 기존 `ApiError`를 복원합니다.

## OWKR 후속 작업

1. Boundra의 BR-003과 scan-root 문제가 해결되면 `checkBoundaries.ignore`의 파일럿 예외를 제거합니다.
2. 관리자용 `/api/scrims` 계약을 분리하고 action 문자열 기반 PATCH를 typed mutation으로 전환합니다.
3. `user-sheet`, `auth`, `player-note` 순서로 도메인을 확대합니다.
4. 실제 운영 오류를 확인한 뒤 custom transport의 공통 오류 매핑을 Boundra adapter로 일반화합니다.
5. CI에서 native CLI 다운로드 캐시 또는 `BOUNDRA_CLI_PATH` 고정 정책을 결정합니다.

## 확인 명령

```bash
pnpm boundaries
pnpm domains:graph
pnpm check
```
