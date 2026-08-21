import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EventUserSheetPicker } from './event-user-sheet-picker';

describe('EventUserSheetPicker', () => {
    it('유저 시트 검색을 여는 버튼과 누락 참여자 안내를 표시한다', () => {
        const markup = renderToStaticMarkup(
            <EventUserSheetPicker participantIds={new Set()} onAdd={vi.fn()} />,
        );

        expect(markup).toContain('누락 참여자 추가');
        expect(markup).toContain('유저 시트에서 추가');
    });
});
