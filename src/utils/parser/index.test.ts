import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { SAMPLE_ROSTER } from '../../constants';
import { balancePlayers } from '../balance';
import { reconcilePlayers } from '../player';
import {
    getEligibleRosterPlayers,
    parseLineToPlayer,
    parseMultipleLines,
} from './index';

const LOCAL_ONLY_TEST_ROSTER = readFileSync(
    new URL('../../../docs/local-only-roster.txt', import.meta.url),
    'utf8',
);

const RECENT_PARTICIPANTS = `
**바비호바**역할 아이콘, 막시밀리앙 — **어제 오후 8:20**
뾱뾱이#31226 그마3 / 마2 / 그마5
**모노** [GI], 역할 아이콘, 다이아 — **어제 오후 8:21**
모노#31832 다4? / 다4! / 다5!
**선물**역할 아이콘, 플래티넘 — **어제 오후 8:21**
one#35119 다3!/플3?/에2
**우람한오크#3390**역할 아이콘, 내전 총관리자 — **어제 오후 8:22**
우람한오크#3390 골3?/플5/플1!
**피셔** [ᴍᴏᴏɴ], 역할 아이콘, 다이아 — **어제 오후 8:22**
TWO#31166 플3/플5/플4
**맹물**역할 아이콘, 다이아 — **어제 오후 8:22**
둥댕#3222 (예상 다5)?/ 다3? / 마3!
**showdown**역할 아이콘, 신참 — **어제 오후 8:23**
내가하늘에서겠다#3375 챔5 / 그마2 / 그마2
**라솔메**역할 아이콘, 플래티넘 — **어제 오후 8:23**
라솔메#3898 플3? 플2! 플3 X (노트북이슈)
**미누**역할 아이콘, 브론즈 — **어제 오후 8:24**
K200#31384 탱 다2! / 딜 다5/ 힐 다3?
**minha**역할 아이콘, 다이아 — **어제 오후 8:27**
QUASAR#31909 마5?/마5/마1!
**유진**역할 아이콘, 다이아 — **어제 오후 9:16**
Venom#33519 다1?/마1/챔5
**톱질대장**역할 아이콘, 다이아 — **어제 오후 7:27**
TIMEWILLTELL#31107 플4 / 플1 / 다5 (주로 힐러 아나 미즈키 합니다.)
**모노** [GI], 역할 아이콘, 다이아 — **어제 오후 3:15**
모노#31832 다4? / 다4! / 다5!
**우람한오크#3390**역할 아이콘, 내전 총관리자 — **어제 오후 3:16**
우람한오크#3390 골3?/플5/플1!
**왕감자**역할 아이콘, 다이아 — **어제 오후 3:17**
햄스터밥주는사람#3409 플4 ? / 플2(?) / 다2!
**김현석**역할 아이콘, 연습생 (20LVL+) — **어제 오후 3:18**
고영례#3286 그4!/마5!/마2!
**연화** [𝜗ৎ], 역할 아이콘, {핑크 메르시} — **어제 오후 3:20**
BaekGoving#3820 플4?/다5!/다5!
**에어맨이 쓰러지지 않아**역할 아이콘, 숙달자 (40LVL+) — **어제 오후 3:21**
가면요루#3833 플5 / 플3 / 실? (장비 이슈)
**용이** [운명.ଓ], 역할 아이콘, 신참 — **어제 오후 3:22**
IlIllIlI#31213 탱!(정커퀸 해저드) 예상 골2 / 딜? 골4 / 힐 예상 실1
**yog\\_1952** [오버워치], 역할 아이콘, 초보자 (25LVL+) — **어제 오후 3:23**
kimjungun#11853 마4/마1!/마5
**뽕뽕** [୨୧], 역할 아이콘, 지망생 (15LVL+) — **어제 오후 3:23**
zzuzzu#31457 플(배치X) ? / 골(배치X) ? / 마4! (복귀유저)
**맹물**역할 아이콘, 다이아 — **어제 오후 3:24**
둥댕#3222 (예상 다5)?/ 다3? / 마3!
`;

const MALFORMED_DISCORD_ROSTER = `
강호의 도리역할 아이콘, 다이아 — 2026. 7. 26. 오후 10:08
강호의도리#3110 플1? / 다1!/ 플1
피리부는양역할 아이콘, 플래티넘 — 2026. 7. 26. 오후 10:08
칠공본드#3150 골3?/플4?/다이야5!(키리코 아나 )
wazn역할 아이콘, 플래티넘 — 2026. 7. 26. 오후 10:08
X4zn#3805 탱! 골2/ 딜? 마3/ 힐 플5(예상)
미누역할 아이콘, 브론즈 — 2026. 7. 26. 오후 10:08
K200#31384 다4/ 플2!/ 다3?
롤랑역할 아이콘, 다이아 — 2026. 7. 26. 오후 10:08
roland#12831 골5? 다2! 다5!
민성역할 아이콘, 다이아 — 2026. 7. 26. 오후 10:08
아나진짜못함#3902 마4? / 그마4 / 챔4
혁이역할 아이콘, {조식 매니아} — 2026. 7. 26. 오후 10:08
혁이#32288 마5/그1!/마1
재준역할 아이콘, 신참 — 2026. 7. 26. 오후 10:08
대인기피증있어요#3166 마4? / 마4? / 마1 !
달사탕 [오버워치], 역할 아이콘, Good Luck to You — 2026. 7. 26. 오후 10:08
달사탕#31414 / 다3 / 다4 / 다3
상만 [오버워치] —
2026. 7. 26. 오후 10:08
뿅뿅이 / 아이언 / 그마4 / 그마3
`;

