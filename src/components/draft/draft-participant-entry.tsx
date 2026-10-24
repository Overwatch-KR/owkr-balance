interface DraftParticipantEntryProps {
  authFailure?: string;
  pending: boolean;
  error: string;
  login: () => void | Promise<void>;
  reconnect: () => void;
}

const AUTH_FAILURE_MESSAGES: Record<string, string> = {
  NOT_PARTICIPANT: '이 디스코드 계정은 해당 내전 명단에 없습니다. 디스코드에서 배정된 계정으로 전환한 뒤 다시 인증해 주세요. 참여 예정인데도 입장되지 않으면 운영자에게 명단의 디스코드 계정 확인을 요청해 주세요.',
  AUTH_CANCELLED: '디스코드 인증을 취소했습니다. 참여하려면 다시 인증해 주세요.',
  OAUTH_STATE_EXPIRED: '인증 요청이 만료되었거나 이미 사용되었습니다. 이 화면에서 다시 인증해 주세요.',
  ROOM_EXPIRED: '내전 방이 없거나 만료되었습니다. 운영자에게 새 공유 링크를 요청해 주세요.',
  INACTIVE_ROOM: '현재 사용 중인 내전 방이 아닙니다. 운영자에게 새 공유 링크를 요청해 주세요.',
};

export function DraftParticipantEntry({ pending, error, login, reconnect, authFailure = '' }: DraftParticipantEntryProps) {
  const failureMessage = authFailure ? AUTH_FAILURE_MESSAGES[authFailure] ?? '디스코드 인증을 완료하지 못했습니다. 잠시 후 다시 인증해 주세요.' : '';
  const roomUnavailable = authFailure === 'ROOM_EXPIRED' || authFailure === 'INACTIVE_ROOM';
  return <section className="mx-auto max-w-lg border-y border-slate-700 py-10 text-center">
          <h2 className="text-xl font-semibold text-white">디스코드로 미리 로그인하세요</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">아직 명단이나 티어 입력이 끝나지 않아도 로그인할 수 있습니다. 로그인 후 대기하다가 내 명단과 팀이 정해지면 자동으로 입장합니다.</p>
          {failureMessage && <p className="mt-5 border-l-2 border-amber-500 bg-amber-500/5 px-3 py-3 text-center text-sm leading-6 text-amber-200" role="alert">{failureMessage}</p>}
          <button type="button" className="mt-6 min-h-12 w-full rounded-md bg-[#5865f2] px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={pending || roomUnavailable} onClick={() => void login()}>
            {pending ? '디스코드 인증으로 이동 중…' : authFailure ? '디스코드로 다시 인증' : '디스코드로 로그인하고 대기'}
          </button>
          {error && <p className="mt-4 text-sm text-amber-200" role="status">{error}</p>}
          {!roomUnavailable && <button type="button" className="mt-3 min-h-10 px-3 text-xs text-slate-400 underline" onClick={reconnect}>기존 참가 인증으로 다시 연결</button>}
          <p className="mt-5 text-xs text-slate-500">일반 사이트의 관리자 로그인으로는 참가할 수 없습니다.</p>
        </section>;
}
