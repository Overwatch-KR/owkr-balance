import { usePlayerInput } from '../../hooks/use-player-input';
import type { UseRosterManagementOptions } from './types';
import { useRosterEditor } from './use-roster-editor';
import { useRosterImport } from './use-roster-import';

/**
 * @description 참가자 입력 상태 위에 편집과 가져오기 유스케이스를 조합해 화면에 하나의 API로 제공한다.
 */
export const useRosterManagement = (options: UseRosterManagementOptions) => {
    const input = usePlayerInput(options.match.players.length);
    const editor = useRosterEditor({
        input,
        match: options.match,
        onPlayerEditCompleted: options.onPlayerEditCompleted,
        onRosterCompleted: options.onRosterCompleted,
        showDetailedError: options.showDetailedError,
    });
    const rosterImport = useRosterImport({
        csrfToken: options.csrfToken,
        input,
        match: options.match,
        onRosterCompleted: options.onRosterCompleted,
        resetPlayerInputs: editor.resetPlayerInputs,
        setSwapSource: options.setSwapSource,
        showDetailedError: options.showDetailedError,
        userSheet: options.userSheet,
    });

    return {
        addPlayer: editor.addPlayer,
        addUserSheetPlayer: editor.addUserSheetPlayer,
        cancelIdentityImport: rosterImport.cancelIdentityImport,
        editingPlayerId: input.editingPlayerId,
        failedParses: input.failedParses,
        handleApplyIdentityRosterOnly: rosterImport.handleApplyIdentityRosterOnly,
        handleIdentityImportConfirm: rosterImport.handleIdentityImportConfirm,
        handlePaste: rosterImport.handlePaste,
        identityImportError: rosterImport.identityImportError,
        inputMode: input.inputMode,
        inputSummary: input.inputSummary,
        inputs: input.inputs,
        isApplyingIdentityImport: rosterImport.isApplyingIdentityImport,
        isInputCollapsed: input.isInputCollapsed,
        isPasteValidationPending: input.isPasteValidationPending,
        manualInputError: editor.manualInputError,
        pasteValidationIssues: input.pasteValidationIssues,
        pasteText: input.pasteText,
        pendingIdentityImport: rosterImport.pendingIdentityImport,
        requestRosterIdentityReview: rosterImport.requestRosterIdentityReview,
        resetPlayerInputs: editor.resetPlayerInputs,
        selectInputMode: input.selectInputMode,
        setFailedParses: input.setFailedParses,
        setInputMode: input.setInputMode,
        setInputSummary: input.setInputSummary,
        setInputs: input.setInputs,
        setIsInputCollapsed: input.setIsInputCollapsed,
        setManualInputError: editor.setManualInputError,
        startEditingPlayer: editor.startEditingPlayer,
        updatePasteText: input.updatePasteText,
    };
};
