
const IMG = 'https://image.tmdb.org/t/p';
const VIDKING = 'https://www.vidking.net/embed';
const VIDKING_ORIGIN = 'https://www.vidking.net';
const VIDEASY = 'https://player.videasy.net';
let playerSource = localStorage.getItem('vk_player') || 'videasy';

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
    { id: 'action', title: 'Action & Adventure', endpoint: '/discover/movie?with_genres=28&sort_by=popularity.desc&vote_count.gte=100', mediaType: 'movie' },
    { id: 'comedy', title: 'Comedies', endpoint: '/discover/movie?with_genres=35&sort_by=popularity.desc&vote_count.gte=100', mediaType: 'movie' },
    { id: 'horror', title: 'Horror', endpoint: '/discover/movie?with_genres=27&sort_by=popularity.desc&vote_count.gte=50', mediaType: 'movie' },
    { id: 'scifi', title: 'Sci-Fi', endpoint: '/discover/movie?with_genres=878&sort_by=popularity.desc&vote_count.gte=100', mediaType: 'movie' },
    { id: 'romance', title: 'Romantic Movies', endpoint: '/discover/movie?with_genres=10749&sort_by=popularity.desc&vote_count.gte=50', mediaType: 'movie' },
    { id: 'thriller', title: 'Thrillers', endpoint: '/discover/movie?with_genres=53&sort_by=popularity.desc&vote_count.gte=100', mediaType: 'movie' },
    { id: 'docs', title: 'Documentaries', endpoint: '/discover/movie?with_genres=99&sort_by=popularity.desc&vote_count.gte=20', mediaType: 'movie' },
    { id: 'animation', title: 'Animation', endpoint: '/discover/movie?with_genres=16&sort_by=popularity.desc&vote_count.gte=50', mediaType: 'movie' },
    { id: 'anime-tv', title: 'Anime Series', endpoint: '/discover/tv?with_genres=16&sort_by=popularity.desc&vote_count.gte=20', mediaType: 'tv' },
    { id: 'crime-tv', title: 'Crime TV Shows', endpoint: '/discover/tv?with_genres=80&sort_by=popularity.desc&vote_count.gte=50', mediaType: 'tv' },
];

const GENRE_MAP = {};


let currentPage = 'home';
let heroItem = null;
let detailCurrent = null;
let searchDebounce = null;
let suggestDebounce = null;
let filterCurrent = null;
let lastSearchQuery = '';
let searchPage = 1;
let filterPage = 1;
let isFetchingMore = false;
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
        buildFilterMenu();
    } catch (e) { }
}

function buildFilterMenu() {
    const box = document.getElementById('filter-dropdown');
    const genres = Object.entries(GENRE_MAP).sort((a,b) => a[1].localeCompare(b[1]));
    const uniqueGenres = [];
    const seenNames = new Set();
    genres.forEach(([id, name]) => {
        if (name === 'Western' || name === 'Westerns') return; // Skip Western
        if (!seenNames.has(name)) {
            seenNames.add(name);
            uniqueGenres.push({id, name});
        }
    });

    if (!seenNames.has('Anime')) {
        uniqueGenres.push({id: '16', name: 'Anime'});
    }

    box.innerHTML = uniqueGenres.map(g => `<div class="filter-item" data-id="${g.id}">${g.name}</div>`).join('');
    box.querySelectorAll('.filter-item').forEach(el => {
        el.onclick = () => {
            const id = el.dataset.id;
            const name = el.textContent;
            applyFilter(id, name);
            box.classList.remove('open');
        };
    });
}

function genreNames(ids) { return (ids || []).map(i => GENRE_MAP[i]).filter(Boolean); }

