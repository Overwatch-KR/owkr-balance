import { useState } from 'react';
import { HEROES, type Hero, type HeroRole } from '../../constants/hero';

const GROUPS: Array<{ role: HeroRole; label: string }> = [
    { role: 'tank', label: '돌격' },
    { role: 'damage', label: '공격' },
    { role: 'support', label: '지원' },
];

interface HeroGridProps {
    disabledHeroIds?: string[];
    maxSelections?: number;
    onChange: (heroIds: string[]) => void;
    selectedHeroIds: string[];
}

function HeroImage({ hero }: { hero: Hero }) {
    const [failed, setFailed] = useState(false);
    return failed ? (
        <span className="flex h-12 w-12 items-center justify-center rounded-md bg-slate-800 text-xs text-slate-500">?</span>
    ) : (
        <img
            alt=""
            className="h-12 w-12 rounded-md bg-slate-800 object-cover"
            src={`/hero/${hero.role}/${hero.id}.png`}
            width={48}
            height={48}
            onError={() => setFailed(true)}
        />
    );
}

/**
 * @description hero.ts 원본을 역할 순서대로 표시하고 누락 이미지는 이름 카드로 대체한다.
 */
export function HeroGrid({
    disabledHeroIds = [],
    maxSelections = 3,
    onChange,
    selectedHeroIds,
}: HeroGridProps) {
    const disabled = new Set(disabledHeroIds);
    const selected = new Set(selectedHeroIds);
    const toggle = (heroId: string) => {
        if (disabled.has(heroId)) return;
        if (selected.has(heroId)) onChange(selectedHeroIds.filter(id => id !== heroId));
        else if (selectedHeroIds.length < maxSelections) onChange([...selectedHeroIds, heroId]);
    };
    return (
        <div className="space-y-5">
            {GROUPS.map(group => (
                <section key={group.role}>
                    <h3 className="mb-2 text-sm font-semibold text-slate-200">{group.label}</h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {HEROES.filter(hero => hero.role === group.role).map(hero => {
                            const isDisabled = disabled.has(hero.id);
                            const isSelected = selected.has(hero.id);
                            return (
                                <button
                                    key={hero.id}
                                    type="button"
                                    disabled={isDisabled}
                                    aria-pressed={isSelected}
                                    onClick={() => toggle(hero.id)}
                                    className={`flex min-h-16 items-center gap-2 rounded-lg border p-2 text-left transition ${isDisabled
                                        ? 'cursor-not-allowed border-slate-800 bg-slate-950/60 opacity-40'
                                        : isSelected
                                            ? 'border-cyan-400 bg-cyan-400/15 text-white ring-1 ring-cyan-300'
                                            : 'border-slate-700 bg-slate-900 hover:border-slate-500 hover:bg-slate-800'}`}
                                >
                                    <HeroImage hero={hero} />
                                    <span className="min-w-0 text-sm font-medium">{hero.name}</span>
                                </button>
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
}
