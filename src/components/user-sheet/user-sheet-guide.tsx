import {
    BookOpen,
    ClipboardPaste,
    KeyRound,
    LockKeyhole,
    RefreshCcw,
    UsersRound,
    X,
} from 'lucide-react';

interface UserSheetGuideProps {
    onClose: () => void;
    onStartTour?: () => void;
}

const GUIDE_ITEMS = [
    {
        description: 'Discord 이름이나 BattleTag가 바뀌어도 같은 유저를 찾을 수 있도록 고유 ID를 최종 식별자로 사용합니다.',
        icon: KeyRound,
        title: 'Discord ID가 기준이에요',
    },
    {
        description: '이 시트는 반복해서 만나는 유저의 공유 정보용입니다. 이번 내전에 넣을 10명은 참가자 작업실에서 따로 선택하고 관리합니다.',
        icon: UsersRound,
        title: '현재 매칭 명단과는 별도예요',
    },
    {
        description: '한 명은 상세 화면의 바로 수정, 여러 명은 전체 편집을 사용하세요. 표의 7개 열을 그대로 붙여넣을 수도 있습니다.',
        icon: ClipboardPaste,
        title: '작업 범위에 맞게 편집해요',
    },
    {
        description: '시트의 역할별 티어는 참고 정보입니다. 팀 밸런스 계산은 참가자 작업실에 저장된 현재 명단의 티어를 사용합니다.',
        icon: UsersRound,
        title: '티어는 참고용이에요',
    },
    {
        description: '특이사항은 모든 관리자와 대진표에 공유되고, 개인 운영 메모는 작성한 관리자 본인에게만 표시됩니다.',
        icon: LockKeyhole,
        title: '공용 정보와 개인 메모를 구분해요',
    },
    {
        description: '시트가 열린 동안에는 변경 사항을 주기적으로 확인합니다. 여러 관리자가 함께 편집했다면 저장 전에 새로고침해 최신 내용을 먼저 확인하세요.',
        icon: RefreshCcw,
        title: '함께 편집할 때는 최신 상태를 확인해요',
    },
] as const;

/**
 * @description 유저 시트의 등록 기준과 편집·공유·동기화 규칙을 한 화면에서 안내한다.
 */
export function UserSheetGuide({ onClose, onStartTour }: UserSheetGuideProps) {
    return (
        <section
            className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-7"
            aria-labelledby="user-sheet-guide-title"
        >
            <div className="mx-auto w-full max-w-4xl">
                <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-300">
                        <BookOpen size={20} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-cyan-300">유저 시트 전용 가이드</p>
                        <h2 id="user-sheet-guide-title" className="mt-1 text-xl font-bold text-white">
                            운영진이 함께 관리하는 유저 정보
                        </h2>
                        <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
                            자주 만나는 유저의 정보와 특이사항을 관리하는 공유 목록입니다. 이번 경기의 참가자·티어 입력과 팀 편성은 매칭 화면에서 진행해요.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                        aria-label="시트 가이드 닫기"
                    >
                        <X size={17} aria-hidden="true" />
                    </button>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                    {GUIDE_ITEMS.map(({ description, icon: Icon, title }) => (
                        <article
                            key={title}
                            className="rounded-xl border border-slate-800 bg-slate-950/35 p-4"
                        >
                            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
                                <Icon size={17} aria-hidden="true" />
                            </span>
                            <h3 className="mt-3 text-sm font-semibold text-slate-100">{title}</h3>
                            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{description}</p>
                        </article>
                    ))}
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                    <article className="rounded-xl border border-violet-500/20 bg-violet-500/[0.05] p-4">
                        <h3 className="text-sm font-semibold text-violet-100">표 데이터 붙여넣기</h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                            Google Sheets에서 아래 순서의 7개 열을 복사해 전체 편집에 붙여넣을 수 있습니다.
                        </p>
                        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2.5">
                            <code className="whitespace-nowrap text-[11px] text-violet-200">
                                디스코드 표시명 · Discord ID · BattleTag · 탱커 · 딜러 · 힐러 · 특이사항
                            </code>
                        </div>
                        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                            Discord ID는 필수입니다. 기존 6열 데이터를 붙여넣은 경우 각 행의 ID를 모두 입력해야 저장할 수 있습니다.
                        </p>
                    </article>

                    <article className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.05] p-4">
                        <span className="inline-flex items-center gap-2 text-sm font-semibold text-cyan-100">
                            <RefreshCcw size={15} aria-hidden="true" />
                            최신 데이터 확인
                        </span>
                        <p className="mt-2 text-xs leading-relaxed text-slate-400">
                            시트가 열려 있으면 1분마다 자동 확인합니다. 창으로 돌아오거나 상단의 새로고침을 누르면 즉시 최신 데이터를 불러옵니다.
                        </p>
                        <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                            여러 운영자가 함께 작업했다면 전체 편집 전에 한 번 새로고침해 주세요.
                        </p>
                    </article>
                </div>

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                    {onStartTour && (
                        <button
                            type="button"
                            onClick={onStartTour}
                            className="btn-ghost inline-flex min-h-10 items-center justify-center gap-2 px-4 py-2 text-sm"
                        >
                            <BookOpen size={15} aria-hidden="true" />
                            단계별 가이드 다시 보기
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        className="btn-primary inline-flex min-h-10 items-center justify-center px-5 py-2 text-sm"
                    >
                        확인했어요
                    </button>
                </div>
            </div>
        </section>
    );
}
