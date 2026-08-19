import { RefreshCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    LOGIN_BACKGROUND_IMAGES,
    LOGIN_BACKGROUND_ROTATION_INTERVAL_MS,
    pickRandomBackgroundIndex,
} from './login-background';

interface LoginScreenProps {
    serviceError?: string | null;
    onRetry?: () => void;
}

/**
 * @description OWKR Balance의 Discord 관리자 로그인 화면을 제공한다.
 */
const LoginScreen = ({ serviceError, onRetry }: LoginScreenProps) => {
    const [activeBackgroundIndex, setActiveBackgroundIndex] = useState(
        () => pickRandomBackgroundIndex(),
    );
    const loginError = new URLSearchParams(window.location.search).get('loginError');

    useEffect(() => {
        const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

        if (reducedMotionQuery.matches) {
            return;
        }

        const intervalId = window.setInterval(() => {
            setActiveBackgroundIndex((currentIndex) => pickRandomBackgroundIndex(currentIndex));
        }, LOGIN_BACKGROUND_ROTATION_INTERVAL_MS);

        return () => window.clearInterval(intervalId);
    }, []);

    return (
        <main className="login-scene relative min-h-screen overflow-hidden bg-[#080a0f] text-white">
            {LOGIN_BACKGROUND_IMAGES.map((backgroundImage, index) => (
                <div
                    key={backgroundImage}
                    aria-hidden="true"
                    className={
                        index === activeBackgroundIndex
                            ? 'login-background login-background-active'
                            : 'login-background'
                    }
                    style={{ backgroundImage: `url(${import.meta.env.BASE_URL}${backgroundImage})` }}
                />
            ))}
            <div className="login-ambient login-ambient-a" />
            <div className="login-ambient login-ambient-b" />

            <div className="relative z-10 flex min-h-screen flex-col px-5 py-6">
                <div className="flex flex-1 items-center justify-center py-6">
                    <div className="w-full max-w-md text-center">
                        <p className="mx-auto max-w-xs text-sm leading-6 text-slate-300/80">
                            OWKR 관리자 전용 내전 매칭 서비스
                        </p>

                        <div className="mt-6 rounded-lg border border-white/10 bg-slate-950/35 p-2 shadow-2xl shadow-black/30 backdrop-blur-xl">
                            <a
                                href="/api/auth/login"
                                className="group flex w-full items-center justify-center gap-3 rounded-lg bg-[#5865F2] px-8 py-4 font-bold text-white shadow-lg shadow-[#5865F2]/25 transition-[background-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:bg-[#6672ff] hover:shadow-[#5865F2]/35 active:translate-y-0"
                            >
                                <svg width="24" height="24" viewBox="0 0 127 96" fill="white" className="transition-transform duration-300 group-hover:scale-110" aria-hidden="true">
                                    <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.11,77.11,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.89,105.89,0,0,0,126.6,80.22c1.24-23.28-5.83-47.5-21.48-72.15ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z" />
                                </svg>
                                Discord 계정으로 로그인
                            </a>
                        </div>

                        {(loginError || serviceError) && (
                            <p className="mt-4 rounded-lg border border-rose-500/20 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">
                                {serviceError ?? '로그인에 실패했습니다. 권한을 확인한 뒤 다시 시도해 주세요.'}
                            </p>
                        )}
                        {serviceError && onRetry && (
                            <button
                                type="button"
                                onClick={onRetry}
                                className="mx-auto mt-3 inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-xs font-medium text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
                            >
                                <RefreshCcw size={13} aria-hidden="true" />
                                연결 다시 확인
                            </button>
                        )}
                        <p className="mt-5 text-xs text-slate-500">등록된 관리자만 접근 가능합니다.</p>
                    </div>
                </div>
                <footer className="flex shrink-0 justify-center">
                    <a
                        href="/discord-login-policy"
                        className="inline-flex min-h-9 items-center rounded-md px-2 text-xs text-slate-500 underline decoration-slate-600 underline-offset-4 transition-colors hover:text-slate-300"
                    >
                        Discord 로그인 정보 이용 안내
                    </a>
                </footer>
            </div>
        </main>
    );
};

export default LoginScreen;
