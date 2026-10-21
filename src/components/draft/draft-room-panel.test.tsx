import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_DRAFT_MAP_CATALOG } from '#domain/draft';
import { DraftMapPick } from './draft-map-pick';
import type { DraftRoomSnapshot } from '#domain/draft';
import { DraftSelection } from './draft-selection';
import { DraftBanResult } from './draft-ban-result';
import { DraftRoomPanel } from './draft-room-panel';
import { DraftOperatorActions } from './draft-operator-actions';
import { DraftConnectionStatus } from './draft-connection-status';
import { getDraftGuidance, getDraftPrimaryAction, getDraftStep, getDraftTeamScores, clearDraftBanRank } from './draft-room-view';

function snapshot(): DraftRoomSnapshot {
  return {
    roomCode: 'EXAMPLE234', gameId: 'game', gameIndex: 1, epoch: 1, roomRevision: 1, expiresAt: 10000,
    phase: 'HERO_VOTING', timer: { phase: 'HERO_VOTING', status: 'ACTIVE', deadlineAt: 9000, remainingMs: null, expiresAt: 10000, epoch: 1 },
    participants: [{ userSheetId: 'self', discordId: 'self', displayName: '하늘', team: 'A', role: 'TANK', slot: 0 },
      { userSheetId: 'ally', discordId: 'ally', displayName: '별빛', team: 'A', role: 'SUPPORT', slot: 1 },
      { userSheetId: 'enemy', discordId: 'enemy', displayName: '상대', team: 'B', role: 'SUPPORT', slot: 1 }],
    selfDiscordId: 'self', isOperator: false, selfReady: false, readyCount: 0, availableMapCount: 4, availableMaps: [], mapSelection: { mode: 'VOTE', pickerDiscordId: null }, inputConnected: true,
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
  it('2픽을 해제해도 3픽 위치와 점수를 유지한다', () => {
    const view = snapshot();
    const selection = clearDraftBanRank(view.ballots!.self!.selection, 1);
    expect(selection).toEqual(['ana', '', 'sombra']);
    view.ballots = { ...view.ballots!, self: { ...view.ballots!.self!, selection }, teammates: [] };
    expect(getDraftTeamScores(view).map(entry => [entry.hero.heroId, entry.points])).toEqual([['ana', 7], ['sombra', 3]]);
    const markup = render(<DraftSelection controller={{ snapshot: view, connected: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() }} />);
    expect(markup).toContain('내 밴 투표 2순위: 선택 없음');
    expect(markup).toContain('내 밴 투표 3순위: 솜브라');
  });
  it('저장된 우리 팀 점수를 합산하고 본인 중복 표와 상대 표를 제외한다', () => {
    const view = snapshot();
    view.ballots = { ...view.ballots!, teammates: [...view.ballots!.teammates, view.ballots!.self!,
      { discordId: 'enemy', ballotRevision: 1, selection: ['ana'], locked: true }] };
    expect(getDraftTeamScores(view).map(entry => [entry.hero.heroId, entry.points])).toEqual([['dva', 12], ['ana', 10], ['sombra', 8]]);
    const markup = render(<DraftSelection controller={{ snapshot: view, connected: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() }} />);
    const scores = markup.slice(markup.indexOf('aria-label="득표 상위 영웅"'), markup.indexOf('aria-label="우리 팀 선택 현황"'));
    expect(scores).toContain('D.Va 12점');
    expect(scores).not.toMatch(/>\s*[123]순위\s*</);
    const own = markup.slice(markup.indexOf('aria-label="내 밴 투표"'));
    expect([...own.matchAll(/data-my-vote-rank="(.*?)"/g)].map(match => match[1])).toEqual(['1', '2', '3']);
    expect(own.indexOf('내 밴 투표 1순위: 아나')).toBeLessThan(own.indexOf('내 밴 투표 2순위: D.Va'));
    expect(own.indexOf('내 밴 투표 2순위: D.Va')).toBeLessThan(own.indexOf('내 밴 투표 3순위: 솜브라'));
  });
  it('전원 기권이면 팀 점수에 가짜 영웅이나 점수를 채우지 않는다', () => {
    const view = snapshot();
    view.ballots = { ...view.ballots!, self: { ...view.ballots!.self!, selection: [] }, teammates: [] };
    expect(getDraftTeamScores(view)).toEqual([]);
    const markup = render(<DraftSelection controller={{ snapshot: view, connected: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() }} />);
    expect(markup).toContain('1번째: 득표 없음');
    expect(markup).toContain('내 밴 투표 1순위: 선택 없음');
    expect(markup).toContain('기권 준비');
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
  it('다른 참가자에게 팟지 확정 버튼을 제공하지 않고 현재 선택자를 안내한다', () => {
    const view = snapshot(); view.phase = 'MAP_PICKING'; view.availableMaps = DEFAULT_DRAFT_MAP_CATALOG.entries;
    view.mapSelection = { mode: 'POTG', pickerDiscordId: 'ally' };
    const markup = render(<DraftMapPick controller={{ snapshot: view, connected: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() }} />);
    expect(markup).toContain('별빛님의 맵 선택을 기다리고 있습니다');
    expect(markup).not.toContain('이 맵으로 확정');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*aria-label="아틀리스"/);
  });
  it('지정 선수에게 미사용 전체 맵 탐색과 확정 기능을 제공한다', () => {
    const view = snapshot(); view.phase = 'MAP_PICKING'; view.availableMaps = DEFAULT_DRAFT_MAP_CATALOG.entries;
    view.mapSelection = { mode: 'POTG', pickerDiscordId: 'self' };
    const markup = render(<DraftMapPick controller={{ snapshot: view, connected: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() }} />);
    expect(markup).toContain('미사용 맵 31개'); expect(markup).toContain('맵 검색'); expect(markup).toContain('다음 맵');
    expect(markup).toContain('이 맵으로 확정'); expect(markup).toContain('3초');
  });
  it('전원 기권은 가짜 밴 슬롯이나 선택 팀을 만들지 않는다', () => {
    const view = snapshot(); view.heroResult = { ...view.heroResult!, firstTeam: null, slots: [], bannedHeroIds: [] };
    const markup = render(<DraftBanResult snapshot={view} onCopy={vi.fn()} />);
    expect(markup).toContain('전원 기권'); expect(markup).not.toContain('data-ban-order');
  });
  it('다른 창에 연결을 넘긴 경우 명시적 재연결을 안내하고 입력을 잠근다', () => {
    const markup = render(<DraftRoomPanel controller={{ snapshot: snapshot(), connected: false, connectionReplaced: true,
      pending: false, error: '다른 창에서 연결했습니다.', command: vi.fn(), reconnect: vi.fn() }} />);
    expect(markup).toContain('이 창에서 다시 연결');
    expect(markup).toContain('다른 창에서 계속 진행하거나');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*aria-label="아나"/);
  });

  it('밴 준비 완료 후에도 수정할 수 있고 마감 이후에는 입력을 막는다', () => {
    const view = snapshot();
    let markup = render(<DraftSelection controller={{ snapshot: view, connected: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() }} />);
    expect(markup).toContain('자동 준비됩니다.');
    expect(markup).toContain('픽을 해제하면 준비가 풀리고');
    expect(markup).not.toContain('draft-pick-rank');
    expect(markup).not.toContain('7점');
    expect(markup).not.toContain('5점');
    expect(markup).not.toContain('3점');
    expect(markup).toContain('영웅 역할 보기');
    view.ballots = { ...view.ballots!, self: { ...view.ballots!.self!, selection: [] } };
    markup = render(<DraftSelection controller={{ snapshot: view, connected: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() }} />);
    expect(markup).toContain('기권 준비');
    view.ballots.self!.locked = true;
    markup = render(<DraftSelection controller={{ snapshot: view, connected: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() }} />);
    expect(markup).toContain('준비 완료 · 마감 전까지 수정할 수 있습니다.');
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="아나"/);
    view.stageStatus = 'SEALED';
    markup = render(<DraftSelection controller={{ snapshot: view, connected: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() }} />);
    expect(markup).toContain('투표 마감');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*aria-label="아나"/);
  });

  it('진행 단계를 표시하고 멈춘 상태와 팟지 대기를 구분한다', () => {
    const view = snapshot();
    expect(getDraftStep(view)).toBe(2);
    view.phase = 'MAP_PICKING'; view.mapSelection = { mode: 'POTG', pickerDiscordId: 'ally' };
    expect(getDraftStep(view)).toBe(1);
    expect(getDraftGuidance(view)).toContain('별빛님의 맵 선택을 기다리는 중');
    view.timer.status = 'PAUSED';
    expect(getDraftGuidance(view)).toBe('운영자가 진행을 일시정지했습니다.');
    const markup = render(<DraftRoomPanel controller={{ snapshot: view, connected: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() }} />);
    expect(markup).toContain('밴픽 진행 단계');
    expect(markup).not.toContain('선호 영웅');
    expect(markup).toContain('aria-current="step"');
    expect(markup).toContain('진행 정지');
  });

  it('현재 경기 상태에 맞는 운영 작업을 선택한다', () => {
    const view = snapshot();
    expect(getDraftPrimaryAction(view)).toBeNull();
    view.phase = 'HERO_RESOLVED';
    expect(getDraftPrimaryAction(view)?.type).toBe('game.confirmApplied');
    view.phase = 'COMPLETED';
    expect(getDraftPrimaryAction(view)?.type).toBe('game.markStarted');
    view.playStatus = 'PLAYING';
    expect(getDraftPrimaryAction(view)?.type).toBe('game.markFinished');
    view.playStatus = 'FINISHED';
    expect(getDraftPrimaryAction(view)?.type).toBe('game.next');
    view.playStatus = 'NOT_STARTED'; view.timer.status = 'RECOVERY_PAUSED';
    expect(getDraftPrimaryAction(view)?.type).toBe('draft.resume');
    view.timer.status = 'ROSTER_CHANGED';
    expect(getDraftPrimaryAction(view)).toBeNull();
  });

  it('관리자의 다음 작업을 대화상자 밖에 표시한다', () => {
    const view = snapshot(); view.phase = 'HERO_RESOLVED'; view.isOperator = true; view.ballots = null;
    const markup = render(<DraftRoomPanel controller={{ snapshot: view, connected: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() }} admin />);
    expect(markup).toContain('다음 운영 작업');
    expect(markup).toContain('게임 설정 적용 확인');
    expect(markup).not.toContain('role="dialog"');
  });

  it('접속·입력·준비가 부족하면 이름과 이유를 표시하고 시작을 잠근다', () => {
    const view = snapshot(); view.phase = 'LOBBY'; view.isOperator = true; view.readyCount = 9;
    view.progress = Array.from({ length: 10 }, (_, index) => ({ ...view.participants[0], discordId: String(index),
      displayName: index === 9 ? '확인대상' : `참가자${index}`, connectionStatus: index === 9 ? 'DISCONNECTED' : 'CONNECTED',
      inputConnected: index !== 9, ready: index !== 9, confirmed: false, lastJoinedAt: 1, lastDisconnectedAt: null }));
    const controller = { snapshot: view, connected: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() };
    let markup = render(<DraftOperatorActions controller={controller} execute={vi.fn()} />);
    expect(markup).toContain('미접속: 확인대상');
    expect(markup).toContain('미준비: 확인대상');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>밴픽 시작/);
    view.progress = view.progress.map(player => ({ ...player, connectionStatus: 'CONNECTED', inputConnected: true, ready: true }));
    view.readyCount = 10;
    markup = render(<DraftOperatorActions controller={controller} execute={vi.fn()} />);
    expect(markup).toContain('10명 모두 준비되었습니다.');
    expect(markup).not.toMatch(/<button[^>]*disabled=""[^>]*>밴픽 시작/);
    view.availableMapCount = 2;
    markup = render(<DraftOperatorActions controller={controller} execute={vi.fn()} />);
    expect(markup).toContain('남은 맵 2개로 진행');
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>밴픽 시작/);
  });

  it('연결 문제를 우선 안내하고 이전 저장 알림을 숨긴다', () => {
    const controller = { snapshot: snapshot(), connected: false, reconnecting: true, pending: false, error: '', command: vi.fn(), reconnect: vi.fn() };
    let markup = render(<DraftConnectionStatus controller={controller} notice="지난 저장 알림" />);
    expect(markup).toContain('다시 연결 중');
    expect(markup).not.toContain('지난 저장 알림');
    markup = render(<DraftConnectionStatus controller={{ ...controller, connectionReplaced: true }} notice="지난 저장 알림" />);
    expect(markup).toContain('다른 창에서 진행 중');
    expect(markup).not.toContain('다시 연결 중');
    expect(markup).not.toContain('지난 저장 알림');
  });

});
