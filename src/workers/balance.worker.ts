/// <reference lib="webworker" />

import type { Player } from '../types';
import { balancePlayers } from '../utils/balance';
import type { BalanceOptions, BalanceWorkerResponse } from '../utils/balance';

interface BalanceWorkerRequest {
    options?: BalanceOptions;
    players: Player[];
}

self.onmessage = (event: MessageEvent<BalanceWorkerRequest>): void => {
    let response: BalanceWorkerResponse;

    try {
        response = {
            ok: true,
            data: balancePlayers(event.data.players, event.data.options),
        };
    } catch (error) {
        response = {
            ok: false,
            error: error instanceof Error ? error.message : '알 수 없는 밸런싱 오류가 발생했습니다.',
        };
    }

    self.postMessage(response);
};
