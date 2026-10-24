import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { APP_UPDATE_AVAILABLE_EVENT, AppUpdateNotice } from './components/app-update-notice';
import LoadingScreen from './components/common/loading-screen';
import { AppRecoveryScreen } from './components/common/app-recovery-screen';
import { AppNavigationShell } from './components/layout/app-navigation-shell';
import { AuthProvider } from './hooks/use-auth';
import { queryClient } from './query-client';
import { applyPageMetadata, getPageMetadata } from './utils/page-metadata';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('애플리케이션 루트 요소를 찾지 못했습니다.');

window.addEventListener('vite:preloadError', () => {
    window.dispatchEvent(new Event(APP_UPDATE_AVAILABLE_EVENT));
});

const normalizedPath = window.location.pathname.replace(/\/+$/, '') || '/';
applyPageMetadata(getPageMetadata(normalizedPath));
const isDraftPreview = import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
    && normalizedPath === '/__preview/draft';
const pagePromise = isDraftPreview
    ? import('./components/draft/draft-preview-page').then(module => module.DraftPreviewPage)
    : normalizedPath === '/discord-login-policy'
    ? import('./components/auth/discord-login-policy-page').then(module => module.DiscordLoginPolicyPage)
    : normalizedPath.startsWith('/draft/')
        ? import('./components/draft/public-draft-page').then(module => module.PublicDraftPage)
    : normalizedPath.startsWith('/participate/')
        ? import('./components/scrim/public-participation-page').then(module => module.PublicParticipationPage)
        : import('./App').then(module => module.default);
const shouldUseAppNavigation = !isDraftPreview && normalizedPath !== '/discord-login-policy'
    && !normalizedPath.startsWith('/draft/')
    && !normalizedPath.startsWith('/participate/');
const LazyPage = lazy(() => pagePromise.then(Page => ({ default: Page })));

const root = createRoot(rootElement, {
    onUncaughtError(error) {
        console.error('Application screen failed', error);
        queueMicrotask(showRecoveryScreen);
    },
});

function showRecoveryScreen(): void {
    root.render(<AppRecoveryScreen />);
}

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

void pagePromise.catch(showRecoveryScreen);