describe('가이드 예시 명단', () => {
    it('선호·비선호·무표시와 에메랄드가 섞인 참가자 10명을 파싱한다', () => {
        const result = parseMultipleLines(SAMPLE_ROSTER);
        const ranks = result.players.flatMap(player => [
            player.tank,
            player.dps,
            player.sup,
        ]);
        const playersWithoutIntent = result.players.filter(player => (
            [player.tank, player.dps, player.sup].every(rank => (
                !rank.isPreferred && !rank.isAvoided
            ))
        ));
        const playersWithPreference = result.players.filter(player => (
            [player.tank, player.dps, player.sup].some(rank => rank.isPreferred)
        ));
        const playersWithAvoidance = result.players.filter(player => (
            [player.tank, player.dps, player.sup].some(rank => rank.isAvoided)
        ));
        const playersWithEmeraldRole = result.players.filter(player => (
            [player.tank, player.dps, player.sup].some(rank => rank.tier === 'EMERALD')
        ));

        expect(result.players).toHaveLength(10);
        expect(result.failedLines).toHaveLength(0);
        expect(ranks).toHaveLength(30);
        expect(playersWithPreference).toHaveLength(5);
        expect(playersWithAvoidance).toHaveLength(7);
        expect(playersWithEmeraldRole).toHaveLength(2);
        expect(playersWithoutIntent).toHaveLength(2);
    });

    it('예시 매칭 결과에서 선호·비선호 배정 예외를 계산한다', () => {
        const { players } = parseMultipleLines(SAMPLE_ROSTER);
        const { result } = balancePlayers(players);

        expect(result.metrics?.preferenceViolations).toEqual(expect.any(Number));
        expect(result.metrics?.avoidedAssignments).toEqual(expect.any(Number));
    });
});

describe('로컬 전용 테스트 명단', () => {
    it('문서에 제공한 10명을 경고 없이 파싱하고 후보 조합을 생성한다', () => {
        const parsed = parseMultipleLines(LOCAL_ONLY_TEST_ROSTER);

        expect(parsed.players).toHaveLength(10);
        expect(parsed.failedLines).toEqual([]);
        expect(parsed.avoidedRoleWarnings).toEqual([]);
        expect(balancePlayers(parsed.players).alternatives).toHaveLength(11);
    });
});

describe('parseMultipleLines', () => {
    it('디스코드 헤더, 설명, 예상 티어와 부가 메모를 함께 파싱한다', () => {
        const {
            players,
            failedLines,
            avoidedRoleWarnings,
            validationIssues,
        } = parseMultipleLines(RECENT_PARTICIPANTS);

        expect(failedLines).toEqual([]);
        expect(players).toHaveLength(16);
        expect(avoidedRoleWarnings).toHaveLength(3);
        expect(avoidedRoleWarnings).toEqual(expect.arrayContaining([
            expect.objectContaining({
                playerName: 'zzuzzu#31457',
                avoidedRoleCount: 2,
                avoidedRoles: ['TANK', 'DPS'],
            }),
        ]));
        expect(validationIssues).toHaveLength(3);
        expect(validationIssues.every(issue => (
            issue.kind === 'multiple-avoided-roles' && issue.ranges.length > 0
        ))).toBe(true);

        const byBattleTag = new Map(players.map((player) => [player.name, player]));
        expect(byBattleTag.get('뾱뾱이#31226')).toMatchObject({
            discordName: '바비호바',
            tank: { tier: 'GRANDMASTER', div: 3 },
            dps: { tier: 'MASTER', div: 2 },
            sup: { tier: 'GRANDMASTER', div: 5 },
        });
        expect(byBattleTag.has('둥댕#3222')).toBe(false);
        expect(byBattleTag.get('가면요루#3833')).toMatchObject({
            discordName: '에어맨이 쓰러지지 않아',
            sup: { tier: 'SILVER', div: 3, isAvoided: true },
        });
        expect(byBattleTag.get('IlIllIlI#31213')).toMatchObject({
            discordName: '용이',
            tank: { tier: 'GOLD', div: 2, isPreferred: true },
            dps: { tier: 'GOLD', div: 4, isAvoided: true },
            sup: { tier: 'SILVER', div: 1 },
        });
        expect(byBattleTag.has('zzuzzu#31457')).toBe(false);
    });

    it('배틀태그가 없는 제출과 비선호 중복 참가자를 자동 추가하지 않는다', () => {
        const result = parseMultipleLines(MALFORMED_DISCORD_ROSTER);

        expect(result.players).toHaveLength(7);
        expect(result.failedLines).toEqual([
            '상만 · 뿅뿅이 / 아이언 / 그마4 / 그마3',
        ]);
        expect(result.validationIssues).toHaveLength(3);
        expect(result.validationIssues[0]).toMatchObject({
            kind: 'multiple-avoided-roles',
            playerName: '칠공본드#3150',
        });
        expect(result.validationIssues.some(issue => (
            issue.kind === 'invalid-entry'
            && issue.message === '배틀태그가 없어 가져올 수 없습니다.'
            && issue.ranges.length === 1
        ))).toBe(true);
        expect(result.avoidedRoleWarnings).toEqual(expect.arrayContaining([
            expect.objectContaining({
                playerName: '칠공본드#3150',
                discordName: '피리부는양',
                avoidedRoleCount: 2,
            }),
            expect.objectContaining({
                playerName: '대인기피증있어요#3166',
                discordName: '재준',
                avoidedRoleCount: 2,
            }),
        ]));
        expect(result.players.some(player => player.name === '칠공본드#3150')).toBe(false);
        expect(result.players.some(player => player.name === '대인기피증있어요#3166')).toBe(false);
    });

    it('최신 배틀태그 검사에서 거부한 줄에 원문 위치를 함께 반환한다', () => {
        const text = [
            'Valid#1234 다3 / 플2 / 골1',
            'Broken#123 다3 / 플2 / 골1',
        ].join('\n');
        const result = parseMultipleLines(text);

        expect(result.players).toHaveLength(1);
        expect(result.failedLines).toEqual(['Broken#123 다3 / 플2 / 골1']);
        expect(result.validationIssues).toEqual([
            expect.objectContaining({
                kind: 'invalid-entry',
                message: '배틀태그는 Player#1234 형식으로 입력해 주세요.',
                playerName: 'Broken#123',
                ranges: [{
                    start: text.indexOf('Broken#123'),
                    end: text.length,
                }],
            }),
        ]);
    });
});

