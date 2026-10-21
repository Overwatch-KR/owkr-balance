import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MatchResultData } from '#domain/balance';
import type { Player } from '#domain/player';
import { createMatchLiveSession } from '../../utils/match-live-share';
import { createIndependentDraftRoom } from './create-independent-draft-room';

vi.mock('../../utils/match-live-share', () => ({ createMatchLiveSession: vi.fn() }));
afterEach(() => vi.resetAllMocks());

describe('independent draft room source', () => {
  it('saves its own roster source before creating the room without starting a collaboration connection', async () => {
    const players: Player[] = [];
    const result = {} as MatchResultData;
    const createRoom = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createMatchLiveSession).mockResolvedValue({ code: 'DRAFT23456' } as Awaited<ReturnType<typeof createMatchLiveSession>>);
    await createIndependentDraftRoom(players, result, 'csrf', createRoom);
    expect(createMatchLiveSession).toHaveBeenCalledWith(players, result, 'csrf');
    expect(createRoom).toHaveBeenCalledWith('DRAFT23456');
    expect(vi.mocked(createMatchLiveSession).mock.invocationCallOrder[0]).toBeLessThan(createRoom.mock.invocationCallOrder[0]);
  });

  it('does not create a room if saving its independent source fails', async () => {
    const createRoom = vi.fn();
    vi.mocked(createMatchLiveSession).mockRejectedValue(new Error('source unavailable'));
    await expect(createIndependentDraftRoom([], {} as MatchResultData, 'csrf', createRoom)).rejects.toThrow('source unavailable');
    expect(createRoom).not.toHaveBeenCalled();
  });
});
