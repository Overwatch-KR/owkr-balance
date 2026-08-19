import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('애플리케이션 루트 요소를 찾지 못했습니다.');

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
            <Page />
        </StrictMode>,
    );
});