document.addEventListener('DOMContentLoaded', async () => {
    wireListeners();
    const hash = window.location.hash.slice(1);
    if (['movies', 'tv', 'mylist'].includes(hash)) {
        currentPage = hash;
    } else if (hash.startsWith('movie/') || hash.startsWith('tv/')) {
        // We handle detail view opening after rows load so it doesn't block the UI
        const [type, id] = hash.split('/');
        setTimeout(() => loadDetailFromUrl(type, id), 500);
    }

    try {
        await loadGenres();
        await buildAllRows();
        pickHero();
        buildContinueRow();
        setupInfiniteScroll();
        if (currentPage !== 'home') navTo(currentPage, false);
        hideLoader();
    } catch (e) { console.error('Boot', e); }
});

function setupInfiniteScroll() {
    const sentinel = document.getElementById('infinite-scroll-sentinel');
    const observer = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting && !isFetchingMore) {
            loadNextPage();
        }
    }, { rootMargin: '400px' });
    observer.observe(sentinel);
}

async function loadNextPage() {
    const sp = document.getElementById('search-page');
    if (!sp.classList.contains('active')) return;

    isFetchingMore = true;
    const loader = document.getElementById('search-loading');
    loader.classList.add('active');

    try {
        let results = [];
        if (filterCurrent) {
            filterPage++;
            const params = { with_genres: filterCurrent.id, page: filterPage };
            if (filterCurrent.name === 'Anime') params.with_original_language = 'ja';
            const [m, t] = await Promise.all([tmdb('/discover/movie', params), tmdb('/discover/tv', params)]);
            results = [...(m.results || []).map(r => norm(r, 'movie')), ...(t.results || []).map(r => norm(r, 'tv'))];
        } else if (lastSearchQuery) {
            searchPage++;
            const [m, t] = await Promise.all([
                tmdb('/search/movie', { query: lastSearchQuery, page: searchPage }),
                tmdb('/search/tv', { query: lastSearchQuery, page: searchPage })
            ]);
            results = [...(m.results || []).map(r => norm(r, 'movie')), ...(t.results || []).map(r => norm(r, 'tv'))];
        }

        const items = results.filter(i => i && i.poster).sort((a,b) => (b.rating || 0) - (a.rating || 0));
        const grid = document.getElementById('search-grid');
        items.forEach(i => grid.appendChild(makeCard(i)));
        
        if (results.length === 0) {
            // No more results to fetch
            document.getElementById('infinite-scroll-sentinel').style.display = 'none';
        }
    } catch (e) { console.error('Paging error', e); } finally {
        isFetchingMore = false;
        loader.classList.remove('active');
    }
}

function genreNames(ids) { return (ids || []).map(i => GENRE_MAP[i]).filter(Boolean); }

async function loadDetailFromUrl(type, id) {
    try {
        const itemData = await tmdb(`/${type}/${id}`);
        const item = {
            id: String(itemData.id),
            title: itemData.title || itemData.name || '',
            type: type,
            media_type: type,
            poster_path: itemData.poster_path,
            backdrop_path: itemData.backdrop_path,
            overview: itemData.overview,
            vote_average: itemData.vote_average,
            release_date: itemData.release_date,
            first_air_date: itemData.first_air_date,
            genre_ids: (itemData.genres || []).map(g => g.id)
        };
        openDetail(norm(item, type), false);
    } catch (e) {
        console.error('Failed to load item from URL', e);
    }
}


let trendingData = null;

