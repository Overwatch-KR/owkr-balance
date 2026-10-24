import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { RosterParticipantSelect } from './roster-participant-select';

describe('RosterParticipantSelect', () => {
    it('renders an OWKR listbox trigger instead of a native select', () => {
        const markup = renderToStaticMarkup(
            <RosterParticipantSelect
                value=""
                options={[
                    { id: '1', name: 'Player#1234', discordName: '참가자' },
                ]}
                onChange={() => undefined}
            />,
        );

        expect(markup).toContain('aria-haspopup="listbox"');
        expect(markup).toContain('참가 명단에서 내 이름 선택');
        expect(markup).not.toContain('<select');
    });

    it('shows the completed state when no roster participant remains', () => {
        const markup = renderToStaticMarkup(
            <RosterParticipantSelect
                value=""
                options={[]}
                onChange={() => undefined}
            />,
        );

        expect(markup).toContain('모든 참가자가 투표를 완료했습니다');
        expect(markup).toContain('disabled=""');
    });
});
