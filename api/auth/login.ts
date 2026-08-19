import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createOAuthState, isLocalAuthRequest } from '../_lib/auth.js';
import { getRequestOrigin } from '../_lib/http.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: '허용되지 않는 요청입니다.' });
    }

    if (isLocalAuthRequest(req)) {
        return res.redirect(302, '/');
    }

    const clientId = process.env.DISCORD_CLIENT_ID;
    if (!clientId) return res.status(503).send('Discord 로그인이 아직 설정되지 않았습니다.');

    const { state, cookie } = createOAuthState(req);
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `${getRequestOrigin(req)}/api/auth/callback`,
        response_type: 'code',
        scope: 'identify',
        state,
    });

    res.setHeader('Set-Cookie', cookie);
    return res.redirect(302, `https://discord.com/oauth2/authorize?${params.toString()}`);
}
