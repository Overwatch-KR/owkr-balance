import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Player, Rank } from '../../types';
import { EventParticipantRegistrationModal } from './event-participant-registration-modal';

const rank: Rank = {
    tier: 'GOLD',
    div: 3,
    score: 1400,
    isPreferred: false,
    isAvoided: false,
};
const players = Array.from({ length: 10 }, (_, index): Player => ({
    id: index + 1,
    discordUserId: `discord-${index + 1}`,
    discordName: `디스코드 ${index + 1}`,
    name: `Player${index + 1}#1234`,
    tank: rank,
    dps: rank,
    sup: rank,
}));

describe('EventParticipantRegistrationModal', () => {
    it('현재 10명을 기본 선택해 실제 참여 여부를 확인한다', () => {
        const markup = renderToStaticMarkup(
            <EventParticipantRegistrationModal
                csrfToken="csrf"
                onClose={vi.fn()}
                onSuccess={vi.fn()}
                players={players}
            />,
        );

        expect(markup).toContain('이번 내전 참여 등록');
        expect(markup).toContain('선택 10/10명');
        expect(markup).toContain('10명 등록');
        expect(markup.match(/aria-checked="true"/g)).toHaveLength(10);
    });
});
