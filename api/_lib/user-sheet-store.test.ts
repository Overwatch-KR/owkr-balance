import type { Redis } from '@upstash/redis';
import { describe, expect, it, vi } from 'vitest';
import {
    deleteUserSheetEntry,
    getUserSheetBattleTagHistory,
    replaceUserSheet,
    syncRosterUserSheetEntries,
    updateUserSheetEntry,
    type StoredUserSheetEntry,
} from './user-sheet-store';

const storedEntry: StoredUserSheetEntry = {
    id: 'sheet-1',
    discordUserId: '11111111111111111',
    discordName: '유저',
    battleTag: 'Player#1234',
    tank: '다3',
    dps: '플2',
    support: '마5',
    note: '공유 메모',
    createdAt: 1,
    updatedAt: 10,
    updatedByName: '관리자 A',
    battleTagHistory: ['Legacy#1111', 'Player#1234'],
};

const createRedis = () => ({
    eval: vi.fn(),
    hget: vi.fn(),
}) as unknown as Redis;

describe('user sheet atomic store', () => {
    it('전체 저장에서 기대 시트 버전이 다르면 교체하지 않는다', async () => {
        const redis = createRedis();
        vi.mocked(redis.eval)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce({
                entries: [storedEntry],
                sheetVersion: 4,
            })
            .mockResolvedValueOnce({ status: 'CONFLICT' });

        const result = await replaceUserSheet(
            redis,
            [storedEntry],
            3,
            '관리자 B',
        );

        expect(result).toEqual({ status: 'CONFLICT' });
        expect(redis.eval).toHaveBeenCalledTimes(3);
        expect(vi.mocked(redis.eval).mock.calls[2]?.[2]?.[0]).toBe('3');
    });

    it('행 수정에서 기대 updatedAt을 원자 스크립트에 전달한다', async () => {
        const redis = createRedis();
        vi.mocked(redis.eval)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce({ status: 'CONFLICT' });
        vi.mocked(redis.hget).mockResolvedValue(storedEntry);

        const result = await updateUserSheetEntry(
            redis,
            { ...storedEntry, note: '새 공유 메모' },
            storedEntry.updatedAt,
            '관리자 B',
        );

        expect(result).toEqual({ status: 'CONFLICT' });
        expect(vi.mocked(redis.eval).mock.calls[1]?.[2]?.slice(0, 3)).toEqual([
            storedEntry.id,
            String(storedEntry.updatedAt),
            'player#1234',
        ]);
    });

    it('행 삭제에서 기대 updatedAt을 원자 스크립트에 전달한다', async () => {
        const redis = createRedis();
        vi.mocked(redis.eval)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce({ status: 'CONFLICT' });

        const result = await deleteUserSheetEntry(redis, storedEntry.id, storedEntry.updatedAt);

        expect(result).toEqual({ status: 'CONFLICT' });
        expect(vi.mocked(redis.eval).mock.calls[1]?.[2]).toEqual([
            storedEntry.id,
            String(storedEntry.updatedAt),
        ]);
    });

    it('행 ID 메모 이관을 위해 현재와 과거 BattleTag를 함께 반환한다', async () => {
        const redis = createRedis();
        vi.mocked(redis.eval).mockResolvedValue(0);
        vi.mocked(redis.hget).mockResolvedValue(storedEntry);

        const history = await getUserSheetBattleTagHistory(
            redis,
            storedEntry.id,
            'Renamed#9999',
        );

        expect(history).toEqual([
            'Legacy#1111',
            'Player#1234',
            'Renamed#9999',
        ]);
    });

    it('명단 동기화에서 이름과 배틀태그를 갱신해도 특이사항은 보존한다', async () => {
        const redis = createRedis();
        vi.mocked(redis.eval)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce({
                entries: [storedEntry],
                sheetVersion: 4,
            })
            .mockResolvedValueOnce({ status: 'OK' })
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce({
                entries: [{
                    ...storedEntry,
                    discordName: '새 이름',
                    battleTag: 'Renamed#9999',
                    tank: '마1',
                }],
                sheetVersion: 5,
            });

        const result = await syncRosterUserSheetEntries(
            redis,
            [{
                entryId: storedEntry.id,
                discordUserId: storedEntry.discordUserId,
                discordName: '새 이름',
                battleTag: 'Renamed#9999',
                tank: '마1',
                dps: '다2',
                support: '다3',
                syncTiers: true,
            }],
            4,
            '관리자 B',
        );

        expect(result).toMatchObject({
            status: 'OK',
            addedCount: 0,
            tierUpdatedCount: 1,
            updatedCount: 1,
        });
        const savedEntries = JSON.parse(
            String(vi.mocked(redis.eval).mock.calls[2]?.[2]?.[1]),
        ) as StoredUserSheetEntry[];
        expect(savedEntries[0]).toMatchObject({
            id: storedEntry.id,
            discordName: '새 이름',
            battleTag: 'Renamed#9999',
            tank: '마1',
            dps: '다2',
            support: '다3',
            note: '공유 메모',
        });
    });

    it('티어 동기화를 끈 기존 유저는 프로필만 바꾸고 기존 티어를 유지한다', async () => {
        const redis = createRedis();
        vi.mocked(redis.eval)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce({
                entries: [storedEntry],
                sheetVersion: 4,
            })
            .mockResolvedValueOnce({ status: 'OK' })
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce({
                entries: [{ ...storedEntry, discordName: '새 이름' }],
                sheetVersion: 5,
            });

        const result = await syncRosterUserSheetEntries(
            redis,
            [{
                entryId: storedEntry.id,
                discordUserId: storedEntry.discordUserId,
                discordName: '새 이름',
                battleTag: storedEntry.battleTag,
                tank: '브5',
                dps: '브5',
                support: '브5',
                syncTiers: false,
            }],
            4,
            '관리자 B',
        );

        expect(result).toMatchObject({ status: 'OK', tierUpdatedCount: 0, updatedCount: 1 });
        const savedEntries = JSON.parse(
            String(vi.mocked(redis.eval).mock.calls[2]?.[2]?.[1]),
        ) as StoredUserSheetEntry[];
        expect(savedEntries[0]).toMatchObject({
            discordName: '새 이름',
            tank: storedEntry.tank,
            dps: storedEntry.dps,
            support: storedEntry.support,
        });
    });

    it('입력에 Discord 이름이 없으면 기존 시트 이름을 지우지 않는다', async () => {
        const redis = createRedis();
        vi.mocked(redis.eval)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce({
                entries: [storedEntry],
                sheetVersion: 4,
            });

        const result = await syncRosterUserSheetEntries(
            redis,
            [{
                entryId: storedEntry.id,
                discordUserId: storedEntry.discordUserId,
                discordName: '',
                battleTag: storedEntry.battleTag,
                tank: '브5',
                dps: '브5',
                support: '브5',
                syncTiers: false,
            }],
            4,
            '관리자 B',
        );

        expect(result).toMatchObject({
            status: 'OK',
            updatedCount: 0,
            snapshot: {
                entries: [{ discordName: storedEntry.discordName }],
                sheetVersion: 4,
            },
        });
        expect(redis.eval).toHaveBeenCalledTimes(2);
    });

    it('이름과 배틀태그가 모두 바뀌어도 같은 Discord ID면 기존 행 하나만 갱신한다', async () => {
        const redis = createRedis();
        const existing: StoredUserSheetEntry = {
            ...storedEntry,
            discordUserId: '111111111111111101',
            discordName: '청록별',
            battleTag: 'NeonFox#12847',
            tank: '다3',
            dps: '플2',
            support: '골1',
        };
        vi.mocked(redis.eval)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce({
                entries: [existing],
                sheetVersion: 7,
            })
            .mockResolvedValueOnce({ status: 'OK' })
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce({
                entries: [{
                    ...existing,
                    discordName: '청별',
                    battleTag: 'NeonFx#12847',
                    tank: '챔1',
                }],
                sheetVersion: 8,
            });

        const result = await syncRosterUserSheetEntries(
            redis,
            [{
                discordUserId: '111111111111111101',
                discordName: '청별',
                battleTag: 'NeonFx#12847',
                tank: '챔1',
                dps: '플2',
                support: '골1',
                syncTiers: true,
            }],
            7,
            '관리자 B',
        );

        expect(result).toMatchObject({
            status: 'OK',
            addedCount: 0,
            updatedCount: 1,
            tierUpdatedCount: 1,
        });
        const savedEntries = JSON.parse(
            String(vi.mocked(redis.eval).mock.calls[2]?.[2]?.[1]),
        ) as StoredUserSheetEntry[];
        expect(savedEntries).toHaveLength(1);
        expect(savedEntries[0]).toMatchObject({
            id: existing.id,
            discordUserId: existing.discordUserId,
            discordName: '청별',
            battleTag: 'NeonFx#12847',
            tank: '챔1',
            dps: '플2',
            support: '골1',
        });
    });

    it('Discord ID가 없는 행은 전체 시트에 저장하지 않는다', async () => {
        const redis = createRedis();
        vi.mocked(redis.eval)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce({
                entries: [storedEntry],
                sheetVersion: 4,
            });

        const result = await replaceUserSheet(
            redis,
            [{ ...storedEntry, discordUserId: undefined }],
            4,
            '관리자 B',
        );

        expect(result).toEqual({ status: 'INVALID' });
        expect(redis.eval).toHaveBeenCalledTimes(2);
    });

    it('서로 다른 Discord ID가 있으면 같은 배틀태그의 신규 유저도 함께 저장한다', async () => {
        const redis = createRedis();
        vi.mocked(redis.eval)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce({ entries: [], sheetVersion: 0 })
            .mockResolvedValueOnce({ status: 'OK' })
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce({ entries: [], sheetVersion: 1 });

        const result = await syncRosterUserSheetEntries(
            redis,
            [
                {
                    discordUserId: '22222222222222222',
                    discordName: '첫 번째',
                    battleTag: 'Same#1234',
                    tank: '골1',
                    dps: '골1',
                    support: '골1',
                    syncTiers: true,
                },
                {
                    discordUserId: '33333333333333333',
                    discordName: '두 번째',
                    battleTag: 'Same#1234',
                    tank: '플1',
                    dps: '플1',
                    support: '플1',
                    syncTiers: true,
                },
            ],
            0,
            '관리자 B',
        );

        expect(result).toMatchObject({ status: 'OK', addedCount: 2 });
        const savedEntries = JSON.parse(
            String(vi.mocked(redis.eval).mock.calls[2]?.[2]?.[1]),
        ) as StoredUserSheetEntry[];
        expect(savedEntries).toHaveLength(2);
        expect(savedEntries.map(entry => entry.discordUserId)).toEqual([
            '22222222222222222',
            '33333333333333333',
        ]);
    });
});
