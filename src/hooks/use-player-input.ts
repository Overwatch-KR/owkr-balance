import { useCallback, useEffect, useState } from 'react';
import type { Player, Tier } from '../types';
import {
    parseMultipleLines,
    type ParseResult,
    type RosterValidationIssue,
} from '../utils/parser';

export type PlayerInputMode = 'discord' | 'manual' | 'mentions';

const ROSTER_PASTE_VALIDATION_DELAY_MS = 350;

export interface PlayerInputs {
    name: string;
    discordName: string;
    tTier: Tier;
    tDiv: string;
    tPref: boolean;
    tAvoid: boolean;
    dTier: Tier;
    dDiv: string;
    dPref: boolean;
    dAvoid: boolean;
    sTier: Tier;
    sDiv: string;
    sPref: boolean;
    sAvoid: boolean;
}

/**
 * @description 수동 참가자 입력 폼의 초기값을 만든다.
 */
export const createDefaultPlayerInputs = (): PlayerInputs => ({
    name: '',
    discordName: '',
    tTier: 'DIAMOND',
    tDiv: '3',
    tPref: false,
    tAvoid: false,
    dTier: 'DIAMOND',
    dDiv: '3',
    dPref: false,
    dAvoid: false,
    sTier: 'PLATINUM',
    sDiv: '3',
    sPref: false,
    sAvoid: false,
});

/**
 * @description 저장된 등급을 수동 입력 셀렉트에서 사용할 값으로 정규화한다.
 */
const getEditableDivision = (tier: Tier, division: number | string): string => {
    if (tier === 'UNRANKED') return '0';
    const value = String(division);
    return ['1', '2', '3', '4', '5'].includes(value) ? value : '3';
};

/**
 * @description 참가자 입력, 편집, 붙여넣기 검사와 접힘 상태를 관리한다.
 */
export const usePlayerInput = (initialPlayerCount: number) => {
    const [inputs, setInputs] = useState(createDefaultPlayerInputs);
    const [pasteText, setPasteText] = useState('');
    const [failedParses, setFailedParses] = useState<string[]>([]);
    const [inputMode, setInputMode] = useState<PlayerInputMode>('discord');
    const [editingPlayerId, setEditingPlayerId] = useState<number | null>(null);
    const [isInputCollapsed, setIsInputCollapsed] = useState(initialPlayerCount > 0);
    const [inputSummary, setInputSummary] = useState(
        initialPlayerCount > 0 ? `저장된 참가자 ${initialPlayerCount}명 불러옴` : '',
    );
    const [pasteValidation, setPasteValidation] = useState<{
        sourceText: string;
        result: ParseResult | null;
    }>({
        sourceText: '',
        result: null,
    });

    useEffect(() => {
        if (!pasteText.trim()) return;

        const timeoutId = window.setTimeout(() => {
            setPasteValidation({
                sourceText: pasteText,
                result: parseMultipleLines(pasteText),
            });
        }, ROSTER_PASTE_VALIDATION_DELAY_MS);

        return () => window.clearTimeout(timeoutId);
    }, [pasteText]);

    const isPasteValidationPending = Boolean(pasteText.trim())
        && pasteValidation.sourceText !== pasteText;
    const pasteParseResult = pasteText.trim() && !isPasteValidationPending
        ? pasteValidation.result
        : null;
    const pasteValidationIssues: RosterValidationIssue[] = pasteParseResult?.validationIssues ?? [];

    useEffect(() => {
        const hasUnsavedInput = Boolean(
            pasteText.trim()
            || inputs.name.trim()
            || inputs.discordName.trim(),
        );
        if (!hasUnsavedInput) return;

        const warnBeforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };

        window.addEventListener('beforeunload', warnBeforeUnload);
        return () => window.removeEventListener('beforeunload', warnBeforeUnload);
    }, [inputs.discordName, inputs.name, pasteText]);

    const resetInputs = useCallback(() => {
        setEditingPlayerId(null);
        setInputs(createDefaultPlayerInputs());
    }, []);

    const editPlayer = useCallback((player: Player) => {
        setInputs({
            name: player.name,
            discordName: player.discordName ?? '',
            tTier: player.tank.tier,
            tDiv: getEditableDivision(player.tank.tier, player.tank.div),
            tPref: player.tank.isPreferred,
            tAvoid: player.tank.isAvoided,
            dTier: player.dps.tier,
            dDiv: getEditableDivision(player.dps.tier, player.dps.div),
            dPref: player.dps.isPreferred,
            dAvoid: player.dps.isAvoided,
            sTier: player.sup.tier,
            sDiv: getEditableDivision(player.sup.tier, player.sup.div),
            sPref: player.sup.isPreferred,
            sAvoid: player.sup.isAvoided,
        });
        setEditingPlayerId(player.id);
        setInputMode('manual');
        setIsInputCollapsed(false);
    }, []);

    const selectInputMode = useCallback((mode: PlayerInputMode) => {
        setInputMode(mode);
        setIsInputCollapsed(false);
    }, []);

    const updatePasteText = useCallback((value: string) => {
        setPasteText(value);
    }, []);

    return {
        editingPlayerId,
        editPlayer,
        failedParses,
        inputMode,
        inputSummary,
        inputs,
        isInputCollapsed,
        pasteText,
        pasteParseResult,
        pasteValidationIssues,
        isPasteValidationPending,
        resetInputs,
        selectInputMode,
        setEditingPlayerId,
        setFailedParses,
        setInputMode,
        setInputSummary,
        setInputs,
        setIsInputCollapsed,
        setPasteText,
        updatePasteText,
    };
};
