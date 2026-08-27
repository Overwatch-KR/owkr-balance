import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppHeader } from './app-header';

/**
 * @description 전역 내비게이션은 루트 Shell이 렌더링하고 AppHeader는 동작 브리지만 담당한다.
 */
describe('AppHeader navigation bridge', () => {
    it('시각적인 상단 헤더를 렌더링하지 않는다', () => {
        const markup = renderToStaticMarkup(
            <AppHeader
                authMode="discord"
                dataMode="remote"
                isGuideOpen={false}
                isLoggingOut={false}
                isUserSheetOpen={false}
                onLogout={vi.fn()}
                onOpenEventParticipants={vi.fn()}
                onOpenGuide={vi.fn()}
                onOpenScrims={vi.fn()}
                onOpenUserSheet={vi.fn()}
                userName="테스트 관리자"
                userSheetHasError={false}
            />,
        );

        expect(markup).toBe('');
    });
});
