interface PageMetadata {
    title: string;
    description: string;
}

interface PageMetadataOptions {
    isLogin?: boolean;
    participationKind?: 'vote' | 'satisfaction';
}

const APP_NAME = 'OWKR Match';
const PAGES: Readonly<Record<string, PageMetadata | undefined>> = {
    '/': { title: '대진표', description: '참가자의 팀 배정 결과를 확인하고 조정합니다.' },
    '/participants': { title: '참가자', description: '이번 내전의 참가 명단과 대기열을 관리합니다.' },
    '/scrims': { title: '내전 관리', description: '내전 일정과 투표, 만족도 조사, 경기 기록을 관리합니다.' },
    '/user-sheet': { title: '유저 시트', description: '유저의 디스코드 정보와 배틀태그, 역할별 티어를 관리합니다.' },
    '/draft-control': { title: '밴픽 운영', description: '참가자 준비와 맵 선정, 영웅 밴을 운영합니다.' },
    '/discord-login-policy': { title: '디스코드 로그인 정보 이용 안내', description: '로그인에 사용하는 디스코드 정보와 이용 기준을 확인합니다.' },
    '/__preview/draft': { title: '밴픽 미리보기', description: '예시 참가 명단으로 밴픽 화면을 확인합니다.' },
};

/** @description 경로와 화면 종류만 사용해 탭 제목과 설명을 정하고 공유 코드·개인 정보는 제외한다. */
export function getPageMetadata(pathname: string, options: PageMetadataOptions = {}): PageMetadata {
    const path = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, '') || '/';
    let page = PAGES[path];
    if (options.isLogin) {
        page = { title: '로그인', description: '디스코드 관리자 계정으로 OWKR Match에 로그인합니다.' };
    } else if (path.startsWith('/draft/')) {
        page = { title: '밴픽 참여', description: '내전 참가자로 준비 상태를 확인하고 맵·영웅 밴 투표에 참여합니다.' };
    } else if (path === '/participate' || path.startsWith('/participate/')) {
        page = options.participationKind === 'vote'
            ? { title: '영웅 밴 투표', description: '내전에서 제외할 영웅을 선택합니다.' }
            : options.participationKind === 'satisfaction'
                ? { title: '만족도 조사', description: '참여한 내전의 만족도와 의견을 남깁니다.' }
                : { title: '내전 참여', description: '공유받은 내전의 투표와 만족도 조사에 참여합니다.' };
    }
    return page
        ? { title: `${page.title} | ${APP_NAME}`, description: page.description }
        : { title: APP_NAME, description: '내전 참가 명단과 팀 배정, 밴픽을 관리합니다.' };
}

/** @description 현재 화면의 제목과 설명을 갱신하며 기존 설명 태그를 재사용한다. */
export function applyPageMetadata(metadata: PageMetadata, target: Document = document): void {
    target.title = metadata.title;
    let description = target.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!description) {
        description = target.createElement('meta');
        description.name = 'description';
        target.head.appendChild(description);
    }
    description.content = metadata.description;
}
