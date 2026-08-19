import {
    AlertCircle,
    Fingerprint,
    Loader2,
    MessageSquareText,
    NotebookPen,
    Pencil,
    Save,
    Shield,
    Swords,
    UserRound,
    X,
} from 'lucide-react';
import type {
    UserSheetDraftEntry,
    UserSheetEntry,
} from '../../utils/user-sheet';
import { BattleTagCopyButton } from '../player/battle-tag-copy-button';
import PlayerNoteEditor from '../player/list/player-note-editor';

export type UserSheetEntryField =
    | 'discordUserId'
    | 'discordName'
    | 'battleTag'
    | 'tank'
    | 'dps'
    | 'support'
    | 'note';

interface UserSheetEntryContentProps {
    csrfToken: string;
    draft: UserSheetDraftEntry;
    entry: UserSheetEntry;
    isCurrentParticipant: boolean;
    isDirty: boolean;
    isEditing: boolean;
    isSaving: boolean;
    noteCacheScope: string;
    onCancel: () => void;
    onEdit: () => void;
    onFieldChange: (field: UserSheetEntryField, value: string) => void;
    onSave: () => void;
    validationMessage: string;
}

const ROLE_FIELDS: ReadonlyArray<{
    field: 'tank' | 'dps' | 'support';
    icon: typeof Shield;
    label: string;
}> = [
    { field: 'tank', label: '탱커', icon: Shield },
    { field: 'dps', label: '딜러', icon: Swords },
    { field: 'support', label: '힐러', icon: UserRound },
];

/**
 * @description 유저 시트 상세의 공용 정보와 독립된 개인 메모 영역을 렌더링한다.
 */
