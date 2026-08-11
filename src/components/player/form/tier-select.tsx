import React from 'react';
import { Ban, Star, ChevronDown } from 'lucide-react';
import {
    EMERALD_RELEASE_AT,
    getAvailableTiers,
    TIER_LABEL_MAP,
} from '../../../constants';
import type { PlayerInputs } from '../../../hooks/use-player-input';
import type { Tier } from '../../../types';
import { normalizeRolePreferences } from '../../../utils/role-preference';
import type { Role } from '../../../types';
import { getTierImage } from '../../../utils/tier';

interface TierSelectProps {
    prefix: 't' | 'd' | 's';
    label: string;
    prefKey: 'tPref' | 'dPref' | 'sPref';
    avoidKey: 'tAvoid' | 'dAvoid' | 'sAvoid';
    inputs: PlayerInputs;
    setInputs: React.Dispatch<React.SetStateAction<PlayerInputs>>;
}

const normalizeInputPreferences = (
    inputs: PlayerInputs,
    preferredAvoidedRole?: Role,
): PlayerInputs => {
    const preferences = normalizeRolePreferences({
        TANK: { isPreferred: inputs.tPref, isAvoided: inputs.tAvoid },
        DPS: { isPreferred: inputs.dPref, isAvoided: inputs.dAvoid },
        SUPPORT: { isPreferred: inputs.sPref, isAvoided: inputs.sAvoid },
    }, preferredAvoidedRole);

    return {
        ...inputs,
        tPref: preferences.TANK.isPreferred,
        tAvoid: preferences.TANK.isAvoided,
        dPref: preferences.DPS.isPreferred,
        dAvoid: preferences.DPS.isAvoided,
        sPref: preferences.SUPPORT.isPreferred,
        sAvoid: preferences.SUPPORT.isAvoided,
    };
};

const TierSelect = ({ prefix, label, prefKey, avoidKey, inputs, setInputs }: TierSelectProps) => {
    const tierKey = `${prefix}Tier` as 'tTier' | 'dTier' | 'sTier';
    const divKey = `${prefix}Div` as 'tDiv' | 'dDiv' | 'sDiv';
    const currentTier = inputs[tierKey];
    const [currentTime, setCurrentTime] = React.useState(Date.now);
    const tierOptions = getAvailableTiers(currentTime);
    const role: Role = prefix === 't' ? 'TANK' : prefix === 'd' ? 'DPS' : 'SUPPORT';
    const tierImg = getTierImage(currentTier);

    React.useEffect(() => {
        const remainingMs = EMERALD_RELEASE_AT - Date.now();
        if (remainingMs <= 0) return;
        const timeoutId = window.setTimeout(() => setCurrentTime(Date.now()), remainingMs);
        return () => window.clearTimeout(timeoutId);
    }, []);

    const togglePref = () => {
        setInputs(prev => normalizeInputPreferences({
            ...prev,
            [prefKey]: !prev[prefKey],
            [avoidKey]: false,
        }));
    };

    const toggleAvoid = () => {
        setInputs((prev) => {
            const willAvoid = !prev[avoidKey];
            return normalizeInputPreferences({
                ...prev,
                [avoidKey]: willAvoid,
                [prefKey]: false,
            }, willAvoid ? role : undefined);
        });
    };

    return (
        <div className="space-y-1.5">
            <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-400">{label}</span>
                <div className="flex gap-1.5">
                    <button
                        type="button"
                        onClick={togglePref}
                        aria-pressed={inputs[prefKey]}
                        aria-label={`${label} 선호 역할`}
                        className={`flex min-h-8 touch-manipulation items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 ${
                            inputs[prefKey]
                                ? 'border-amber-500/30 bg-amber-500/20 text-amber-400'
                                : 'border-slate-700 bg-slate-800 text-slate-500 hover:border-slate-600'
                        }`}
                    >
                        <Star size={10} fill={inputs[prefKey] ? "currentColor" : "none"} aria-hidden="true" />
                        선호
                    </button>
                    <button
                        type="button"
                        onClick={toggleAvoid}
                        aria-pressed={inputs[avoidKey]}
                        aria-label={`${label} 비선호 역할`}
                        className={`flex min-h-8 touch-manipulation items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/70 ${
                            inputs[avoidKey]
                                ? 'border-rose-500/30 bg-rose-500/20 text-rose-400'
                                : 'border-slate-700 bg-slate-800 text-slate-500 hover:border-slate-600'
                        }`}
                    >
                        <Ban size={10} aria-hidden="true" />
                        비선호
                    </button>
                </div>
            </div>
            <div className="flex gap-2 items-center">
                <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-700/50 bg-surface p-1.5"
                    data-tier-state="ranked"
                >
                    {tierImg ? (
                        <img
                            key={tierImg}
                            src={tierImg}
                            alt=""
                            width={24}
                            height={24}
                            aria-hidden="true"
                            className="w-full h-full object-contain"
                            onLoad={(e) => e.currentTarget.style.display = 'block'}
                            onError={(e) => e.currentTarget.style.display = 'none'}
                        />
                    ) : null}
                </div>
                <div className="flex gap-2 flex-1">
                    <div className="relative flex-1">
                        <select
                            name={`${prefix}-tier`}
                            aria-label={`${label} 티어`}
                            className="input-base cursor-pointer appearance-none pr-8"
                            data-tier-state="ranked"
                            value={currentTier}
                            onChange={(event) => {
                                const nextTier = event.target.value as Tier;
                                setInputs(prev => ({
                                    ...prev,
                                    [tierKey]: nextTier,
                                    [divKey]: prev[divKey] === '0' ? '3' : prev[divKey],
                                }));
                            }}
                        >
                            {tierOptions.map(tier => (
                                <option key={tier} value={tier}>{TIER_LABEL_MAP[tier]}</option>
                            ))}
                        </select>
                        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                    </div>
                    <div className="relative w-20">
                        <select
                            name={`${prefix}-division`}
                            aria-label={`${label} 등급`}
                            className="input-base cursor-pointer appearance-none text-center"
                            value={inputs[divKey]}
                            onChange={(e) => setInputs(prev => ({ ...prev, [divKey]: e.target.value }))}
                        >
                            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-500" aria-hidden="true" />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TierSelect;
