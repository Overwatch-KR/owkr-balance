import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

export interface PageBreadcrumbItem {
    label: string;
    onClick?: () => void;
}

interface PageHeaderProps {
    actions?: ReactNode;
    breadcrumbs: PageBreadcrumbItem[];
    description?: ReactNode;
    eyebrow?: string;
    meta?: ReactNode;
    title: string;
}

/**
 * @description 전체 페이지와 작업실에서 같은 breadcrumb·제목·보조 액션 구조를 제공한다.
 */
export const PageHeader = ({
    actions,
    breadcrumbs,
    description,
    eyebrow,
    meta,
    title,
}: PageHeaderProps) => (
    <header className="card mb-6 flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
            <nav aria-label="페이지 경로" className="mb-3 flex min-w-0 flex-wrap items-center gap-1 text-xs text-slate-500">
                {breadcrumbs.map((item, index) => {
                    const isCurrent = index === breadcrumbs.length - 1;
                    return (
                        <span key={`${item.label}-${index}`} className="inline-flex min-w-0 items-center gap-1">
                            {index > 0 && <ChevronRight size={13} className="shrink-0 text-slate-600" aria-hidden="true" />}
                            {item.onClick && !isCurrent ? (
                                <button
                                    type="button"
                                    onClick={item.onClick}
                                    className="min-h-8 rounded-md px-1.5 font-medium text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70"
                                >
                                    {item.label}
                                </button>
                            ) : (
                                <span
                                    aria-current={isCurrent ? 'page' : undefined}
                                    className={isCurrent ? 'px-1.5 font-semibold text-cyan-300' : 'px-1.5'}
                                >
                                    {item.label}
                                </span>
                            )}
                        </span>
                    );
                })}
            </nav>
            {eyebrow && (
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-300/80">
                    {eyebrow}
                </p>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
            {description && (
                <div className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-400">
                    {description}
                </div>
            )}
            {meta && <div className="mt-4 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
                {actions}
            </div>
        )}
    </header>
);
