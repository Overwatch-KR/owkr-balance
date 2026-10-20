import { useState } from 'react';
import { draftRequest, useDraftRoom } from '@application/draft/use-draft-room';
import { DraftParticipantEntry } from './draft-participant-entry';
import { DraftRoomPanel } from './draft-room-panel';

/** @description 공유 링크에서만 해당 방의 참가자 Discord 인증과 투표 화면을 연다. */
export function PublicDraftPage() {
  const code = window.location.pathname.split('/')[2] ?? '';
  const validCode = /^[A-Z2-9]{10}$/.test(code);
  const controller = useDraftRoom({ roomCode: validCode ? code : null, mode: 'participant' });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const login = async () => {
    setPending(true); setError('');
    try {
      const result = await draftRequest<{ redirect: string }>('/api/draft-participant', { action: 'start', roomCode: code });
      const target = new URL(result.redirect);
      if (target.origin !== 'https://discord.com' || target.pathname !== '/oauth2/authorize') throw new Error('인증 주소를 확인하지 못했습니다.');
      window.location.assign(target);
    } catch (failure) { setError(failure instanceof Error ? failure.message : '인증을 시작하지 못했습니다.'); setPending(false); }
  };
  return <main className="min-h-screen bg-[#080a0f] px-4 py-8 text-slate-200 sm:px-8">
    <div className="mx-auto max-w-[1500px]">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div><p className="text-xs text-cyan-400">OWKR MATCH CONTROL</p><h1 className="mt-1 text-2xl font-semibold text-white">실시간 내전 참여</h1></div>
        <p className="text-xs text-slate-500">공유 링크로 참여 · 참가자 전원 마이크 필수</p>
      </header>
      {!validCode ? <p role="alert">유효한 내전 공유 링크를 확인해 주세요.</p> : controller.snapshot
        ? <DraftRoomPanel controller={controller} />
        : <DraftParticipantEntry pending={pending} error={error || controller.error} login={login} reconnect={controller.reconnect} />}
      <footer className="mt-10 text-center text-[10px] text-slate-600">Overwatch © Blizzard Entertainment</footer>
    </div>
  </main>;
}
