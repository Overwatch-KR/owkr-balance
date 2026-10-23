import { useEffect, useState } from 'react';
import { draftRequest, useDraftRoom } from '@application/draft/use-draft-room';
import { DraftParticipantWaiting } from './draft-participant-waiting';
import { DraftParticipantEntry } from './draft-participant-entry';
import { DraftRoomPanel } from './draft-room-panel';
import { DraftEntryHeader } from './draft-entry-header';
import { DraftClosedRoom } from './draft-closed-room';

/** @description 공유 링크에서만 해당 방의 참가자 Discord 인증과 투표 화면을 연다. */
export function PublicDraftPage() {
  const code = window.location.pathname.split('/')[2] ?? '';
  const validCode = /^[A-Z2-9]{10}$/.test(code);
  const [authFailure, setAuthFailure] = useState(() => new URL(window.location.href).searchParams.get('draft_error') ?? '');
  const controller = useDraftRoom({ roomCode: validCode && !authFailure ? code : null, mode: 'participant' });
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('draft_error')) return;
    url.searchParams.delete('draft_error');
    url.searchParams.delete('draft_code');
    window.history.replaceState({}, '', url);
  }, []);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const login = async () => {
    setPending(true); setError('');
    try {
      const result = await draftRequest<{ redirect: string }>('/api/draft-participant', { action: 'start', roomCode: code });
      const target = new URL(result.redirect);
      if (target.origin !== 'https://discord.com' || target.pathname !== '/oauth2/authorize') throw new Error('인증 주소를 확인하지 못했습니다.');
      window.location.assign(target);
    } catch (failure) {
      if (failure instanceof Error && 'code' in failure && ['ROOM_CLOSED', 'ROOM_EXPIRED', 'INACTIVE_ROOM'].includes(String(failure.code))) setAuthFailure(String(failure.code));
      setError(failure instanceof Error ? failure.message : '인증을 시작하지 못했습니다.'); setPending(false);
    }
  };
  const entryScreen = !controller.snapshot || controller.roomClosed || controller.participantAuthRequired
    || Boolean(controller.admission) || Boolean(authFailure) || !validCode;
  return <main className={`draft-public-page app-canvas bg-surface text-slate-200 ${entryScreen ? 'draft-entry-page' : ''}`}>
    <div className={`draft-public-content mx-auto w-full ${entryScreen ? 'draft-entry-content' : ''}`}>
      {entryScreen && <DraftEntryHeader />}
      {controller.roomClosed || ['ROOM_CLOSED', 'ROOM_EXPIRED', 'INACTIVE_ROOM'].includes(authFailure) ? <DraftClosedRoom reason={authFailure || controller.roomUnavailableReason} /> : !validCode ? <section className="app-status-content mx-auto border-y border-slate-700 py-10 text-center">
        <h2 className="text-xl font-semibold text-white">참가 인증을 다시 시작해 주세요</h2>
        <p className="mt-3 text-sm text-amber-200" role="alert">인증 요청이 만료되었거나 유효한 내전 공유 링크를 확인할 수 없습니다.</p>
        <p className="mt-3 text-sm text-slate-400">공유받은 내전 링크를 다시 열어 주세요. 링크가 없거나 방이 만료되었다면 운영자에게 새 링크를 요청해 주세요.</p>
      </section> : controller.admission ? <DraftParticipantWaiting admission={controller.admission} error={error || controller.error} login={login} pending={pending} />
        : controller.snapshot && !controller.participantAuthRequired
        ? <DraftRoomPanel controller={controller} />
        : authFailure || controller.participantAuthRequired
          ? <DraftParticipantEntry pending={pending} error={error || (controller.error === 'Discord로 참여해 주세요.' ? '' : controller.error)} login={login} authFailure={authFailure} reconnect={() => { setAuthFailure(''); controller.reconnect(); }} />
          : <section className="mx-auto w-full max-w-lg border-y border-slate-700 py-10 text-center">
            <h2 className="text-lg font-semibold text-white" role="status">{controller.error && !controller.reconnecting ? '내전 연결을 확인해 주세요' : '참가 인증을 확인하고 있습니다'}</h2>
            <p className="mt-3 text-sm text-slate-400">{controller.error || '저장된 인증으로 내전에 연결하고 있습니다. 잠시만 기다려 주세요.'}</p>
            {controller.error && !controller.reconnecting && <button type="button" className="btn-ghost mt-5 min-h-11" onClick={controller.reconnect}>다시 연결</button>}
          </section>}
      <footer className="mt-2 shrink-0 text-center text-[10px] text-slate-600">Overwatch © Blizzard Entertainment</footer>
    </div>
  </main>;
}
