export class ApiError extends Error {
    readonly body: unknown;
    readonly code?: string;
    readonly status: number;
    readonly retryable: boolean;

    constructor(
        message: string,
        status: number,
        options: { body?: unknown; code?: string } = {},
    ) {
        super(message);
        this.name = 'ApiError';
        this.body = options.body;
        this.code = options.code;
        this.status = status;
        this.retryable = status === 0 || status === 408 || status === 429 || status >= 500;
    }
}

interface ApiErrorResponse {
    body: unknown;
    code?: string;
    message: string;
}

const readResponseError = async (response: Response): Promise<ApiErrorResponse> => {
    const body = await response.json().catch(() => null) as {
        code?: unknown;
        error?: unknown;
    } | null;
    const code = typeof body?.code === 'string' ? body.code : undefined;
    if (typeof body?.error === 'string' && body.error.trim()) {
        return { body, code, message: body.error };
    }
    if (response.status === 401) {
        return { body, code, message: '로그인이 만료되었습니다. 다시 로그인해 주세요.' };
    }
    if (response.status === 403) {
        return { body, code, message: '이 작업을 수행할 권한이 없습니다.' };
    }
    if (response.status === 429) {
        return { body, code, message: '요청이 많습니다. 잠시 후 다시 시도해 주세요.' };
    }
    if (response.status >= 500) {
        return {
            body,
            code,
            message: '서버가 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
        };
    }
    return { body, code, message: '요청을 처리하지 못했습니다.' };
};

/**
 * @description JSON API 요청의 네트워크·HTTP·응답 형식 오류를 일관된 오류 객체로 변환한다.
 */
export const requestJson = async <T>(
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<T> => {
    let response: Response;
    try {
        response = await fetch(input, init);
    } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        throw new ApiError('서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.', 0);
    }
    if (!response.ok) {
        const error = await readResponseError(response);
        throw new ApiError(error.message, response.status, {
            body: error.body,
            code: error.code,
        });
    }
    if (response.status === 204) return undefined as T;
    try {
        return await response.json() as T;
    } catch {
        throw new ApiError('서버 응답 형식을 확인하지 못했습니다.', response.status);
    }
};

/**
 * @description Boundra 같은 계약 계층이 감싼 오류에서도 원래 API 오류를 찾아낸다.
 */
export const findApiError = (error: unknown): ApiError | null => {
    let current = error;
    const seen = new Set<unknown>();
    while (current && !seen.has(current)) {
        if (current instanceof ApiError) return current;
        seen.add(current);
        current = current instanceof Error ? current.cause : undefined;
    }
    return null;
};

/**
 * @description 알 수 없는 예외를 사용자에게 보여줄 안전한 한국어 메시지로 바꾼다.
 */
export const getErrorMessage = (error: unknown, fallback: string): string => {
    const apiError = findApiError(error);
    if (apiError?.message.trim()) return apiError.message;
    if (error instanceof Error && error.name === 'BoundraRuntimeError') return fallback;
    return error instanceof Error && error.message.trim() ? error.message : fallback;
};