export function UserSheetEntryContent({
    csrfToken,
    draft,
    entry,
    isCurrentParticipant,
    isDirty,
    isEditing,
    isSaving,
    noteCacheScope,
    onCancel,
    onEdit,
    onFieldChange,
    onSave,
    validationMessage,
}: UserSheetEntryContentProps) {
    return (
        <section
            id="user-sheet-entry-detail"
            className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5 md:p-8"
            aria-labelledby="user-sheet-entry-title"
        >
            <div className="mx-auto max-w-3xl">
                {isEditing ? (
                    <>
                        <div className="grid grid-cols-2 items-center gap-3">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                {isCurrentParticipant && (
                                    <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-[11px] font-medium text-cyan-300">
                                        현재 참가자
                                    </span>
                                )}
                                <span className="truncate text-xs text-slate-600">
                                    최종 수정 · {entry.updatedByName} · {new Date(entry.updatedAt).toLocaleString('ko-KR')}
                                </span>
                            </div>
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={onCancel}
                                    disabled={isSaving}
                                    className="btn-ghost inline-flex min-h-9 items-center gap-2 disabled:opacity-40"
                                >
                                    <X size={14} aria-hidden="true" />
                                    취소
                                </button>
                                <button
                                    type="button"
                                    onClick={onSave}
                                    disabled={isSaving || !csrfToken || !isDirty}
                                    className="btn-primary inline-flex min-h-9 items-center gap-2 disabled:opacity-40"
                                >
                                    {isSaving
                                        ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                                        : <Save size={14} aria-hidden="true" />}
                                    {isSaving ? '공용 정보 저장 중…' : '공용 정보 저장'}
                                </button>
                            </div>
                        </div>
                        <h2 id="user-sheet-entry-title" className="sr-only">
                            {entry.discordName || entry.battleTag} 정보 수정
                        </h2>
                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <label className="grid gap-1.5 text-xs text-slate-500">
                                디스코드 이름
                                <input
                                    value={draft.discordName}
                                    onChange={event => onFieldChange('discordName', event.target.value)}
                                    className="h-10 rounded-lg border border-slate-700 bg-surface px-3 text-sm text-slate-100 outline-none focus:border-cyan-400"
                                    autoComplete="off"
                                />
                            </label>
                            <label className="grid gap-1.5 text-xs text-slate-500">
                                배틀태그
                                <input
                                    value={draft.battleTag}
                                    onChange={event => onFieldChange('battleTag', event.target.value)}
                                    className={`h-10 rounded-lg border bg-surface px-3 font-mono text-sm text-slate-100 outline-none focus:border-cyan-400 ${
                                        validationMessage ? 'border-rose-400/70' : 'border-slate-700'
                                    }`}
                                    autoComplete="off"
                                    spellCheck={false}
                                    aria-invalid={Boolean(validationMessage)}
                                />
                            </label>
                            <label className="grid gap-1.5 text-xs text-slate-500 sm:col-span-2">
                                Discord 고유 ID <span className="text-rose-300">*</span>
                                <input
                                    value={draft.discordUserId ?? ''}
                                    onChange={event => onFieldChange('discordUserId', event.target.value.replace(/\D/g, ''))}
                                    className="h-10 rounded-lg border border-slate-700 bg-surface px-3 font-mono text-sm text-slate-100 outline-none focus:border-cyan-400"
                                    inputMode="numeric"
                                    required
                                    autoComplete="off"
                                    placeholder="필수 · 17~20자리 숫자"
                                />
                            </label>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                                {isCurrentParticipant && (
                                    <span className="rounded-full bg-cyan-500/15 px-2 py-1 text-[11px] font-medium text-cyan-300">
                                        현재 참가자
                                    </span>
                                )}
                                <span className="text-xs text-slate-600">
                                    최종 수정 · {entry.updatedByName} · {new Date(entry.updatedAt).toLocaleString('ko-KR')}
                                </span>
                            </div>
                            <h2 id="user-sheet-entry-title" className="truncate text-xl font-semibold text-white">
                                {entry.discordName || entry.battleTag}
                            </h2>
                            <div className="mt-1 flex items-center gap-1">
                                <p className="min-w-0 break-all font-mono text-sm text-slate-400">{entry.battleTag}</p>
                                <BattleTagCopyButton battleTag={entry.battleTag} />
                            </div>
                            <p className={`mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] ${
                                entry.discordUserId ? 'text-slate-500' : 'text-rose-300'
                            }`}>
                                <Fingerprint size={12} aria-hidden="true" />
                                Discord ID · {entry.discordUserId || '입력 필요'}
                            </p>
                        </div>
                        <button
                            id="user-sheet-quick-edit"
                            type="button"
                            onClick={onEdit}
                            className="btn-primary inline-flex min-h-9 items-center gap-2"
                        >
                            <Pencil size={14} aria-hidden="true" />
                            공용 정보 수정
                        </button>
                    </div>
                )}

                {validationMessage && (
                    <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-500/25 bg-rose-500/[0.08] px-3 py-2.5 text-xs text-rose-200" role="alert">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                        {validationMessage}
                    </div>
                )}

                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    {ROLE_FIELDS.map(item => (
                        <div key={item.field} className="rounded-xl border border-slate-800 bg-surface p-4">
                            <label
                                htmlFor={`user-sheet-${item.field}`}
                                className="flex items-center gap-2 text-xs text-slate-500"
                            >
                                <item.icon size={14} aria-hidden="true" />
                                {item.label}
                            </label>
                            {isEditing ? (
                                <input
                                    id={`user-sheet-${item.field}`}
                                    value={draft[item.field]}
                                    onChange={event => onFieldChange(item.field, event.target.value)}
                                    placeholder="예: 다3"
                                    className="mt-2 h-10 w-full rounded-lg border border-slate-700 bg-surface-elevated px-3 text-sm font-semibold text-slate-100 outline-none focus:border-cyan-400"
                                    autoComplete="off"
                                />
                            ) : (
                                <p className="mt-2 text-base font-semibold text-slate-200">{entry[item.field] || '미입력'}</p>
                            )}
                        </div>
                    ))}
                </div>

                <div id="user-sheet-notes">
                    <div className={`mt-4 rounded-xl border p-4 ${
                        entry.note || isEditing
                            ? 'border-emerald-500/20 bg-emerald-500/[0.04]'
                            : 'border-slate-800 bg-surface'
                    }`}>
                        <label
                            htmlFor="user-sheet-note"
                            className={`flex items-center gap-2 text-xs ${
                                entry.note || isEditing ? 'text-emerald-300/80' : 'text-slate-500'
                            }`}
                        >
                            <MessageSquareText size={14} aria-hidden="true" />
                            특이사항
                            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300/70">
                                관리자 공유
                            </span>
                        </label>
                        {isEditing ? (
                            <textarea
                                id="user-sheet-note"
                                value={draft.note}
                                onChange={event => onFieldChange('note', event.target.value)}
                                placeholder="플레이 성향이나 참고할 내용을 적어 주세요."
                                maxLength={500}
                                rows={5}
                                className="mt-3 w-full resize-y rounded-lg border border-slate-700 bg-surface px-3 py-2.5 text-sm leading-relaxed text-slate-100 outline-none focus:border-cyan-400"
                            />
                        ) : (
                            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300">
                                {entry.note || '등록된 특이사항이 없습니다.'}
                            </p>
                        )}
                    </div>

                    <section
                        className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/[0.035] p-4"
                        aria-labelledby="user-sheet-private-note-title"
                    >
                        <div className="flex items-start gap-2">
                            <NotebookPen size={15} className="mt-0.5 shrink-0 text-violet-300" aria-hidden="true" />
                            <div>
                                <div className="flex items-center gap-2">
                                    <h3 id="user-sheet-private-note-title" className="text-xs font-medium text-violet-200">
                                        개인 운영 메모
                                    </h3>
                                    {!isEditing && (
                                        <span className="rounded bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-300/70">
                                            나만 보기
                                        </span>
                                    )}
                                </div>
                                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                                    현재 로그인한 관리자 본인에게만 보이며 특이사항 및 팀 결과와 분리됩니다.
                                </p>
                            </div>
                        </div>
                        <PlayerNoteEditor
                            battleTag={entry.battleTag}
                            cacheScope={noteCacheScope}
                            csrfToken={csrfToken}
                            entryId={entry.id}
                        />
                    </section>
                </div>
            </div>
        </section>
    );
}
