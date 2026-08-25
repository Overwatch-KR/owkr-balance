import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EventParticipantSummary } from './event-participant-summary';

const candidate = {
    id: '123456789012345678',
    name: 'Player#1234',
    discordName: '참여자',
    discordUserId: '123456789012345678',
};

describe('EventParticipantSummary', () => {
    it('저장 상태에서는 체크박스 없이 확정 참여자만 표시한다', () => {
        const markup = renderToStaticMarkup(
            <EventParticipantSummary
                candidates={[candidate]}
                isEditing={false}
                isLoading={false}
                onToggle={vi.fn()}
                participantIds={new Set([candidate.id])}
            />,
        );

        expect(markup).toContain('확정 참여자');
        expect(markup).toContain('참여자');
        expect(markup).toContain('Discord ID 123456789012345678');
        expect(markup).toContain('Battle.net');
        expect(markup).toContain('Player#1234');
        expect(markup).not.toContain('role="checkbox"');
        expect(markup).not.toContain('aria-checked');
    });

    it('수정 상태에서만 후보 선택 체크박스를 표시한다', () => {
        const markup = renderToStaticMarkup(
            <EventParticipantSummary
                candidates={[candidate]}
                isEditing
                isLoading={false}
                onToggle={vi.fn()}
                participantIds={new Set([candidate.id])}
            />,
        );

        expect(markup).toContain('실제 참여자 선택');
        expect(markup).toContain('role="checkbox"');
        expect(markup).toContain('aria-checked="true"');
    });
});
