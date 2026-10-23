/** @description 참가자의 로그인·대기·참여 불가 화면에 공통 제목을 중앙 정렬로 표시한다. */
export function DraftEntryHeader() {
  return <header className="draft-entry-header text-center">
    <p className="text-xs font-semibold tracking-[0.18em] text-cyan-400">OWKR MATCH CONTROL</p>
    <h1 className="mt-3 text-2xl font-semibold text-white">실시간 내전 참여</h1>
    <p className="mt-3 text-xs text-slate-500">공유 링크로 참여 · 참가자 전원 마이크 필수</p>
  </header>;
}
