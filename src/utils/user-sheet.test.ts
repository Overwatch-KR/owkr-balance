import { describe, expect, it, vi } from 'vitest';
import { getTierScore } from '../constants';
import type { Player, Rank, Tier } from '../types';
import {
    fetchUserSheetConflictSnapshot,
    formatUserSheetChangeSummary,
    getUserSheetChangeSummary,
    mergeDiscordPlayersIntoUserSheet,
    normalizeUserSheetBattleTag,
    parseUserSheetRows,
    saveUserSheet,
    syncRosterPlayersToUserSheet,
    updateUserSheetEntry,
    validateUserSheetEntries,
    type UserSheetDraftEntry,
} from './user-sheet';
import { ApiError } from './api';

const rank = (
    tier: Tier,
    div: number,
    isPreferred = false,
    isAvoided = false,
): Rank => ({
    tier,
    div,
    score: getTierScore(tier, div),
    isPreferred,
    isAvoided,
});

const player = (name: string, discordName?: string): Player => ({
    id: 1,
    name,
    discordName,
    tank: rank('DIAMOND', 3, true),
    dps: rank('PLATINUM', 2, false, true),
    sup: rank('MASTER', 5),
});

describe('parseUserSheetRows', () => {
    it('헤더가 포함된 Google Sheets 6열을 유저 행으로 변환한다', () => {
        const rows = parseUserSheetRows([
            '디스코드 이름\t배틀태그\t탱커\t딜러\t힐러\t특이사항',
            '상민\tPlayer#1234\t다3\t플2\t마5\t운영 메모',
        ].join('\n'));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            discordName: '상민',
            battleTag: 'Player#1234',
            tank: '다3',
            dps: '플2',
            support: '마5',
            note: '운영 메모',
        });
    });

    it('Discord ID가 포함된 Google Sheets 7열을 유저 행으로 변환한다', () => {
        const rows = parseUserSheetRows([
            '디스코드 이름\tDiscord ID\t배틀태그\t탱커\t딜러\t힐러\t특이사항',
            '상민\t123456789012345678\tPlayer#1234\t다3\t플2\t마5\t운영 메모',
        ].join('\n'));

        expect(rows[0]).toMatchObject({
            discordName: '상민',
            discordUserId: '123456789012345678',
            battleTag: 'Player#1234',
            tank: '다3',
            dps: '플2',
            support: '마5',
            note: '운영 메모',
        });
    });

    it('배틀태그 연결 시 대소문자와 바깥 공백을 무시한다', () => {
        expect(normalizeUserSheetBattleTag(' Player#1234 ')).toBe('player#1234');
    });

    it('시트 역할 티어에서는 선호·비선호 기호를 제거한다', () => {
        const rows = parseUserSheetRows('상민\tPlayer#1234\t다3!\t플2?\t마5★\t메모');
        expect(rows[0]).toMatchObject({ tank: '다3', dps: '플2', support: '마5' });
    });
});

describe('mergeDiscordPlayersIntoUserSheet', () => {
    it('신규 BattleTag는 빈 행을 재사용해 추가한다', () => {
        const blank: UserSheetDraftEntry = {
            id: 'blank',
            discordName: '',
            battleTag: '',
            tank: '',
            dps: '',
            support: '',
            note: '',
        };
        const result = mergeDiscordPlayersIntoUserSheet([blank], [player('New#1234', '새유저')]);

        expect(result).toMatchObject({ addedCount: 1, updatedCount: 0 });
        expect(result.rows[0]).toEqual({
            id: 'blank',
            discordUserId: '',
            discordName: '새유저',
            battleTag: 'New#1234',
            tank: '다3',
            dps: '플2',
            support: '마5',
            note: '',
        });
    });

    it('중복 BattleTag는 티어를 갱신하고 기존 특이사항을 보존한다', () => {
        const current: UserSheetDraftEntry = {
            id: 'existing',
            discordName: '옛이름',
            battleTag: 'Player#1234',
            tank: '골1',
            dps: '골2',
            support: '골3',
            note: '기존 중요 메모',
        };
        const result = mergeDiscordPlayersIntoUserSheet(
            [current],
            [player('player#1234', '새이름')],
        );

        expect(result).toMatchObject({ addedCount: 0, updatedCount: 1 });
        expect(result.rows[0]).toMatchObject({
            id: 'existing',
            discordName: '새이름',
            battleTag: 'player#1234',
            tank: '다3',
            dps: '플2',
            support: '마5',
            note: '기존 중요 메모',
        });
    });

    it('Discord 이름이 없으면 중복 행의 기존 이름을 유지한다', () => {
        const current: UserSheetDraftEntry = {
            id: 'existing',
            discordName: '유지할이름',
            battleTag: 'Player#1234',
            tank: '',
            dps: '',
            support: '',
            note: '',
        };
        const result = mergeDiscordPlayersIntoUserSheet([current], [player('Player#1234')]);
        expect(result.rows[0].discordName).toBe('유지할이름');
    });
});

