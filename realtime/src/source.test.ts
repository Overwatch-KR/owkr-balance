import { describe, expect, it } from 'vitest';
import { parseDraftSource, SOURCE_POSITIONS } from './source.js';
import { validateDraftSource } from '../../domains/draft/shared/public.js';

const now = Date.now();
function waiting(count: number) {
  return { revision: 1, expiresAt: now + 3_600_000,
    participants: Array.from({ length: count }, (_, i) => ({ discordUserId: `10000000000000000${i.toString().padStart(2, '0')}`, position: null as string | null })) };
}
describe('waiting room source boundaries', () => {
  it('accepts empty and unassigned rosters for room creation but keeps start validation strict', () => {
    for (const count of [0, 4, 10, 12]) {
      const source = parseDraftSource('LOCAL23456', JSON.stringify(waiting(count)), [])!;
      expect(source.participants).toEqual([]);
      expect(source.pendingRosterDiscordIds).toHaveLength(Math.min(count, 10));
      expect(() => validateDraftSource(source, source, now, true)).not.toThrow();
      expect(() => validateDraftSource(source, source, now)).toThrow('10명');
    }
  });
  it('rejects partially assigned rosters, malformed ids and duplicate waiting identities', () => {
    const source = waiting(4); source.participants[0].position = SOURCE_POSITIONS[0];
    expect(() => parseDraftSource('LOCAL23456', JSON.stringify(source), [])).toThrow('10인');
    const duplicate = waiting(2); duplicate.participants[1].discordUserId = duplicate.participants[0].discordUserId;
    expect(() => parseDraftSource('LOCAL23456', JSON.stringify(duplicate), [])).toThrow('계정');
    duplicate.participants[1].discordUserId = 'invalid';
    expect(() => parseDraftSource('LOCAL23456', JSON.stringify(duplicate), [])).toThrow('계정');
  });
});
