import { afterEach, describe, expect, it, vi } from 'vitest';
import { BoundraRuntimeError } from 'boundra';
import { ApiError, findApiError, getErrorMessage, requestJson } from './api';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('requestJson', () => {
    it('네트워크 실패를 재시도 가능한 공통 오류로 변환한다', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network failed')));

        await expect(requestJson('/api/test')).rejects.toMatchObject({
            name: 'ApiError',
            status: 0,
            retryable: true,
        });
    });

    it('서버가 제공한 안전한 오류 메시지와 상태 코드를 보존한다', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
            JSON.stringify({ error: '권한이 없습니다.' }),
            { status: 403, headers: { 'Content-Type': 'application/json' } },
        )));

        await expect(requestJson('/api/test')).rejects.toEqual(
            expect.objectContaining({
                message: '권한이 없습니다.',
                name: 'ApiError',
                status: 403,
                retryable: false,
            }),
        );
    });

    it('충돌 병합에 필요한 오류 코드와 응답 본문을 보존한다', async () => {
        const body = {
            code: 'USER_SHEET_CONFLICT',
            error: '동시 수정 충돌',
            snapshot: { entries: [], sheetVersion: 3 },
        };
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
            JSON.stringify(body),
            { status: 409, headers: { 'Content-Type': 'application/json' } },
        )));

        await expect(requestJson('/api/test')).rejects.toEqual(
            expect.objectContaining({
                body,
                code: 'USER_SHEET_CONFLICT',
                message: '동시 수정 충돌',
                status: 409,
            }),
        );
    });

    it('계약 계층이 감싼 API 오류의 상태와 사용자 메시지를 복원한다', () => {
        const original = new ApiError('참여 링크를 찾지 못했습니다.', 404);
        const wrapped = new BoundraRuntimeError({
            code: 'RUNTIME-003',
            contract: 'get-public-participation',
            phase: 'transport',
            message: 'transport failed',
            suggestion: 'check transport',
            cause: original,
        });

        expect(findApiError(wrapped)).toBe(original);
        expect(findApiError(wrapped)?.status).toBe(404);
        expect(getErrorMessage(wrapped, 'fallback')).toBe('참여 링크를 찾지 못했습니다.');
    });

    it('계약 검증 상세 대신 사용자용 fallback 메시지를 반환한다', () => {
        const error = new BoundraRuntimeError({
            code: 'RUNTIME-002',
            contract: 'get-public-participation',
            phase: 'result',
            message: 'result validation failed',
            suggestion: 'check schema',
        });

        expect(getErrorMessage(error, '응답을 확인하지 못했습니다.'))
            .toBe('응답을 확인하지 못했습니다.');
    });
});
