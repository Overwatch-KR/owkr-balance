import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Player, Rank } from '../../../types';
import type { UserSheetEntry } from '../../../utils/user-sheet';
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

describe('RosterIdentityResolver identity review', () => {
    it('이름만 일치하는 기존 유저의 ID를 채우지 않고 실제 ID 입력 전 적용을 막는다', () => {
        const existing: UserSheetEntry = {
            id: 'sheet-a',
            discordName: '홍길동',
            discordUserId: '123456789012345678',
            battleTag: 'Old#1111',
            tank: '다3',
            dps: '다3',
            support: '다3',
            note: '',
            createdAt: 1,
            updatedAt: 1,
            updatedByName: '관리자',
        };
        const markup = renderToStaticMarkup(
            <RosterIdentityResolver
                currentPlayers={[]}
                entries={[existing]}
                failedLines={[]}
                isSubmitting={false}
                onApplyRosterOnly={vi.fn()}
                onCancel={vi.fn()}
                onConfirm={vi.fn()}
                players={[{ ...player, name: 'New#2222', discordName: '홍길동' }]}
                submitError=""
            />,
        );

        expect(markup).toContain('이름 일치 · ID 확인 필요');
        expect(markup).toContain('이름만 일치하고 배틀태그가 다릅니다. 실제 Discord ID를 입력해 주세요.');
        expect(markup).toMatch(/name="discord-user-id-1"[^>]*value=""/);
        expect(markup).toContain('1명 확인 필요');
        expect(markup).not.toContain('value="123456789012345678"');
    });
});
