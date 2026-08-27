# 프로젝트 구조

OWKR Match는 브라우저 UI, 애플리케이션 유스케이스, Vercel Functions, 공유 도메인 계약을 분리합니다. 새 코드는 아래 책임과 의존 방향을 기준으로 배치합니다.

## 아키텍처 방향

현재 구조는 기존 `domains`를 순수 도메인 코어로 유지하면서 프런트엔드에 얇은 layered architecture를 적용합니다.

```text
Presentation (`src/components`)
        ↓
Application (`src/application`)
        ↓
Domain (`domains/*` public API)

Browser hooks / utilities ──→ Application이 사용하는 기술 어댑터
Server delivery (`api`) ───→ Domain public API / server stores
```

일반적인 서버 프로젝트처럼 `controller/service/repository` 폴더를 그대로 복제하지 않습니다. 이미 독립된 `domains`와 Boundra 경계가 있으므로, 도메인 규칙을 다시 service 계층으로 감싸는 대신 화면 조립과 유스케이스만 분리합니다.

## 최상위 디렉터리

```text
api/                    Vercel Functions와 서버 저장소 어댑터
domains/                클라이언트·서버가 공유하는 순수 도메인 계약과 공개 API
public/                 폰트, 티어, 영웅, 마스코트 정적 자산
src/                    React 애플리케이션과 브라우저 전용 로직
docs/                   운영·구조·도입 기록
```

## 프런트엔드

```text
src/
├── App.tsx             현재 인증·라우팅·화면 조립을 담당하는 composition root
├── main.tsx            공개 경로와 인증 애플리케이션 진입점
├── application/
│   └── roster/         참가자 입력·편집·명단 가져오기 유스케이스
├── components/
│   ├── auth/           로그인과 Discord 정보 이용 안내
│   ├── common/         여러 기능에서 재사용하는 표현 컴포넌트
│   ├── event/          이벤트 참여자 등록·조회·편집
│   ├── layout/         전역 헤더와 페이지 공통 헤더
│   ├── match/          팀 결과, 교체, 대안 조합, 이미지 복사
│   ├── player/         참가자 입력·검토·목록
│   ├── roles/          역할 아이콘
│   ├── scrim/          내전 생성·링크·밴·설문·후기
│   └── user-sheet/     공유 유저 시트 조회·수정·충돌 해결
├── hooks/              화면 전용 상태 훅과 기존 import 호환 진입점
├── constants/          티어 점수와 표시용 정적 정의
├── types/              기존 경로를 유지하는 도메인 타입 호환 export
├── utils/
│   ├── parser/         Discord 명단 파서
│   ├── storage/        브라우저 저장과 UI 환경설정
│   └── *.ts            브라우저 API·변환·기능 간 공유 유틸리티
└── workers/            브라우저 Web Worker 진입점
```

### 계층별 책임

- `components/`는 렌더링, 사용자 입력, 접근성, 페이지 레이아웃을 담당합니다.
- `application/`은 여러 상태와 도메인 로직을 조합하는 사용자 작업 흐름을 담당합니다. React hook 형태여도 UI 컴포넌트를 import하지 않습니다.
- `hooks/`는 한 화면이나 브라우저 상태에 가까운 훅을 유지합니다. 기존 경로를 깨지 않기 위한 얇은 re-export도 둘 수 있습니다.
- `utils/`는 순수 변환 또는 브라우저/API 어댑터를 담당합니다. 새 기능의 긴 오케스트레이션을 `utils`에 추가하지 않습니다.
- `domains/`는 React, 브라우저, Vercel 요청 객체에 의존하지 않는 핵심 모델·규칙·계약을 유지합니다.

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

`domains` 내부 구현은 `domain.json`의 `publicApi`에 선언한 진입점으로만 외부에 공개합니다. 애플리케이션과 API에서 도메인을 사용할 때는 긴 상대 경로 대신 `package.json#imports`에 선언한 `#domain/balance`, `#domain/player`, `#domain/scrim`, `#domain/scrim/rules`를 사용합니다. `balance`는 `player`의 공개 모델에만 의존하며, 내전 도메인은 계약·모델용 공개 API와 가벼운 규칙 진입점을 분리합니다.

## import 규칙

```ts
import type { Player } from '#domain/player';
import { normalizeMatchShareCode } from '#domain/balance';
import { useRosterManagement } from '@application/roster/use-roster-management';
```

- `../../domains/.../shared/public`처럼 디렉터리 깊이에 결합되는 cross-layer 상대 경로를 새로 만들지 않습니다.
- 도메인 외부에서는 `#domain/*` 공개 진입점을 사용합니다.
- 프런트엔드 계층 간 명시적인 import가 필요하면 `@application/*`, `@presentation/*` alias를 사용합니다.
- 같은 기능 폴더 내부의 짧은 상대 import는 그대로 사용합니다. 모든 import를 alias로 바꾸는 것이 목표는 아닙니다.
- `application/`은 `components/` 또는 `@presentation/*`를 import하지 않습니다. ESLint가 이 역방향 의존을 차단합니다.
- `api/`는 `src/`를 import하지 않습니다. 공통 로직은 도메인 공개 API로 이동합니다.

## 페이지 UI 규칙

관리자 전용 전체 페이지의 상단은 `components/layout/page-header.tsx`를 사용합니다.

- 페이지 이동 경로는 breadcrumb로 표현합니다.
- 이전 페이지로 돌아가는 동작도 breadcrumb 항목에 연결합니다.
- 별도의 `뒤로가기` 버튼은 모달, 단계형 입력, 임시 상세 화면처럼 실제 브라우저/작업 단계의 역방향 이동에만 사용합니다.
- 제목, 설명, 메타 정보, 보조 액션의 위치는 `PageHeader` 슬롯을 기준으로 맞춥니다.

## 배치 기준

- 한 화면에서만 쓰는 UI는 해당 `components/<feature>/`에 둡니다.
- 서로 다른 기능에서 쓰는 표현 컴포넌트만 `components/common/` 또는 `components/layout/`으로 올립니다.
- 여러 상태와 부수 효과를 묶어 하나의 사용자 작업을 완성하면 `application/<feature>/`에 둡니다.
- 입력과 출력이 명확한 순수 로직은 `utils/` 또는 적절한 `domains/`에 둡니다.
- 브라우저 저장 관련 코드는 `utils/storage/`에 모으고 저장 키에는 버전을 포함합니다.
- 클라이언트와 서버가 함께 의존하는 모델과 규칙은 `domains/` 공개 API에 둡니다.
- Vercel 요청 처리와 Redis 접근은 `api/`에만 둡니다.
- 테스트는 대상 파일 옆에 배치해 이동과 삭제 범위를 명확히 유지합니다.

## 의존 방향

```text
components ───────→ application ───────→ domain public API
    │                    │
    ├────→ view hooks    └────→ browser/API utilities
    └────→ formatting utilities

api route ────────→ api/_lib ──────────→ domain public API / Redis
balance domain ───→ player domain public API
```

레이어는 파일 크기를 줄이기 위한 폴더 규칙이 아니라 변경 이유를 분리하기 위한 경계입니다. 하나의 파일이 길더라도 책임이 하나라면 유지할 수 있고, 반대로 짧아도 UI·API 호출·도메인 규칙이 섞이면 분리합니다.
