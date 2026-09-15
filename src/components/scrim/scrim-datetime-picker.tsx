import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';

interface ScrimDateTimePickerProps {
    date: string;
    onDateChange: (date: string) => void;
    onTimeChange: (time: string) => void;
    time: string;
}

interface CalendarDay {
    date: string;
    day: number;
    isCurrentMonth: boolean;
}

type OpenPanel = 'date' | 'time' | null;
type Period = 'AM' | 'PM';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);

const pad = (value: number): string => String(value).padStart(2, '0');

const parseDate = (value: string): { year: number; month: number; day: number } => {
    const [year, month, day] = value.split('-').map(Number);
    return { year, month, day };
};

const parseTime = (value: string): { hour: number; minute: number } => {
    const [hour, minute] = value.split(':').map(Number);
    return { hour, minute };
};

const toDateValue = (year: number, month: number, day: number): string => (
    `${year}-${pad(month)}-${pad(day)}`
);

const formatDateLabel = (value: string): string => {
    const { year, month, day } = parseDate(value);
    return `${year}. ${pad(month)}. ${pad(day)}.`;
};

const formatTimeLabel = (value: string): string => {
    const { hour, minute } = parseTime(value);
    const period = hour < 12 ? '오전' : '오후';
    const displayHour = hour % 12 || 12;
    return `${period} ${pad(displayHour)}:${pad(minute)}`;
};

const getCalendarDays = (year: number, month: number): CalendarDay[] => {
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(Date.UTC(year, month - 1, index - firstWeekday + 1));
        const dateYear = date.getUTCFullYear();
        const dateMonth = date.getUTCMonth() + 1;
        const day = date.getUTCDate();
        return {
            date: toDateValue(dateYear, dateMonth, day),
            day,
            isCurrentMonth: dateYear === year && dateMonth === month,
        };
    });
};

const getTodayInSeoul = (): string => (
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
);

/**
 * @description 네이티브 입력 없이 내전 날짜와 시작 시간을 선택하는 전용 팝오버 UI다.
 */
