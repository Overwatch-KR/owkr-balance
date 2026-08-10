# OWKR Balance

OWKR 운영진을 위한 Overwatch 2 내전 팀 밸런싱 도구입니다.

Discord 참가 명단을 붙여넣거나 직접 입력하면 10명의 역할과 티어를 분석해 두 팀을 구성합니다.
운영진이 함께 사용하는 유저 시트, 개인 운영 메모, 참여 대조와 결과 이미지 복사도 지원합니다.

## 주요 기능

- Discord 채팅 명단 파싱 및 기존 참가 명단과 변경 내용 비교
- 수동 입력과 마이크 미사용 상태 지원
- Discord 멘션을 이용한 실제 참여자 대조
- 선호·비선호 역할과 미배치 상태를 고려한 팀 자동 배정
- 탱커 티어 차이가 과도하게 벌어지지 않도록 하는 안전장치
- 참가자·대기열 관리, 팀원 직접 교체, 대안 매칭 결과 제공
- Discord에 붙여넣을 수 있는 대진표 이미지 복사
- 운영진 공유 유저 시트와 BattleTag 기반 참가자 연결
- 작성자만 보는 개인 운영 메모
- 단계별 사용 가이드

## 사용 방법

### 1. Discord 참가 명단 가져오기

Discord에서 메시지 작성자 헤더와 티어 정보가 포함되도록 복사한 뒤
`참가자 입력 → 채팅 붙여넣기`에 붙여넣습니다.

```text
테스터1#11853 다5/다1/다5
테스터2#38848 다3/마4/다4
테스터3#34981 미배치(골)/미배치(플)/플2
테스터4#31207 그5!/마1/마4 마이크x
```

역할 순서는 항상 `탱커 / 딜러 / 힐러`입니다.

| 표기 | 의미 |
| --- | --- |
| `브`, `실`, `골`, `플`, `다`, `마`, `그`, `챔` | 브론즈부터 챔피언까지의 티어 약어 |
| `1`~`5` | 디비전 |
| `!` | 선호 역할 |
| `?` | 비선호 역할 |
| `미배치` | 배치되지 않은 역할 |
| `마이크x` | 마이크 미사용 |

비선호 역할은 한 명당 하나만 허용됩니다. 입력을 잠시 멈추면 비선호가 두 개 이상인
참가자를 입력창 바로 아래에 표시하며, `?`를 하나만 남길 때까지 명단 가져오기 버튼을
비활성화합니다. 형식을 읽지 못한 항목은 임의로 보정하지 않고 정상 참가자 적용 후
수동 입력에서 이어서 보완할 수 있습니다.

명단을 적용하면 정상 유저 중 유저 시트에 없는 BattleTag도 자동으로 신규 등록됩니다.
이미 시트에 있는 유저의 정보와 특이사항은 이 과정에서 덮어쓰지 않습니다.

### 2. 수동으로 참가자 추가하기

`수동 입력`에서 Discord 이름, BattleTag, 역할별 티어와 선호·비선호 역할을 선택합니다.
음성 채팅에 참여하지 않는 유저는 `마이크 미사용`을 선택할 수 있습니다.

참가자는 최대 10명까지 본 명단에 들어가며, 이후 인원은 대기열에 추가됩니다.

### 3. 실제 참여자 대조하기

`참여 대조`에 Discord에서 복사한 멘션 목록을 붙여넣으면 현재 참가 명단과 실제 참여자를
일대일로 비교합니다. 이름이 비슷하더라도 한 Discord 항목을 여러 참가자에게 중복 연결하지 않습니다.

### 4. 팀 자동 배정하기

참가자 10명이 준비되면 `팀 짜기` 버튼이 활성화됩니다. 알고리즘은 다음 조건을 우선순위대로
비교한 뒤 양 팀의 총점과 역할별 점수 차이를 줄입니다.

1. 선호 역할 위반 최소화
2. 탱커 티어 차이 안전 범위 우선
3. 비선호 역할 배정 최소화
4. 미배치 역할 배정 최소화
5. 역할별 격차, 팀 내부 편차, 마이크 미사용 인원 차이 최소화

