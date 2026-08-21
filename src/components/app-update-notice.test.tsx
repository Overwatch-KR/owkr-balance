import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UpdateAvailableNotice } from './update-available-notice';

describe('UpdateAvailableNotice', () => {
    it('작업 손실을 피하는 업데이트 안내와 선택 동작을 표시한다', () => {
        const markup = renderToStaticMarkup(
            <UpdateAvailableNotice onDismiss={vi.fn()} onReload={vi.fn()} />,
        );

        expect(markup).toContain('새 버전이 준비됐어요');
        expect(markup).toContain('현재 작업을 마친 뒤 새로고침해 주세요.');
        expect(markup).toContain('나중에');
        expect(markup).toContain('지금 새로고침');
        expect(markup).toContain('aria-live="polite"');
    });
});
