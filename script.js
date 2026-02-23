
const IMG = 'https://image.tmdb.org/t/p';
const VIDKING = 'https://www.vidking.net/embed';
const VIDKING_ORIGIN = 'https://www.vidking.net';

const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:';
const API_KEY = IS_LOCAL ? '85134f05e0f15fe779e23cd56c1a08d5' : null;
const BASE = IS_LOCAL ? 'https://api.themoviedb.org/3' : '';

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

const ROWS = [
    { id: 'trending', title: 'Trending Now', endpoint: '/trending/all/week', mediaType: 'all', badge: 'top10' },
    { id: 'popular-m', title: 'Popular on Dert', endpoint: '/movie/popular', mediaType: 'movie' },
    { id: 'now-play', title: 'Now Playing in Theaters', endpoint: '/movie/now_playing', mediaType: 'movie', badge: 'new' },
    { id: 'top-m', title: 'Top Rated Movies', endpoint: '/movie/top_rated', mediaType: 'movie' },
    { id: 'upcoming', title: 'Upcoming Movies', endpoint: '/movie/upcoming', mediaType: 'movie', badge: 'new' },
    { id: 'popular-t', title: 'Popular TV Shows', endpoint: '/tv/popular', mediaType: 'tv' },
    { id: 'top-t', title: 'Top Rated TV Shows', endpoint: '/tv/top_rated', mediaType: 'tv' },
    { id: 'airing', title: 'Currently Airing', endpoint: '/tv/on_the_air', mediaType: 'tv', badge: 'new' },
    { id: 'action', title: 'Action & Adventure', endpoint: '/discover/movie?with_genres=28', mediaType: 'movie' },
    { id: 'comedy', title: 'Comedies', endpoint: '/discover/movie?with_genres=35', mediaType: 'movie' },
    { id: 'horror', title: 'Horror', endpoint: '/discover/movie?with_genres=27', mediaType: 'movie' },
    { id: 'scifi', title: 'Sci-Fi', endpoint: '/discover/movie?with_genres=878', mediaType: 'movie' },
    { id: 'romance', title: 'Romantic Movies', endpoint: '/discover/movie?with_genres=10749', mediaType: 'movie' },
    { id: 'thriller', title: 'Thrillers', endpoint: '/discover/movie?with_genres=53', mediaType: 'movie' },
    { id: 'docs', title: 'Documentaries', endpoint: '/discover/movie?with_genres=99', mediaType: 'movie' },
    { id: 'animation', title: 'Animation', endpoint: '/discover/movie?with_genres=16', mediaType: 'movie' },
    { id: 'anime-tv', title: 'Anime Series', endpoint: '/discover/tv?with_genres=16', mediaType: 'tv' },
    { id: 'crime-tv', title: 'Crime TV Shows', endpoint: '/discover/tv?with_genres=80', mediaType: 'tv' },
];

const GENRE_MAP = {};


let currentPage = 'home';
let heroItem = null;
let detailCurrent = null;
let searchDebounce = null;
let suggestDebounce = null;
let ignoreProgress = false;


const CACHE_TTL = 30 * 60 * 1000;

async function tmdb(ep, extra = {}) {
    let url;
    if (IS_LOCAL) {
        const sep = ep.includes('?') ? '&' : '?';
        url = `${BASE}${ep}${sep}api_key=${API_KEY}&language=en-US`;
        Object.entries(extra).forEach(([k, v]) => url += `&${k}=${encodeURIComponent(v)}`);
    } else {
        const params = new URLSearchParams({ ep, ...extra });
        url = `/api/tmdb?${params.toString()}`;
    }

    const cacheKey = 'tmdb_' + ep + JSON.stringify(extra);
    if (!Object.keys(extra).includes('query')) {
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const { data, ts } = JSON.parse(cached);
                if (Date.now() - ts < CACHE_TTL) return data;
            }
        } catch (_) { }
    }

    const r = await fetch(url);
    if (!r.ok) throw new Error(`TMDB ${r.status}`);
    const data = await r.json();

    if (!Object.keys(extra).includes('query')) {
        try { sessionStorage.setItem(cacheKey, JSON.stringify({ data, ts: Date.now() })); } catch (_) { }
    }
    return data;
}

