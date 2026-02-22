// Vercel Serverless Function — proxies TMDB requests so the API key stays server-side.
// Set TMDB_API_KEY in Vercel Dashboard → Settings → Environment Variables.

export default async function handler(req, res) {
    // Only allow GET
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'TMDB_API_KEY not configured' });
    }

    const { ep, ...params } = req.query;
    if (!ep) {
        return res.status(400).json({ error: 'Missing "ep" query parameter' });
    }

    // Whitelist allowed endpoint prefixes to prevent open-proxy abuse
    const ALLOWED = [
        '/trending/', '/movie/', '/tv/', '/search/', '/genre/', '/discover/'
    ];
    if (!ALLOWED.some(prefix => ep.startsWith(prefix))) {
        return res.status(403).json({ error: 'Endpoint not allowed' });
    }

    try {
        const sep = ep.includes('?') ? '&' : '?';
        let url = `https://api.themoviedb.org/3${ep}${sep}api_key=${apiKey}&language=en-US`;

        // Forward any extra params (e.g. query, page)
        Object.entries(params).forEach(([k, v]) => {
            url += `&${k}=${encodeURIComponent(v)}`;
        });

        const tmdbRes = await fetch(url);
        const data = await tmdbRes.json();

        // Cache at Vercel edge for 10 min, stale-while-revalidate for 1 hour
        res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=3600');
        return res.status(tmdbRes.status).json(data);
    } catch (err) {
        console.error('TMDB proxy error:', err);
        return res.status(502).json({ error: 'Failed to fetch from TMDB' });
    }
}
