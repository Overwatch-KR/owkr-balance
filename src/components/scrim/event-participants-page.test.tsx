import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EventParticipantsPage } from './event-participants-page';

describe('EventParticipantsPage loading state', () => {
    it('최초 로딩 중에는 수동 새로고침 아이콘을 회전시키지 않는다', () => {
        const markup = renderToStaticMarkup(
            <EventParticipantsPage csrfToken="csrf" onClose={vi.fn()} />,
        );

        expect(markup).toContain('새로고침');
        expect(markup).not.toContain('animate-spin');
    });
});
