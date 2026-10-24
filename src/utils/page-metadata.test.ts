import { describe, expect, it, vi } from 'vitest';
import { applyPageMetadata, getPageMetadata } from './page-metadata';

describe('current page metadata', () => {
    it('normalizes a direct link without putting query values in the title', () => {
        expect(getPageMetadata('/user-sheet/?entryId=private-user#detail')).toEqual(getPageMetadata('/user-sheet'));
        expect(getPageMetadata('/user-sheet').title).toBe('유저 시트 | OWKR Match');
        expect(getPageMetadata('/participants').title).toBe('참가자 | OWKR Match');
    });

    it('keeps room codes and participation tokens out of metadata', () => {
        const room = getPageMetadata('/draft/PRIVATE234?draft_error=secret');
        const survey = getPageMetadata('/participate/private-token', { participationKind: 'satisfaction' });
        expect(room.title).toBe('밴픽 참여 | OWKR Match');
        expect(survey.title).toBe('만족도 조사 | OWKR Match');
        expect(JSON.stringify([room, survey])).not.toMatch(/PRIVATE234|private-token|secret/);
    });

    it('distinguishes login and public participation screens after loading', () => {
        expect(getPageMetadata('/scrims', { isLogin: true }).title).toBe('로그인 | OWKR Match');
        expect(getPageMetadata('/scrims').title).toBe('내전 관리 | OWKR Match');
        expect(getPageMetadata('/participate/code').title).toBe('내전 참여 | OWKR Match');
        expect(getPageMetadata('/participate/code', { participationKind: 'vote' }).title).toBe('영웅 밴 투표 | OWKR Match');
        expect(getPageMetadata('/unknown/private-value').title).toBe('OWKR Match');
    });

    it('replaces stale screen metadata without accumulating description tags', () => {
        let tag: { name: string; content: string } | null = null;
        const appendChild = vi.fn((element: typeof tag) => { tag = element; });
        const target = {
            title: '',
            querySelector: () => tag,
            createElement: () => ({ name: '', content: '' }),
            head: { appendChild },
        } as unknown as Document;
        applyPageMetadata(getPageMetadata('/'), target);
        applyPageMetadata(getPageMetadata('/draft-control'), target);
        applyPageMetadata(getPageMetadata('/participants'), target);
        expect(target.title).toBe('참가자 | OWKR Match');
        expect(tag).toEqual({ name: 'description', content: getPageMetadata('/participants').description });
        expect(appendChild).toHaveBeenCalledTimes(1);
    });
});
