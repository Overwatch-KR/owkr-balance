import { createHash, randomBytes } from 'node:crypto';
import { DraftRuleError, requireDraft } from '../../domains/draft/shared/public.js';
import type { DraftEngine } from './engine.js';
import { signDraftTicket } from './tickets.js';

interface ParticipantIdentity {
  discordId: string;
  displayName: string;
  roomCode: string;
  expiresAt: number;
}

interface ParticipantTicket {
  ticket: string;
  expiresAt: number;
}

interface ParticipantExchange {
  handle: string;
  roomCode: string;
  expiresAt: number;
  ticket: string;
  ticketExpiresAt: number;
}

interface OAuthContext {
  roomCode: string;
  contextHash: string;
  expiresAt: number;
}

export interface ParticipantAuthOptions {
  engine: DraftEngine;
  appOrigin: string;
  publicOrigin: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  fetch?: typeof fetch;
}

function opaque(): string { return randomBytes(32).toString('base64url'); }
function hash(value: string): string { return createHash('sha256').update(value).digest('hex'); }

/** @description 참가자 인증은 관리자 세션과 분리하고 1회 코드와 서버 보관 세션만 발급한다. */
export class DraftParticipantAuth {
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: ParticipantAuthOptions) { this.fetcher = options.fetch ?? fetch; }

  async begin(roomCode: string, contextHash: string): Promise<string> {
    requireDraft(/^[A-Z2-9]{10}$/.test(roomCode) && /^[a-f0-9]{64}$/.test(contextHash), 'INVALID_AUTH_CONTEXT', '참가 인증 문맥을 확인해 주세요.');
    const bundle = await this.options.engine.requireRoom(roomCode);
    const state = opaque();
    const context: OAuthContext = { roomCode, contextHash, expiresAt: Math.min(bundle.now + 600_000, bundle.room.expiresAt) };
    await this.options.engine.store.putTransient(`state:${hash(state)}`, JSON.stringify(context), context.expiresAt);
    const url = new URL('https://discord.com/oauth2/authorize');
    url.search = new URLSearchParams({ response_type: 'code', client_id: this.options.clientId,
      scope: 'identify', state, redirect_uri: `${this.options.publicOrigin}/auth/discord/callback`,
    }).toString();
    return url.toString();
  }

  /** @description 검증된 인증 문맥의 방으로 실패 사유만 돌려보내며 인증 정보는 발급하지 않는다. */
  async callback(code: string, state: string, issuer: string | null, oauthError: string | null = null): Promise<string> {
    let roomCode: string | null = null;
    try {
      requireDraft(/^[\w-]{43}$/.test(state) && (issuer === 'https://discord.com' || (oauthError !== null && issuer === null)),
        'INVALID_OAUTH_CALLBACK', 'Discord 인증 응답을 확인해 주세요.');
      const raw = await this.options.engine.store.getTransient(`state:${hash(state)}`, true);
      requireDraft(raw, 'OAUTH_STATE_EXPIRED', '인증 요청이 만료되었거나 이미 사용되었습니다.');
      const context = JSON.parse(raw) as OAuthContext;
      requireDraft(/^[A-Z2-9]{10}$/.test(context.roomCode), 'INVALID_OAUTH_CALLBACK', '인증 요청을 확인해 주세요.');
      roomCode = context.roomCode;
      requireDraft(Date.now() < context.expiresAt, 'OAUTH_STATE_EXPIRED', '인증 요청이 만료되었습니다.');
      requireDraft(oauthError === null, oauthError === 'access_denied' ? 'AUTH_CANCELLED' : 'DISCORD_AUTH_FAILED', 'Discord 인증을 완료하지 못했습니다.');
      requireDraft(code.length > 0 && code.length <= 1024, 'INVALID_OAUTH_CALLBACK', 'Discord 인증 응답을 확인해 주세요.');
      return await this.authenticate(code, context);
    } catch (error) {
      const allowed = ['NOT_PARTICIPANT', 'AUTH_CANCELLED', 'OAUTH_STATE_EXPIRED', 'ROOM_EXPIRED', 'INACTIVE_ROOM'];
      const reason = error instanceof DraftRuleError && allowed.includes(error.code) ? error.code : 'AUTH_FAILED';
      const redirect = new URL(`/draft/${roomCode ?? 'auth-error'}`, this.options.appOrigin);
      redirect.searchParams.set('draft_error', reason);
      return redirect.toString();
    }
  }

  private async authenticate(code: string, context: OAuthContext): Promise<string> {
    const tokenResponse = await this.fetcher('https://discord.com/api/oauth2/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.options.clientId, client_secret: this.options.clientSecret,
        grant_type: 'authorization_code', code, redirect_uri: `${this.options.publicOrigin}/auth/discord/callback`,
      }), signal: AbortSignal.timeout(8000),
    });
    requireDraft(tokenResponse.ok, 'DISCORD_AUTH_FAILED', 'Discord 인증을 완료하지 못했습니다.');
    const tokens = await tokenResponse.json() as { access_token?: string; token_type?: string; scope?: string };
    requireDraft(typeof tokens.access_token === 'string' && tokens.token_type?.toLowerCase() === 'bearer'
      && tokens.scope?.split(' ').includes('identify'), 'DISCORD_AUTH_FAILED', 'Discord 인증 범위를 확인해 주세요.');
    const userResponse = await this.fetcher('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }, signal: AbortSignal.timeout(8000),
    });
    requireDraft(userResponse.ok, 'DISCORD_AUTH_FAILED', 'Discord 본인 정보를 확인하지 못했습니다.');
    const user = await userResponse.json() as { id?: string; global_name?: string; username?: string };
    requireDraft(typeof user.id === 'string' && /^\d{17,20}$/.test(user.id), 'DISCORD_AUTH_FAILED', 'Discord 계정을 확인해 주세요.');
    const bundle = await this.options.engine.requireRoom(context.roomCode);
    const participant = bundle.source?.participants.find(player => player.discordId === user.id);
    requireDraft(participant, 'NOT_PARTICIPANT', '이 내전 명단에 등록된 Discord 계정으로 참여해 주세요.');
    const exchangeCode = opaque();
    await this.options.engine.store.putTransient(`code:${hash(exchangeCode)}`, JSON.stringify({ ...context,
      discordId: user.id, displayName: participant.displayName, expiresAt: Math.min(Date.now() + 60_000, bundle.room.expiresAt),
    }), Math.min(Date.now() + 60_000, bundle.room.expiresAt));
    return `${this.options.appOrigin}/draft/${context.roomCode}?draft_code=${encodeURIComponent(exchangeCode)}`;
  }

  async exchange(code: string, contextHash: string): Promise<ParticipantExchange> {
    requireDraft(/^[\w-]{43}$/.test(code) && /^[a-f0-9]{64}$/.test(contextHash), 'INVALID_EXCHANGE', '교환 코드를 확인해 주세요.');
    const raw = await this.options.engine.store.getTransient(`code:${hash(code)}`, true);
    requireDraft(raw, 'EXCHANGE_EXPIRED', '교환 코드가 만료되었거나 이미 사용되었습니다.');
    const identity = JSON.parse(raw) as ParticipantIdentity & OAuthContext;
    requireDraft(identity.contextHash === contextHash && identity.expiresAt > Date.now(), 'INVALID_AUTH_CONTEXT', '인증을 시작한 브라우저에서 계속해 주세요.');
    const bundle = await this.options.engine.requireRoom(identity.roomCode);
    requireDraft(bundle.source?.participants.some(player => player.discordId === identity.discordId), 'NOT_PARTICIPANT', '현재 명단에 없습니다.');
    const handle = opaque();
    const session: ParticipantIdentity = { discordId: identity.discordId, displayName: identity.displayName,
      roomCode: identity.roomCode, expiresAt: bundle.room.expiresAt };
    await this.options.engine.store.putTransient(`session:${hash(handle)}`, JSON.stringify(session), session.expiresAt);
    const entry = this.issueTicket(session, bundle.room.expiresAt);
    return { handle, roomCode: identity.roomCode, expiresAt: session.expiresAt,
      ticket: entry.ticket, ticketExpiresAt: entry.expiresAt };
  }

  async refresh(handle: string, roomCode: string): Promise<ParticipantTicket> {
    requireDraft(/^[\w-]{43}$/.test(handle) && /^[A-Z2-9]{10}$/.test(roomCode), 'INVALID_SESSION', '참가자 세션을 확인해 주세요.');
    const raw = await this.options.engine.store.getTransient(`session:${hash(handle)}`);
    requireDraft(raw, 'PARTICIPANT_SESSION_EXPIRED', '참가 인증을 다시 진행해 주세요.');
    const session = JSON.parse(raw) as ParticipantIdentity;
    requireDraft(session.roomCode === roomCode && session.expiresAt > Date.now(), 'INVALID_SESSION', '이 방의 참가 인증이 필요합니다.');
    const bundle = await this.options.engine.requireRoom(roomCode);
    requireDraft(bundle.source?.participants.some(player => player.discordId === session.discordId), 'NOT_PARTICIPANT', '현재 명단에서 제외되었습니다.');
    return this.issueTicket(session, bundle.room.expiresAt);
  }

  private issueTicket(session: ParticipantIdentity, roomExpiresAt: number): ParticipantTicket {
    const now = Math.floor(Date.now() / 1000);
    const exp = Math.min(now + 300, Math.floor(Math.min(roomExpiresAt, session.expiresAt) / 1000));
    requireDraft(exp > now, 'PARTICIPANT_SESSION_EXPIRED', '참가 인증을 다시 진행해 주세요.');
    return { ticket: signDraftTicket({ iss: 'owkr-realtime', purpose: 'realtime-entry', sub: session.discordId,
      displayName: session.displayName, roomCode: session.roomCode, scope: 'join', iat: now, exp,
    }, this.options.privateKey), expiresAt: exp * 1000 };
  }
}
