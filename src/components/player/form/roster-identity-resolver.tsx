import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    Fingerprint,
    RefreshCw,
    X,
} from 'lucide-react';
import { formatRank } from '../../../constants';
import type { Player } from '../../../types';
import {
    getDefaultRosterImportMode,
    reconcilePlayers,
    type RosterImportMode,
} from '../../../utils/player';
import type { UserSheetEntry } from '../../../utils/user-sheet';
import { cleanUserSheetRank } from '../../../utils/user-sheet';
import {
    cleanDiscordUserId,
    isValidDiscordUserId,
    normalizeDiscordName,
    suggestRosterIdentities,
} from '../../../utils/player-identity';
import {
    RosterIdentityRow,
    type FieldChange,
    type ResolutionDraft,
} from './roster-identity-row';
import { useDialogFocus } from '../../../hooks/use-dialog-focus';

export interface RosterIdentityResolution {
    mode: RosterImportMode;
    players: Player[];
    syncTierPlayerIds: number[];
}

interface RosterIdentityResolverProps {
    currentPlayers: Player[];
    entries: UserSheetEntry[];
    failedLines: string[];
    isLocalOnly?: boolean;
    isSubmitting: boolean;
    onApplyRosterOnly: (resolution: RosterIdentityResolution) => void;
    onCancel: () => void;
    onConfirm: (resolution: RosterIdentityResolution) => void;
    players: Player[];
    submitError: string;
}

const makeDrafts = (
    players: Player[],
    entries: UserSheetEntry[],
): ResolutionDraft[] => suggestRosterIdentities(players, entries).map(suggestion => {
    const selectedEntry = entries.find(entry => entry.id === suggestion.selectedEntryId);
    return {
        ...suggestion,
        discordUserId: selectedEntry?.discordUserId ?? suggestion.player.discordUserId ?? '',
        requiresDiscordUserId: suggestion.requiresDiscordUserId
            || !selectedEntry?.discordUserId,
        selectedEntryId: suggestion.selectedEntryId ?? '',
        syncTiers: true,
    };
});

const getIncomingRanks = (player: Player) => ({
    tank: cleanUserSheetRank(formatRank(player.tank)),
    dps: cleanUserSheetRank(formatRank(player.dps)),
    support: cleanUserSheetRank(formatRank(player.sup)),
});

const makeChange = (
    label: string,
    before: string | undefined,
    after: string | undefined,
): FieldChange | null => {
    const previous = before?.trim() ?? '';
    const next = after?.trim() ?? '';
    return previous === next ? null : {
        after: next || '미등록',
        before: previous || '미등록',
        label,
    };
};

/**
 * @description 신규·중복 참가자 식별, 명단 적용 방식, 유저 시트 갱신 범위를 한 화면에서 확정한다.
 */
