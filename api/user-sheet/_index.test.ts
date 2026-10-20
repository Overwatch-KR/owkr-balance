import type { VercelRequest, VercelResponse } from '@vercel/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from './index';

const createRequest = (): VercelRequest => ({
    headers: { host: 'localhost:3000' },
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

describe('local-only user sheet', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('원격 저장소 대신 빈 로컬 스냅샷을 반환한다', async () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('OWKR_LOCAL_AUTH_BYPASS', 'true');
        vi.stubEnv('OWKR_LOCAL_DATA_ONLY', 'true');
        const response = createResponse();

        await handler(createRequest(), response);

        expect(response.status).toHaveBeenCalledWith(200);
        expect(response.json).toHaveBeenCalledWith({ entries: [], sheetVersion: 0 });
    });
});