describe('syncRosterPlayersToUserSheet', () => {
    it('식별 결과와 선택한 티어 갱신 범위를 시트 버전과 함께 전송한다', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
            JSON.stringify({
                addedCount: 0,
                entries: [],
                sheetVersion: 4,
                tierUpdatedCount: 1,
                updatedCount: 1,
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));

        const identifiedPlayer = {
            ...player('New#1234', '새유저'),
            discordUserId: '123456789012345678',
            userSheetEntryId: 'sheet-1',
        };
        const result = await syncRosterPlayersToUserSheet(
            [identifiedPlayer],
            new Set([identifiedPlayer.id]),
            3,
            'csrf-token',
        );
        const fetchCall = fetchMock.mock.calls[0];
        fetchMock.mockRestore();

        expect(result.updatedCount).toBe(1);
        expect(fetchCall).toEqual(['/api/user-sheet', expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-token' }),
            body: JSON.stringify({
                entries: [{
                    entryId: 'sheet-1',
                    clientPlayerId: 1,
                    discordUserId: '123456789012345678',
                    discordName: '새유저',
                    battleTag: 'New#1234',
                    tank: '다3',
                    dps: '플2',
                    support: '마5',
                    syncTiers: true,
                }],
                sheetVersion: 3,
            }),
        })]);
    });
});

describe('user sheet conflict payloads', () => {
    const draft: UserSheetDraftEntry = {
        id: 'sheet-1',
        discordName: '유저',
        battleTag: 'Player#1234',
        tank: '다3',
        dps: '플2',
        support: '마5',
        note: '공유 메모',
    };

    it('전체 저장에 조회 당시 시트 버전을 포함한다', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
            JSON.stringify({ entries: [], sheetVersion: 8 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));

        await saveUserSheet([draft], 7, 'csrf-token');
        const fetchCall = fetchMock.mock.calls[0];
        fetchMock.mockRestore();

        expect(fetchCall).toEqual(['/api/user-sheet', expect.objectContaining({
            method: 'PUT',
            body: JSON.stringify({ entries: [draft], sheetVersion: 7 }),
        })]);
    });

    it('상세 저장에 조회 당시 행 수정 시각을 포함한다', async () => {
        const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
            JSON.stringify({ entries: [], sheetVersion: 9 }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
        ));

        await updateUserSheetEntry(draft, 12345, 'csrf-token');
        const fetchCall = fetchMock.mock.calls[0];
        fetchMock.mockRestore();

        expect(fetchCall).toEqual(['/api/user-sheet', expect.objectContaining({
            method: 'PATCH',
            body: JSON.stringify({ entry: draft, expectedUpdatedAt: 12345 }),
        })]);
    });

    it('409 충돌 응답에 포함된 최신 스냅샷을 추가 요청 없이 사용한다', async () => {
        const snapshot = {
            entries: [{
                ...draft,
                createdAt: 1,
                updatedAt: 2,
                updatedByName: '관리자',
            }],
            sheetVersion: 9,
        };
        const fetchMock = vi.spyOn(globalThis, 'fetch');
        const error = new ApiError('동시 수정 충돌', 409, {
            code: 'USER_SHEET_CONFLICT',
            body: { snapshot },
        });

        await expect(fetchUserSheetConflictSnapshot(error)).resolves.toEqual(snapshot);
        expect(fetchMock).not.toHaveBeenCalled();
        fetchMock.mockRestore();
    });

    it('배틀태그 중복 409는 병합 충돌로 취급하지 않는다', async () => {
        const error = new ApiError('같은 배틀태그가 이미 등록되어 있습니다.', 409, {
            code: 'DUPLICATE_BATTLE_TAG',
        });

        await expect(fetchUserSheetConflictSnapshot(error)).resolves.toBeNull();
    });
});

