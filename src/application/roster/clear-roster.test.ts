import { describe, expect, it, vi } from 'vitest';
import { createRosterClearActions } from './clear-roster';

const setup = (isConnected = true, playerCount = 10) => {
    const calls: string[] = [];
    const options = {
        isConnected,
        playerCount,
        clearRoster: vi.fn(() => calls.push('clear')),
        closeDialog: vi.fn(() => calls.push('close')),
        leaveSession: vi.fn(() => calls.push('leave')),
        openDialog: vi.fn(() => calls.push('open')),
    };
    return { ...options, calls, ...createRosterClearActions(options) };
};

describe('전체 명단 삭제와 협업 연결', () => {
    it('연결 중에는 선택하기 전까지 명단과 연결을 유지한다', () => {
        const actions = setup();
        actions.requestClear();
        expect(actions.calls).toEqual(['open']);
    });

    it('취소하면 명단과 연결을 변경하지 않는다', () => {
        const actions = setup();
        actions.requestClear();
        actions.cancelClear();
        expect(actions.calls).toEqual(['open', 'close']);
    });

    it('협업 유지 선택은 연결을 끊지 않고 명단을 비운다', () => {
        const actions = setup();
        actions.confirmClear('keep');
        expect(actions.calls).toEqual(['close', 'clear']);
    });

    it('연결 종료 선택은 동기화를 먼저 끊고 로컬 명단을 비운다', () => {
        const actions = setup();
        actions.confirmClear('leave');
        expect(actions.calls).toEqual(['leave', 'close', 'clear']);
    });

    it('협업 연결이 없으면 기존처럼 바로 명단을 비운다', () => {
        const actions = setup(false);
        actions.requestClear();
        expect(actions.calls).toEqual(['clear']);
    });

    it('빈 명단이면 삭제 선택을 띄우거나 연결을 변경하지 않는다', () => {
        const actions = setup(true, 0);
        actions.requestClear();
        expect(actions.calls).toEqual([]);
    });
});
