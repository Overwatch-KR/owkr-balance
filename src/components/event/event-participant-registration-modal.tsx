import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarCheck2, Check, Loader2, X } from 'lucide-react';
import type { EventParticipationSnapshot } from '../../../domains/scrim/shared/rules';
import type { ScrimRosterParticipant } from '../../../domains/scrim/shared/public';
import { useDialogFocus } from '../../hooks/use-dialog-focus';
import type { Player } from '../../types';
import { getErrorMessage, requestJson } from '../../utils/api';
import { EventParticipantIdentity } from './event-participant-identity';

interface EventParticipantRegistrationModalProps {
    csrfToken: string;
    onClose: () => void;
    onSuccess: (addedCount: number, totalCount: number) => void;
    players: Player[];
}

const toParticipant = (player: Player): ScrimRosterParticipant => ({
    id: player.discordUserId ?? player.userSheetEntryId ?? String(player.id),
    name: player.name,
    discordName: player.discordName,
    discordUserId: player.discordUserId,
});

/**
 * @description 현재 팀 결과 인원 중 실제 참여자를 확인해 기존 이벤트 명단에 추가한다.
 */
export function EventParticipantRegistrationModal({
    csrfToken,
    onClose,
    onSuccess,
    players,
}: EventParticipantRegistrationModalProps) {
    const candidates = useMemo(() => players.map(toParticipant), [players]);
    const [selectedIds, setSelectedIds] = useState(() => new Set(
        candidates.map(participant => participant.id),
    ));
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');
    const dialogRef = useDialogFocus({ closeOnEscape: !isSaving, onClose });

    const toggle = (participantId: string) => {
        if (isSaving) return;
        setSelectedIds(current => {
            const next = new Set(current);
            if (next.has(participantId)) next.delete(participantId);
            else next.add(participantId);
            return next;
        });
    };

    const submit = async () => {
        if (selectedIds.size === 0 || isSaving) return;
        setIsSaving(true);
        setError('');
        try {
            const selectedParticipants = candidates.filter(participant => selectedIds.has(participant.id));
            const result = await requestJson<EventParticipationSnapshot>('/api/event-participants', {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                },
                body: JSON.stringify({ participants: selectedParticipants }),
            });
            const registeredIds = new Set(result.participantIds);
            const registeredCount = selectedParticipants.filter(participant => (
                registeredIds.has(participant.id)
            )).length;
            onSuccess(registeredCount, result.participantIds.length);
        } catch (submitError) {
            setError(getErrorMessage(submitError, '이번 내전 참여자를 등록하지 못했습니다.'));
            setIsSaving(false);
        }
    };

    return (
        <motion.div
            className="fixed inset-0 z-[110] overflow-y-auto bg-slate-950/90 p-3 backdrop-blur-sm md:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="presentation"
            onMouseDown={event => {
                if (!isSaving && event.target === event.currentTarget) onClose();
            }}
        >
            <motion.section
                ref={dialogRef}
                initial={{ opacity: 0, y: 20, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="event-registration-title"
                tabIndex={-1}
                className="mx-auto max-w-2xl rounded-2xl border border-slate-800 bg-surface-elevated p-4 shadow-2xl shadow-black/40 focus:outline-none md:p-6"
            >
                <header className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 text-cyan-300">
                            <CalendarCheck2 size={18} aria-hidden="true" />
                            <p className="text-xs font-semibold">2026 넥슨 이벤트</p>
                        </div>
                        <h2 id="event-registration-title" className="mt-2 text-xl font-bold text-white">
                            이번 내전 참여 등록
                        </h2>
                        <p className="mt-1 text-sm text-slate-400">
                            현재 명단을 모두 선택했습니다. 실제로 참여하지 않은 사람만 해제해 주세요.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="btn-ghost p-2"
                        disabled={isSaving}
                        onClick={onClose}
                        aria-label="닫기"
                    >
                        <X size={18} aria-hidden="true" />
                    </button>
                </header>

                <ul className="mt-5 grid gap-2" aria-label="이번 내전 참여자">
                    {candidates.map(candidate => {
                        const isSelected = selectedIds.has(candidate.id);
                        return (
                            <li key={candidate.id}>
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={isSelected}
                                    disabled={isSaving}
                                    onClick={() => toggle(candidate.id)}
                                    className={`flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-sm transition disabled:cursor-wait ${
                                        isSelected
                                            ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-100'
                                            : 'border-slate-800 bg-slate-900 text-slate-400'
                                    }`}
                                >
                                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                        isSelected
                                            ? 'border-cyan-300 bg-cyan-300 text-slate-950'
                                            : 'border-slate-600 bg-slate-950'
                                    }`}>
                                        {isSelected ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : null}
                                    </span>
                                    <EventParticipantIdentity participant={candidate} />
                                </button>
                            </li>
                        );
                    })}
                </ul>

                {error ? (
                    <p className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 py-2 text-sm text-rose-200" role="alert">
                        {error}
                    </p>
                ) : null}

                <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
                    <span className="text-sm text-slate-400">선택 {selectedIds.size}/{candidates.length}명</span>
                    <div className="flex gap-2">
                        <button type="button" className="btn-ghost" disabled={isSaving} onClick={onClose}>
                            취소
                        </button>
                        <button
                            type="button"
                            className="btn-primary min-w-36 disabled:opacity-40"
                            disabled={selectedIds.size === 0 || isSaving}
                            onClick={() => void submit()}
                        >
                            {isSaving ? (
                                <Loader2 size={16} className="mr-1 inline animate-spin" aria-hidden="true" />
                            ) : (
                                <CalendarCheck2 size={16} className="mr-1 inline" aria-hidden="true" />
                            )}
                            {isSaving ? '등록 중' : `${selectedIds.size}명 등록`}
                        </button>
                    </div>
                </footer>
            </motion.section>
        </motion.div>
    );
}
