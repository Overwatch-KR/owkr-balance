import {
    AlertCircle,
    ArrowRight,
    CheckCircle2,
    Link2,
    UserPlus,
} from 'lucide-react';
import type { UserSheetEntry } from '../../../utils/user-sheet';
import type { RosterIdentitySuggestion } from '../../../utils/player-identity';

export interface ResolutionDraft extends RosterIdentitySuggestion {
    discordUserId: string;
    selectedEntryId: string;
    syncTiers: boolean;
}

export interface FieldChange {
    after: string;
    before: string;
    label: string;
}

const MATCH_LABELS: Record<RosterIdentitySuggestion['matchKind'], string> = {
    DISCORD_ID: 'Discord ID 일치',
    BATTLE_TAG_AND_NAME: '이름·배틀태그 일치',
    BATTLE_TAG: '배틀태그 일치',
    DISCORD_NAME: '이름으로 추천',
    AMBIGUOUS: '후보 확인 필요',
    NEW: '신규 유저',
};

interface RosterIdentityRowProps {
    candidates: UserSheetEntry[];
    changes: FieldChange[];
    draft: ResolutionDraft;
    error: string;
    idMatchedEntry?: UserSheetEntry;
    isLocalOnly?: boolean;
    onDiscordUserIdChange: (draft: ResolutionDraft, value: string) => void;
    onEntryChange: (draft: ResolutionDraft, entryId: string) => void;
    onSyncTiersChange: (playerId: number, syncTiers: boolean) => void;
    resolvedEntry?: UserSheetEntry;
}

/**
 * @description 참가자 한 명의 기존 시트 연결, Discord ID, 갱신 예정 항목을 표시한다.
 */
export function RosterIdentityRow({
    candidates,
    changes,
    draft,
    error,
    idMatchedEntry,
    isLocalOnly = false,
    onDiscordUserIdChange,
    onEntryChange,
    onSyncTiersChange,
    resolvedEntry,
}: RosterIdentityRowProps) {
    return (
        <article
            className={`rounded-xl border p-3 ${
                error
                    ? 'border-rose-500/30 bg-rose-500/[0.045]'
                    : 'border-slate-800 bg-surface'
            }`}
        >
            <div className={`grid gap-3 ${
                isLocalOnly
                    ? 'grid-cols-1'
                    : 'lg:grid-cols-[minmax(0,1.2fr)_minmax(180px,0.9fr)_minmax(210px,1fr)]'
            }`}>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        {isLocalOnly
                            ? <CheckCircle2 size={14} className="shrink-0 text-emerald-300" aria-hidden="true" />
                            : resolvedEntry
                            ? <Link2 size={14} className="shrink-0 text-cyan-300" aria-hidden="true" />
                            : <UserPlus size={14} className="shrink-0 text-violet-300" aria-hidden="true" />}
                        <p className="truncate text-sm font-medium text-slate-100">
                            {draft.player.discordName || draft.player.name}
                        </p>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                            isLocalOnly
                                ? 'bg-emerald-500/10 text-emerald-300'
                                : draft.requiresDiscordUserId
                                ? 'bg-amber-500/10 text-amber-300'
                                : 'bg-cyan-500/10 text-cyan-300'
                        }`}>
                            {isLocalOnly
                                ? '로컬 명단'
                                : idMatchedEntry && draft.matchKind !== 'DISCORD_ID'
                                ? 'Discord ID로 기존 연결'
                                : MATCH_LABELS[draft.matchKind]}
                        </span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[11px] text-slate-600">
                        {draft.player.name}
                    </p>
                </div>

                {!isLocalOnly && <label className="grid gap-1 text-[11px] text-slate-500">
                    시트 연결
                    <select
                        name={`roster-entry-${draft.player.id}`}
                        value={resolvedEntry?.id ?? ''}
                        onChange={event => onEntryChange(draft, event.target.value)}
                        className="h-10 min-w-0 rounded-lg border border-slate-700 bg-slate-950/50 px-2 text-xs text-slate-200 outline-none focus:border-cyan-400"
                    >
                        <option value="">새 유저로 생성 · 미등록 ID만 가능</option>
                        {candidates.map(entry => (
                            <option key={entry.id} value={entry.id}>
                                {entry.discordName || '이름 없음'} · {entry.battleTag}
                            </option>
                        ))}
                    </select>
                </label>}

                {!isLocalOnly && <label className="grid gap-1 text-[11px] text-slate-500">
                    Discord 고유 ID
                    <input
                        name={`discord-user-id-${draft.player.id}`}
                        autoComplete="off"
                        spellCheck={false}
                        value={draft.discordUserId}
                        onChange={event => onDiscordUserIdChange(draft, event.target.value)}
                        inputMode="numeric"
                        placeholder="필수 · 17~20자리 숫자…"
                        className={`h-10 min-w-0 rounded-lg border bg-slate-950/50 px-3 font-mono text-xs outline-none ${
                            error
                                ? 'border-rose-400/60 text-rose-100 focus:border-rose-300'
                                : 'border-slate-700 text-slate-200 focus:border-cyan-400'
                        }`}
                        aria-invalid={Boolean(error)}
                    />
                </label>}
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
                    {error ? (
                        <>
                            <AlertCircle size={12} className="shrink-0 text-rose-300" aria-hidden="true" />
                            <span className="text-rose-200">{error}</span>
                        </>
                    ) : (
                        <>
                            <CheckCircle2 size={12} className="shrink-0 text-emerald-300" aria-hidden="true" />
                            <span className="text-emerald-300">
                                {isLocalOnly
                                    ? '현재 브라우저의 참가 명단에만 추가'
                                    : resolvedEntry
                                    ? idMatchedEntry && draft.matchKind !== 'DISCORD_ID'
                                        ? `Discord ID로 ${resolvedEntry.discordName || resolvedEntry.battleTag} 기존 행 재연결 · 새 행을 만들지 않음`
                                        : changes.length > 0
                                            ? `${changes.length}개 항목 갱신 예정`
                                            : '시트 정보 변경 없음'
                                    : '새 유저 시트 행으로 추가'}
                            </span>
                        </>
                    )}
                </div>
                {!isLocalOnly && resolvedEntry && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-slate-400">
                        <input
                            type="checkbox"
                            name={`sync-tiers-${draft.player.id}`}
                            checked={draft.syncTiers}
                            onChange={event => onSyncTiersChange(draft.player.id, event.target.checked)}
                            className="accent-cyan-400"
                        />
                        티어 변동 반영
                    </label>
                )}
            </div>

            {!isLocalOnly && !error && (resolvedEntry ? changes.length > 0 : true) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                    {resolvedEntry ? changes.map(change => (
                        <span
                            key={change.label}
                            className="inline-flex min-w-0 items-center gap-1 rounded-md bg-slate-950/45 px-2 py-1 text-[10px] text-slate-400"
                        >
                            <strong className="font-medium text-slate-300">{change.label}</strong>
                            <span className="max-w-28 truncate">{change.before}</span>
                            <ArrowRight size={10} className="shrink-0 text-cyan-500" aria-hidden="true" />
                            <span className="max-w-28 truncate text-cyan-200">{change.after}</span>
                        </span>
                    )) : (
                        <span className="rounded-md bg-violet-500/[0.08] px-2 py-1 text-[10px] text-violet-200">
                            ID · 이름 · 배틀태그 · 3개 역할 티어 저장
                        </span>
                    )}
                </div>
            )}
        </article>
    );
}
