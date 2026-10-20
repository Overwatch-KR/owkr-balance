interface DraftParticipantEntryProps {
  pending: boolean;
  error: string;
  login: () => void | Promise<void>;
  reconnect: () => void;
}

export function DraftParticipantEntry({ pending, error, login, reconnect }: DraftParticipantEntryProps) {
  return <section className="mx-auto max-w-lg border-y border-slate-700 py-10 text-center">
          <h2 className="text-xl font-semibold text-white">배정된 Discord 계정으로 참여하세요</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">공유받은 이 방에만 참여할 수 있습니다. 팀은 명단에 따라 자동 배정되며 다른 사람의 이름을 선택할 수 없습니다.</p>
          <button type="button" className="mt-6 min-h-12 w-full rounded-md bg-[#5865f2] px-5 py-3 font-semibold text-white disabled:opacity-50" disabled={pending} onClick={() => void login()}>
            {pending ? 'Discord 인증으로 이동 중…' : 'Discord로 이 내전 참여'}
          </button>
          <p className="mt-4 text-sm text-amber-200" role="status">{error}</p>
          <button type="button" className="mt-3 min-h-10 px-3 text-xs text-slate-400 underline" onClick={reconnect}>기존 참가 인증으로 다시 연결</button>
          <p className="mt-5 text-xs text-slate-500">일반 사이트의 관리자 로그인으로는 참가할 수 없습니다.</p>
        </section>;
}
