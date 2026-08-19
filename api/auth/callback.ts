import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
    createClearedOAuthStateCookie,
    createSessionCookie,
    isAllowedAdmin,
    verifyOAuthState,
} from '../_lib/auth.js';
import { disableResponseCache, getRequestOrigin } from '../_lib/http.js';

interface DiscordTokenResponse {
    access_token: string;
}

interface DiscordUserResponse {
    id: string;
    username: string;
    global_name?: string | null;
}

const fetchDiscordJson = async <T>(url: string, accessToken: string): Promise<T> => {
    const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) throw new Error(`Discord API 요청 실패 (${response.status})`);
    return response.json() as Promise<T>;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    disableResponseCache(res);
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
    }

    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state || !verifyOAuthState(req, state)) {
        return res.status(400).send('로그인 요청이 만료되었거나 올바르지 않습니다. 다시 시도해 주세요.');
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        return res.status(503).send('Discord 로그인이 아직 설정되지 않았습니다.');
    }

    try {
        const origin = getRequestOrigin(req);
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: clientId,
                client_secret: clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: `${origin}/api/auth/callback`,
            }),
        });
        if (!tokenResponse.ok) throw new Error(`Discord 토큰 발급 실패 (${tokenResponse.status})`);

        const tokenData = await tokenResponse.json() as DiscordTokenResponse;
        const discordUser = await fetchDiscordJson<DiscordUserResponse>(
            'https://discord.com/api/users/@me',
            tokenData.access_token,
        );

        if (!isAllowedAdmin(discordUser.id)) {
            return res.status(403).send('등록된 관리자가 아닙니다.');
        }

        const sessionCookie = createSessionCookie(req, {
            id: discordUser.id,
            username: discordUser.username,
            globalName: discordUser.global_name ?? undefined,
        });
        res.setHeader('Set-Cookie', [sessionCookie, createClearedOAuthStateCookie(req)]);
        return res.redirect(302, origin);
    } catch (error) {
        console.error('Discord OAuth callback failed', error);
        return res.status(502).send('Discord 로그인 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.');
    }
}