export function RosterIdentityResolver({
    currentPlayers,
    entries,
    failedLines,
    isLocalOnly = false,
    isSubmitting,
    onApplyRosterOnly,
    onCancel,
    onConfirm,
    players,
    submitError,
}: RosterIdentityResolverProps) {
    const dialogRef = useDialogFocus({ closeOnEscape: !isSubmitting, onClose: onCancel });
    const [drafts, setDrafts] = useState<ResolutionDraft[]>(() => makeDrafts(players, entries));
    const [mode, setMode] = useState<RosterImportMode>(() => (
        getDefaultRosterImportMode(currentPlayers.length, players.length)
    ));
    const [bulkText, setBulkText] = useState('');
    const [bulkMessage, setBulkMessage] = useState('');
    const entriesById = useMemo(() => new Map(entries.map(entry => [entry.id, entry])), [entries]);
    const entriesByDiscordId = useMemo(() => new Map(
        entries.flatMap(entry => (
            entry.discordUserId ? [[entry.discordUserId, entry] as const] : []
        )),
    ), [entries]);

    useEffect(() => {
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, []);

    const getResolvedEntry = useCallback((draft: ResolutionDraft): UserSheetEntry | undefined => {
        const discordUserId = cleanDiscordUserId(draft.discordUserId);
        return entriesByDiscordId.get(discordUserId)
            ?? entriesById.get(draft.selectedEntryId);
    }, [entriesByDiscordId, entriesById]);

    const duplicateIds = useMemo(() => {
        const counts = new Map<string, number>();
        drafts.forEach(draft => {
            const id = cleanDiscordUserId(draft.discordUserId);
            if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
        });
        return new Set(
            [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
        );
    }, [drafts]);
    const duplicateEntryIds = useMemo(() => {
        const counts = new Map<string, number>();
        drafts.forEach(draft => {
            const entryId = getResolvedEntry(draft)?.id;
            if (entryId) counts.set(entryId, (counts.get(entryId) ?? 0) + 1);
        });
        return new Set(
            [...counts.entries()].filter(([, count]) => count > 1).map(([id]) => id),
        );
    }, [drafts, getResolvedEntry]);

    const getDraftError = useCallback((draft: ResolutionDraft): string => {
        const discordUserId = cleanDiscordUserId(draft.discordUserId);
        const resolvedEntry = getResolvedEntry(draft);
        if (!isLocalOnly && draft.requiresDiscordUserId && !discordUserId) {
            return '신규 또는 중복 후보는 Discord ID가 필요합니다.';
        }
        if (discordUserId && !isValidDiscordUserId(discordUserId)) {
            return 'Discord ID는 17~20자리 숫자여야 합니다.';
        }
        if (discordUserId && duplicateIds.has(discordUserId)) {
            return '같은 Discord ID가 이번 명단에 두 번 입력되었습니다.';
        }
        if (resolvedEntry && duplicateEntryIds.has(resolvedEntry.id)) {
            return '같은 기존 유저가 이번 명단에 두 번 연결되었습니다.';
        }
        if (
            resolvedEntry?.discordUserId
            && discordUserId
            && resolvedEntry.discordUserId !== discordUserId
        ) {
            return '선택한 기존 유저에 다른 Discord ID가 등록되어 있습니다.';
        }
        return '';
    }, [duplicateEntryIds, duplicateIds, getResolvedEntry, isLocalOnly]);

    const errors = useMemo(
        () => drafts.map(getDraftError),
        [drafts, getDraftError],
    );
    const unresolvedCount = errors.filter(Boolean).length;
    const newCount = drafts.filter(draft => !getResolvedEntry(draft)).length;
    const matchedCount = drafts.length - newCount;

    const resolvedPlayers = useMemo(() => drafts.map(draft => {
        const discordUserId = cleanDiscordUserId(draft.discordUserId);
        const resolvedEntry = getResolvedEntry(draft);
        return {
            ...draft.player,
            discordName: draft.player.discordName?.trim()
                || resolvedEntry?.discordName
                || undefined,
            discordUserId: discordUserId || resolvedEntry?.discordUserId,
            userSheetEntryId: resolvedEntry?.id,
        };
    }), [drafts, getResolvedEntry]);

    const resolution = useMemo<RosterIdentityResolution>(() => ({
        mode,
        players: resolvedPlayers,
        syncTierPlayerIds: drafts
            .filter(draft => !getResolvedEntry(draft) || draft.syncTiers)
            .map(draft => draft.player.id),
    }), [drafts, getResolvedEntry, mode, resolvedPlayers]);
    const rosterPreview = useMemo(
        () => reconcilePlayers(currentPlayers, resolvedPlayers, mode),
        [currentPlayers, mode, resolvedPlayers],
    );

    const getDraftChanges = useCallback((draft: ResolutionDraft): FieldChange[] => {
        const entry = getResolvedEntry(draft);
        if (!entry) return [];
        const ranks = getIncomingRanks(draft.player);
        return [
            makeChange('Discord ID', entry.discordUserId, cleanDiscordUserId(draft.discordUserId)),
            makeChange(
                'Discord 이름',
                entry.discordName,
                draft.player.discordName?.trim() || entry.discordName,
            ),
            makeChange('배틀태그', entry.battleTag, draft.player.name),
            ...(draft.syncTiers ? [
                makeChange('탱커', entry.tank, ranks.tank),
                makeChange('딜러', entry.dps, ranks.dps),
                makeChange('힐러', entry.support, ranks.support),
            ] : []),
        ].filter((change): change is FieldChange => Boolean(change));
    }, [getResolvedEntry]);
    const sheetChangeCount = drafts.filter(draft => (
        !getResolvedEntry(draft) || getDraftChanges(draft).length > 0
    )).length;
    const allExistingTiersEnabled = drafts
        .filter(draft => getResolvedEntry(draft))
        .every(draft => draft.syncTiers);

    const updateDraft = (
        playerId: number,
        patch: Partial<Pick<
            ResolutionDraft,
            'discordUserId' | 'selectedEntryId' | 'syncTiers'
        >>,
    ) => {
        setDrafts(current => current.map(draft => (
            draft.player.id === playerId ? { ...draft, ...patch } : draft
        )));
        setBulkMessage('');
    };

    const selectEntry = (draft: ResolutionDraft, entryId: string) => {
        const entry = entriesById.get(entryId);
        updateDraft(draft.player.id, {
            selectedEntryId: entryId,
            discordUserId: entry?.discordUserId
                ?? (entryId ? draft.discordUserId : ''),
        });
    };

    const updateDiscordUserId = (draft: ResolutionDraft, value: string) => {
        const discordUserId = cleanDiscordUserId(value);
        const idMatchedEntry = entriesByDiscordId.get(discordUserId);
        updateDraft(draft.player.id, {
            discordUserId,
            selectedEntryId: idMatchedEntry?.id
                ?? (draft.matchKind === 'NEW' ? '' : draft.selectedEntryId),
        });
    };

    const applyBulkIds = () => {
        const parsed = bulkText
            .split(/\r?\n/)
            .map(line => {
                const id = cleanDiscordUserId(line.match(/(?:<@!?)?\d{17,20}>?/)?.[0] ?? '');
                const label = line.replace(/(?:<@!?)?\d{17,20}>?/, '').trim();
                return { id, label };
            })
            .filter(item => item.id);
        if (parsed.length === 0) {
            setBulkMessage('붙여넣은 내용에서 Discord ID를 찾지 못했습니다.');
            return;
        }

        setDrafts(current => {
            const next = current.map(draft => ({ ...draft }));
            const sequentialTargets = next.filter(draft => draft.requiresDiscordUserId);
            for (const [index, item] of parsed.entries()) {
                const normalizedLabel = normalizeDiscordName(item.label);
                const labeledTarget = normalizedLabel
                    ? next.find(draft => [
                        draft.player.discordName ?? '',
                        draft.player.name,
                        draft.player.name.split('#')[0],
                    ].some(value => normalizeDiscordName(value) === normalizedLabel))
                    : undefined;
                const target = labeledTarget ?? sequentialTargets[index];
                if (!target) continue;
                target.discordUserId = item.id;
                const existing = entriesByDiscordId.get(item.id);
                if (existing) target.selectedEntryId = existing.id;
            }
            return next;
        });
        setBulkMessage(`${parsed.length}개의 Discord ID를 입력란에 반영했습니다.`);
    };

    const toggleAllExistingTiers = () => {
        const nextValue = !allExistingTiersEnabled;
        setDrafts(current => current.map(draft => (
            getResolvedEntry(draft) ? { ...draft, syncTiers: nextValue } : draft
        )));
    };

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/90 p-2 backdrop-blur-sm md:p-5"
            role="presentation"
            onMouseDown={event => {
                if (event.target === event.currentTarget && !isSubmitting) onCancel();
            }}
        >
            <section
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="roster-identity-title"
                tabIndex={-1}
                className="flex h-[calc(100dvh-1rem)] w-full max-w-5xl flex-col overscroll-contain overflow-hidden rounded-2xl border border-slate-700/80 bg-surface-elevated shadow-2xl focus:outline-none md:h-[min(900px,calc(100dvh-2.5rem))]"
            >
                <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-4 py-4 md:px-6">
                    <div>
                        <div className="flex items-center gap-2">
                            <Fingerprint size={18} className="text-cyan-300" aria-hidden="true" />
                            <h2 id="roster-identity-title" className="font-semibold text-white">
                                참가자 식별 및 적용 검토
                            </h2>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                            {isLocalOnly
                                ? '원격 유저 시트에 연결하지 않고 현재 브라우저의 참가 명단에만 적용합니다.'
                                : '기존 유저 연결과 변경 내용을 확인한 뒤 명단과 유저 시트를 한 번에 반영합니다.'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isSubmitting}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-white/5 hover:text-slate-200 disabled:opacity-40"
                        aria-label="식별 검토 닫기"
                    >
                        <X size={17} aria-hidden="true" />
                    </button>
                </header>

                {isLocalOnly ? (
                    <div className="flex shrink-0 items-start gap-2 border-b border-emerald-500/15 bg-emerald-500/[0.06] px-4 py-3 text-xs text-emerald-100/80 md:px-6">
                        <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-300" aria-hidden="true" />
                        <p>
                            로컬 전용 테스트 · 참가자 {drafts.length}명 · Discord ID와 유저 시트 저장을 생략합니다.
                        </p>
                    </div>
                ) : (
                <div className="grid shrink-0 grid-cols-3 gap-2 border-b border-slate-800 px-4 py-3 md:px-6">
                    <div className="rounded-lg bg-cyan-500/[0.08] px-3 py-2">
                        <p className="text-[10px] text-cyan-400/70">기존 연결</p>
                        <p className="mt-0.5 text-sm font-semibold text-cyan-200">{matchedCount}명</p>
                    </div>
                    <div className="rounded-lg bg-violet-500/[0.08] px-3 py-2">
                        <p className="text-[10px] text-violet-400/70">신규 생성</p>
                        <p className="mt-0.5 text-sm font-semibold text-violet-200">{newCount}명</p>
                    </div>
                    <div className={`rounded-lg px-3 py-2 ${
                        unresolvedCount > 0 ? 'bg-rose-500/[0.1]' : 'bg-emerald-500/[0.08]'
                    }`}>
                        <p className={`text-[10px] ${
                            unresolvedCount > 0 ? 'text-rose-400/70' : 'text-emerald-400/70'
                        }`}>확인 필요</p>
                        <p className={`mt-0.5 text-sm font-semibold ${
                            unresolvedCount > 0 ? 'text-rose-200' : 'text-emerald-200'
                        }`}>{unresolvedCount}명</p>
                    </div>
                </div>
                )}

                <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-6">
                    {currentPlayers.length > 0 && (
                        <div className="mb-4 rounded-xl border border-slate-800 bg-surface p-3">
                            <p className="text-xs font-medium text-slate-300">명단 적용 방식</p>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => setMode('replace')}
                                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                        mode === 'replace'
                                            ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-100'
                                            : 'border-slate-800 text-slate-400 hover:border-slate-700'
                                    }`}
                                >
                                    <span className="block text-xs font-semibold">현재 명단 교체</span>
                                    <span className="mt-0.5 block text-[11px] opacity-70">
                                        유지 {rosterPreview.unchangedCount} · 갱신 {rosterPreview.updatedCount} · 제외 {rosterPreview.removedCount}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('append')}
                                    className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                        mode === 'append'
                                            ? 'border-cyan-400/50 bg-cyan-500/10 text-cyan-100'
                                            : 'border-slate-800 text-slate-400 hover:border-slate-700'
                                    }`}
                                >
                                    <span className="block text-xs font-semibold">기존 명단에 추가</span>
                                    <span className="mt-0.5 block text-[11px] opacity-70">
                                        갱신 {rosterPreview.updatedCount} · 신규 {rosterPreview.addedCount}
                                    </span>
                                </button>
                            </div>
                        </div>
                    )}

                    {!isLocalOnly && (
                    <div className="mb-4 rounded-xl border border-slate-800 bg-surface p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <label htmlFor="bulk-discord-ids" className="text-xs font-medium text-slate-300">
                                    Discord ID 한 번에 붙여넣기
                                </label>
                                <p className="mt-1 text-[11px] text-slate-600">
                                    `별명 123456789012345678` 형식 또는 미해결 인원 순서대로 한 줄씩 입력하세요.
                                </p>
                            </div>
                            {matchedCount > 0 && (
                                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-800 px-2.5 py-2 text-[11px] text-slate-300">
                                    <input
                                        type="checkbox"
                                        name="sync-all-existing-tiers"
                                        checked={allExistingTiersEnabled}
                                        onChange={toggleAllExistingTiers}
                                        className="accent-cyan-400"
                                    />
                                    기존 유저 티어 변동 함께 반영
                                </label>
                            )}
                        </div>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                            <textarea
                                id="bulk-discord-ids"
                                name="bulk-discord-ids"
                                autoComplete="off"
                                value={bulkText}
                                onChange={event => setBulkText(event.target.value)}
                                rows={3}
                                placeholder={'상민 123456789012345678\nPlayer#1234 234567890123456789'}
                                className="min-h-20 flex-1 resize-y rounded-lg border border-slate-700 bg-slate-950/40 px-3 py-2 font-mono text-xs text-slate-200 outline-none focus:border-cyan-400"
                                spellCheck={false}
                            />
                            <button
                                type="button"
                                onClick={applyBulkIds}
                                className="btn-ghost min-h-10 shrink-0 border border-slate-700 sm:self-end"
                            >
                                일괄 반영
                            </button>
                        </div>
                        {bulkMessage && <p className="mt-2 text-[11px] text-cyan-300">{bulkMessage}</p>}
                    </div>
                    )}

                    {failedLines.length > 0 && (
                        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3">
                            <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-300" aria-hidden="true" />
                            <p className="text-[11px] leading-relaxed text-amber-100/75">
                                해석하지 못한 {failedLines.length}명은 이번 적용에서 제외되고, 적용 후 입력창에서 이어서 보완할 수 있습니다.
                            </p>
                        </div>
                    )}

                    <div className="space-y-2.5">
                        {drafts.map((draft, index) => {
                            const error = errors[index];
                            const resolvedEntry = getResolvedEntry(draft);
                            const idMatchedEntry = entriesByDiscordId.get(
                                cleanDiscordUserId(draft.discordUserId),
                            );
                            const changes = getDraftChanges(draft);
                            const candidates = draft.candidateEntryIds
                                .map(id => entriesById.get(id))
                                .filter((entry): entry is UserSheetEntry => Boolean(entry));
                            if (
                                resolvedEntry
                                && !candidates.some(entry => entry.id === resolvedEntry.id)
                            ) {
                                candidates.unshift(resolvedEntry);
                            }
                            return (
                                <RosterIdentityRow
                                    key={draft.player.id}
                                    candidates={candidates}
                                    changes={changes}
                                    draft={draft}
                                    error={error}
                                    idMatchedEntry={idMatchedEntry}
                                    isLocalOnly={isLocalOnly}
                                    resolvedEntry={resolvedEntry}
                                    onEntryChange={selectEntry}
                                    onDiscordUserIdChange={updateDiscordUserId}
                                    onSyncTiersChange={(playerId, syncTiers) => updateDraft(playerId, {
                                        syncTiers,
                                    })}
                                />
                            );
                        })}
                    </div>

                    {!isLocalOnly && submitError && (
                        <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/[0.08] p-3" role="alert">
                            <div className="flex items-start gap-2">
                                <AlertCircle size={15} className="mt-0.5 shrink-0 text-rose-300" aria-hidden="true" />
                                <div>
                                    <p className="text-xs font-semibold text-rose-100">유저 시트 갱신 실패</p>
                                    <p className="mt-1 text-[11px] leading-relaxed text-rose-200/75">{submitError}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => onApplyRosterOnly(resolution)}
                                className="mt-3 min-h-9 rounded-lg border border-rose-300/25 px-3 text-xs text-rose-100 hover:bg-rose-400/10"
                            >
                                시트 갱신 없이 명단만 적용
                            </button>
                        </div>
                    )}
                </div>

                <footer className="flex shrink-0 flex-col gap-3 border-t border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-6">
                    <p className="text-[11px] text-slate-600">
                        {isLocalOnly
                            ? '이 명단과 팀 결과는 현재 브라우저에만 30분 동안 저장됩니다.'
                            : '개인 운영 메모와 관리자 특이사항은 자동 갱신하지 않습니다.'}
                    </p>
                    <div className="flex shrink-0 justify-end gap-2">
                        <button
                            type="button"
                            onClick={onCancel}
                            disabled={isSubmitting}
                            className="btn-ghost min-h-10 disabled:opacity-40"
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={() => (
                                isLocalOnly
                                    ? onApplyRosterOnly(resolution)
                                    : onConfirm(resolution)
                            )}
                            disabled={(!isLocalOnly && unresolvedCount > 0) || isSubmitting}
                            className="btn-primary min-h-10 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {isLocalOnly ? '로컬 명단에만 적용' : isSubmitting ? (
                                <span className="inline-flex items-center gap-2">
                                    <RefreshCw size={14} className="animate-spin" aria-hidden="true" />
                                    유저 시트 갱신 중
                                </span>
                            ) : unresolvedCount > 0
                                ? `${unresolvedCount}명 확인 필요`
                                : sheetChangeCount > 0
                                    ? `명단 적용 및 유저 시트 ${sheetChangeCount}명 갱신`
                                    : '명단 적용 · 시트 변경 없음'}
                        </button>
                    </div>
                </footer>
            </section>
        </div>
    );
}