describe('parseLineToPlayer', () => {
    it.each(['에메랄드', '에메', '에매', '애매', '애', 'E', 'e'])(
        '에메랄드 별칭 %s를 파싱한다',
        (alias) => {
            const player = parseLineToPlayer(`Tester#1234 ${alias}3 / 플2 / 다4`);

            expect(player?.tank).toMatchObject({ tier: 'EMERALD', div: 3 });
        },
    );

    it('E로 시작하는 일반 영문 단어를 에메랄드로 오인하지 않는다', () => {
        expect(parseLineToPlayer('Tester#1234 Echo3 / 플2 / 다4')).toBeNull();
    });

    it.each(['미배치', '언랭', 'unranked'])(
        '%s 역할 하나가 포함된 두 포지션 배치 참가자를 받는다',
        (unranked) => {
            expect(parseLineToPlayer(`Tester#1234 다3 / 플2 / ${unranked}`)).toMatchObject({
                tank: { tier: 'DIAMOND', div: 3 },
                dps: { tier: 'PLATINUM', div: 2 },
                sup: { tier: 'UNRANKED', div: 0, score: 0 },
            });
        },
    );

    it('세 번째 포지션을 생략한 두 포지션 입력을 미배치로 채운다', () => {
        expect(parseLineToPlayer('Tester#1234 다3 / 플2')).toMatchObject({
            tank: { tier: 'DIAMOND', div: 3 },
            dps: { tier: 'PLATINUM', div: 2 },
            sup: { tier: 'UNRANKED', div: 0, score: 0 },
        });
    });

    it('정식 티어가 한 포지션뿐인 참가자는 받지 않는다', () => {
        expect(parseLineToPlayer('Tester#1234 다3 / 미배치 / 언랭')).toBeNull();
    });

    it('두 포지션이 비선호이면 임의 보정하지 않고 거부한다', () => {
        const player = parseLineToPlayer('Tester#1234 다3? / 플2? / 골1');

        expect(player).toBeNull();
    });
});

describe('getEligibleRosterPlayers', () => {
    it('적용 배열에 문제 유저가 남아 있어도 경고 배틀태그를 다시 제외한다', () => {
        const existingPlayer = parseLineToPlayer('Existing#9999 골3 / 골3 / 골3');
        const normalPlayer = parseLineToPlayer('Normal#1234 다3 / 플2 / 골1');
        const rejectedPlayer = parseLineToPlayer('Rejected#5678 다3? / 플2 / 골1');
        expect(existingPlayer).not.toBeNull();
        expect(normalPlayer).not.toBeNull();
        expect(rejectedPlayer).not.toBeNull();

        const eligible = getEligibleRosterPlayers(
            [normalPlayer!, rejectedPlayer!],
            [],
            [{
                playerName: 'rejected#5678',
                discordName: '문제 유저',
                avoidedRoleCount: 2,
                avoidedRoles: ['TANK', 'DPS'],
            }],
        );

        const appended = reconcilePlayers([existingPlayer!], eligible, 'append');

        expect(appended.players.map(player => player.name)).toEqual([
            'Existing#9999',
            'Normal#1234',
        ]);
    });
});