function norm(item, fallback) {
    const mt = item.media_type || fallback || 'movie';
    if (mt === 'person') return null;
    return {
        id: String(item.id),
        title: item.title || item.name || '',
        type: mt,
        poster: item.poster_path ? `${IMG}/w500${item.poster_path}` : null,
        backdrop: item.backdrop_path ? `${IMG}/w1280${item.backdrop_path}` : null,
        desc: item.overview || '',
        rating: item.vote_average ? item.vote_average.toFixed(1) : null,
        year: (item.release_date || item.first_air_date || '').slice(0, 4) || null,
        genreIds: item.genre_ids || [],
    };
}

async function loadGenres() {
    try {
        const [m, t] = await Promise.all([tmdb('/genre/movie/list'), tmdb('/genre/tv/list')]);
        [...(m.genres || []), ...(t.genres || [])].forEach(g => GENRE_MAP[g.id] = g.name);
    } catch (e) { }
}

function genreNames(ids) { return (ids || []).map(i => GENRE_MAP[i]).filter(Boolean); }


document.addEventListener('DOMContentLoaded', async () => {
    wireListeners();
    try {
        await loadGenres();
        await buildAllRows();
        pickHero();
        buildContinueRow();
    } catch (e) { console.error('Boot', e); }
    hideLoader();
});


let trendingData = null;

async function buildAllRows() {
    const main = document.getElementById('main-rows');
    main.innerHTML = '';

    const BATCH_SIZE = 10;
    const allResults = [];
    for (let i = 0; i < ROWS.length; i += BATCH_SIZE) {
        const batch = ROWS.slice(i, i + BATCH_SIZE);
        const tasks = batch.map(async cfg => {
            const data = await tmdb(cfg.endpoint);
            if (cfg.id === 'trending') trendingData = data;
            return { cfg, items: (data.results || []).map(r => norm(r, cfg.mediaType)).filter(Boolean) };
        });
        const results = await Promise.allSettled(tasks);
        allResults.push(...results);
    }
    allResults.forEach(r => {
        if (r.status !== 'fulfilled') return;
        const { cfg, items } = r.value;
        if (!items.length) return;
        main.appendChild(makeRow(cfg, items));
    });
}

function makeRow(cfg, items) {
    const sec = document.createElement('section');
    sec.className = 'content-row';
    sec.dataset.type = cfg.mediaType;
    sec.dataset.rowid = cfg.id;
    sec.innerHTML = `
        <div class="row-head">
            <h2>${cfg.title}</h2>
            <span class="see-all">Explore All ›</span>
        </div>
        <div class="slider-wrap">
            <button class="slide-arrow l" aria-label="Left">‹</button>
            <div class="slider-track"></div>
            <button class="slide-arrow r" aria-label="Right">›</button>
        </div>`;
    const track = sec.querySelector('.slider-track');
    items.forEach((item, idx) => track.appendChild(makeCard(item, cfg.badge, idx)));
    sec.querySelector('.slide-arrow.l').onclick = () => track.scrollBy({ left: -track.clientWidth * .82, behavior: 'smooth' });
    sec.querySelector('.slide-arrow.r').onclick = () => track.scrollBy({ left: track.clientWidth * .82, behavior: 'smooth' });
    return sec;
}


function makeCard(item, badgeType, idx) {
    const card = document.createElement('div');
    card.className = 'card';

    if (item.poster) {
        const img = document.createElement('img');
        img.loading = 'lazy'; img.alt = item.title; img.src = item.poster;
        img.onerror = () => { img.remove(); card.classList.add('no-img'); card.textContent = item.title; };
        card.appendChild(img);
    } else {
        card.classList.add('no-img');
        card.textContent = item.title;
    }

    if (badgeType === 'top10' && idx < 10) {
        const b = document.createElement('div');
        b.className = 'top-badge'; b.textContent = `TOP ${idx + 1}`;
        card.appendChild(b);
    } else if (badgeType === 'new') {
        const b = document.createElement('div');
        b.className = 'new-badge'; b.textContent = 'New';
        card.appendChild(b);
    }

    const prog = getProgress(item.id, item.type);
    if (prog && prog.progress > 2) {
        const bar = document.createElement('div'); bar.className = 'card-progress';
        const fill = document.createElement('div'); fill.className = 'card-progress-fill';
        fill.style.width = Math.min(prog.progress, 100) + '%';
        bar.appendChild(fill); card.appendChild(bar);
    }

    const genres = genreNames(item.genreIds).slice(0, 3).join(' · ');
    const panel = document.createElement('div');
    panel.className = 'card-panel';
    panel.innerHTML = `
        <div class="card-btns">
            <button class="card-circle play-c" data-do="play" title="Play">▶</button>
            <button class="card-circle" data-do="list" title="My List">+</button>
            <button class="card-circle card-info-btn" data-do="info" title="More Info">⌄</button>
        </div>
        ${item.rating ? `<div class="card-match">${Math.round(item.rating * 10)}% Match</div>` : ''}
        <div class="card-name">${item.title}</div>
        ${genres ? `<div class="card-tags">${genres}</div>` : ''}`;
    card.appendChild(panel);

    panel.querySelector('[data-do="play"]').onclick = e => { e.stopPropagation(); playContent(item); };
    panel.querySelector('[data-do="list"]').onclick = e => { e.stopPropagation(); toggleMyList(item); };
    panel.querySelector('[data-do="info"]').onclick = e => { e.stopPropagation(); openDetail(item); };
    card.onclick = () => openDetail(item);
    return card;
}


