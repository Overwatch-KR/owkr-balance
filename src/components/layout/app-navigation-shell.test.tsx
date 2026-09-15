import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    AppNavigationShell,
    LiveSessionStatusBar,
} from './app-navigation-shell';

vi.mock('../../hooks/use-auth', () => ({
    useAuth: () => ({
        authMode: 'discord',
        dataMode: 'remote',
        isLoading: false,
        logout: vi.fn(),
        user: {
            avatarUrl: 'https://cdn.discordapp.com/avatars/123/avatar.webp?size=128',
            id: 'owkr-local-admin',
            username: 'local-admin',
            globalName: '로컬 관리자',
        },
    }),
}));

let sidebarCollapsed = false;

/**
 * @description 관리자 내비게이션이 링크 의미론과 모바일 메뉴 상태를 정적으로 제공하는지 검증한다.
 */
describe('AppNavigationShell', () => {
    beforeEach(() => {
        sidebarCollapsed = false;
        vi.stubGlobal('localStorage', {
            getItem: vi.fn((key: string) => (
                key === 'owkr:navigation:collapsed' && sidebarCollapsed ? 'true' : null
            )),
            setItem: vi.fn(),
        });
        vi.stubGlobal('window', {
            location: { pathname: '/' },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('페이지 목적지를 링크로 렌더링하고 현재 경로를 표시한다', () => {
        const markup = renderToStaticMarkup(
            <AppNavigationShell><main>내용</main></AppNavigationShell>,
        );

        expect(markup).toContain('href="/participants"');
        expect(markup).toContain('href="/scrims"');
        expect(markup).toContain('href="/user-sheet"');
        expect(markup).toContain('href="/event-participants"');
        expect(markup.match(/aria-current="page"/g)).toHaveLength(2);
    });

    it('모바일 더보기는 다이얼로그 확장 상태를 전달한다', () => {
        const markup = renderToStaticMarkup(
            <AppNavigationShell><main>내용</main></AppNavigationShell>,
        );

        expect(markup).not.toContain('aria-pressed');
        expect(markup).toContain('aria-controls="mobile-more-dialog"');
        expect(markup).toContain('aria-expanded="false"');
        expect(markup).toContain('aria-haspopup="dialog"');
    });

    it('유저 시트 경로를 데스크톱과 모바일의 현재 페이지로 표시한다', () => {
        vi.stubGlobal('window', {
            location: { pathname: '/user-sheet' },
        });
        const markup = renderToStaticMarkup(
            <AppNavigationShell><main>내용</main></AppNavigationShell>,
        );

        expect(markup.match(/href="\/user-sheet" aria-current="page"/g)).toHaveLength(2);
    });

    it('모바일 safe area를 포함한 본문 하단 여백을 확보한다', () => {
        const markup = renderToStaticMarkup(
            <AppNavigationShell><main>내용</main></AppNavigationShell>,
        );

        expect(markup).toContain('pb-[calc(5rem+env(safe-area-inset-bottom))]');
    });

    it('Discord 프로필 이미지를 사이드바 계정 영역에 표시한다', () => {
        const markup = renderToStaticMarkup(
            <AppNavigationShell><main>내용</main></AppNavigationShell>,
        );

        expect(markup.match(/data-discord-avatar="true"/g)).toHaveLength(1);
        expect(markup).toContain('https://cdn.discordapp.com/avatars/123/avatar.webp?size=128');
    });

    it('접힌 상태에서도 펼치기 버튼을 로고 헤더에 두고 축약 글자 대신 아이콘을 표시한다', () => {
        sidebarCollapsed = true;
        const markup = renderToStaticMarkup(
            <AppNavigationShell><main>내용</main></AppNavigationShell>,
        );

        expect(markup).toContain('data-sidebar-logo="compact"');
        expect(markup).toMatch(/data-sidebar-header="true".*data-sidebar-toggle="true"/s);
        expect(markup).toContain('aria-label="사이드바 펼치기"');
        expect(markup).not.toContain('>OW</span>');
    });

    it('실시간 공유 상태를 모든 페이지 위에 표시할 수 있다', () => {
        const markup = renderToStaticMarkup(
            <LiveSessionStatusBar
                state={{
                    isGuideOpen: false,
                    isLiveConnected: true,
                    isLivePublishing: false,
                    liveCollaborators: [
                        {
                            userId: 'discord-admin-1',
                            displayName: '관리자 A',
                            avatarUrl: 'https://cdn.discordapp.com/avatars/1/avatar.webp',
                            lastSeenAt: 1_000,
                        },
                        {
                            userId: 'discord-admin-2',
                            displayName: '관리자 B',
                            lastSeenAt: 1_000,
                        },
                    ],
                    liveRecentChange: {
                        actor: {
                            userId: 'discord-admin-2',
                            displayName: '관리자 B',
                        },
                        kind: 'TEAMS',
                        updatedAt: 1_000,
                    },
                    liveSessionCode: 'LIVE234567',
                    liveSyncError: '',
                    userSheetHasError: false,
                }}
                onNavigate={vi.fn()}
            />,
        );

        expect(markup).toContain('aria-live="polite"');
        expect(markup).toContain('2명 함께 편집 중');
        expect(markup).toContain('관리자 B · 팀 배정 수정');
        expect(markup).toContain('현재 공동 작업자 2명');
        expect(markup).toContain('LIVE234567');
        expect(markup).toContain('대진표 보기');
    });
});
