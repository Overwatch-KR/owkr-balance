import { QueryClient } from '@tanstack/react-query';

/**
 * @description 관리자 페이지의 서버 데이터를 한 캐시에 모으고 짧은 재진입에서 기존 화면을 즉시 재사용한다.
 */
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            gcTime: 30 * 60 * 1000,
            retry: false,
            retryOnMount: false,
            staleTime: 30 * 1000,
        },
    },
});