async function buildAllRows() {
    const main = document.getElementById('main-rows');
    main.innerHTML = '';

    const seenIds = new Set();

    const BATCH_SIZE = 10;
    const allResults = [];
    for (let i = 0; i < ROWS.length; i += BATCH_SIZE) {
        const batch = ROWS.slice(i, i + BATCH_SIZE);
        const tasks = batch.map(async cfg => {
            let ep = cfg.endpoint;
            if (ep.includes('/discover/')) {
                const page = Math.floor(Math.random() * 3) + 1;
                ep += `&page=${page}`;
            }
            const data = await tmdb(ep);
            if (cfg.id === 'trending') trendingData = data;
            return { cfg, items: (data.results || []).map(r => norm(r, cfg.mediaType)).filter(Boolean) };
        });
        const results = await Promise.allSettled(tasks);
        allResults.push(...results);
    }
    allResults.forEach(r => {
        if (r.status !== 'fulfilled') return;
        const { cfg, items } = r.value;
        const unique = items.filter(item => {
            if (seenIds.has(item.id)) return false;
            seenIds.add(item.id);
            return true;
        });
        if (!unique.length) return;
        main.appendChild(makeRow(cfg, unique));
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
            <button class="slide-arrow l" aria-label="Left">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
            </button>
            <div class="slider-track"></div>
            <button class="slide-arrow r" aria-label="Right">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
            </button>
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
    card.style.animationDelay = `${(idx % 20) * 0.05}s`;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `View details for ${item.title}`);

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
    const inList = isInMyList(item.id);
    const plusIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
    const checkIcon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>';
    panel.innerHTML = `
        <div class="card-btns">
            <button class="card-circle play-c" data-do="play" title="Play" aria-label="Play">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l15 8-15 8z"/></svg>
            </button>
            <button class="card-circle ${inList ? 'in-list' : ''}" data-do="list" title="${inList ? 'Remove from List' : 'Add to My List'}" aria-label="${inList ? 'Remove from List' : 'Add to My List'}">${inList ? checkIcon : plusIcon}</button>
            <button class="card-circle card-info-btn" data-do="info" title="More Info" aria-label="More Info">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
        </div>
        ${item.rating ? `<div class="card-match">${Math.round(item.rating * 10)}% Match</div>` : ''}
        <div class="card-name">${item.title}</div>
        ${genres ? `<div class="card-tags">${genres}</div>` : ''}`;
    card.appendChild(panel);

    panel.querySelector('[data-do="play"]').onclick = e => { e.stopPropagation(); playContent(item); };
    const listBtn = panel.querySelector('[data-do="list"]');
    listBtn.onclick = e => {
        e.stopPropagation();
        toggleMyList(item);
        const nowInList = isInMyList(item.id);
        listBtn.innerHTML = nowInList ? checkIcon : plusIcon;
        listBtn.title = nowInList ? 'Remove from List' : 'Add to My List';
        listBtn.setAttribute('aria-label', nowInList ? 'Remove from List' : 'Add to My List');
        listBtn.classList.toggle('in-list', nowInList);
    };
    panel.querySelector('[data-do="info"]').onclick = e => { e.stopPropagation(); openDetail(item); };
    card.onclick = () => openDetail(item);
    card.onkeydown = e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openDetail(item);
        }
    };
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


async function openDetail(item, updateUrl = true) {
    if (!item) return;
    detailCurrent = item;

    if (updateUrl) {
        history.pushState({ isDetail: true, type: item.type, id: item.id }, '', `#${item.type}/${item.id}`);
    }

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
            sc.tabIndex = 0;
            sc.setAttribute('role', 'button');
            sc.setAttribute('aria-label', `View details for ${escapeHtml(si.title)}`);
            sc.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sc.click(); } };
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