function pickHero() {
    const use = data => {
        const ok = (data.results || []).map(r => norm(r)).filter(i => i && i.backdrop && i.desc);
        if (!ok.length) return;
        heroItem = ok[Math.floor(Math.random() * Math.min(ok.length, 6))];
        renderHero();
    };
    if (trendingData) { use(trendingData); return; }
    tmdb('/trending/all/week').then(use);
}

function renderHero() {
    if (!heroItem) return;
    document.getElementById('hero').style.backgroundImage = `url(${heroItem.backdrop})`;
    document.getElementById('hero-title').textContent = heroItem.title;
    document.getElementById('hero-overview').textContent = heroItem.desc;
    document.getElementById('hero-type-text').textContent = heroItem.type === 'tv' ? 'S E R I E S' : 'F I L M';

    const meta = document.getElementById('hero-metadata');
    meta.innerHTML = '';
    if (heroItem.rating) {
        const ms = document.createElement('span'); ms.className = 'match-score';
        ms.textContent = `${Math.round(heroItem.rating * 10)}% Match`; meta.appendChild(ms);
    }
    if (heroItem.year) {
        const y = document.createElement('span'); y.className = 'meta-year';
        y.textContent = heroItem.year; meta.appendChild(y);
    }
    const mb = document.createElement('span'); mb.className = 'meta-badge'; mb.textContent = 'HD';
    meta.appendChild(mb);

    document.getElementById('hero-play-btn').onclick = () => playContent(heroItem);
    document.getElementById('hero-info-btn').onclick = () => openDetail(heroItem);
}


