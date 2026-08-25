import { Component, StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { AppUpdateNotice } from './components/app-update-notice';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('애플리케이션 루트 요소를 찾지 못했습니다.');

interface UpdateRecoveryBoundaryProps {
    children: ReactNode;
}

interface UpdateRecoveryBoundaryState {
    hasError: boolean;
}

/**
 * @description 배포 교체 중 이전 청크를 불러오지 못해도 빈 화면 대신 최신 버전 새로고침 안내를 표시한다.
 */
class UpdateRecoveryBoundary extends Component<
    UpdateRecoveryBoundaryProps,
    UpdateRecoveryBoundaryState
> {
    state: UpdateRecoveryBoundaryState = { hasError: false };

    static getDerivedStateFromError(): UpdateRecoveryBoundaryState {
        return { hasError: true };
    }

    render() {
        if (!this.state.hasError) return this.props.children;
        return (
            <main className="flex min-h-screen items-center justify-center bg-surface p-5 text-slate-200">
                <section className="card w-full max-w-md text-center">
                    <h1 className="text-lg font-semibold text-white">새 버전이 준비됐어요</h1>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                        업데이트 중 이전 화면을 계속 불러오지 못했습니다. 새로고침하면 최신 버전으로 이어집니다.
                    </p>
                    <button
                        type="button"
                        className="btn-primary mt-5 w-full"
                        onClick={() => window.location.reload()}
                    >
                        지금 새로고침
                    </button>
                </section>
            </main>
        );
    }
}

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
const pagePromise = normalizedPath === '/discord-login-policy'
    ? import('./components/auth/discord-login-policy-page').then(module => module.DiscordLoginPolicyPage)
    : normalizedPath.startsWith('/participate/')
        ? import('./components/scrim/public-participation-page').then(module => module.PublicParticipationPage)
    : import('./App').then(module => module.default);

if (normalizedPath === '/discord-login-policy') {
    document.title = 'Discord 로그인 정보 이용 안내 | OWKR Balance';
}
if (normalizedPath.startsWith('/participate/')) document.title = 'OWKR 내전 참여';

void pagePromise.then((Page) => {
    createRoot(rootElement).render(
        <StrictMode>
            <UpdateRecoveryBoundary>
                <Page />
                <AppUpdateNotice />
            </UpdateRecoveryBoundary>
        </StrictMode>,
    );
}).catch(() => {
    createRoot(rootElement).render(
        <UpdateRecoveryBoundary>
            <main className="flex min-h-screen items-center justify-center bg-surface p-5 text-slate-200">
                <section className="card w-full max-w-md text-center">
                    <h1 className="text-lg font-semibold text-white">새 버전이 준비됐어요</h1>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                        이전 화면 파일을 불러오지 못했습니다. 새로고침하면 최신 버전을 사용할 수 있습니다.
                    </p>
                    <button
                        type="button"
                        className="btn-primary mt-5 w-full"
                        onClick={() => window.location.reload()}
                    >
                        지금 새로고침
                    </button>
                </section>
            </main>
        </UpdateRecoveryBoundary>,
    );
});