export function ScrimDateTimePicker({
    date,
    onDateChange,
    onTimeChange,
    time,
}: ScrimDateTimePickerProps) {
    const selectedDate = parseDate(date);
    const selectedTime = parseTime(time);
    const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
    const [visibleMonth, setVisibleMonth] = useState(() => ({
        month: selectedDate.month,
        year: selectedDate.year,
    }));
    const wrapperRef = useRef<HTMLDivElement>(null);
    const selectedHourRef = useRef<HTMLButtonElement>(null);
    const selectedMinuteRef = useRef<HTMLButtonElement>(null);
    const today = useMemo(() => getTodayInSeoul(), []);
    const calendarDays = useMemo(
        () => getCalendarDays(visibleMonth.year, visibleMonth.month),
        [visibleMonth.month, visibleMonth.year],
    );
    const period: Period = selectedTime.hour < 12 ? 'AM' : 'PM';
    const twelveHour = selectedTime.hour % 12 || 12;

    useEffect(() => {
        const closeOnOutsideClick = (event: MouseEvent) => {
            if (!wrapperRef.current?.contains(event.target as Node)) setOpenPanel(null);
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenPanel(null);
        };
        document.addEventListener('mousedown', closeOnOutsideClick);
        document.addEventListener('keydown', closeOnEscape);
        return () => {
            document.removeEventListener('mousedown', closeOnOutsideClick);
            document.removeEventListener('keydown', closeOnEscape);
        };
    }, []);

    useEffect(() => {
        if (openPanel !== 'time') return;
        window.requestAnimationFrame(() => {
            selectedHourRef.current?.scrollIntoView({ block: 'center' });
            selectedMinuteRef.current?.scrollIntoView({ block: 'center' });
        });
    }, [openPanel]);

    const shiftMonth = (amount: number) => {
        setVisibleMonth(current => {
            const next = new Date(Date.UTC(current.year, current.month - 1 + amount, 1));
            return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
        });
    };

    const selectPeriod = (nextPeriod: Period) => {
        const nextHour = nextPeriod === 'AM'
            ? selectedTime.hour % 12
            : (selectedTime.hour % 12) + 12;
        onTimeChange(`${pad(nextHour)}:${pad(selectedTime.minute)}`);
    };

    const selectHour = (hour: number) => {
        const nextHour = period === 'AM' ? hour % 12 : (hour % 12) + 12;
        onTimeChange(`${pad(nextHour)}:${pad(selectedTime.minute)}`);
    };

    const selectMinute = (minute: number) => {
        onTimeChange(`${pad(selectedTime.hour)}:${pad(minute)}`);
    };

    return (
        <div ref={wrapperRef} className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">진행 날짜</span>
                <button
                    type="button"
                    aria-expanded={openPanel === 'date'}
                    aria-haspopup="dialog"
                    onClick={() => {
                        setVisibleMonth({ year: selectedDate.year, month: selectedDate.month });
                        setOpenPanel(current => current === 'date' ? null : 'date');
                    }}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl border bg-slate-950/60 px-3.5 text-left transition ${
                        openPanel === 'date'
                            ? 'border-cyan-400/70 ring-2 ring-cyan-400/15'
                            : 'border-slate-700/70 hover:border-slate-600'
                    }`}
                >
                    <CalendarDays size={18} className="shrink-0 text-cyan-300" aria-hidden="true" />
                    <span className="flex-1 text-sm font-medium text-white">{formatDateLabel(date)}</span>
                    <ChevronRight size={16} className={`text-slate-400 transition-transform ${openPanel === 'date' ? 'rotate-90' : ''}`} />
                </button>

                {openPanel === 'date' && (
                    <div
                        role="dialog"
                        aria-label="내전 진행 날짜 선택"
                        className="absolute left-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-[#171a21] p-4 shadow-2xl shadow-black/50"
                    >
                        <div className="flex items-center justify-between">
                            <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" onClick={() => shiftMonth(-1)} aria-label="이전 달">
                                <ChevronLeft size={18} />
                            </button>
                            <strong className="text-sm text-white">{visibleMonth.year}년 {visibleMonth.month}월</strong>
                            <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" onClick={() => shiftMonth(1)} aria-label="다음 달">
                                <ChevronRight size={18} />
                            </button>
                        </div>
                        <div className="mt-2 grid grid-cols-7 text-center text-xs font-medium text-slate-400">
                            {WEEKDAYS.map((weekday, index) => (
                                <span key={weekday} className={index === 0 ? 'text-rose-400/80' : index === 6 ? 'text-blue-400/80' : ''}>{weekday}</span>
                            ))}
                        </div>
                        <div className="mt-2 grid grid-cols-7 gap-1">
                            {calendarDays.map(day => {
                                const isSelected = day.date === date;
                                const isToday = day.date === today;
                                return (
                                    <button
                                        key={day.date}
                                        type="button"
                                        aria-pressed={isSelected}
                                        onClick={() => {
                                            onDateChange(day.date);
                                            setOpenPanel(null);
                                        }}
                                        className={`relative flex aspect-square items-center justify-center rounded-lg text-sm transition ${
                                            isSelected
                                                ? 'bg-cyan-400 font-bold text-slate-950 shadow-lg shadow-cyan-400/20'
                                                : day.isCurrentMonth
                                                    ? 'text-slate-200 hover:bg-white/8'
                                                    : 'text-slate-500 hover:bg-white/5'
                                        }`}
                                    >
                                        {day.day}
                                        {isToday && !isSelected && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-cyan-300" />}
                                    </button>
                                );
                            })}
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                const todayDate = parseDate(today);
                                setVisibleMonth({ year: todayDate.year, month: todayDate.month });
                                onDateChange(today);
                                setOpenPanel(null);
                            }}
                            className="mt-3 w-full rounded-lg py-2 text-xs font-medium text-cyan-300 hover:bg-cyan-400/10"
                        >
                            오늘 선택
                        </button>
                    </div>
                )}
            </div>

            <div className="relative">
                <span className="mb-1.5 block text-xs font-medium text-slate-400">시작 시간</span>
                <button
                    type="button"
                    aria-expanded={openPanel === 'time'}
                    aria-haspopup="dialog"
                    onClick={() => setOpenPanel(current => current === 'time' ? null : 'time')}
                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl border bg-slate-950/60 px-3.5 text-left transition ${
                        openPanel === 'time'
                            ? 'border-cyan-400/70 ring-2 ring-cyan-400/15'
                            : 'border-slate-700/70 hover:border-slate-600'
                    }`}
                >
                    <Clock3 size={18} className="shrink-0 text-cyan-300" aria-hidden="true" />
                    <span className="flex-1 text-sm font-medium text-white">{formatTimeLabel(time)}</span>
                    <ChevronRight size={16} className={`text-slate-400 transition-transform ${openPanel === 'time' ? 'rotate-90' : ''}`} />
                </button>

                {openPanel === 'time' && (
                    <div
                        role="dialog"
                        aria-label="내전 시작 시간 선택"
                        className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-700 bg-[#171a21] p-4 shadow-2xl shadow-black/50"
                    >
                        <div className="mb-3 text-center text-sm font-semibold text-white">{formatTimeLabel(time)}</div>
                        <div className="grid grid-cols-[0.85fr_1fr_1fr] gap-2">
                            <div className="space-y-2">
                                {(['AM', 'PM'] as const).map(value => (
                                    <button
                                        key={value}
                                        type="button"
                                        onClick={() => selectPeriod(value)}
                                        className={`w-full rounded-xl py-3 text-sm font-semibold transition ${
                                            period === value ? 'bg-cyan-400 text-slate-950' : 'bg-slate-900 text-slate-400 hover:bg-slate-800'
                                        }`}
                                    >
                                        {value === 'AM' ? '오전' : '오후'}
                                    </button>
                                ))}
                            </div>
                            <div className="custom-scrollbar max-h-56 space-y-1 overflow-y-auto pr-1" aria-label="시">
                                {HOURS.map(hour => (
                                    <button
                                        key={hour}
                                        ref={hour === twelveHour ? selectedHourRef : undefined}
                                        type="button"
                                        onClick={() => selectHour(hour)}
                                        className={`w-full rounded-lg py-2.5 text-sm font-medium transition ${
                                            hour === twelveHour ? 'bg-blue-400 text-slate-950' : 'text-slate-300 hover:bg-white/5'
                                        }`}
                                    >
                                        {pad(hour)}시
                                    </button>
                                ))}
                            </div>
                            <div className="custom-scrollbar max-h-56 space-y-1 overflow-y-auto pr-1" aria-label="분">
                                {MINUTES.map(minute => (
                                    <button
                                        key={minute}
                                        ref={minute === selectedTime.minute ? selectedMinuteRef : undefined}
                                        type="button"
                                        onClick={() => {
                                            selectMinute(minute);
                                            setOpenPanel(null);
                                        }}
                                        className={`w-full rounded-lg py-2.5 text-sm font-medium transition ${
                                            minute === selectedTime.minute ? 'bg-blue-400 text-slate-950' : 'text-slate-300 hover:bg-white/5'
                                        }`}
                                    >
                                        {pad(minute)}분
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
