import {
    createContext,
    createElement,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { getErrorMessage, requestJson } from '../utils/api';

export interface AuthUser {
    avatarUrl?: string;
    id: string;
    username: string;
    globalName?: string;
}

export type AuthMode = 'discord' | 'local';
export type DataMode = 'remote' | 'local';

interface AuthResponse {
    authMode?: AuthMode;
    dataMode?: DataMode;
    loggedIn: boolean;
    user?: AuthUser;
    csrfToken?: string;
}

interface AuthContextValue {
    authMode: AuthMode;
    csrfToken: string;
    dataMode: DataMode;
    error: string | null;
    isLoading: boolean;
    logout: () => Promise<void>;
    retry: () => void;
    user: AuthUser | null;
}

interface AuthProviderProps {
    children: ReactNode;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * @description 서버 세션을 조회하고 안전한 로그아웃 요청을 제공한다.
 */
const useAuthState = (): AuthContextValue => {
    const [authMode, setAuthMode] = useState<AuthMode>('discord');
    const [dataMode, setDataMode] = useState<DataMode>('remote');
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [csrfToken, setCsrfToken] = useState('');
    const [error, setError] = useState<string | null>(null);

    const loadSession = useCallback(async (signal?: AbortSignal) => {
        setError(null);
        try {
            const data = await requestJson<AuthResponse>('/api/auth/me', {
                credentials: 'same-origin',
                signal,
            });
            setAuthMode(data.authMode === 'local' ? 'local' : 'discord');
            setDataMode(data.dataMode === 'local' ? 'local' : 'remote');
            setUser(data.loggedIn ? data.user ?? null : null);
            setCsrfToken(data.loggedIn ? data.csrfToken ?? '' : '');
        } catch (loadError) {
            if (loadError instanceof DOMException && loadError.name === 'AbortError') return;
            setUser(null);
            setCsrfToken('');
            setError(getErrorMessage(loadError, '로그인 상태를 확인하지 못했습니다.'));
        } finally {
            if (!signal?.aborted) setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void loadSession(controller.signal);
        return () => controller.abort();
    }, [loadSession]);

    const logout = useCallback(async () => {
        await requestJson('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-CSRF-Token': csrfToken },
        });
        setAuthMode('discord');
        setUser(null);
        setCsrfToken('');
    }, [csrfToken]);

    const retry = useCallback(() => {
        setIsLoading(true);
        void loadSession();
    }, [loadSession]);

    return useMemo(() => ({
        authMode,
        csrfToken,
        dataMode,
        error,
        isLoading,
        logout,
        retry,
        user,
    }), [authMode, csrfToken, dataMode, error, isLoading, logout, retry, user]);
};

/**
 * @description 앱 전체가 하나의 인증 요청과 세션 상태를 공유하도록 제공한다.
 */
export const AuthProvider = ({ children }: AuthProviderProps) => {
    const value = useAuthState();
    return createElement(AuthContext.Provider, { value }, children);
};

/**
 * @description 최상위 인증 공급자가 제공하는 현재 관리자 세션을 반환한다.
 */
export const useAuth = (): AuthContextValue => {
    const value = useContext(AuthContext);
    if (!value) throw new Error('useAuth는 AuthProvider 안에서 사용해야 합니다.');
    return value;
};
