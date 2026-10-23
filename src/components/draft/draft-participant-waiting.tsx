import { CheckCircle2, Clock3, UserRoundX } from 'lucide-react';
import type { DraftParticipantAdmission } from '#domain/draft';

/** @description 로그인된 계정의 명단 대기·제외 상태를 보여주며 팀 배정은 자동으로 다시 확인한다. */
export function DraftParticipantWaiting({ admission, error, login, pending = false }: {
  admission: DraftParticipantAdmission; error: string; pending?: boolean; login: () => void | Promise<void>;
}) {
  const excluded = admission.status === 'EXCLUDED';
  const Icon = excluded ? UserRoundX : Clock3;
  return <section className="app-status-content mx-auto border-y border-slate-700 py-10 text-center" aria-labelledby="draft-waiting-title">
    <div className="mb-6 inline-flex items-center gap-2 text-sm text-emerald-300"><CheckCircle2 size={18} aria-hidden="true" />Discord 로그인 완료 · {admission.displayName}</div>
    <Icon size={36} className={`mx-auto mb-4 ${excluded ? 'text-amber-300' : 'text-cyan-300'}`} aria-hidden="true" />
    <h2 id="draft-waiting-title" className="text-2xl font-semibold text-white">{excluded ? '이번 내전 명단에 포함되지 않았습니다' : '아직 내전 명단이 작성되지 않았습니다.'}</h2>
    <p className="mt-4 text-sm leading-7 text-slate-300">{excluded
      ? '현재 참가자 10명에 이 계정이 포함되어 있지 않습니다. 참여 예정이라면 운영자에게 명단을 확인해 주세요.'
      : '티어를 아직 작성하지 않았다면 Discord 내전 티어 채널에 티어를 작성해 주세요. 내전 명단과 팀 배정이 완료되면 자동으로 입장합니다.'}</p>
    <p className="mt-5 font-mono text-lg text-cyan-200">명단 {admission.participantCount}/10</p>
    <p className="mt-2 text-xs text-slate-500">이 화면을 열어 두면 상태가 자동으로 갱신됩니다.</p>
    {error && <p role="status" className="mt-4 text-sm text-amber-200">{error}</p>}
    <button type="button" className="btn-ghost mt-6 text-sm" disabled={pending} onClick={() => void login()}>{pending ? 'Discord 인증으로 이동 중…' : '다른 Discord 계정으로 로그인'}</button>
  </section>;
}
