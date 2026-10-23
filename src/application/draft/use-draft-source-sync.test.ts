import { describe, it, expect, vi } from 'vitest';
import type { MatchResultData } from '#domain/balance';
import { publishDraftSource } from './use-draft-source-sync';
import { fetchMatchLiveSession, updateMatchLiveSession } from '../../utils/match-live-share';
vi.mock('#domain/balance', () => ({ createMatchLiveParticipants: () => [{ discordUserId: 'new', position: 'A_TANK' }] }));
vi.mock('../../utils/match-live-share', () => ({ fetchMatchLiveSession: vi.fn(), updateMatchLiveSession: vi.fn() }));
describe('draft source publishing', () => {
  it('publishes team edits to the independent source using its latest revision', async () => {
    vi.mocked(fetchMatchLiveSession).mockResolvedValue({ revision: 7, participants: [] } as never);
    await publishDraftSource('SOURCE2345', [], {} as MatchResultData, 'csrf');
    expect(updateMatchLiveSession).toHaveBeenCalledWith('SOURCE2345', 7, [], {}, 'csrf');
  });
  it('does not overwrite a newer revision after a conflict', async () => {
    vi.mocked(fetchMatchLiveSession).mockResolvedValue({ revision: 8, participants: [] } as never);
    vi.mocked(updateMatchLiveSession).mockRejectedValueOnce(new Error('conflict'));
    await expect(publishDraftSource('SOURCE2345', [], null, 'csrf')).rejects.toThrow('conflict');
  });
});
