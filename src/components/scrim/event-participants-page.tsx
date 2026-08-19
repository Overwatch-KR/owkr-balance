import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import type { ScrimRecord } from '../../../domains/scrim/shared/public';
import { getErrorMessage, requestJson } from '../../utils/api';
import { EventParticipantSummary } from './event-participant-summary';

interface EventParticipantsPageProps {
    onClose: () => void;
}

interface ScrimsResponse {
    scrims: ScrimRecord[];
}

/**
 * @description 상단 메뉴에서 바로 접근해 이벤트 기간의 고유 참여자를 확인하는 전용 화면이다.
 */
export function EventParticipantsPage({ onClose }: EventParticipantsPageProps) {
    const [scrims, setScrims] = useState<ScrimRecord[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const result = await requestJson<ScrimsResponse>('/api/scrims', {
                credentials: 'same-origin',
            });
            setScrims(result.scrims);
        } catch (loadError) {
            setError(getErrorMessage(loadError, '이벤트 참여자를 불러오지 못했습니다.'));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const timer = window.setTimeout(() => void load(), 0);
        return () => window.clearTimeout(timer);
    }, [load]);

    return (
        <main className="min-h-screen bg-surface px-4 py-6 text-slate-200 md:px-8 md:py-8">
            <div className="mx-auto max-w-4xl">
                <header className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold text-cyan-300">2026 여름 이벤트</p>
                        <h1 className="mt-1 text-2xl font-bold text-white">이벤트 참여자</h1>
                        <p className="mt-1 text-sm text-slate-400">기간 중 한 번이라도 내전에 참여한 사람을 확인합니다.</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            className="btn-ghost"
                            disabled={isLoading}
                            onClick={() => void load()}
                        >
                            <RefreshCw size={16} className={`mr-1 inline ${isLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
                            새로고침
                        </button>
                        <button type="button" className="btn-ghost" onClick={onClose}>
                            <ArrowLeft size={16} className="mr-1 inline" aria-hidden="true" />
                            매칭으로 돌아가기
                        </button>
                    </div>
                </header>

                {error ? (
                    <section className="card mt-6 border border-rose-400/20" role="alert">
                        <h2 className="font-semibold text-rose-200">참여자 명단을 불러오지 못했습니다</h2>
                        <p className="mt-2 text-sm text-slate-400">{error}</p>
                        <button type="button" className="btn-ghost mt-4" onClick={() => void load()}>
                            다시 시도
                        </button>
                    </section>
                ) : (
                    <EventParticipantSummary isLoading={isLoading} scrims={scrims} />
                )}
            </div>
        </main>
    );
}
