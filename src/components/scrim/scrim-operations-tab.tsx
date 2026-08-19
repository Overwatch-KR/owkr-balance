import {
    Copy,
    ExternalLink,
    LoaderCircle,
    TimerReset,
} from 'lucide-react';
import type {
    PublicParticipationKind,
    PublicParticipationLink,
    ScrimRecord,
} from '../../../domains/scrim/shared/public';

interface LinkControlCardProps {
    kind: PublicParticipationKind;
    link?: PublicParticipationLink;
    onAction: (action: string, payload?: Record<string, unknown>) => void;
    onCopy: (kind: PublicParticipationKind) => void;
    pendingActionKey: string;
    satisfactionExpiresAt?: number;
}

function LinkControlCard({
    kind,
    link,
    onAction,
    onCopy,
    pendingActionKey,
    satisfactionExpiresAt,
}: LinkControlCardProps) {
    const title = kind === 'vote' ? '영웅 밴 투표 링크' : '만족도 조사 링크';
    const href = link ? `${window.location.origin}/participate/${link.token}` : '';
    const isDeactivating = pendingActionKey === `deactivateLink:${kind}`;

    return (
        <section className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="font-semibold text-white">{title}</h3>
                    <p className={`mt-1 text-xs ${link?.active ? 'text-emerald-300' : 'text-slate-500'}`}>
                        {link?.active
                            ? '활성화된 링크'
                            : kind === 'vote'
                                ? '투표를 열면 링크가 자동으로 생성됩니다.'
                                : '비활성화된 내전 링크'}
                    </p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    link?.active
                        ? 'bg-emerald-400/10 text-emerald-200'
                        : 'bg-slate-800 text-slate-400'
                }`}>
                    {link?.active ? '활성' : '비활성'}
                </span>
            </div>

            {!link?.active && kind === 'satisfaction' ? (
                <button
                    type="button"
                    className="btn-primary mt-4 w-full"
                    onClick={() => onAction('activateLink', { kind, regenerate: !link })}
                >
                    {link ? '링크 다시 활성화' : '링크 생성'}
                </button>
            ) : null}

            {kind === 'satisfaction' && satisfactionExpiresAt ? (
                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-2.5">
                    <p className="text-xs text-slate-500">현재 응답 마감</p>
                    <p className="mt-0.5 text-sm font-medium text-slate-200">
                        {new Date(satisfactionExpiresAt).toLocaleString('ko-KR', {
                            timeZone: 'Asia/Seoul',
                        })}
                    </p>
                    <button
                        type="button"
                        className="btn-ghost mt-3 w-full"
                        onClick={() => onAction('extendSatisfaction')}
                    >
                        <TimerReset size={15} className="mr-1 inline" />응답 기간 24시간 연장
                    </button>
                </div>
            ) : null}

            {link?.active ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <button type="button" className="btn-ghost w-full" onClick={() => onCopy(kind)}>
                        <Copy size={15} className="mr-1 inline" />링크 복사
                    </button>
                    <a className="btn-ghost w-full text-center" href={href} target="_blank" rel="noreferrer">
                        <ExternalLink size={15} className="mr-1 inline" />열기
                    </a>
                    <button
                        type="button"
                        className="btn-danger w-full"
                        disabled={isDeactivating}
                        onClick={() => onAction('deactivateLink', { kind })}
                    >
                        {isDeactivating ? (
                            <>
                                <LoaderCircle size={15} className="mr-1 inline animate-spin" aria-hidden="true" />
                                비활성화 중
                            </>
                        ) : '링크 비활성화'}
                    </button>
                    <button
                        type="button"
                        className="btn-ghost w-full"
                        onClick={() => onAction('activateLink', { kind, regenerate: true })}
                    >
                        새 링크 생성
                    </button>
                </div>
            ) : null}
        </section>
    );
}

interface ScrimOperationsTabProps {
    onAction: (action: string, payload?: Record<string, unknown>) => void;
    onCopy: (kind: PublicParticipationKind) => void;
    pendingActionKey: string;
    scrim: ScrimRecord;
}

/**
 * @description 내전의 투표 및 만족도 공개 링크 상태와 운영 동작을 표시한다.
 */
export function ScrimOperationsTab({
    onAction,
    onCopy,
    pendingActionKey,
    scrim,
}: ScrimOperationsTabProps) {
    return (
        <section className="card" role="tabpanel" id="scrim-panel-operations" aria-labelledby="scrim-tab-operations">
            <h2 className="text-lg font-semibold text-white">운영 및 참여 링크</h2>
            <p className="mt-1 text-sm text-slate-400">투표와 만족도 링크를 각각 관리합니다.</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
                <LinkControlCard
                    kind="vote"
                    link={scrim.publicLinks?.vote}
                    onAction={onAction}
                    onCopy={onCopy}
                    pendingActionKey={pendingActionKey}
                />
                <LinkControlCard
                    kind="satisfaction"
                    link={scrim.publicLinks?.satisfaction}
                    satisfactionExpiresAt={scrim.satisfactionExpiresAt}
                    onAction={onAction}
                    onCopy={onCopy}
                    pendingActionKey={pendingActionKey}
                />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" className="btn-primary" onClick={() => onAction('openVote')}>
                    영웅 밴 투표 열기
                </button>
                <button type="button" className="btn-ghost" onClick={() => onAction('closeVote')}>
                    투표 수동 마감
                </button>
            </div>
        </section>
    );
}
