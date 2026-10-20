import { sign, verify, randomUUID, createPrivateKey, createPublicKey } from 'node:crypto';
import { requireDraft } from '../../domains/draft/shared/public.js';

export interface DraftTicket {
  iss: 'owkr-vercel' | 'owkr-realtime';
  aud: 'owkr-draft';
  purpose: 'admin-entry' | 'realtime-entry';
  sub: string;
  displayName: string;
  roomCode: string | null;
  scope: 'create' | 'join';
  jti: string;
  iat: number;
  exp: number;
}

export function signDraftTicket(payload: Omit<DraftTicket, 'jti' | 'aud'>, privateKey: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, aud: 'owkr-draft', jti: randomUUID() })).toString('base64url');
  const value = `${header}.${body}`;
  const key = createPrivateKey(privateKey);
  requireDraft(key.asymmetricKeyType === 'rsa', 'INVALID_TICKET_KEY', 'RSA 입장권 키가 필요합니다.');
  return `${value}.${sign('RSA-SHA256', Buffer.from(value), key).toString('base64url')}`;
}

export function verifyDraftTicket(token: string, publicKey: string, purpose: DraftTicket['purpose'], now: number): DraftTicket {
  requireDraft(token.length <= 8192, 'INVALID_TICKET', '입장권이 올바르지 않습니다.');
  const parts = token.split('.');
  requireDraft(parts.length === 3, 'INVALID_TICKET', '입장권이 올바르지 않습니다.');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as { alg: string; typ: string };
  requireDraft(header.alg === 'RS256' && header.typ === 'JWT', 'INVALID_TICKET', '입장권 서명 방식이 올바르지 않습니다.');
  const key = createPublicKey(publicKey);
  requireDraft(key.asymmetricKeyType === 'rsa' && verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), key,
    Buffer.from(parts[2], 'base64url')), 'INVALID_TICKET', '입장권 서명을 확인할 수 없습니다.');
  const value = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as DraftTicket;
  requireDraft(value.aud === 'owkr-draft' && value.purpose === purpose
    && value.iss === (purpose === 'admin-entry' ? 'owkr-vercel' : 'owkr-realtime')
    && /^\d{17,20}$/.test(value.sub) && typeof value.displayName === 'string' && value.displayName.length <= 100
    && typeof value.jti === 'string' && value.jti.length > 0 && value.jti.length <= 100
    && (value.scope === 'create' || value.scope === 'join')
    && (value.roomCode === null || /^[A-Z2-9]{10}$/.test(value.roomCode))
    && Number.isSafeInteger(value.exp) && Number.isSafeInteger(value.iat)
    && value.iat * 1000 <= now + 5000 && value.exp * 1000 > now
    && value.exp > value.iat && value.exp - value.iat <= (purpose === 'admin-entry' ? 60 : 300),
  'INVALID_TICKET', '입장권 용도·대상 또는 유효기간을 확인해 주세요.');
  return value;
}