describe('validateUserSheetEntries', () => {
    it('Discord ID 형식 오류와 중복을 별도로 표시한다', () => {
        const base = {
            discordName: '유저',
            battleTag: 'Player#1234',
            tank: '',
            dps: '',
            support: '',
            note: '',
        };
        const result = validateUserSheetEntries([
            { ...base, id: 'invalid', discordUserId: '1234' },
            { ...base, id: 'duplicate-a', discordUserId: '11111111111111111' },
            { ...base, id: 'duplicate-b', discordUserId: '11111111111111111' },
        ]);

        expect(result.errors.get('invalid')).toBe('INVALID_DISCORD_USER_ID');
        expect(result.errors.get('duplicate-a')).toBe('DUPLICATE_DISCORD_USER_ID');
        expect(result.errors.get('duplicate-b')).toBe('DUPLICATE_DISCORD_USER_ID');
    });

    it('중복 배틀태그라도 서로 다른 Discord ID가 있으면 구분 가능한 행으로 허용한다', () => {
        const duplicateRows: UserSheetDraftEntry[] = [
            {
                id: 'first',
                discordUserId: '11111111111111111',
                discordName: '첫 번째',
                battleTag: 'Same#1234',
                tank: '골3',
                dps: '골3',
                support: '골3',
                note: '',
            },
            {
                id: 'second',
                discordUserId: '22222222222222222',
                discordName: '두 번째',
                battleTag: 'Same#1234',
                tank: '골3',
                dps: '골3',
                support: '골3',
                note: '',
            },
        ];

        expect(validateUserSheetEntries(duplicateRows).errors.size).toBe(0);
    });

    const draft = (
        id: string,
        battleTag: string,
        discordUserId = '',
    ): UserSheetDraftEntry => ({
        id,
        discordUserId,
        discordName: '유저',
        battleTag,
        tank: '',
        dps: '',
        support: '',
        note: '',
    });

    it('Discord ID 필수와 배틀태그 형식 오류를 구분한다', () => {
        const result = validateUserSheetEntries([
            draft('invalid', 'Player1234', '33333333333333333'),
            draft('duplicate-a', 'Player#1234'),
            draft('duplicate-b', ' player#1234 '),
        ]);

        expect(result.errors.get('invalid')).toBe('INVALID_BATTLE_TAG');
        expect(result.errors.get('duplicate-a')).toBe('REQUIRED_DISCORD_USER_ID');
        expect(result.errors.get('duplicate-b')).toBe('REQUIRED_DISCORD_USER_ID');
    });

    it('완전히 빈 행은 저장 대상과 오류 검사에서 제외한다', () => {
        const blank = draft('blank', '');
        blank.discordName = '';

        const result = validateUserSheetEntries([blank]);

        expect(result.activeRows).toHaveLength(0);
        expect(result.errors.size).toBe(0);
    });
});

describe('getUserSheetChangeSummary', () => {
    const draft = (
        id: string,
        battleTag: string,
        discordName = '유저',
    ): UserSheetDraftEntry => ({
        id,
        discordName,
        battleTag,
        tank: '다3',
        dps: '플2',
        support: '마5',
        note: '',
    });

    it('전체 인원수가 아닌 실제 추가·수정·삭제 건수를 계산한다', () => {
        const summary = getUserSheetChangeSummary(
            [
                draft('1', 'Keep#1111'),
                draft('2', 'Update#2222', '이전 이름'),
                draft('3', 'Remove#3333'),
            ],
            [
                draft('1', 'Keep#1111'),
                draft('2', 'update#2222', '새 이름'),
                draft('4', 'Add#4444'),
            ],
        );

        expect(summary).toEqual({
            addedCount: 1,
            updatedCount: 1,
            removedCount: 1,
        });
        expect(formatUserSheetChangeSummary(summary)).toBe(
            '유저 시트를 저장했습니다. (추가 1명 · 수정 1명 · 삭제 1명)',
        );
    });

    it('실제 변경이 없으면 변경 없음으로 안내한다', () => {
        const entries = [draft('1', 'Keep#1111')];
        const summary = getUserSheetChangeSummary(entries, entries);

        expect(formatUserSheetChangeSummary(summary)).toBe('변경된 내용이 없습니다.');
    });
});