결과가 마음에 들지 않으면 다른 대안을 선택하거나, 두 선수를 차례로 눌러 직접 교체할 수 있습니다.

### 5. 결과 공유하기

`이미지로 복사`를 누른 뒤 Discord 채팅에 바로 붙여넣습니다. 유저 시트에 등록된 특이사항은
BattleTag가 일치하면 화면의 대진표에 표시되지만, 복사 이미지에서는 제외됩니다.

## 유저 시트

유저 시트는 매 경기 티어를 입력하는 곳이 아니라, 운영진이 유저 정보를 계속 관리하는 공유 목록입니다.
팀 배정에는 현재 참가 명단의 티어만 사용하며, 시트의 티어는 참고 정보로만 표시합니다.

유저 시트의 기본 열은 다음과 같습니다.

```text
디스코드 표시명	BattleTag	탱커	딜러	힐러	특이사항
상만	Player#1234	다3	플2	플3	마이크x
```

- 유저 연결과 중복 판정에는 Discord 이름이 아닌 BattleTag를 사용합니다.
- 역할 티어의 `!`, `?`, `★` 기호는 시트에 저장할 때 제거합니다.
- 상세 화면의 `바로 수정`으로 현재 화면에서 한 유저만 수정할 수 있습니다.
- 여러 유저는 `전체 편집`에서 표 형태로 수정하거나 Google Sheets의 6개 열을 붙여넣을 수 있습니다.
- 전체 편집의 `Discord 명단 가져오기`는 신규 BattleTag를 추가하고 기존 BattleTag의 티어를 갱신합니다.
  이때 기존 특이사항은 보존합니다.
- 시트가 열려 있으면 1분마다 최신 데이터를 확인하며, 창으로 돌아오거나 새로고침 버튼을 누르면
  즉시 갱신합니다.
- 시트를 연 상태로 브라우저를 새로고침하면 같은 시트 화면이 다시 열립니다.

### 특이사항과 운영 메모

특이사항은 관리자 공용 정보이고 운영 메모는 작성자 개인 정보입니다.

| 종류 | 공개 범위 | 용도 |
| --- | --- | --- |
| 특이사항 | 모든 관리자 | 화면의 대진표에도 표시할 공통 유저 정보 |
| 개인 운영 메모 | 작성한 관리자 본인 | 본인만 참고할 비공개 메모 |

개인 운영 메모는 멤버 리스트와 유저 시트 상세 화면에서 별도 저장합니다.
개인 메모 저장은 공용 유저 정보 API를 호출하지 않으므로 티어와 특이사항을 덮어쓰지 않습니다.

## 데이터 저장과 권한

- 내전 매칭 참가자 리스트, 참여 대조 내용과 팀 결과는 로그인한 Discord 계정별로 현재 브라우저에 30분간 저장됩니다.
- 유저 시트는 Upstash Redis Hash에 행 단위로 저장되며 동시 편집 충돌 시 수정 전·내 초안·최신값을 비교해 병합할 수 있습니다.
- 개인 운영 메모 캐시는 같은 계정으로 연 브라우저 탭 사이에서 즉시 동기화되며 localStorage에는 저장하지 않습니다.
- 개인 운영 메모는 로그인한 관리자 ID와 안정적인 시트 행 ID 조합으로 분리됩니다. 기존 BattleTag 기반 메모는 첫 조회 때 자동 이전됩니다.
- 로그인 세션은 서명된 HttpOnly 쿠키로 관리되며 기본 유효 시간은 1주일입니다.
- 일반 Discord 채팅 복사본에는 Discord 사용자 숫자 ID가 없으므로 참가자 식별에 사용하지 않습니다.
- OAuth 로그인에서 확인한 운영자 Discord ID가 `ADMIN_USER_IDS`에 있을 때만 접근할 수 있습니다.

## 개발 환경

### 요구 사항

- Node.js 24
- pnpm 11.9
- Vercel CLI 58.9 이상
- Discord OAuth 애플리케이션 (`pnpm dev:full` 사용 시)
- 운영 Upstash Redis 또는 Vercel KV 연동 Redis 접근 권한

### 설치 및 실행

```bash
pnpm install
pnpm dev:local-only
```

