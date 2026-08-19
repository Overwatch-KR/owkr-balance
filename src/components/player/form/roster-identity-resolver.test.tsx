import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Player, Rank } from '../../../types';
import { RosterIdentityResolver } from './roster-identity-resolver';

const rank: Rank = {
    tier: 'DIAMOND',
    div: 3,
    score: 2700,
    isPreferred: false,
    isAvoided: false,
};

const player: Player = {
    id: 1,
    name: 'LocalTank1#1001',
    tank: { ...rank, isPreferred: true },
    dps: rank,
    sup: rank,
};

describe('RosterIdentityResolver local-only mode', () => {
    it('Discord ID와 유저 시트 입력 없이 브라우저 명단 적용을 허용한다', () => {
        const markup = renderToStaticMarkup(
            <RosterIdentityResolver
                currentPlayers={[]}
                entries={[]}
                failedLines={[]}
                isLocalOnly
                isSubmitting={false}
                onApplyRosterOnly={vi.fn()}
                onCancel={vi.fn()}
                onConfirm={vi.fn()}
                players={[player]}
                submitError=""
            />,
        );

        expect(markup).toContain('로컬 전용 테스트');
        expect(markup).toContain('로컬 명단에만 적용');
        expect(markup).toContain('현재 브라우저의 참가 명단에만 추가');
        expect(markup).not.toContain('Discord 고유 ID');
        expect(markup).not.toContain('유저 시트 갱신 중');
    });
});
