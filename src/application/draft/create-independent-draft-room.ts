import type { MatchResultData } from '#domain/balance';
import type { Player } from '#domain/player';
import { createMatchLiveSession } from '../../utils/match-live-share';

/** @description 밴픽용 팀 원본만 따로 저장하고 공동 편집 연결·기억·동기화를 시작하지 않는다. */
export async function createIndependentDraftRoom(
  players: Player[],
  result: MatchResultData | null,
  csrfToken: string,
  createRoom: (sourceId: string) => Promise<void>,
): Promise<void> {
  const source = await createMatchLiveSession(players, result, csrfToken);
  await createRoom(source.code);
}