`dev:local-only`는 별도 `.env.local` 설정 없이 실행할 수 있으며 원격 Redis 연결을 코드에서
차단합니다. 운영 데이터가 필요한 개발에만 `.env.example`을 `.env.local`로 복사해 설정합니다.

`pnpm dev`는 Vite 정적 화면만 실행합니다. 로그인, 유저 시트와 메모 API까지 확인하려면
Vercel Functions를 함께 실행하는 다음 명령 중 하나를 사용해야 합니다.

| 명령 | 인증 방식 | 용도 |
| --- | --- | --- |
| `pnpm dev:local-only` | 고정 로컬 사용자 | 원격 저장소 없이 참가 명단·팀 결과 UI 테스트 |
| `pnpm dev:local` | 고정 로컬 사용자 | Discord OAuth 없이 운영 Redis에 연결 |
| `pnpm dev:full` | 실제 Discord OAuth | OAuth 로그인과 운영 환경에 가까운 인증 흐름 검증 |

### 로컬 전용 후보 조합 Dialog 테스트

다음 명령으로 실행합니다.

```bash
pnpm install
pnpm dev:local-only
```

브라우저에서 `http://localhost:3000`을 열고 아래 순서로 확인합니다.

1. `참가자 추가·관리` → `채팅 붙여넣기`로 이동합니다.
2. 아래 명단을 붙여넣고 `명단 가져오기`를 누릅니다.
3. 참가자 검토 Dialog에서 Discord ID를 입력하지 않고 `로컬 명단에만 적용`을 누릅니다.
4. `팀 편성 화면으로 이동` → `팀 자동 배정`을 누릅니다.
5. 결과 아래 추천 후보 2개와 `전체 12개 자세히 보기` Dialog를 확인합니다.
6. Dialog에서 다른 조합을 적용해 추천 순위와 현재 조합 표시가 유지되는지 확인합니다.

```text
LocalTank1#1001 마3! / 다2 / 플1?
LocalTank2#1002 다1! / 마5? / 다3
LocalDps1#1003 플2? / 마2! / 다4
LocalDps2#1004 다5 / 마4! / 플1?
LocalDps3#1005 골1? / 다2! / 마5
LocalDps4#1006 다3 / 마1! / 플2?
LocalSup1#1007 플1? / 다4 / 마3!
LocalSup2#1008 다5 / 골1? / 마1!
LocalSup3#1009 골2? / 플1 / 다2!
LocalSup4#1010 다4 / 플3? / 그5!
```

macOS에서는 `pbcopy < docs/local-only-roster.txt`로 테스트 명단을 바로 복사할 수 있습니다.
이 모드의 참가 명단과 팀 결과는 브라우저에만 30분 동안 저장되며, 유저 시트·개인 메모·내전
기록은 원격 저장소에 연결되거나 기록되지 않습니다.

`pnpm dev:local`은 명령을 실행한 로컬 Vercel 개발 서버의 루프백 요청에만 인증 우회를
활성화합니다. Discord Client ID, Client Secret, 관리자 목록과 JWT Secret은 필요하지 않지만,
유저 시트와 개인 운영 메모는 `.env.local`의 운영 Redis 환경 변수를 그대로 사용합니다.
이 모드에서 조회·추가·수정·삭제한 내용은 별도 샌드박스를 거치지 않고 운영 데이터에 즉시
반영됩니다.

이 명령은 `vercel dev --local`로 Functions를 실행하므로 Vercel 계정 로그인이나 프로젝트
연결도 필요하지 않습니다. Vercel Cloud에서 환경 변수를 자동으로 가져오지 않으므로
`.env.local`에 `UPSTASH_REDIS_REST_URL`과 `UPSTASH_REDIS_REST_TOKEN`을 직접 설정해야 합니다.
파일은 Git에서 제외되어 있지만 외부에 공유하거나 커밋하지 마세요.

Vercel CLI에 로그인할 수 있는 환경에서 운영 변수를 자동으로 내려받으려는 경우에만
`pnpm exec vercel env pull .env.local --environment=production`을 선택적으로 사용할 수 있습니다.
이 명령은 기존 `.env.local`을 덮어쓸 수 있습니다.