async function openDetail(item) {
    detailCurrent = item;
    const ov = document.getElementById('detail-overlay');

    document.getElementById('detail-hero').style.backgroundImage = item.backdrop ? `url(${item.backdrop})` : 'none';
    document.getElementById('detail-title').textContent = item.title;
    document.getElementById('detail-overview').textContent = item.desc;

    const meta = document.getElementById('detail-meta');
    meta.innerHTML = '';
    if (item.rating) { const s = document.createElement('span'); s.className = 'match'; s.textContent = `${Math.round(item.rating * 10)}% Match`; meta.appendChild(s); }
    if (item.year) { const s = document.createElement('span'); s.className = 'year'; s.textContent = item.year; meta.appendChild(s); }
    const b = document.createElement('span'); b.className = 'badge'; b.textContent = item.type === 'tv' ? 'Series' : 'Movie'; meta.appendChild(b);
    const hd = document.createElement('span'); hd.className = 'badge'; hd.textContent = 'HD'; meta.appendChild(hd);

    document.getElementById('detail-genre-line').innerHTML = genreNames(item.genreIds).length
        ? `<span>Genres:</span> ${genreNames(item.genreIds).join(', ')}` : '';

    const pb = document.getElementById('detail-play-btn');
    const pr = getProgress(item.id, item.type);
    if (pr && pr.season && pr.episode) {
        pb.querySelector('span').textContent = `Resume S${pr.season}:E${pr.episode}`;
        pb.onclick = () => playContent(item, pr.season, pr.episode);
    } else {
        pb.querySelector('span').textContent = 'Play';
        pb.onclick = () => playContent(item);
    }
    syncListBtn(item);

    document.getElementById('episodes-section').classList.remove('active');
    document.getElementById('detail-cast-line').innerHTML = '';
    document.getElementById('similar-grid').innerHTML = '';
    document.getElementById('about-title').textContent = item.title;
    document.getElementById('about-details').innerHTML = '';

    ov.classList.add('active');
    document.body.style.overflow = 'hidden';
    ov.scrollTop = 0;

    try {
        const [det, cred, sim] = await Promise.all([
            tmdb(`/${item.type}/${item.id}`),
            tmdb(`/${item.type}/${item.id}/credits`),
            tmdb(`/${item.type}/${item.id}/similar`)
        ]);

        if (det.overview) { item.desc = det.overview; document.getElementById('detail-overview').textContent = det.overview; }
        if (det.genres) document.getElementById('detail-genre-line').innerHTML = `<span>Genres:</span> ${det.genres.map(g => g.name).join(', ')}`;

        const cast = (cred.cast || []).slice(0, 8);
        if (cast.length) document.getElementById('detail-cast-line').innerHTML = `<span>Cast:</span> ${cast.map(c => c.name).join(', ')}`;

        const abt = document.getElementById('about-details');
        const rows = [];
        if (cast.length) rows.push(`<div class="about-row"><strong>Cast:</strong> ${cast.map(c => c.name).join(', ')}</div>`);
        if (det.genres) rows.push(`<div class="about-row"><strong>Genres:</strong> ${det.genres.map(g => g.name).join(', ')}</div>`);
        if (det.status) rows.push(`<div class="about-row"><strong>Status:</strong> ${det.status}</div>`);
        if (det.runtime) rows.push(`<div class="about-row"><strong>Runtime:</strong> ${det.runtime} min</div>`);
        if (det.vote_average) rows.push(`<div class="about-row"><strong>Rating:</strong> ${det.vote_average.toFixed(1)}/10</div>`);
        abt.innerHTML = rows.join('');

        if (item.type === 'tv' && det.seasons) {
            const seasons = det.seasons.filter(s => s.season_number > 0);
            if (seasons.length) {
                meta.querySelector('.badge').textContent = `${seasons.length} Season${seasons.length > 1 ? 's' : ''}`;
                const pick = document.getElementById('season-picker');
                pick.innerHTML = seasons.map(s => `<option value="${s.season_number}">Season ${s.season_number}</option>`).join('');
                const sp = getProgress(item.id, 'tv');
                if (sp && sp.season) pick.value = sp.season;
                pick.onchange = () => fetchEps(item.id, +pick.value);
                await fetchEps(item.id, +pick.value);
                document.getElementById('episodes-section').classList.add('active');
            }
        }

        const sims = (sim.results || []).slice(0, 9).map(r => norm(r, item.type)).filter(Boolean);
        const sg = document.getElementById('similar-grid');
        sg.innerHTML = '';
        sims.forEach(si => {
            const sc = document.createElement('div');
            sc.className = 'sim-card';
            sc.innerHTML = `
                <img class="sim-card-img" src="${escapeHtml(si.backdrop || si.poster || '')}" alt="${escapeHtml(si.title)}" loading="lazy"
                     onerror="this.style.background='#333'">
                <div class="sim-card-body">
                    <div class="sim-card-head">
                        ${si.rating ? `<span class="sim-match">${Math.round(si.rating * 10)}%</span>` : '<span></span>'}
                        ${si.year ? `<span class="sim-year">${escapeHtml(si.year)}</span>` : ''}
                    </div>
                    <div class="sim-card-title">${escapeHtml(si.title)}</div>
                    <div class="sim-card-desc">${escapeHtml(si.desc)}</div>
                </div>`;
            sc.onclick = () => { closeDetail(); setTimeout(() => openDetail(si), 350); };
            sg.appendChild(sc);
        });
    } catch (e) { console.warn('Detail', e); }
}

function closeDetail() {
    document.getElementById('detail-overlay').classList.remove('active');
    document.body.style.overflow = '';
    detailCurrent = null;
}

function syncListBtn(item) {
    const btn = document.getElementById('detail-list-btn');
    const yes = isInMyList(item.id);
    btn.classList.toggle('in-list', yes);
    btn.title = yes ? 'Remove from List' : 'Add to My List';
    btn.onclick = () => { toggleMyList(item); syncListBtn(item); };
}


