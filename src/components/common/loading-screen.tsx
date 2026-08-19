import { DouMascot } from './dou-mascot';

/**
 * @description 로그인 세션을 확인하는 동안 전체 화면 로딩 상태를 표시한다.
 */
const LoadingScreen = () => (
    <main className="flex min-h-screen items-center justify-center bg-surface px-5 text-slate-400" role="status" aria-live="polite">
        <div className="flex flex-col items-center text-center">
            <DouMascot variant="loading" size={112} className="animate-pulse" decorative />
            <p className="mt-4 text-sm">로그인 상태를 확인하고 있습니다</p>
        </div>
    </main>
);

export default LoadingScreen;
