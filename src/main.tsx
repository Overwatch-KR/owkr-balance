import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { APP_UPDATE_AVAILABLE_EVENT, AppUpdateNotice } from './components/app-update-notice';
import LoadingScreen from './components/common/loading-screen';
import { AppNavigationShell } from './components/layout/app-navigation-shell';
import { AuthProvider } from './hooks/use-auth';
import { queryClient } from './query-client';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('애플리케이션 루트 요소를 찾지 못했습니다.');

window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    window.dispatchEvent(new Event(APP_UPDATE_AVAILABLE_EVENT));
});

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
const pagePromise = normalizedPath === '/discord-login-policy'
    ? import('./components/auth/discord-login-policy-page').then(module => module.DiscordLoginPolicyPage)
    : normalizedPath.startsWith('/participate/')
        ? import('./components/scrim/public-participation-page').then(module => module.PublicParticipationPage)
        : import('./App').then(module => module.default);
const shouldUseAppNavigation = normalizedPath !== '/discord-login-policy'
    && !normalizedPath.startsWith('/participate/');
const LazyPage = lazy(() => pagePromise.then(Page => ({ default: Page })));

if (normalizedPath === '/discord-login-policy') {
    document.title = 'Discord 로그인 정보 이용 안내 | OWKR Balance';
}
if (normalizedPath.startsWith('/participate/')) document.title = 'OWKR 내전 참여';

const root = createRoot(rootElement);

root.render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            {shouldUseAppNavigation ? (
                <AuthProvider>
                    <AppNavigationShell>
                        <Suspense fallback={<LoadingScreen message="화면을 준비하고 있습니다" />}>
                            <LazyPage />
                        </Suspense>
                    </AppNavigationShell>
                </AuthProvider>
            ) : (
                <Suspense fallback={<LoadingScreen message="화면을 준비하고 있습니다" />}>
                    <LazyPage />
                </Suspense>
            )}
            <AppUpdateNotice />
        </QueryClientProvider>
    </StrictMode>,
);

void pagePromise.catch(() => {
    root.render(
        <AppUpdateNotice forceVisible />,
    );
});