function closeDetail(updateUrl = true) {
    document.getElementById('detail-overlay').classList.remove('active');
    document.body.style.overflow = '';
    detailCurrent = null;

    if (updateUrl) {
        if (currentPage === 'home') {
            history.pushState(null, '', window.location.pathname + window.location.search);
        } else {
            history.pushState(null, '', '#' + currentPage);
        }
    }
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
    list.innerHTML = '<div class="loading-spinner-wrap active"><div class="spinner"></div></div>';
    try {
        const d = await tmdb(`/tv/${tvId}/season/${sNum}`);
        const eps = d.episodes || [];
        if (!eps.length) { list.innerHTML = '<div class="empty-state"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><h3>No episodes</h3><p>Episodes for this season are not available yet.</p></div>'; return; }
        list.innerHTML = eps.map(ep => {
            const still = ep.still_path ? `${IMG}/w300${ep.still_path}` : '';
            const rt = ep.runtime ? `${ep.runtime}m` : '';
            return `
                <div class="ep-card" tabindex="0" role="button" aria-label="Play episode ${ep.episode_number}: ${escapeHtml(ep.name) || 'Episode ' + ep.episode_number}" onkeydown="if(event.key==='Enter'||event.key===' ') { event.preventDefault(); this.click(); }" onclick="playContent(detailCurrent,${sNum},${ep.episode_number})">
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
    } catch (e) { list.innerHTML = '<div class="empty-state"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="1"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><h3 style="color:#ff4444">Failed to load</h3><p>Please try again later.</p></div>'; }
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
    const isVidking = playerSource === 'vidking';

    if (item.type === 'tv') {
        if (isVidking) {
            url = `${VIDKING}/tv/${item.id}/${s}/${e}?color=e50914&autoPlay=true&nextEpisode=true&episodeSelector=true`;
        } else {
            url = `${VIDEASY}/tv/${item.id}/${s}/${e}?color=e50914&autoplayNextEpisode=true&nextEpisode=true&episodeSelector=true`;
        }
    } else {
        if (isVidking) {
            url = `${VIDKING}/movie/${item.id}?color=e50914&autoPlay=true`;
        } else {
            url = `${VIDEASY}/movie/${item.id}?color=e50914`;
        }
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


async function applyFilter(genreId, genreName) {
    const sp = document.getElementById('search-page');
    const mr = document.getElementById('main-rows');
    const he = document.getElementById('hero');
    const ml = document.getElementById('mylist-page');

    filterCurrent = { id: genreId, name: genreName };
    filterPage = 1;
    lastSearchQuery = '';
    document.getElementById('infinite-scroll-sentinel').style.display = 'block';
    navTo('filter', false);

    he.style.display = 'none'; mr.style.display = 'none'; ml.classList.remove('active');
    sp.classList.add('active');

    document.getElementById('search-heading').innerHTML = `Movies & Shows: <span>${escapeHtml(genreName)}</span>`;
    const grid = document.getElementById('search-grid');
    grid.innerHTML = '<div class="loading-spinner-wrap active" style="grid-column: 1 / -1;"><div class="spinner"></div></div>';

    try {
        const params = { with_genres: genreId };
        if (genreName === 'Anime') params.with_original_language = 'ja';

        const [m, t] = await Promise.all([
            tmdb('/discover/movie', params),
            tmdb('/discover/tv', params)
        ]);
        const items = [
            ...(m.results || []).map(r => norm(r, 'movie')),
            ...(t.results || []).map(r => norm(r, 'tv'))
        ].filter(i => i && i.poster).sort((a, b) => (b.rating || 0) - (a.rating || 0));

        if (!items.length) {
            grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg><h3>No matches found</h3><p>Try selecting a different genre.</p></div>';
            return;
        }
        grid.innerHTML = '';
        items.forEach(i => grid.appendChild(makeCard(i)));
    } catch (e) {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="1"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><h3 style="color:#ff4444">Something went wrong</h3><p>Please try again later.</p></div>';
    }
}

async function doSearch(q) {
    const sp = document.getElementById('search-page');
    const mr = document.getElementById('main-rows');
    const he = document.getElementById('hero');
    const ml = document.getElementById('mylist-page');

    if (!q.trim()) {
        sp.classList.remove('active'); ml.classList.remove('active');
        mr.style.display = ''; he.style.display = '';
        lastSearchQuery = '';
        return;
    }
    lastSearchQuery = q;
    searchPage = 1;
    filterCurrent = null;
    document.getElementById('infinite-scroll-sentinel').style.display = 'block';
    he.style.display = 'none'; mr.style.display = 'none'; ml.classList.remove('active');
    sp.classList.add('active');

    document.getElementById('search-heading').innerHTML = `Search results for "<span>${escapeHtml(q)}</span>"`;
    const grid = document.getElementById('search-grid');
    grid.innerHTML = '<div class="loading-spinner-wrap active" style="grid-column: 1 / -1;"><div class="spinner"></div></div>';

    try {
        const data = await tmdb('/search/multi', { query: q });
        const items = (data.results || []).map(r => norm(r)).filter(i => i && i.poster);
        if (!items.length) {
            grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><h3>No results found</h3><p>Try adjusting your search query.</p></div>';
            return;
        }
        grid.innerHTML = '';
        items.forEach(i => grid.appendChild(makeCard(i)));
    } catch (e) {
        grid.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;"><svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#ff4444" stroke-width="1"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><h3 style="color:#ff4444">Something went wrong</h3><p>Please try again later.</p></div>';
    }
}


async function fetchSuggestions(q) {
    const box = document.getElementById('search-suggestions');
    if (!q || q.length < 2) { box.classList.remove('active'); box.innerHTML = ''; return; }
    try {
        const data = await tmdb('/search/multi', { query: q });
        const items = (data.results || []).map(r => norm(r)).filter(i => i && i.poster).slice(0, 6);
        if (!items.length) { box.classList.remove('active'); box.innerHTML = ''; return; }
        box.innerHTML = items.map(i => `
            <div class="suggest-item" tabindex="0" role="button" aria-label="${escapeHtml(i.title)}" onkeydown="if(event.key==='Enter'||event.key===' ') { event.preventDefault(); this.click(); }" data-id="${escapeHtml(i.id)}" data-type="${escapeHtml(i.type)}">
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
    if (ls.some(i => i.id === item.id)) {
        ls = ls.filter(i => i.id !== item.id);
        showToast('Removed from My List');
    } else {
        ls.unshift({ id: item.id, title: item.title, type: item.type, poster: item.poster, backdrop: item.backdrop, desc: item.desc, rating: item.rating, year: item.year, genreIds: item.genreIds || [] });
        showToast('Added to My List');
    }
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


function navTo(page, updateUrl = true) {
    currentPage = page;
    if (updateUrl) {
        if (page === 'home') {
            history.pushState(null, '', window.location.pathname + window.location.search);
        } else {
            history.pushState(null, '', '#' + page);
        }
    }
    document.querySelectorAll('.nav-link').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    document.querySelectorAll('.mobile-dropdown-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
    
    if (page === 'home') filterCurrent = null;
    
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


function makeInteractive(el) {
    if (!el) return;
    el.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            el.click();
        }
    });
}

function wireListeners() {
    function setVh() {
        const vh = (window.visualViewport ? window.visualViewport.height : window.innerHeight) * 0.01;
        document.documentElement.style.setProperty('--vh', vh + 'px');
    }
    setVh();
    window.addEventListener('resize', setVh, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', setVh, { passive: true });
    window.addEventListener('orientationchange', () => setTimeout(setVh, 150));

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

    document.querySelectorAll('.nav-link').forEach(el => {
        el.onclick = () => navTo(el.dataset.page);
        makeInteractive(el);
    });
    document.querySelectorAll('.mobile-dropdown-item').forEach(el => {
        el.onclick = () => navTo(el.dataset.page);
        makeInteractive(el);
    });
    document.querySelectorAll('.bottom-nav-item').forEach(el => {
        el.onclick = () => navTo(el.dataset.page);
        makeInteractive(el);
    });
    const logoBtn = document.getElementById('logo-btn');
    if (logoBtn) {
        logoBtn.onclick = () => navTo('home');
        makeInteractive(logoBtn);
    }

    window.addEventListener('popstate', (e) => {
        const hash = window.location.hash.slice(1) || 'home';

        if (hash.startsWith('movie/') || hash.startsWith('tv/')) {
            const [type, id] = hash.split('/');
            loadDetailFromUrl(type, id);
        } else {
            if (document.getElementById('detail-overlay').classList.contains('active')) {
                closeDetail(false);
            }
            if (['home', 'movies', 'tv', 'mylist'].includes(hash) && currentPage !== hash) {
                navTo(hash, false);
            }
        }
    });

    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    if (mobileMenuBtn) {
        mobileMenuBtn.onclick = () => document.getElementById('mobile-dropdown').classList.toggle('open');
        makeInteractive(mobileMenuBtn);
    }

    const filterBtn = document.getElementById('filter-btn');
    const filterDrop = document.getElementById('filter-dropdown');
    if (filterBtn) {
        filterBtn.onclick = (e) => { e.stopPropagation(); filterDrop.classList.toggle('open'); };
        // makeInteractive(filterBtn); // Already handled in .nav-link loop
    }
    
    const mobileFilterTrigger = document.getElementById('mobile-filter-trigger');
    if (mobileFilterTrigger) {
        mobileFilterTrigger.onclick = (e) => { e.stopPropagation(); filterDrop.classList.toggle('open'); };
        // makeInteractive(mobileFilterTrigger); // Already handled in .bottom-nav-item loop
    }

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

    const avatar = document.getElementById('nav-avatar');
    const accDrop = document.getElementById('account-dropdown');
    if (avatar) {
        avatar.onclick = e => {
            e.stopPropagation();
            accDrop.classList.toggle('open');
            avatar.classList.toggle('open');
        };
        makeInteractive(avatar);
    }

    wireSettingsActions();

    document.addEventListener('click', e => {
        if (filterDrop.classList.contains('open') && !filterDrop.contains(e.target) && !filterBtn.contains(e.target) && (!mobileFilterTrigger || !mobileFilterTrigger.contains(e.target))) {
            filterDrop.classList.remove('open');
        }

        const dd = document.getElementById('mobile-dropdown');
        const btn = document.getElementById('mobile-menu-btn');
        if (dd.classList.contains('open') && !dd.contains(e.target) && !btn.contains(e.target)) dd.classList.remove('open');
        if (accDrop.classList.contains('open') && !avatar.contains(e.target)) {
            accDrop.classList.remove('open');
            avatar.classList.remove('open');
            resetConfirmStates();
        }
    });
}

function showToast(msg) {
    const t = document.getElementById('account-toast');
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2500);
}

function resetConfirmStates() {
    document.querySelectorAll('.account-item.confirm').forEach(el => {
        el.classList.remove('confirm');
        el.querySelector('span').textContent = el.dataset.label;
    });
}

function settingsConfirm(btn, action) {
    if (btn.classList.contains('confirm')) {
        btn.classList.remove('confirm');
        btn.classList.add('done');
        action();
        btn.querySelector('span').textContent = 'Done!';
        setTimeout(() => {
            btn.classList.remove('done');
            btn.querySelector('span').textContent = btn.dataset.label;
        }, 1500);
        return;
    }
    resetConfirmStates();
    btn.dataset.label = btn.dataset.label || btn.querySelector('span').textContent;
    btn.classList.add('confirm');
    btn.querySelector('span').textContent = 'Click again to confirm';
}

function wireSettingsActions() {
    document.getElementById('settings-clear-history').onclick = e => {
        e.stopPropagation();
        settingsConfirm(e.currentTarget, () => {
            localStorage.removeItem('vk_hist');
            const old = document.querySelector('[data-rowid="continue"]');
            if (old) old.remove();
            showToast('Watch history cleared');
        });
    };

    document.getElementById('settings-clear-progress').onclick = e => {
        e.stopPropagation();
        settingsConfirm(e.currentTarget, () => {
            Object.keys(localStorage).filter(k => k.startsWith('vk_p_')).forEach(k => localStorage.removeItem(k));
            showToast('All progress reset');
        });
    };

    document.getElementById('settings-clear-list').onclick = e => {
        e.stopPropagation();
        settingsConfirm(e.currentTarget, () => {
            localStorage.removeItem('vk_mylist');
            showToast('My List cleared');
        });
    };

    document.getElementById('settings-clear-cache').onclick = e => {
        e.stopPropagation();
        settingsConfirm(e.currentTarget, () => {
            try { sessionStorage.clear(); } catch (_) { }
            showToast('Cache cleared');
        });
    };

    document.getElementById('settings-about').onclick = e => {
        e.stopPropagation();
        const dd = document.getElementById('account-dropdown');
        dd.classList.remove('open');
        document.getElementById('nav-avatar').classList.remove('open');
        showToast('Dert v1.0.0 — Free movie streaming powered by TMDB & Vidking');
    };

    document.getElementById('settings-sync').onclick = e => {
        e.stopPropagation();
        document.getElementById('account-dropdown').classList.remove('open');
        document.getElementById('nav-avatar').classList.remove('open');
        openSyncModal();
    };

    const playerText = document.getElementById('player-source-text');
    if (playerText) playerText.textContent = playerSource === 'vidking' ? 'Player: VidKing' : 'Player: VidEasy';

    const playerToggleBtn = document.getElementById('settings-toggle-player');
    if (playerToggleBtn) {
        playerToggleBtn.onclick = e => {
            e.stopPropagation();
            playerSource = playerSource === 'vidking' ? 'videasy' : 'vidking';
            localStorage.setItem('vk_player', playerSource);
            playerText.textContent = playerSource === 'vidking' ? 'Player: VidKing' : 'Player: VidEasy';
            showToast(`Player set to ${playerSource === 'vidking' ? 'VidKing' : 'VidEasy'}`);
        };
    }
}

let syncTimerInterval = null;

function openSyncModal() {
    const ov = document.getElementById('sync-overlay');
    const pinDisplay = document.getElementById('sync-pin-display');
    pinDisplay.textContent = '------';
    pinDisplay.classList.remove('active', 'copied');
    pinDisplay.removeAttribute('title');
    pinDisplay.onclick = null;
    pinDisplay.onkeydown = null;
    document.getElementById('sync-pin-timer').textContent = '';
    document.getElementById('sync-import-code').value = '';
    document.getElementById('sync-export-status').textContent = '';
    document.getElementById('sync-export-status').className = 'sync-status';
    document.getElementById('sync-import-status').textContent = '';
    document.getElementById('sync-import-status').className = 'sync-status';
    document.getElementById('sync-generate').disabled = false;
    document.getElementById('sync-generate').textContent = 'Generate PIN';
    if (syncTimerInterval) { clearInterval(syncTimerInterval); syncTimerInterval = null; }
    switchSyncTab('export');
    ov.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSyncModal() {
    document.getElementById('sync-overlay').classList.remove('active');
    document.body.style.overflow = '';
    if (syncTimerInterval) { clearInterval(syncTimerInterval); syncTimerInterval = null; }
}

function switchSyncTab(tab) {
    document.querySelectorAll('.sync-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('sync-export-panel').classList.toggle('hidden', tab !== 'export');
    document.getElementById('sync-import-panel').classList.toggle('hidden', tab !== 'import');
}

function getSyncData() {
    const data = {};
    const prefixes = ['vk_hist', 'vk_mylist', 'vk_p_'];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (prefixes.some(p => key.startsWith(p))) {
            try { data[key] = JSON.parse(localStorage.getItem(key)); } catch (_) { data[key] = localStorage.getItem(key); }
        }
    }
    return data;
}

async function generateSyncCode() {
    const status = document.getElementById('sync-export-status');
    const pinDisplay = document.getElementById('sync-pin-display');
    const timerEl = document.getElementById('sync-pin-timer');
    const btn = document.getElementById('sync-generate');

    if (IS_LOCAL) {
        status.textContent = 'Cloud sync requires deployment to Vercel';
        status.className = 'sync-status error';
        return;
    }

    const data = getSyncData();
    const keys = Object.keys(data);
    if (keys.length === 0) {
        status.textContent = 'No data to export';
        status.className = 'sync-status error';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner btn-spinner"></div> Uploading...';
    status.textContent = '';
    status.className = 'sync-status';

    try {
        const payload = JSON.stringify({ v: 1, t: Date.now(), d: data });
        const r = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: payload })
        });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error || 'Upload failed');

        pinDisplay.textContent = result.pin;
        pinDisplay.classList.add('active');
        pinDisplay.title = 'Click to copy';
        pinDisplay.onclick = () => {
            navigator.clipboard.writeText(result.pin).then(() => {
                const orig = pinDisplay.textContent;
                pinDisplay.textContent = 'COPIED';
                pinDisplay.classList.add('copied');
                showToast('PIN copied to clipboard!');
                setTimeout(() => {
                    if (pinDisplay.classList.contains('active')) {
                        pinDisplay.textContent = result.pin;
                        pinDisplay.classList.remove('copied');
                    }
                }, 1500);
            }).catch(() => {
                showToast('Failed to copy PIN');
            });
        };
        pinDisplay.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                pinDisplay.click();
            }
        };
        status.textContent = `${keys.length} item${keys.length > 1 ? 's' : ''} ready to sync`;
        status.className = 'sync-status success';
        btn.textContent = 'Generate New PIN';
        btn.disabled = false;

        if (syncTimerInterval) clearInterval(syncTimerInterval);
        let remaining = 600;
        timerEl.textContent = 'Expires in 10:00';
        syncTimerInterval = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(syncTimerInterval);
                syncTimerInterval = null;
                timerEl.textContent = 'PIN expired';
                pinDisplay.textContent = '------';
                pinDisplay.classList.remove('active', 'copied');
                pinDisplay.removeAttribute('title');
                pinDisplay.onclick = null;
                pinDisplay.onkeydown = null;
                status.textContent = 'PIN expired — generate a new one';
                status.className = 'sync-status error';
                return;
            }
            const m = Math.floor(remaining / 60);
            const s = String(remaining % 60).padStart(2, '0');
            timerEl.textContent = `Expires in ${m}:${s}`;
        }, 1000);
    } catch (e) {
        status.textContent = e.message || 'Failed to upload sync data';
        status.className = 'sync-status error';
        btn.textContent = 'Generate PIN';
        btn.disabled = false;
    }
}