### 환경 변수

```dotenv
APP_ORIGIN=http://localhost:3000
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
ADMIN_USER_IDS=
JWT_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
OWKR_LOCAL_DATA_ONLY=
```

| 변수 | 설명 |
| --- | --- |
| `APP_ORIGIN` | 현재 환경의 공개 주소. 운영에서는 실제 HTTPS 도메인 |
| `DISCORD_CLIENT_ID` | Discord OAuth 애플리케이션 Client ID |
| `DISCORD_CLIENT_SECRET` | Discord OAuth 애플리케이션 Client Secret |
| `ADMIN_USER_IDS` | 접근을 허용할 Discord 사용자 숫자 ID 목록. 쉼표로 구분 |
| `JWT_SECRET` | OAuth state와 로그인 세션 서명 키. 최소 32자 |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST Token |
| `OWKR_LOCAL_DATA_ONLY` | `true`이면 자격 증명이 있어도 원격 Redis 연결 차단 |

Redis 연동에서 `KV_REST_API_URL`과 `KV_REST_API_TOKEN`이 제공되는 경우에도 자동으로 인식합니다.
`KV_URL`과 `REDIS_URL`은 현재 애플리케이션 코드에서 직접 사용하지 않습니다.

로컬 우회 실행에서는 `.env.local`의 운영 Redis 환경 변수로 직접 연결합니다. 운영 Redis
자격 증명이 변경되면 로컬 파일도 직접 갱신해야 합니다.
로컬 인증 우회 변수는 `pnpm dev:local` 명령이 서버 프로세스에만 주입하므로 `.env.local`이나
Vercel 프로젝트 환경 변수에 직접 추가하지 않습니다.

### Discord OAuth 설정

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 애플리케이션을 만듭니다.
2. OAuth2 Redirect URI에 다음 주소를 정확히 등록합니다.

```text
http://localhost:3000/api/auth/callback
https://서비스도메인/api/auth/callback
```

3. 애플리케이션의 Client ID와 Client Secret을 환경 변수에 등록합니다.
4. Discord 개발자 모드에서 운영자 계정의 사용자 ID를 복사해 `ADMIN_USER_IDS`에 등록합니다.
5. `APP_ORIGIN`이 접속 중인 주소와 일치하는지 확인합니다.

`APP_ORIGIN`을 로컬 주소로 둔 채 배포하면 운영 사이트에서 로그인해도 로컬 콜백으로 이동하므로
Production 환경에서는 반드시 운영 도메인을 사용해야 합니다.

### 검증 명령

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm check
```

`pnpm check`는 타입 검사, 린트, 테스트와 프로덕션 빌드를 순서대로 실행합니다.
`main` 브랜치에 푸시하면 GitHub Actions에서도 같은 검증을 수행합니다.

## 프로젝트 구조

```text
api/
├── auth/                 # Discord OAuth 로그인·로그아웃·콜백
├── notes/                # 개인 운영 메모
└── user-sheet/           # 공유 유저 시트
src/
├── components/
│   ├── match/            # 팀 결과, 교체, 이미지 복사
│   ├── player/           # 참가자 입력·대조·목록·메모
│   └── user-sheet/       # 유저 시트 조회·직접 수정·전체 편집
├── hooks/                # 인증, 저장, 밸런싱과 화면 상태
└── utils/
    ├── balance/          # 팀 밸런싱 알고리즘
    ├── parser/           # Discord 채팅 파서
    └── user-sheet.ts     # 유저 시트 변환·API 클라이언트
```

## 배포

Discord OAuth와 Redis 기반 기능에 서버가 필요하므로 운영 배포는 Vercel을 기준으로 합니다.
Vite 정적 파일은 `dist`에 빌드되고 `/api`는 Vercel Functions로 실행됩니다.

## 라이선스

소스 코드는 [MIT License](LICENSE.md)에 따라 사용할 수 있습니다.

Overwatch, Blizzard Entertainment, Battle.net 및 관련 이름, 로고, 랭크 아이콘과 게임 에셋은
각 권리자에게 있습니다. 이 프로젝트는 비공식 커뮤니티 도구이며 Blizzard Entertainment와
관련이 없습니다.
