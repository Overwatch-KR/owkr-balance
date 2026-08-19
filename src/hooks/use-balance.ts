import { useCallback, useEffect, useRef, useState } from 'react';
import type { MatchResultData, Player } from '../types';
import type { BalanceOptions, BalanceWorkerResponse } from '../utils/balance';

interface BalanceTeamsOptions extends BalanceOptions {
    preserveResult?: MatchResultData;
}

const MAX_ALTERNATIVE_COUNT = 11;

const getTeamAssignmentKey = (assignment: MatchResultData['teamA']['assignment']): string => [
    `T:${assignment.TANK.map(player => player.id).toSorted((a, b) => a - b).join(',')}`,
    `D:${assignment.DPS.map(player => player.id).toSorted((a, b) => a - b).join(',')}`,
    `S:${assignment.SUPPORT.map(player => player.id).toSorted((a, b) => a - b).join(',')}`,
].join('|');

const getMatchResultKey = (matchResult: MatchResultData): string => [
    getTeamAssignmentKey(matchResult.teamA.assignment),
    getTeamAssignmentKey(matchResult.teamB.assignment),
].toSorted().join('||');

/**
 * @description 밸런싱 워커의 생명주기와 결과 상태를 React에 연결한다.
 */
export const useBalance = (
    initialResult: MatchResultData | null = null,
    initialAlternatives: MatchResultData[] = [],
) => {
    const [isBalancing, setIsBalancing] = useState(false);
    const [result, setResult] = useState<MatchResultData | null>(() => initialResult);
    const [alternatives, setAlternatives] = useState<MatchResultData[]>(() => initialAlternatives);
    const workerRef = useRef<Worker | null>(null);

    useEffect(() => () => workerRef.current?.terminate(), []);

    const balanceTeams = useCallback((
        players: Player[],
        options: BalanceTeamsOptions = {},
    ): Promise<void> => {
        if (players.length !== 10) {
            return Promise.reject(new Error(`플레이어가 10명이어야 합니다. (현재: ${players.length}명)`));
        }

        workerRef.current?.terminate();
        setIsBalancing(true);

        return new Promise((resolve, reject) => {
            let worker: Worker;

            try {
                worker = new Worker(new URL('../workers/balance.worker.ts', import.meta.url), { type: 'module' });
            } catch (error) {
                setIsBalancing(false);
                reject(error);
                return;
            }

            workerRef.current = worker;

            const finish = (): void => {
                worker.terminate();
                if (workerRef.current === worker) workerRef.current = null;
                setIsBalancing(false);
            };

            worker.onmessage = (event: MessageEvent<BalanceWorkerResponse>) => {
                finish();

                if (!event.data.ok) {
                    reject(new Error(event.data.error));
                    return;
                }

                if (options.preserveResult) {
                    const seenResults = new Set([getMatchResultKey(options.preserveResult)]);
                    const generatedAlternatives = [
                        event.data.data.result,
                        ...event.data.data.alternatives,
                    ].filter(candidate => {
                        const key = getMatchResultKey(candidate);
                        if (seenResults.has(key)) return false;
                        seenResults.add(key);
                        return true;
                    }).slice(0, MAX_ALTERNATIVE_COUNT);

                    setAlternatives(generatedAlternatives);
                } else {
                    setResult(event.data.data.result);
                    setAlternatives(event.data.data.alternatives);
                }
                resolve();
            };

            worker.onerror = () => {
                finish();
                reject(new Error('밸런싱 워커를 실행하지 못했습니다.'));
            };

            worker.postMessage({
                players,
                options: { ignorePreferences: options.ignorePreferences },
            });
        });
    }, []);

    return { balanceTeams, result, setResult, alternatives, setAlternatives, isBalancing };
};