async function importSyncCode() {
    const code = document.getElementById('sync-import-code').value.trim();
    const status = document.getElementById('sync-import-status');
    const btn = document.getElementById('sync-import-btn');

    if (IS_LOCAL) {
        status.textContent = 'Cloud sync requires deployment to Vercel';
        status.className = 'sync-status error';
        return;
    }

    if (!code || !/^\d{6}$/.test(code)) {
        status.textContent = 'Enter a 6-digit PIN';
        status.className = 'sync-status error';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<div class="spinner btn-spinner"></div> Syncing...';
    status.textContent = '';

    try {
        const r = await fetch(`/api/sync?code=${code}`);
        const result = await r.json();
        if (!r.ok) throw new Error(result.error || 'Sync failed');

        const parsed = JSON.parse(result.data);
        if (!parsed.d || typeof parsed.d !== 'object') throw new Error('Invalid data');

        let count = 0;
        Object.entries(parsed.d).forEach(([key, val]) => {
            if (key.startsWith('vk_')) {
                localStorage.setItem(key, typeof val === 'string' ? val : JSON.stringify(val));
                count++;
            }
        });

        status.textContent = `Synced ${count} item${count > 1 ? 's' : ''} successfully!`;
        status.className = 'sync-status success';
        showToast('Data synced successfully!');
        setTimeout(() => { closeSyncModal(); buildContinueRow(); }, 1500);
    } catch (e) {
        const msg = e.message === 'Code not found or expired'
            ? 'PIN not found or expired — try again'
            : (e.message || 'Sync failed');
        status.textContent = msg;
        status.className = 'sync-status error';
    } finally {
        btn.disabled = false;
        btn.textContent = 'Sync';
    }
}

(function wireSyncModal() {
    document.getElementById('sync-close').onclick = closeSyncModal;
    document.getElementById('sync-overlay').onclick = e => { if (e.target === e.currentTarget) closeSyncModal(); };
    document.querySelectorAll('.sync-tab').forEach(t => t.onclick = () => switchSyncTab(t.dataset.tab));
    document.getElementById('sync-generate').onclick = generateSyncCode;
    document.getElementById('sync-import-btn').onclick = importSyncCode;
    const codeInput = document.getElementById('sync-import-code');
    codeInput.oninput = () => { codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6); };
})();

function hideLoader() { setTimeout(() => document.getElementById('loader-screen').classList.add('hidden'), 800); }