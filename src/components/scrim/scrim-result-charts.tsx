import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { HeroRole } from '../../constants/hero';
import { SATISFACTION_OPTIONS } from '../../../domains/scrim/shared/constants';

export interface HeroDemandChartDatum {
    count: number;
    name: string;
    role: HeroRole;
}

interface HeroDemandChartProps {
    data: HeroDemandChartDatum[];
}

interface SatisfactionChartsProps {
    disappointmentCounts: Record<string, number>;
    scoreCounts: number[];
}

const ROLE_COLORS: Record<HeroRole, string> = {
    tank: '#67e8f9',
    damage: '#fb7185',
    support: '#34d399',
};

const TOOLTIP_STYLE = {
    backgroundColor: '#111827',
    border: '1px solid #334155',
    borderRadius: 12,
    color: '#f8fafc',
    fontSize: 13,
} as const;

const AXIS_TICK = {
    fill: '#94a3b8',
    fontSize: 12,
} as const;

/**
 * @description 영웅별 밴 투표 수요를 역할군 색상이 적용된 가로 막대그래프로 표시한다.
 */
export function HeroDemandChart({ data }: HeroDemandChartProps) {
    const chartHeight = Math.max(240, data.length * 44);
    return (
        <div>
            <div className="mb-3 flex flex-wrap gap-3 text-xs text-slate-400" aria-label="역할군 범례">
                {([
                    ['tank', '돌격'],
                    ['damage', '공격'],
                    ['support', '지원'],
                ] as const).map(([role, label]) => (
                    <span key={role} className="inline-flex items-center gap-1.5">
                        <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: ROLE_COLORS[role] }}
                            aria-hidden="true"
                        />
                        {label}
                    </span>
                ))}
            </div>
            <div
                className="max-h-[420px] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-950/40 px-2 py-3"
                role="img"
                aria-label="영웅별 밴 투표 득표 그래프"
            >
                <div style={{ height: chartHeight }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={data}
                            layout="vertical"
                            margin={{ top: 4, right: 24, bottom: 4, left: 4 }}
                            accessibilityLayer
                        >
                            <CartesianGrid stroke="#1e293b" horizontal={false} />
                            <XAxis
                                type="number"
                                allowDecimals={false}
                                axisLine={false}
                                tickLine={false}
                                tick={AXIS_TICK}
                            />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={76}
                                axisLine={false}
                                tickLine={false}
                                tick={AXIS_TICK}
                            />
                            <Tooltip
                                cursor={{ fill: 'rgba(51, 65, 85, 0.24)' }}
                                contentStyle={TOOLTIP_STYLE}
                                itemStyle={{ color: '#e2e8f0' }}
                                labelStyle={{ color: '#f8fafc', fontWeight: 600 }}
                            />
                            <Bar
                                dataKey="count"
                                name="득표"
                                radius={[0, 8, 8, 0]}
                                maxBarSize={24}
                            >
                                {data.map(item => (
                                    <Cell key={`${item.role}-${item.name}`} fill={ROLE_COLORS[item.role]} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}

/**
 * @description 익명 만족도 별점 분포와 아쉬운 점 선택 횟수를 각각 막대그래프로 표시한다.
 */
export function SatisfactionCharts({
    disappointmentCounts,
    scoreCounts,
}: SatisfactionChartsProps) {
    const scoreData = scoreCounts.map((count, index) => ({
        count,
        name: `${index + 1}점`,
    }));
    const disappointmentData = SATISFACTION_OPTIONS
        .map(name => ({ count: disappointmentCounts[name] ?? 0, name }))
        .filter(item => item.count > 0);

    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <h3 className="text-sm font-semibold text-white">별점 분포</h3>
                <p className="mt-1 text-xs text-slate-500">1점부터 5점까지 익명 응답 수입니다.</p>
                <div className="mt-4 h-64" role="img" aria-label="만족도 별점별 응답 수 그래프">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                            data={scoreData}
                            margin={{ top: 8, right: 8, bottom: 0, left: -20 }}
                            accessibilityLayer
                        >
                            <CartesianGrid stroke="#1e293b" vertical={false} />
                            <XAxis
                                dataKey="name"
                                axisLine={false}
                                tickLine={false}
                                tick={AXIS_TICK}
                            />
                            <YAxis
                                allowDecimals={false}
                                axisLine={false}
                                tickLine={false}
                                tick={AXIS_TICK}
                            />
                            <Tooltip
                                cursor={{ fill: 'rgba(51, 65, 85, 0.24)' }}
                                contentStyle={TOOLTIP_STYLE}
                                itemStyle={{ color: '#fde68a' }}
                            />
                            <Bar
                                dataKey="count"
                                name="응답"
                                fill="#fbbf24"
                                radius={[8, 8, 0, 0]}
                                maxBarSize={42}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
                <h3 className="text-sm font-semibold text-white">아쉬운 점</h3>
                <p className="mt-1 text-xs text-slate-500">3점 미만 응답에서 선택된 항목입니다.</p>
                {disappointmentData.length > 0 ? (
                    <div className="mt-4 h-64" role="img" aria-label="아쉬운 점 항목별 선택 횟수 그래프">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={disappointmentData}
                                layout="vertical"
                                margin={{ top: 4, right: 16, bottom: 4, left: 12 }}
                                accessibilityLayer
                            >
                                <CartesianGrid stroke="#1e293b" horizontal={false} />
                                <XAxis
                                    type="number"
                                    allowDecimals={false}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={AXIS_TICK}
                                />
                                <YAxis
                                    type="category"
                                    dataKey="name"
                                    width={84}
                                    axisLine={false}
                                    tickLine={false}
                                    tick={AXIS_TICK}
                                />
                                <Tooltip
                                    cursor={{ fill: 'rgba(51, 65, 85, 0.24)' }}
                                    contentStyle={TOOLTIP_STYLE}
                                    itemStyle={{ color: '#a5f3fc' }}
                                />
                                <Bar
                                    dataKey="count"
                                    name="선택"
                                    fill="#22d3ee"
                                    radius={[0, 8, 8, 0]}
                                    maxBarSize={22}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <div className="mt-4 flex h-64 items-center justify-center rounded-xl border border-dashed border-slate-800 px-5 text-center text-sm text-slate-500">
                        선택된 아쉬운 점이 없습니다.
                    </div>
                )}
            </section>
        </div>
    );
}