async function fetchEps(tvId, sNum) {
    const list = document.getElementById('episodes-list');
    list.innerHTML = '<div style="color:#808080;padding:20px;text-align:center">Loading episodes…</div>';
    try {
        const d = await tmdb(`/tv/${tvId}/season/${sNum}`);
        const eps = d.episodes || [];
        if (!eps.length) { list.innerHTML = '<div style="color:#808080;padding:20px">No episodes</div>'; return; }
        list.innerHTML = eps.map(ep => {
            const still = ep.still_path ? `${IMG}/w300${ep.still_path}` : '';
            const rt = ep.runtime ? `${ep.runtime}m` : '';
            return `
                <div class="ep-card" onclick="playContent(detailCurrent,${sNum},${ep.episode_number})">
                    <div class="ep-index">${ep.episode_number}</div>
                    <div class="ep-thumb" style="background-image:url(${escapeHtml(still)})">
                        <div class="ep-play-overlay"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div>
                    </div>
                    <div class="ep-info">
                        <div class="ep-info-top">
                            <span class="ep-name">${escapeHtml(ep.name) || 'Episode ' + ep.episode_number}</span>
                            <span class="ep-len">${escapeHtml(rt)}</span>
                        </div>
                        <div class="ep-synopsis">${escapeHtml(ep.overview || '')}</div>
                    </div>
                </div>`;
        }).join('');
    } catch (e) { list.innerHTML = '<div style="color:#ff4444;padding:20px">Failed to load</div>'; }
}


