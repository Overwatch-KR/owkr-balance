import type { VercelRequest } from '@vercel/node';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    createSessionCookie,
    getSessionUser,
    hasValidCsrfToken,
    isAllowedAdmin,
    isLocalAuthRequest,
} from './auth';

const createRequest = (
    host = 'localhost:3000',
    headers: Record<string, string> = {},
): VercelRequest => ({
    headers: {
        host,
        ...headers,
    },
} as unknown as VercelRequest);

const enableLocalAuth = (): void => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('OWKR_LOCAL_AUTH_BYPASS', 'true');
};

describe('local authentication', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it.each([
        'localhost:3000',
        '127.0.0.1:3000',
        '[::1]:3000',
    ])('%s 루프백 요청에서만 명시적 우회를 허용한다', (host) => {
        enableLocalAuth();

        expect(isLocalAuthRequest(createRequest(host))).toBe(true);
    });

    it('플래그가 없거나 production 또는 외부 호스트면 우회하지 않는다', () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('OWKR_LOCAL_AUTH_BYPASS', 'false');
        expect(isLocalAuthRequest(createRequest())).toBe(false);

        vi.stubEnv('OWKR_LOCAL_AUTH_BYPASS', 'true');
        vi.stubEnv('NODE_ENV', 'production');
        expect(isLocalAuthRequest(createRequest())).toBe(false);

        vi.stubEnv('NODE_ENV', 'development');
        expect(isLocalAuthRequest(createRequest('preview.example.com'))).toBe(false);
    });

    it('JWT나 세션 쿠키 없이 고정 개발 사용자와 유효한 CSRF 토큰을 제공한다', () => {
        enableLocalAuth();
        vi.stubEnv('JWT_SECRET', '');

        const user = getSessionUser(createRequest());

        expect(user).toEqual({
            id: 'owkr-local-admin',
            username: 'local-admin',
            globalName: '로컬 관리자',
            csrfToken: 'owkr-local-auth-csrf-token',
        });
        expect(hasValidCsrfToken(
            createRequest('localhost:3000', {
                'x-csrf-token': user?.csrfToken ?? '',
            }),
            user!,
        )).toBe(true);
        expect(hasValidCsrfToken(
            createRequest('localhost:3000', {
                'x-csrf-token': 'invalid-token',
            }),
            user!,
        )).toBe(false);
    });

    it('일반 모드에서는 기존 서명 세션만 인증한다', () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('OWKR_LOCAL_AUTH_BYPASS', 'false');
        vi.stubEnv('JWT_SECRET', 'test-secret-with-at-least-32-characters');
        const request = createRequest();

        expect(getSessionUser(request)).toBeNull();

        const cookie = createSessionCookie(request, {
            id: 'discord-user-1',
            username: 'discord-admin',
            globalName: '운영자',
        });
        const sessionToken = cookie.match(/^owkr_session=([^;]+)/)?.[1];
        const payload = jwt.decode(sessionToken ?? '') as JwtPayload | null;
        const authenticatedRequest = createRequest('localhost:3000', {
            cookie: cookie.split(';', 1)[0] ?? '',
        });

        expect(cookie).toContain('Max-Age=604800');
        expect((payload?.exp ?? 0) - (payload?.iat ?? 0)).toBe(60 * 60 * 24 * 7);
        expect(getSessionUser(authenticatedRequest)).toMatchObject({
            id: 'discord-user-1',
            username: 'discord-admin',
            globalName: '운영자',
            type: 'session',
        });
    });
});

describe('admin allowlist', () => {
    it('관리자 상수에 등록된 Discord 사용자 ID만 허용한다', () => {
        expect(isAllowedAdmin('579176046817968128')).toBe(true);
        expect(isAllowedAdmin('not-an-admin')).toBe(false);
    });
});
