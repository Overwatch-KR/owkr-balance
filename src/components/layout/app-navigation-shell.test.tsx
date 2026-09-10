import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppNavigationShell } from './app-navigation-shell';

vi.mock('../../hooks/use-auth', () => ({
    useAuth: () => ({
        authMode: 'local',
        dataMode: 'local',
        isLoading: false,
        logout: vi.fn(),
        user: {
            id: 'owkr-local-admin',
            username: 'local-admin',
            globalName: '로컬 관리자',
        },
    }),
}));

/**
 * @description 관리자 내비게이션이 링크 의미론과 모바일 메뉴 상태를 정적으로 제공하는지 검증한다.
 */
describe('AppNavigationShell', () => {
    beforeEach(() => {
        vi.stubGlobal('localStorage', {
            getItem: vi.fn(() => null),
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
        expect(markup).toContain('href="/event-participants"');
        expect(markup.match(/aria-current="page"/g)).toHaveLength(2);
    });

    it('모달 동작은 현재 페이지 대신 누름·확장 상태로 전달한다', () => {
        const markup = renderToStaticMarkup(
            <AppNavigationShell><main>내용</main></AppNavigationShell>,
        );

        expect(markup).not.toContain('aria-pressed');
        expect(markup).toContain('aria-controls="mobile-more-dialog"');
        expect(markup).toContain('aria-expanded="false"');
        expect(markup).toContain('aria-haspopup="dialog"');
    });

    it('모바일 safe area를 포함한 본문 하단 여백을 확보한다', () => {
        const markup = renderToStaticMarkup(
            <AppNavigationShell><main>내용</main></AppNavigationShell>,
        );

        expect(markup).toContain('pb-[calc(5rem+env(safe-area-inset-bottom))]');
    });
});