function playContent(item, season, episode) {
    if (!item) return;
    saveHistory(item);

    destroyPlayerFrame();

    if (item.type === 'tv' && !season && !episode) {
        const pr = getProgress(item.id, 'tv');
        if (pr && pr.season && pr.episode) {
            season = pr.season;
            episode = pr.episode;
        }
    }

    const s = season || 1;
    const e = episode || 1;

    let url;
    if (item.type === 'tv') {
        url = `${VIDKING}/tv/${item.id}/${s}/${e}?color=e50914&autoPlay=true&nextEpisode=true&episodeSelector=true`;
    } else {
        url = `${VIDKING}/movie/${item.id}?color=e50914&autoPlay=true`;
    }

    closeDetail();

    ignoreProgress = false;

    setTimeout(() => {
        const frame = document.getElementById('player-frame');
        frame.innerHTML = `<iframe src="${url}" allowfullscreen allow="autoplay;fullscreen;encrypted-media;picture-in-picture"></iframe>`;
    }, 150);

    document.getElementById('player-overlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function destroyPlayerFrame() {
    const wrap = document.getElementById('player-frame');
    const iframe = wrap.querySelector('iframe');
    if (iframe) {
        try { iframe.contentWindow.postMessage('{"type":"PAUSE"}', '*'); } catch (_) { }
        iframe.src = 'about:blank';   // force-stop all media
        iframe.remove();
    }
    wrap.innerHTML = '';
}

function closePlayer() {
    ignoreProgress = true;
    destroyPlayerFrame();
    document.getElementById('player-overlay').classList.remove('active');
    document.body.style.overflow = '';
    buildContinueRow();
}


async function doSearch(q) {
    const sp = document.getElementById('search-page');
    const mr = document.getElementById('main-rows');
    const he = document.getElementById('hero');
    const ml = document.getElementById('mylist-page');

    if (!q.trim()) {
        sp.classList.remove('active'); ml.classList.remove('active');
        mr.style.display = ''; he.style.display = '';
        return;
    }
    he.style.display = 'none'; mr.style.display = 'none'; ml.classList.remove('active');
    sp.classList.add('active');

    document.getElementById('search-heading').innerHTML = `Search results for "<span>${escapeHtml(q)}</span>"`;
    const grid = document.getElementById('search-grid');
    grid.innerHTML = '<div style="color:#808080;padding:40px;text-align:center">Searching…</div>';

    try {
        const data = await tmdb('/search/multi', { query: q });
        const items = (data.results || []).map(r => norm(r)).filter(i => i && i.poster);
        if (!items.length) { grid.innerHTML = '<div style="color:#808080;padding:60px;text-align:center">No results found</div>'; return; }
        grid.innerHTML = '';
        items.forEach(i => grid.appendChild(makeCard(i)));
    } catch (e) { grid.innerHTML = '<div style="color:#ff4444;padding:40px;text-align:center">Search failed</div>'; }
}


async function fetchSuggestions(q) {
    const box = document.getElementById('search-suggestions');
    if (!q || q.length < 2) { box.classList.remove('active'); box.innerHTML = ''; return; }
    try {
        const data = await tmdb('/search/multi', { query: q });
        const items = (data.results || []).map(r => norm(r)).filter(i => i && i.poster).slice(0, 6);
        if (!items.length) { box.classList.remove('active'); box.innerHTML = ''; return; }
        box.innerHTML = items.map(i => `
            <div class="suggest-item" data-id="${escapeHtml(i.id)}" data-type="${escapeHtml(i.type)}">
                <img class="suggest-poster" src="${escapeHtml(i.poster)}" alt="${escapeHtml(i.title)}" loading="lazy" onerror="this.style.background='#333'">
                <div class="suggest-info">
                    <div class="suggest-title">${escapeHtml(i.title)}</div>
                    <div class="suggest-meta">
                        <span class="sug-type">${i.type === 'tv' ? 'Series' : 'Movie'}</span>
                        ${i.year ? ` · ${escapeHtml(i.year)}` : ''}
                        ${i.rating ? ` · ${Math.round(i.rating * 10)}%` : ''}
                    </div>
                </div>
            </div>
        `).join('') + `<div class="suggest-footer" id="suggest-see-all">See all results for "${escapeHtml(q)}"</div>`;
        box.querySelectorAll('.suggest-item').forEach((el, idx) => {
            el.onclick = () => { box.classList.remove('active'); box.innerHTML = ''; openDetail(items[idx]); };
        });
        document.getElementById('suggest-see-all').onclick = () => { box.classList.remove('active'); box.innerHTML = ''; doSearch(q); };
        box.classList.add('active');
    } catch (_) { box.classList.remove('active'); }
}

function hideSuggestions() {
    const box = document.getElementById('search-suggestions');
    box.classList.remove('active');
    box.innerHTML = '';
}


function getMyList() { return JSON.parse(localStorage.getItem('vk_mylist') || '[]'); }
function isInMyList(id) { return getMyList().some(i => i.id === id); }
function toggleMyList(item) {
    let ls = getMyList();
    if (ls.some(i => i.id === item.id)) ls = ls.filter(i => i.id !== item.id);
    else ls.unshift({ id: item.id, title: item.title, type: item.type, poster: item.poster, backdrop: item.backdrop, desc: item.desc, rating: item.rating, year: item.year, genreIds: item.genreIds || [] });
    localStorage.setItem('vk_mylist', JSON.stringify(ls.slice(0, 100)));
}
function showMyList() {
    const ls = getMyList(), g = document.getElementById('mylist-grid'), em = document.getElementById('mylist-empty');
    g.innerHTML = '';
    if (!ls.length) { em.classList.remove('hidden'); return; }
    em.classList.add('hidden');
    ls.forEach(i => g.appendChild(makeCard(i)));
}


function saveHistory(item) {
    let h = JSON.parse(localStorage.getItem('vk_hist') || '[]');
    h = h.filter(x => x.id !== item.id);
    h.unshift({ id: item.id, title: item.title, type: item.type, poster: item.poster, backdrop: item.backdrop, desc: item.desc, rating: item.rating, year: item.year, genreIds: item.genreIds || [] });
    localStorage.setItem('vk_hist', JSON.stringify(h.slice(0, 30)));
}

function buildContinueRow() {
    const old = document.querySelector('[data-rowid="continue"]');
    if (old) old.remove();
    const h = JSON.parse(localStorage.getItem('vk_hist') || '[]');
    if (!h.length) return;
    const main = document.getElementById('main-rows');
    main.insertBefore(makeRow({ id: 'continue', title: 'Continue Watching for You', mediaType: 'all' }, h), main.firstChild);
}


function saveProgress(data) {
    const payload = {
        id: String(data.id), mediaType: data.mediaType,
        currentTime: data.currentTime || 0, duration: data.duration || 0,
        progress: data.progress || 0, season: data.season || null,
        episode: data.episode || null, updatedAt: Date.now()
    };
    const showKey = `vk_p_${data.mediaType}_${data.id}`;
    localStorage.setItem(showKey, JSON.stringify(payload));
    if (data.mediaType === 'tv' && data.season && data.episode) {
        const epKey = `vk_p_tv_${data.id}_s${data.season}_e${data.episode}`;
        localStorage.setItem(epKey, JSON.stringify(payload));
    }
}

function getProgress(id, type, season, episode) {
    const key = type === 'tv' && season && episode
        ? `vk_p_tv_${id}_s${season}_e${episode}`
        : `vk_p_${type}_${id}`;
    const r = localStorage.getItem(key);
    return r ? JSON.parse(r) : null;
}


function navTo(page) {
    currentPage = page;
    document.querySelectorAll('.nav-link').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    document.querySelectorAll('.mobile-dropdown-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    document.getElementById('mobile-dropdown').classList.remove('open');

    const he = document.getElementById('hero'), mr = document.getElementById('main-rows');
    const sp = document.getElementById('search-page'), ml = document.getElementById('mylist-page');
    document.getElementById('search-input').value = '';
    sp.classList.remove('active');

    if (page === 'mylist') {
        he.style.display = 'none'; mr.style.display = 'none';
        ml.classList.add('active'); showMyList(); return;
    }
    ml.classList.remove('active'); he.style.display = ''; mr.style.display = '';
    document.querySelectorAll('.content-row').forEach(r => {
        const t = r.dataset.type;
        r.classList.toggle('hidden', page !== 'home' && t !== 'all' && t !== (page === 'movies' ? 'movie' : 'tv'));
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


function wireListeners() {
    let scrollTicking = false;
    window.addEventListener('scroll', () => {
        if (!scrollTicking) {
            requestAnimationFrame(() => {
                document.getElementById('navbar').classList.toggle('solid', window.scrollY > 10);
                scrollTicking = false;
            });
            scrollTicking = true;
        }
    }, { passive: true });

    document.querySelectorAll('.nav-link').forEach(el => el.onclick = () => navTo(el.dataset.page));
    document.querySelectorAll('.mobile-dropdown-item').forEach(el => el.onclick = () => navTo(el.dataset.page));
    document.getElementById('logo-btn').onclick = () => navTo('home');

    document.getElementById('mobile-menu-btn').onclick = () => document.getElementById('mobile-dropdown').classList.toggle('open');

    const sw = document.getElementById('search-wrapper'), si = document.getElementById('search-input');
    document.getElementById('search-btn').onclick = () => { sw.classList.toggle('open'); if (sw.classList.contains('open')) si.focus(); else { si.value = ''; doSearch(''); hideSuggestions(); } };
    document.getElementById('search-clear').onclick = () => { si.value = ''; doSearch(''); hideSuggestions(); si.focus(); };
    si.oninput = () => {
        clearTimeout(searchDebounce);
        clearTimeout(suggestDebounce);
        const val = si.value;
        suggestDebounce = setTimeout(() => fetchSuggestions(val), 250);
        searchDebounce = setTimeout(() => { hideSuggestions(); doSearch(val); }, 3000);
    };
    si.onkeydown = e => {
        if (e.key === 'Escape') { si.value = ''; sw.classList.remove('open'); doSearch(''); hideSuggestions(); }
        if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchDebounce); clearTimeout(suggestDebounce); hideSuggestions(); doSearch(si.value); }
    };

    document.getElementById('detail-close-btn').onclick = closeDetail;
    document.getElementById('detail-overlay').onclick = e => { if (e.target === e.currentTarget) closeDetail(); };

    document.getElementById('player-back-btn').onclick = closePlayer;

    document.onkeydown = e => {
        if (e.key !== 'Escape') return;
        if (document.getElementById('player-overlay').classList.contains('active')) closePlayer();
        else if (document.getElementById('detail-overlay').classList.contains('active')) closeDetail();
    };

    window.addEventListener('message', ev => {
        if (ignoreProgress) return;

        try {
            const msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
            if (msg?.type === 'PLAYER_EVENT' && msg.data) saveProgress(msg.data);
        } catch (_) { }
    });

    document.addEventListener('click', e => {
        const dd = document.getElementById('mobile-dropdown');
        const btn = document.getElementById('mobile-menu-btn');
        if (dd.classList.contains('open') && !dd.contains(e.target) && !btn.contains(e.target)) dd.classList.remove('open');
    });
}


function hideLoader() { setTimeout(() => document.getElementById('loader-screen').classList.add('hidden'), 800); }