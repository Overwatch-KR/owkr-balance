# 프로젝트 구조

OWKR Match는 브라우저 UI, Vercel Functions, 공유 도메인 계약을 분리합니다. 새 코드는 아래 책임 경계를 기준으로 배치합니다.

## 최상위 디렉터리

```text
api/                    Vercel Functions와 서버 저장소 어댑터
domains/                클라이언트·서버가 공유하는 도메인 계약과 공개 API
public/                 폰트, 티어, 영웅, 마스코트 정적 자산
src/                    React 애플리케이션과 브라우저 전용 로직
docs/                   운영·구조·도입 기록
```

## 프런트엔드

```text
src/
├── App.tsx             인증 후 화면 전환과 매칭 상태 조립
├── main.tsx            공개 경로와 인증 애플리케이션 진입점
├── components/
│   ├── auth/           로그인과 Discord 정보 이용 안내
│   ├── common/         여러 기능에서 재사용하는 표현 컴포넌트
│   ├── event/          이벤트 참여자 등록·조회·편집
│   ├── layout/         전역 헤더 등 페이지 골격
│   ├── match/          팀 결과, 교체, 대안 조합, 이미지 복사
│   ├── player/         참가자 입력·검토·목록
│   ├── roles/          역할 아이콘
│   ├── scrim/          내전 생성·링크·밴·설문·후기
│   └── user-sheet/     공유 유저 시트 조회·수정·충돌 해결
├── hooks/              여러 컴포넌트를 조립하는 화면 상태와 작업 흐름
├── constants/          티어 점수와 표시용 정적 정의
├── types/              기존 경로를 유지하는 도메인 타입 호환 export
├── utils/
│   ├── parser/         Discord 명단 파서
│   ├── storage/        브라우저 저장과 UI 환경설정
│   └── *.ts            기능 간 공유되는 순수 변환·API 유틸리티
└── workers/            브라우저 Web Worker 진입점
```

## 서버와 도메인

```text
api/
├── _lib/               인증, Redis, 저장소 구현과 공통 HTTP 처리
├── auth/               Discord OAuth 세션
├── event-participants/ 이벤트 참여자 저장 API
├── notes/              개인 운영 메모 API
├── public/             로그인 없이 사용하는 참여 API
├── scrims/             내전 운영 API
└── user-sheet/         공유 유저 시트 API

domains/balance/
├── shared/             순수 팀 밸런싱 알고리즘과 결과 모델
└── tests/              밸런싱 품질·교체 회귀 검증

domains/player/
└── shared/             플레이어·랭크·역할·티어 모델

domains/scrim/
├── client/             브라우저에서 호출하는 공개 함수
├── server/             서버에서 사용하는 공개 함수
├── shared/             양쪽에서 공유하는 모델·계약·상수·시간 규칙
└── tests/              도메인 계약 검증
```

`domains` 내부 구현은 `domain.json`의 `publicApi`에 선언한 진입점으로만 외부에 공개합니다. `balance`는 `player`의 공개 모델에만 의존하며, 내전 도메인은 계약·모델용 `shared/public.ts`와 가벼운 규칙용 `shared/rules.ts`를 분리해 불필요한 runtime 번들 결합을 피합니다. `boundra.config.json`과 `domain.json`이 이 경계를 검사합니다.

## 배치 기준

- 한 화면에서만 쓰는 UI는 해당 `components/<feature>/`에 둡니다.
- 서로 다른 기능에서 쓰는 표현 컴포넌트만 `components/common/`으로 올립니다.
- 상태와 부수 효과를 묶는 로직은 `hooks/`, 입력과 출력이 명확한 순수 로직은 `utils/`에 둡니다.
- 브라우저 저장 관련 코드는 `utils/storage/`에 모으고 저장 키에는 버전을 포함합니다.
- 클라이언트와 서버가 함께 의존하는 내전 모델은 `domains/scrim/shared/`에 둡니다.
- 팀 배정 규칙과 결과 모델은 `domains/balance/`, 플레이어 기본 모델은 `domains/player/`에 둡니다.
- Vercel 요청 처리와 Redis 접근은 `api/`에만 둡니다.
- `api/`는 `src/`를 import하지 않으며, 공통 로직은 도메인의 공개 진입점을 사용합니다.
- 테스트는 대상 파일 옆에 배치해 이동과 삭제 범위를 명확히 유지합니다.

## 의존 방향

```text
components → hooks → utils / domain public API
     │          │                 │
     └──────────┴─────────────────┴→ constants / compatibility types

src / api → domains의 공개 진입점 → domains 내부 구현
balance domain → player domain public API
api route → api/_lib → Redis
```

상위 조립 계층인 컴포넌트와 API 라우트가 하위 로직을 호출하며, 순수 유틸리티가 화면 컴포넌트를 역으로 import하지 않도록 유지합니다.
