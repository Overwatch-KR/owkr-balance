import { describe, expect, it } from 'vitest';
import type { Player } from '../types';
import type { UserSheetEntry } from './user-sheet';
import {
    cleanDiscordUserId,
    suggestRosterIdentities,
    suggestRosterIdentity,
} from './player-identity';

const player = (
    id: number,
    name: string,
    discordName?: string,
): Player => ({
    id,
    name,
    discordName,
    tank: { tier: 'GOLD', div: 3, score: 2200, isPreferred: false, isAvoided: false },
    dps: { tier: 'GOLD', div: 3, score: 2200, isPreferred: false, isAvoided: false },
    sup: { tier: 'GOLD', div: 3, score: 2200, isPreferred: false, isAvoided: false },
});

const entry = (
    id: string,
    battleTag: string,
    discordName: string,
    discordUserId?: string,
): UserSheetEntry => ({
    id,
    battleTag,
    discordName,
    discordUserId,
    tank: '골3',
    dps: '골3',
    support: '골3',
    note: '',
    createdAt: 1,
    updatedAt: 1,
    updatedByName: '관리자',
});

describe('roster identity suggestions', () => {
    it('변경된 별명과 배틀태그라도 Discord ID가 같으면 기존 행을 확정한다', () => {
        const incoming = {
            ...player(1, 'Changed#9999', '새 별명'),
            discordUserId: '123456789012345678',
        };
        const suggestion = suggestRosterIdentity(incoming, [
            entry('sheet-1', 'Old#1234', '옛 별명', '123456789012345678'),
        ]);

        expect(suggestion).toMatchObject({
            matchKind: 'DISCORD_ID',
            requiresDiscordUserId: false,
            selectedEntryId: 'sheet-1',
        });
    });

    it('유일한 Discord 이름만 같고 배틀태그가 다르면 후보만 표시하고 ID를 요구한다', () => {
        const suggestion = suggestRosterIdentity(
            player(1, 'Changed#9999', '같은 이름'),
            [entry('sheet-1', 'Old#1234', '같은 이름', '123456789012345678')],
        );

        expect(suggestion).toMatchObject({
            candidateEntryIds: ['sheet-1'],
            matchKind: 'DISCORD_NAME',
            requiresDiscordUserId: true,
        });
        expect(suggestion.selectedEntryId).toBeUndefined();
    });

    it('기존 행도 Discord ID가 비어 있으면 식별 완료 전에 입력을 요구한다', () => {
        const suggestion = suggestRosterIdentity(
            player(1, 'Same#1234', '같은 이름'),
            [entry('sheet-1', 'Same#1234', '같은 이름')],
        );

        expect(suggestion).toMatchObject({
            matchKind: 'BATTLE_TAG_AND_NAME',
            requiresDiscordUserId: true,
            selectedEntryId: 'sheet-1',
        });
    });

    it('한 명단 안의 중복 배틀태그는 각각 Discord ID 확인을 요구한다', () => {
        const suggestions = suggestRosterIdentities([
            player(1, 'Same#1234', '첫 번째'),
            player(2, 'Same#1234', '두 번째'),
        ], [
            entry('sheet-1', 'Same#1234', '첫 번째'),
        ]);

        expect(suggestions).toHaveLength(2);
        expect(suggestions.every(item => (
            item.matchKind === 'AMBIGUOUS' && item.requiresDiscordUserId
        ))).toBe(true);
    });

    it('복사한 Discord 멘션 표기에서 숫자 ID만 보존한다', () => {
        expect(cleanDiscordUserId('<@!123456789012345678>')).toBe('123456789012345678');
    });
});
