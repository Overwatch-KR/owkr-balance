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
                isGuideOpen={false}
                isLiveConnected={false}
                isLivePublishing={false}
                liveSyncError=""
                onOpenGuide={vi.fn()}
                userSheetHasError={false}
            />,
        );

        expect(markup).toBe('');
    });
});
