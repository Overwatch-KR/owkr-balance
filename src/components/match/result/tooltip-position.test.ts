import { describe, expect, it } from 'vitest';
import { getTooltipPosition } from './tooltip-position';

const viewport = { width: 800, height: 600 };
const panel = { width: 256, height: 200 };

describe('getTooltipPosition', () => {
    it('여백이 충분하면 셀 아래에 표시한다', () => {
        expect(getTooltipPosition({ left: 100, right: 300, top: 100, bottom: 150 }, panel, viewport))
            .toEqual({ left: 100, top: 158 });
    });

    it('최하단 셀에서는 위쪽으로 전환한다', () => {
        expect(getTooltipPosition({ left: 100, right: 300, top: 540, bottom: 590 }, panel, viewport))
            .toEqual({ left: 100, top: 332 });
    });

    it('좌우 화면 경계를 벗어나지 않는다', () => {
        expect(getTooltipPosition({ left: 750, right: 790, top: 100, bottom: 150 }, panel, viewport).left).toBe(532);
        expect(getTooltipPosition({ left: 0, right: 50, top: 100, bottom: 150 }, panel, viewport, true).left).toBe(12);
    });

    it('어느 쪽에도 충분한 여백이 없으면 화면 안으로 보정한다', () => {
        const position = getTooltipPosition({ left: 100, right: 300, top: 250, bottom: 300 }, { width: 256, height: 500 }, viewport);
        expect(position.top).toBe(88);
    });
});
