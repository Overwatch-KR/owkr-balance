export type ClearRosterCollaborationChoice = 'keep' | 'leave';

interface RosterClearOptions {
    clearRoster: () => void;
    closeDialog: () => void;
    isConnected: boolean;
    leaveSession: () => void;
    openDialog: () => void;
    playerCount: number;
}

/**
 * @description 연결 중인 명단 삭제는 선택을 기다리고, 연결 종료를 고른 경우 동기화를 끊은 뒤 로컬 명단을 비운다.
 */
export const createRosterClearActions = ({
    clearRoster,
    closeDialog,
    isConnected,
    leaveSession,
    openDialog,
    playerCount,
}: RosterClearOptions) => ({
    requestClear: () => {
        if (playerCount === 0) return;
        if (isConnected) openDialog();
        else clearRoster();
    },
    confirmClear: (choice: ClearRosterCollaborationChoice) => {
        if (choice === 'leave') leaveSession();
        closeDialog();
        clearRoster();
    },
    cancelClear: closeDialog,
});
