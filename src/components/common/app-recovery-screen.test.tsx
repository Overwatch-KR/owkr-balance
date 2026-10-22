import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppUpdateNotice } from '../app-update-notice';
import { AppRecoveryScreen } from './app-recovery-screen';

describe('screen recovery without lazy chunks', () => {
  it('renders update controls immediately even when the page chunk cannot load', () => {
    const markup = renderToStaticMarkup(<AppUpdateNotice forceVisible />);
    expect(markup).toContain('새 버전이 준비됐어요');
    expect(markup).toContain('지금 새로고침');
    expect(markup).not.toContain('template');
  });
  it('provides a full visible recovery screen with a manual reload action', () => {
    const markup = renderToStaticMarkup(<AppRecoveryScreen />);
    expect(markup).toContain('<main');
    expect(markup).toContain('화면을 다시 불러와 주세요');
    expect(markup).toContain('화면 새로고침');
    expect(markup).toContain('저장된 참가 인증');
  });
});
