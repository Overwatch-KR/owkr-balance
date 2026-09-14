import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSessionCookie } from '../_lib/auth';
import handler from './me';

const createRequest = (host = 'localhost:3000'): VercelRequest => ({
    headers: { host },
    method: 'GET',
} as unknown as VercelRequest);

const createResponse = (): VercelResponse => {
    const response = {
        json: vi.fn(),
        setHeader: vi.fn(),
        status: vi.fn(),
    };
    response.json.mockReturnValue(response);
    response.status.mockReturnValue(response);
    return response as unknown as VercelResponse;
};

describe('GET /api/auth/me', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('로컬 우회 모드의 인증 사용자와 인증 방식을 반환한다', () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('OWKR_LOCAL_AUTH_BYPASS', 'true');
        const response = createResponse();

        handler(createRequest(), response);

        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith({
            authMode: 'local',
            dataMode: 'remote',
            loggedIn: true,
            user: {
                id: 'owkr-local-admin',
                username: 'local-admin',
                globalName: '로컬 관리자',
            },
            csrfToken: 'owkr-local-auth-csrf-token',
        });
    });

    it('일반 비로그인 요청은 Discord 인증 모드로 유지한다', () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('OWKR_LOCAL_AUTH_BYPASS', 'false');
        const response = createResponse();

        handler(createRequest(), response);

        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith({
            authMode: 'discord',
            dataMode: 'remote',
            loggedIn: false,
        });
    });

    it('원격 저장소를 차단한 실행에서는 로컬 데이터 모드를 반환한다', () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('OWKR_LOCAL_AUTH_BYPASS', 'true');
        vi.stubEnv('OWKR_LOCAL_DATA_ONLY', 'true');
        const response = createResponse();

        handler(createRequest(), response);

        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
            authMode: 'local',
            dataMode: 'local',
            loggedIn: true,
        }));
    });

    it('Discord 로그인 세션의 프로필 이미지 URL을 사용자 정보에 포함한다', () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('OWKR_LOCAL_AUTH_BYPASS', 'false');
        vi.stubEnv('JWT_SECRET', 'test-secret-with-at-least-32-characters');
        const request = createRequest();
        const cookie = createSessionCookie(request, {
            avatarUrl: 'https://cdn.discordapp.com/avatars/123/avatar.webp?size=128',
            id: '123',
            username: 'discord-admin',
            globalName: '운영자',
        });
        request.headers.cookie = cookie.split(';', 1)[0] ?? '';
        const response = createResponse();

        handler(request, response);

        expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
            loggedIn: true,
            user: expect.objectContaining({
                avatarUrl: 'https://cdn.discordapp.com/avatars/123/avatar.webp?size=128',
                id: '123',
            }),
        }));
    });
});
