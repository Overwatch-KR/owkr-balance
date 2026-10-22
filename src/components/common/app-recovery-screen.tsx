/** @description 화면 코드 로딩·렌더 오류에도 초기 번들만으로 수동 복구 화면을 표시한다. */
export function AppRecoveryScreen() {
  return <main className="flex min-h-screen items-center justify-center bg-surface px-5 text-slate-200">
    <section className="w-full max-w-lg border-y border-slate-700 py-8 text-center" role="alert">
      <h1 className="text-xl font-semibold text-white">화면을 다시 불러와 주세요</h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">새 버전으로 업데이트되었거나 화면을 불러오지 못했습니다. 새로고침하면 저장된 참가 인증으로 다시 연결합니다.</p>
      <button type="button" className="btn-primary mt-5 min-h-11" onClick={() => window.location.reload()}>화면 새로고침</button>
    </section>
  </main>;
}
