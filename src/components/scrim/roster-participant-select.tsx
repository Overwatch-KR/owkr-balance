import {
    useEffect,
    useId,
    useRef,
    useState,
    type KeyboardEvent,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronDown, UserRound } from 'lucide-react';
import type { ScrimRosterParticipant } from '../../../domains/scrim/shared/public';

interface RosterParticipantSelectProps {
    onChange: (participantId: string) => void;
    options: ScrimRosterParticipant[];
    value: string;
}

const getParticipantLabel = (participant: ScrimRosterParticipant): string => (
    participant.discordName ?? participant.name
);

/**
 * @description 공개 영웅 밴 투표에서 로스터 참가자를 OWKR 전용 목록 UI로 선택한다.
 */
export function RosterParticipantSelect({
    onChange,
    options,
    value,
}: RosterParticipantSelectProps) {
    const listboxId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const selectedParticipant = options.find(participant => participant.id === value);
    const isDisabled = options.length === 0;

    useEffect(() => {
        if (!isOpen) return;
        const closeOnOutsidePointer = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setIsOpen(false);
        };
        document.addEventListener('pointerdown', closeOnOutsidePointer);
        return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
    }, [isOpen]);

    const open = () => {
        if (isDisabled) return;
        const selectedIndex = options.findIndex(participant => participant.id === value);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setIsOpen(true);
    };

    const select = (participant: ScrimRosterParticipant) => {
        onChange(participant.id);
        setIsOpen(false);
    };

    const moveActiveOption = (direction: 1 | -1) => {
        if (!isOpen) {
            open();
            return;
        }
        setActiveIndex(current => (current + direction + options.length) % options.length);
    };

    const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (isDisabled) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            moveActiveOption(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (event.key === 'Home' && isOpen) {
            event.preventDefault();
            setActiveIndex(0);
            return;
        }
        if (event.key === 'End' && isOpen) {
            event.preventDefault();
            setActiveIndex(options.length - 1);
            return;
        }
        if ((event.key === 'Enter' || event.key === ' ') && isOpen) {
            event.preventDefault();
            select(options[activeIndex]);
            return;
        }
        if (event.key === 'Escape' && isOpen) {
            event.preventDefault();
            setIsOpen(false);
        }
        if (event.key === 'Tab') setIsOpen(false);
    };

    return (
        <div ref={rootRef} className="relative mt-1">
            <button
                type="button"
                aria-activedescendant={isOpen ? `${listboxId}-option-${activeIndex}` : undefined}
                aria-controls={listboxId}
                aria-expanded={isOpen}
                aria-haspopup="listbox"
                disabled={isDisabled}
                onClick={() => (isOpen ? setIsOpen(false) : open())}
                onKeyDown={handleTriggerKeyDown}
                className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 text-left transition ${
                    isOpen
                        ? 'border-cyan-400/70 bg-slate-950 ring-2 ring-cyan-400/15'
                        : 'border-slate-800 bg-slate-950/55 hover:border-slate-700'
                } disabled:cursor-not-allowed disabled:opacity-55`}
            >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    selectedParticipant ? 'bg-cyan-400/10 text-cyan-200' : 'bg-slate-800 text-slate-500'
                }`}>
                    <UserRound size={18} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-medium ${
                        selectedParticipant ? 'text-white' : 'text-slate-400'
                    }`}>
                        {selectedParticipant
                            ? getParticipantLabel(selectedParticipant)
                            : isDisabled
                                ? '모든 참가자가 투표를 완료했습니다'
                                : '로스터에서 내 이름 선택'}
                    </span>
                    {selectedParticipant?.discordName && selectedParticipant.discordName !== selectedParticipant.name ? (
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                            {selectedParticipant.name}
                        </span>
                    ) : null}
                </span>
                <ChevronDown
                    size={18}
                    aria-hidden="true"
                    className={`shrink-0 text-slate-500 transition-transform ${isOpen ? 'rotate-180 text-cyan-300' : ''}`}
                />
            </button>

            <AnimatePresence>
                {isOpen ? (
                    <motion.div
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.98 }}
                        transition={{ duration: 0.16, ease: 'easeOut' }}
                        className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-40 overflow-hidden rounded-2xl border border-slate-700 bg-[#111520]/98 p-1.5 shadow-2xl shadow-black/50 backdrop-blur-xl"
                    >
                        <div
                            id={listboxId}
                            role="listbox"
                            aria-label="로스터 참가자"
                            className="max-h-72 space-y-1 overflow-y-auto overscroll-contain p-1"
                        >
                            {options.map((participant, index) => {
                                const isSelected = participant.id === value;
                                const isActive = index === activeIndex;
                                return (
                                    <button
                                        key={participant.id}
                                        id={`${listboxId}-option-${index}`}
                                        type="button"
                                        role="option"
                                        aria-selected={isSelected}
                                        tabIndex={-1}
                                        onPointerEnter={() => setActiveIndex(index)}
                                        onClick={() => select(participant)}
                                        className={`flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left transition ${
                                            isActive
                                                ? 'bg-cyan-400/12 text-white'
                                                : 'text-slate-300 hover:bg-slate-800/80'
                                        }`}
                                    >
                                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${
                                            isActive
                                                ? 'bg-cyan-300 text-slate-950'
                                                : 'bg-slate-800 text-slate-400'
                                        }`}>
                                            {getParticipantLabel(participant).slice(0, 1)}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-sm font-medium">
                                                {getParticipantLabel(participant)}
                                            </span>
                                            {participant.discordName && participant.discordName !== participant.name ? (
                                                <span className="mt-0.5 block truncate text-xs text-slate-500">
                                                    {participant.name}
                                                </span>
                                            ) : null}
                                        </span>
                                        {isSelected ? <Check size={17} className="shrink-0 text-cyan-300" /> : null}
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                ) : null}
            </AnimatePresence>
        </div>
    );
}
