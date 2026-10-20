import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { DraftRoomSnapshot } from '#domain/draft';
import { DraftSelection } from './draft-selection';
import { DraftBanResult } from './draft-ban-result';

function snapshot(): DraftRoomSnapshot {
  return {
    roomCode: 'EXAMPLE234', gameId: 'game', gameIndex: 1, epoch: 1, roomRevision: 1, expiresAt: 10000,
    phase: 'HERO_VOTING', timer: { phase: 'HERO_VOTING', status: 'ACTIVE', deadlineAt: 9000, remainingMs: null, expiresAt: 10000, epoch: 1 },
    participants: [{ userSheetId: 'self', discordId: 'self', displayName: '하늘', team: 'A', role: 'TANK', slot: 0 },
      { userSheetId: 'ally', discordId: 'ally', displayName: '별빛', team: 'A', role: 'SUPPORT', slot: 1 },
      { userSheetId: 'enemy', discordId: 'enemy', displayName: '상대', team: 'B', role: 'SUPPORT', slot: 1 }],
    selfDiscordId: 'self', isOperator: false, selfReady: false, readyCount: 0, availableMapCount: 4, inputConnected: true,
    heroes: [{ heroId: 'ana', nameKo: '아나', role: 'SUPPORT', active: true }, { heroId: 'dva', nameKo: 'D.Va', role: 'TANK', active: true },
      { heroId: 'sombra', nameKo: '솜브라', role: 'DPS', active: true }], stageKind: 'BAN', candidates: null,
    mapResult: { resolutionId: 'map', method: 'WEIGHTED', selectedOption: 'map', totals: {}, draws: [], firstAttackTeam: 'A',
      map: { mapId: 'map', canonicalMapId: 'map', nameKo: '왕의 길', nameEn: 'Kings Row', mode: 'HYBRID', active: true } },
    heroResult: { resolutionId: 'result', catalogVersion: 'example', firstTeam: 'B', scores: { A: [], B: [] },
      slots: [{ team: 'B', heroId: 'ana', skipped: [] }, { team: 'A', heroId: null, skipped: [] }, { team: 'A', heroId: 'dva', skipped: [] }, { team: 'B', heroId: 'sombra', skipped: [] }],
      bannedHeroIds: ['ana', 'dva', 'sombra'], roleCounts: { TANK: 1, DPS: 1, SUPPORT: 1 }, draws: [] },
    ballots: { self: { discordId: 'self', ballotRevision: 1, selection: ['ana', 'dva', 'sombra'], locked: false },
      teammates: [{ discordId: 'ally', ballotRevision: 1, selection: ['dva', 'sombra', 'ana'], locked: true }], confirmedCounts: { A: 1, B: 0 }, mapTotals: null },
    playStatus: 'NOT_STARTED', serverNow: 1000,
  };
}
function render(content: React.ReactNode) {
  const client = new QueryClient();
  client.setQueryData(['draft-asset-manifest'], { assets: ['ana', 'dva', 'sombra'].map(id => ({ id, kind: 'heroes', localPath: `/hero/test/${id}.webp` })) });
  return renderToStaticMarkup(<QueryClientProvider client={client}>{content}</QueryClientProvider>);
}

describe('draft selection and ban results', () => {
  it('본인과 팀원의 이름 아래에 3,2,1순위 초상화를 각자의 표대로 표시한다', () => {
    const markup = render(<DraftSelection controller={{ snapshot: snapshot(), connected: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() }} />);
    const self = markup.slice(markup.indexOf('aria-label="하늘 내 선택"'), markup.indexOf('aria-label="별빛 선택 현황"'));
    expect(self.indexOf('src="/hero/test/sombra.webp"')).toBeLessThan(self.indexOf('src="/hero/test/dva.webp"'));
    expect(self.indexOf('src="/hero/test/dva.webp"')).toBeLessThan(self.indexOf('src="/hero/test/ana.webp"'));
    expect(self).not.toMatch(/>\s*[123]\s*<\//);
    expect(markup).toContain('aria-label="별빛 3순위: 아나"');
    expect(markup).not.toContain('상대 선택 현황');
    expect(markup).not.toContain('내 밴 순위');
    expect(markup).toContain('aria-label="3순위 위로"');
  });
  it('서버 슬롯의 B,A,A,B 순서와 빈 슬롯을 보존하고 진영에 맞는 색을 표시한다', () => {
    const markup = render(<DraftBanResult snapshot={snapshot()} onCopy={vi.fn()} />);
    expect([...markup.matchAll(/data-ban-team="(.*?)"/g)].map(match => match[1])).toEqual(['B', 'A', 'A', 'B']);
    expect(markup).toContain('밴 없음');
    expect(markup).toContain('수비 · B팀 선택');
    expect(markup).toContain('공격 · A팀 선택');
    expect(markup).toContain('1·4번 밴');
    expect(markup).toContain('2·3번 밴');
    expect(markup).toContain('bg-red-500');
    expect(markup).toContain('bg-blue-500');
  });
  it('공격 수비가 없는 맵에서 임의의 진영을 붙이지 않는다', () => {
    const view = snapshot(); view.mapResult = { ...view.mapResult!, firstAttackTeam: null };
    const markup = render(<DraftBanResult snapshot={view} onCopy={vi.fn()} />);
    expect(markup).toContain('A팀 선택'); expect(markup).toContain('B팀 선택');
    expect(markup).not.toContain('공격 ·'); expect(markup).not.toContain('수비 ·');
  });
  it('전원 기권은 가짜 밴 슬롯이나 선택 팀을 만들지 않는다', () => {
    const view = snapshot(); view.heroResult = { ...view.heroResult!, firstTeam: null, slots: [], bannedHeroIds: [] };
    const markup = render(<DraftBanResult snapshot={view} onCopy={vi.fn()} />);
    expect(markup).toContain('전원 기권'); expect(markup).not.toContain('data-ban-order');
  });
});
