// ===== Configuration =====
const CONFIG = {
    API_BASE: 'https://www.cheapshark.com/api/1.0',
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    INITIAL_LOAD: 60,  // Show 60 initially
    LOAD_MORE_COUNT: 60,  // Load 60 more each time
    MAX_FETCH: 600  // Fetch up to 600 deals (10 pages)
};

// Store names mapping (comprehensive list of legitimate PC game stores)
const STORE_NAMES = {
    '1': 'Steam',
    '2': 'GamersGate',
    '3': 'GreenManGaming',
    '4': 'Amazon',
    '5': 'GameStop',
    '6': 'Direct2Drive',
    '7': 'GOG',
    '8': 'EA App',
    '9': 'Humble Store',
    '10': 'Humble Widgets',
    '11': 'Humble Store',
    '12': 'Humble Monthly',
    '13': 'Ubisoft Connect',
    '14': 'IndieGala',
    '15': 'Fanatical',
    '16': 'Gamesrocket',
    '17': 'Games Republic',
    '18': 'SilaGames',
    '19': 'Playfield',
    '20': 'ImperialGames',
    '21': 'WinGameStore',
    '22': 'FunStockDigital',
    '23': 'GameBillet',
    '24': 'Voidu',
    '25': 'Epic Games',
    '26': '2Game',
    '27': 'Gamesplanet',
    '28': 'Gamesload',
    '29': 'Gamivo',
    '30': 'AllYouPlay',
    '31': 'AllYouPlay',
    '32': 'GamesPlanet FR',
    '33': 'DLGamer',
    '34': 'Noctre',
    '35': 'DreamGame'
};

// ===== State Management =====
const STORAGE_KEY = 'gamevault_filters';

// Load saved filters from localStorage
function loadSavedFilters() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            return JSON.parse(saved);
        }
    } catch (error) {
        // Ignore localStorage errors
    }
    return null;
}

// Save filters to localStorage
function saveFilters(filters) {
    try {
        const toSave = {
            store: filters.store,
            genre: filters.genre,
            discount: filters.discount,
            maxPrice: filters.maxPrice,
            sort: filters.sort
            // Intentionally not saving 'search' as it's too specific
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (error) {
        // Ignore localStorage errors (privacy mode, quota exceeded, etc.)
    }
}

// Restore saved filters to UI elements
function restoreSavedFiltersToUI() {
    if (savedFilters) {
        if (savedFilters.store) elements.storeFilter.value = savedFilters.store;
        if (savedFilters.genre) elements.genreFilter.value = savedFilters.genre;
        if (savedFilters.discount !== undefined) elements.discountFilter.value = String(savedFilters.discount);
        if (savedFilters.maxPrice !== undefined) elements.priceFilter.value = String(savedFilters.maxPrice);
        if (savedFilters.sort) elements.sortFilter.value = savedFilters.sort;
    }
}

// Initialize state with saved filters or defaults
const savedFilters = loadSavedFilters();
let state = {
    allDeals: [],
    filteredDeals: [],
    displayedCount: CONFIG.INITIAL_LOAD,  // Track how many to show
    filters: {
        search: '',
        store: savedFilters?.store || 'all',
        genre: savedFilters?.genre || 'all',
        discount: savedFilters?.discount || 0,
        maxPrice: savedFilters?.maxPrice || 100,
        sort: savedFilters?.sort || 'Deal Rating'
    },
    isLoading: false,
    cache: {
        data: null,
        timestamp: null
    },
    genreCache: {} // Cache for Steam API genre lookups
};

// ===== DOM Elements =====
const elements = {
    gamesGrid: document.getElementById('gamesGrid'),
    loading: document.getElementById('loading'),
    noResults: document.getElementById('noResults'),
    resultCount: document.getElementById('resultCount'),
    searchInput: document.getElementById('searchInput'),
    storeFilter: document.getElementById('storeFilter'),
    genreFilter: document.getElementById('genreFilter'),
    discountFilter: document.getElementById('discountFilter'),
    sortFilter: document.getElementById('sortFilter'),
    priceFilter: document.getElementById('priceFilter'),
    activeFilters: document.getElementById('activeFilters'),
    loadMoreBtn: document.getElementById('loadMoreBtn')
};

// ===== API Functions =====
async function fetchDeals() {
    // Check cache first
    if (state.cache.data && state.cache.timestamp) {
        const cacheAge = Date.now() - state.cache.timestamp;
        if (cacheAge < CONFIG.CACHE_DURATION) {
            return state.cache.data;
        }
    }

    try {
        const allDeals = [];
        const pageSize = 60; // API max per request
        const maxPages = Math.ceil(CONFIG.MAX_FETCH / pageSize); // Get 5 pages for 300 deals

        // Fetch multiple pages
        for (let page = 0; page < maxPages; page++) {
            const response = await fetch(
                `${CONFIG.API_BASE}/deals?pageSize=${pageSize}&pageNumber=${page}&onSale=1`
            );

            if (!response.ok) {
                break;
            }

            const deals = await response.json();

            if (deals.length === 0) {
                break;
            }

            allDeals.push(...deals);

            // If we got fewer than requested, there are no more pages
            if (deals.length < pageSize) {
                break;
            }
        }

        // Filter out deals without discounts and enrich data
        const enrichedDeals = allDeals
            .filter(deal => parseFloat(deal.savings) > 0)
            .map(deal => ({
                ...deal,
                dealID: deal.dealID,
                title: deal.title,
                storeID: deal.storeID,
                storeName: STORE_NAMES[deal.storeID] || `Store ${deal.storeID}`,
                salePrice: parseFloat(deal.salePrice),
                normalPrice: parseFloat(deal.normalPrice),
                savings: parseFloat(deal.savings),
                dealRating: parseFloat(deal.dealRating) || 0,
                thumb: deal.thumb,
                savingsAmount: parseFloat(deal.normalPrice) - parseFloat(deal.salePrice),
                steamAppID: deal.steamAppID || null,
                genres: [] // Will be populated by fetchGenres
            }));

        // Fetch genres for Steam games in background
        fetchGenresForDeals(enrichedDeals);

        // Cache the results
        state.cache.data = enrichedDeals;
        state.cache.timestamp = Date.now();

        return enrichedDeals;
    } catch (error) {
        throw error;
    }
}

// ===== Genre Detection =====
// Genre keywords for title-based detection
const GENRE_KEYWORDS = {
    'Action': ['action', 'shooter', 'fps', 'combat', 'fighting', 'beat em up', 'hack and slash'],
    'RPG': ['rpg', 'role-playing', 'jrpg', 'crpg', 'dungeon crawler'],
    'Strategy': ['strategy', 'tactics', 'rts', 'turn-based', '4x', 'grand strategy', 'tower defense'],
    'Simulation': ['simulator', 'simulation', 'tycoon', 'management', 'builder'],
    'Sports': ['football', 'soccer', 'basketball', 'nba', 'fifa', 'nhl', 'racing', 'rally', 'motorsport'],
    'Adventure': ['adventure', 'point and click', 'narrative', 'story-rich'],
    'Puzzle': ['puzzle', 'match-3', 'brain', 'logic'],
    'Horror': ['horror', 'survival horror', 'zombie', 'scary'],
    'Indie': ['indie'],
    'Casual': ['casual', 'relaxing', 'chill'],
    'Platformer': ['platformer', 'platform', 'metroidvania'],
    'Racing': ['racing', 'rally', 'kart', 'drift', 'f1', 'nascar']
};

async function fetchGenresForDeals(deals) {
    // Apply keyword-based genre detection for all games
    deals.forEach(deal => {
        const titleLower = deal.title.toLowerCase();
        const detectedGenres = [];

        // Check each genre's keywords
        for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
            if (keywords.some(keyword => titleLower.includes(keyword))) {
                detectedGenres.push(genre);
            }
        }

        // Assign detected genres
        if (detectedGenres.length > 0) {
            deal.genres = detectedGenres;
        }
    });

    // Update the genre filter immediately
    updateGenreFilter();
}

// ===== Filter & Sort Functions =====
// Normalize title for better deduplication matching
function normalizeTitle(title) {
    return title
        .toLowerCase()
        .trim()
        // Replace all types of dashes with standard dash
        .replace(/[–—―]/g, '-')
        // Remove trademark symbols and special characters
        .replace(/[™®©]/g, '')
        // Remove edition-specific terms to group different editions together
        .replace(/\b(deluxe|digital|standard|premium|ultimate|definitive|complete|goty|game of the year|collector's?|special|limited|enhanced|remastered|anniversary|gold|platinum|legendary|royal)\b/gi, '')
        // Remove "edition" word
        .replace(/\bedition\b/gi, '')
        // Remove year patterns like (2024), [2024], 2024
        .replace(/[\(\[]?\b20\d{2}\b[\)\]]?/g, '')
        // Remove version numbers like v1.0, 1.0, etc
        .replace(/\bv?\d+\.\d+\b/gi, '')
        // Normalize multiple spaces to single space
        .replace(/\s+/g, ' ')
        // Remove leading/trailing punctuation and spaces
        .replace(/^[\s\-:]+|[\s\-:]+$/g, '');
}

// Deduplicate games - group by title and track all stores
function deduplicateDeals(deals) {
    const gameMap = new Map();

    deals.forEach(deal => {
        const titleKey = normalizeTitle(deal.title);
        const existing = gameMap.get(titleKey);

        if (!existing) {
            // First occurrence - create entry with stores array
            gameMap.set(titleKey, {
                ...deal,
                alternativeStores: []
            });
        } else {
            // Game already exists - add this store as alternative
            const currentBestPrice = parseFloat(existing.salePrice);
            const newPrice = parseFloat(deal.salePrice);

            if (newPrice < currentBestPrice) {
                // New deal is cheaper - make it primary, old becomes alternative
                existing.alternativeStores.push({
                    storeName: existing.storeName,
                    storeID: existing.storeID,
                    salePrice: existing.salePrice,
                    normalPrice: existing.normalPrice,
                    savings: existing.savings,
                    dealID: existing.dealID
                });
                // Update primary deal
                Object.assign(existing, {
                    ...deal,
                    alternativeStores: existing.alternativeStores
                });
            } else {
                // Existing deal is cheaper - add new as alternative
                existing.alternativeStores.push({
                    storeName: deal.storeName,
                    storeID: deal.storeID,
                    salePrice: deal.salePrice,
                    normalPrice: deal.normalPrice,
                    savings: deal.savings,
                    dealID: deal.dealID
                });
            }
        }
    });

    return Array.from(gameMap.values());
}

function applyFilters() {
    let filtered = [...state.allDeals];

    // Search filter
    if (state.filters.search) {
        const searchLower = state.filters.search.toLowerCase();
        filtered = filtered.filter(deal =>
            deal.title.toLowerCase().includes(searchLower)
        );
    }

    // Store filter - ensure both values are strings for comparison
    if (state.filters.store !== 'all') {
        filtered = filtered.filter(deal => String(deal.storeID) === String(state.filters.store));
    }

    // Genre filter
    if (state.filters.genre !== 'all') {
        filtered = filtered.filter(deal =>
            deal.genres && deal.genres.length > 0 &&
            deal.genres.includes(state.filters.genre)
        );
    }

    // Discount filter
    if (state.filters.discount > 0) {
        filtered = filtered.filter(deal => deal.savings >= state.filters.discount);
    }

    // Price filter
    if (state.filters.maxPrice < 100) {
        filtered = filtered.filter(deal => deal.salePrice <= state.filters.maxPrice);
    }

    // Sort (deduplication already done when data was loaded)
    filtered = sortDeals(filtered, state.filters.sort);

    state.filteredDeals = filtered;
    return filtered;
}

// ===== Dynamic Store Filter =====
function updateStoreFilter() {
    // Count deals per store
    const storeCounts = {};
    state.allDeals.forEach(deal => {
        const storeId = String(deal.storeID);
        storeCounts[storeId] = (storeCounts[storeId] || 0) + 1;
    });

    // Get currently selected value
    const currentValue = elements.storeFilter.value;

    // Rebuild dropdown with only stores that have deals
    let options = '<option value="all">All Stores</option>';

    // Sort stores by deal count (descending)
    const sortedStores = Object.entries(storeCounts)
        .sort((a, b) => b[1] - a[1]);

    sortedStores.forEach(([storeId, count]) => {
        const storeName = STORE_NAMES[storeId] || 'Unknown Store';
        options += `<option value="${storeId}">${storeName} (${count})</option>`;
    });

    elements.storeFilter.innerHTML = options;

    // Restore selection if still valid
    if (currentValue !== 'all' && storeCounts[currentValue]) {
        elements.storeFilter.value = currentValue;
    }
}

// ===== Dynamic Genre Filter =====
function updateGenreFilter() {
    // Count deals per genre
    const genreCounts = {};
    state.allDeals.forEach(deal => {
        if (deal.genres && deal.genres.length > 0) {
            deal.genres.forEach(genre => {
                genreCounts[genre] = (genreCounts[genre] || 0) + 1;
            });
        }
    });

    // Get currently selected value
    const currentValue = elements.genreFilter.value;

    // Rebuild dropdown with only genres that have deals
    let options = '<option value="all">All Genres</option>';

    // Sort genres by deal count (descending)
    const sortedGenres = Object.entries(genreCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20); // Limit to top 20 genres to keep dropdown manageable

    sortedGenres.forEach(([genre, count]) => {
        options += `<option value="${genre}">${genre} (${count})</option>`;
    });

    elements.genreFilter.innerHTML = options;

    // Restore selection if still valid
    if (currentValue !== 'all' && genreCounts[currentValue]) {
        elements.genreFilter.value = currentValue;
    }
}

function sortDeals(deals, sortBy) {
    const sorted = [...deals];

    switch (sortBy) {
        case 'Deal Rating':
            return sorted.sort((a, b) => b.dealRating - a.dealRating);
        case 'Savings':
            return sorted.sort((a, b) => b.savings - a.savings);
        case 'Price':
            return sorted.sort((a, b) => a.salePrice - b.salePrice);
        case 'Recent':
            return sorted; // Already sorted by recent from API
        case 'Title':
            return sorted.sort((a, b) => a.title.localeCompare(b.title));
        default:
            return sorted;
    }
}

// ===== Render Functions =====
function renderGames(deals) {
    if (deals.length === 0) {
        elements.gamesGrid.style.display = 'none';
        elements.noResults.style.display = 'block';
        elements.resultCount.textContent = 'No deals found';
        elements.loadMoreBtn.style.display = 'none';
        return;
    }

    elements.gamesGrid.style.display = 'grid';
    elements.noResults.style.display = 'none';

    // Only show up to displayedCount items
    const dealsToShow = deals.slice(0, state.displayedCount);
    const totalDeals = deals.length;

    elements.resultCount.textContent = `Showing ${dealsToShow.length} of ${totalDeals} amazing deal${totalDeals !== 1 ? 's' : ''}`;

    elements.gamesGrid.innerHTML = dealsToShow.map(deal => createGameCard(deal)).join('');

    // Show/hide load more button
    if (dealsToShow.length < totalDeals) {
        elements.loadMoreBtn.style.display = 'block';
        const remaining = totalDeals - dealsToShow.length;
        const btnText = elements.loadMoreBtn.querySelector('.btn-text');
        if (btnText) {
            btnText.textContent = `Load More Deals (${remaining} remaining)`;
        }
    } else {
        elements.loadMoreBtn.style.display = 'none';
    }
}

function createGameCard(deal) {
    const discountPercent = Math.round(deal.savings);
    const dealRatingStars = '⭐'.repeat(Math.min(Math.round(deal.dealRating / 2), 5));

    // Sort alternative stores by price
    const altStores = deal.alternativeStores || [];
    const sortedAltStores = altStores.sort((a, b) => parseFloat(a.salePrice) - parseFloat(b.salePrice));

    return `
        <div class="game-card">
            <div onclick="openDeal('${deal.dealID}')" style="cursor: pointer;">
                <img
                    src="${deal.thumb}"
                    alt="${deal.title}"
                    class="game-image"
                    loading="lazy"
                    onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 460 215%22><rect fill=%22%231A1A3E%22 width=%22460%22 height=%22215%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23B8B8D4%22 font-family=%22Arial%22 font-size=%2218%22>Game Image</text></svg>'"
                />
                <div class="game-content">
                    <h3 class="game-title">${escapeHtml(deal.title)}</h3>
                    <span class="game-store">${deal.storeName} <span style="color: #4CAF50; font-size: 0.85em;">⭐ Best Price</span></span>

                    <div class="game-pricing">
                        <div class="game-discount">-${discountPercent}%</div>
                        <div class="game-price-box">
                            <span class="game-price-original">$${deal.normalPrice.toFixed(2)}</span>
                            <span class="game-price-current">$${deal.salePrice.toFixed(2)}</span>
                        </div>
                    </div>

                    <div class="game-savings">
                        Save $${deal.savingsAmount.toFixed(2)}
                    </div>

                    ${deal.dealRating > 0 ? `
                        <div class="game-deal-rating">
                            <span class="deal-stars">${dealRatingStars}</span>
                            <span>Deal Rating: ${deal.dealRating.toFixed(1)}</span>
                        </div>
                    ` : ''}
                </div>
            </div>

            ${sortedAltStores.length > 0 ? `
                <div class="alternative-stores">
                    <div class="alt-stores-header" onclick="toggleAltStores(this)">
                        <span>📍 Also available at ${sortedAltStores.length} other store${sortedAltStores.length > 1 ? 's' : ''}</span>
                        <span class="toggle-icon">▼</span>
                    </div>
                    <div class="alt-stores-list" style="display: none;">
                        ${sortedAltStores.map(alt => {
                            const altDiscount = Math.round(alt.savings);
                            const priceDiff = (parseFloat(alt.salePrice) - parseFloat(deal.salePrice)).toFixed(2);
                            return `
                                <div class="alt-store-item" onclick="openDeal('${alt.dealID}'); event.stopPropagation();">
                                    <div class="alt-store-name">${alt.storeName}</div>
                                    <div class="alt-store-price">
                                        <span class="alt-price">$${parseFloat(alt.salePrice).toFixed(2)}</span>
                                        <span class="alt-discount">-${altDiscount}%</span>
                                        ${priceDiff > 0 ? `<span class="price-diff">+$${priceDiff}</span>` : ''}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function openDeal(dealID) {
    const url = `https://www.cheapshark.com/redirect?dealID=${dealID}`;
    window.open(url, '_blank', 'noopener,noreferrer');
}

function toggleAltStores(header) {
    const list = header.nextElementSibling;
    const icon = header.querySelector('.toggle-icon');

    if (list.style.display === 'none') {
        list.style.display = 'block';
        icon.textContent = '▲';
    } else {
        list.style.display = 'none';
        icon.textContent = '▼';
    }
}

function updateActiveFilters() {
    const tags = [];

    if (state.filters.search) {
        tags.push({
            label: `Search: "${state.filters.search}"`,
            key: 'search'
        });
    }

    if (state.filters.store !== 'all') {
        tags.push({
            label: `Store: ${STORE_NAMES[state.filters.store]}`,
            key: 'store'
        });
    }

    if (state.filters.genre !== 'all') {
        tags.push({
            label: `Genre: ${state.filters.genre}`,
            key: 'genre'
        });
    }

    if (state.filters.discount > 0) {
        tags.push({
            label: `Min ${state.filters.discount}% discount`,
            key: 'discount'
        });
    }

    if (state.filters.maxPrice < 100) {
        tags.push({
            label: `Under $${state.filters.maxPrice}`,
            key: 'maxPrice'
        });
    }

    const clearFiltersBtn = document.getElementById('clearFiltersBtn');

    if (tags.length === 0) {
        elements.activeFilters.innerHTML = '';
        clearFiltersBtn.style.display = 'none';
        return;
    }

    clearFiltersBtn.style.display = 'inline-flex';
    elements.activeFilters.innerHTML = tags.map(tag => `
        <div class="filter-tag">
            ${tag.label}
            <button onclick="removeFilter('${tag.key}')" aria-label="Remove filter">×</button>
        </div>
    `).join('');
}

function removeFilter(filterKey) {
    switch (filterKey) {
        case 'search':
            state.filters.search = '';
            elements.searchInput.value = '';
            break;
        case 'store':
            state.filters.store = 'all';
            elements.storeFilter.value = 'all';
            break;
        case 'genre':
            state.filters.genre = 'all';
            elements.genreFilter.value = 'all';
            break;
        case 'discount':
            state.filters.discount = 0;
            elements.discountFilter.value = '0';
            break;
        case 'maxPrice':
            state.filters.maxPrice = 100;
            elements.priceFilter.value = '100';
            break;
    }

    updateFiltersAndRender();
}

function clearAllFilters() {
    // Reset all filters to default
    state.filters.search = '';
    state.filters.store = 'all';
    state.filters.genre = 'all';
    state.filters.discount = 0;
    state.filters.maxPrice = 100;
    state.filters.sort = 'Deal Rating';

    // Reset all UI elements
    elements.searchInput.value = '';
    elements.storeFilter.value = 'all';
    elements.genreFilter.value = 'all';
    elements.discountFilter.value = '0';
    elements.priceFilter.value = '100';
    elements.sortFilter.value = 'Deal Rating';

    updateFiltersAndRender();
}

function updateFiltersAndRender() {
    // Reset displayed count when filters change
    state.displayedCount = CONFIG.INITIAL_LOAD;
    const filtered = applyFilters();
    renderGames(filtered);
    updateActiveFilters();

    // Save filter preferences to localStorage
    saveFilters(state.filters);
}

// ===== Load More Function =====
function loadMoreDeals() {
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    const btnText = loadMoreBtn.querySelector('.btn-text');
    const originalText = 'Load More Deals';

    // Disable button and show loading state
    loadMoreBtn.disabled = true;
    loadMoreBtn.classList.add('loading');
    btnText.textContent = 'Loading...';

    // Simulate loading for better UX (even though rendering is instant)
    setTimeout(() => {
        state.displayedCount += CONFIG.LOAD_MORE_COUNT;
        renderGames(state.filteredDeals);

        // Reset button state
        loadMoreBtn.disabled = false;
        loadMoreBtn.classList.remove('loading');
        btnText.textContent = originalText;
    }, 300);
}

// ===== Loading State =====
function setLoading(isLoading) {
    state.isLoading = isLoading;
    if (isLoading) {
        elements.loading.classList.add('active');
        elements.gamesGrid.style.display = 'none';
        elements.noResults.style.display = 'none';
    } else {
        elements.loading.classList.remove('active');
    }
}

// ===== Event Listeners =====
function setupEventListeners() {
    // Search input with debounce
    let searchTimeout;
    elements.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            state.filters.search = e.target.value.trim();
            updateFiltersAndRender();
        }, 300);
    });

    // Store filter
    elements.storeFilter.addEventListener('change', (e) => {
        state.filters.store = e.target.value;
        updateFiltersAndRender();
    });

    // Genre filter
    elements.genreFilter.addEventListener('change', (e) => {
        state.filters.genre = e.target.value;
        updateFiltersAndRender();
    });

    // Discount filter
    elements.discountFilter.addEventListener('change', (e) => {
        state.filters.discount = parseInt(e.target.value);
        updateFiltersAndRender();
    });

    // Sort filter
    elements.sortFilter.addEventListener('change', (e) => {
        state.filters.sort = e.target.value;
        updateFiltersAndRender();
    });

    // Price filter
    elements.priceFilter.addEventListener('change', (e) => {
        state.filters.maxPrice = parseInt(e.target.value);
        updateFiltersAndRender();
    });

    // Smooth scrolling for navigation
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });
}

// ===== Statistics & Deal of the Day =====
function updateStatistics() {
    const totalDeals = state.allDeals.length;
    const avgDiscount = Math.round(
        state.allDeals.reduce((sum, deal) => sum + deal.savings, 0) / totalDeals
    );
    const uniqueStores = new Set(state.allDeals.map(d => d.storeID)).size;

    document.getElementById('totalDealsCount').textContent = totalDeals;
    document.getElementById('avgDiscountValue').textContent = `${avgDiscount}%`;
    document.getElementById('storeCount').textContent = `${uniqueStores}+`;
}

function showFreeGames() {
    // Find all free games (salePrice = 0)
    const freeGames = state.allDeals.filter(deal => parseFloat(deal.salePrice) === 0);

    if (freeGames.length === 0) return;

    const freeGamesSection = document.getElementById('freeGames');
    const freeGamesGrid = document.getElementById('freeGamesGrid');

    // Show up to 6 free games
    const gamesToShow = freeGames.slice(0, 6);

    // If only 1 free game, show it as a featured card (like Deal of the Day)
    if (gamesToShow.length === 1) {
        const game = gamesToShow[0];
        freeGamesGrid.className = 'free-games-featured';
        freeGamesGrid.innerHTML = `
            <div class="free-game-featured-card" onclick="openDeal('${game.dealID}')" style="cursor: pointer;">
                <img
                    src="${game.thumb}"
                    alt="${escapeHtml(game.title)}"
                    class="free-game-featured-image"
                    loading="eager"
                    onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 460 215%22><rect fill=%22%231A1A3E%22 width=%22460%22 height=%22215%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23B8B8D4%22 font-family=%22Arial%22 font-size=%2218%22>Game Image</text></svg>'"
                />
                <div class="free-game-featured-content">
                    <h3 class="free-game-featured-title">${escapeHtml(game.title)}</h3>
                    <span class="free-game-featured-store">📍 Available at ${game.storeName}</span>

                    <div class="free-game-featured-pricing">
                        <div class="free-game-featured-badge">
                            <div class="free-badge-large">100% OFF</div>
                        </div>
                        <div class="free-game-featured-prices">
                            <span class="free-game-featured-original">Was: $${game.normalPrice.toFixed(2)}</span>
                            <span class="free-game-featured-free">NOW FREE!</span>
                        </div>
                    </div>

                    <div class="free-game-featured-cta">
                        🎁 Claim This Free Game Now! 🎁
                    </div>
                </div>
            </div>
        `;
    } else {
        // Multiple games: use grid layout
        freeGamesGrid.className = 'free-games-grid';
        freeGamesGrid.innerHTML = gamesToShow.map(game => {
            return `
                <div class="free-game-card" onclick="openDeal('${game.dealID}')" style="cursor: pointer;">
                    <div class="free-badge">FREE</div>
                    <img
                        src="${game.thumb}"
                        alt="${escapeHtml(game.title)}"
                        class="free-game-image"
                        loading="lazy"
                        onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 460 215%22><rect fill=%22%231A1A3E%22 width=%22460%22 height=%22215%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23B8B8D4%22 font-family=%22Arial%22 font-size=%2218%22>Game Image</text></svg>'"
                    />
                    <div class="free-game-content">
                        <h4 class="free-game-title">${escapeHtml(game.title)}</h4>
                        <span class="free-game-store">📍 ${game.storeName}</span>
                        <div class="free-game-price">
                            <span class="free-game-original">$${game.normalPrice.toFixed(2)}</span>
                            <span class="free-game-free">FREE</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Show the section
    freeGamesSection.style.display = 'block';
}

function showDealOfTheDay() {
    // Find the deal with the highest discount percentage (75%+) and best rating
    // Exclude free games (they have their own section)
    const topDeals = state.allDeals
        .filter(deal => parseFloat(deal.salePrice) > 0 && deal.savings >= 75)
        .sort((a, b) => {
            // Sort by savings first, then by deal rating
            if (b.savings !== a.savings) {
                return b.savings - a.savings;
            }
            return b.dealRating - a.dealRating;
        });

    if (topDeals.length === 0) {
        // If no 75%+ deals, just get the highest discount (excluding free games)
        topDeals.push(...state.allDeals
            .filter(deal => parseFloat(deal.salePrice) > 0)
            .sort((a, b) => b.savings - a.savings));
    }

    const dealOfDay = topDeals[0];
    if (!dealOfDay) return;

    const discountPercent = Math.round(dealOfDay.savings);
    const savingsAmount = dealOfDay.savingsAmount.toFixed(2);

    const dealOfDaySection = document.getElementById('dealOfDay');
    const dealOfDayCard = document.getElementById('dealOfDayCard');

    dealOfDayCard.innerHTML = `
        <img
            src="${dealOfDay.thumb}"
            alt="${dealOfDay.title}"
            class="deal-of-day-image"
            loading="eager"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 460 215%22><rect fill=%22%231A1A3E%22 width=%22460%22 height=%22215%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23B8B8D4%22 font-family=%22Arial%22 font-size=%2218%22>Game Image</text></svg>'"
        />
        <div class="deal-of-day-content">
            <h3 class="deal-of-day-title">${escapeHtml(dealOfDay.title)}</h3>
            <span class="deal-of-day-store">${dealOfDay.storeName}</span>

            <div class="deal-of-day-pricing">
                <div class="deal-of-day-discount">-${discountPercent}%</div>
                <div class="deal-of-day-prices">
                    <span class="deal-of-day-original">$${dealOfDay.normalPrice.toFixed(2)}</span>
                    <span class="deal-of-day-current">$${dealOfDay.salePrice.toFixed(2)}</span>
                </div>
            </div>

            <div class="deal-of-day-savings">
                💰 You Save $${savingsAmount}! 💰
            </div>

            <a
                href="https://www.cheapshark.com/redirect?dealID=${dealOfDay.dealID}"
                target="_blank"
                rel="noopener noreferrer"
                class="deal-of-day-btn"
            >
                🔥 Get This Deal Now 🔥
            </a>
        </div>
    `;

    // Show the section
    dealOfDaySection.style.display = 'block';
}

// ===== Initialization =====
async function init() {
    try {
        setLoading(true);

        // Fetch deals
        const deals = await fetchDeals();

        // Deduplicate deals to show only unique games
        state.allDeals = deduplicateDeals(deals);

        // Update store filter with available stores
        updateStoreFilter();

        // Update genre filter (populated by keyword detection)
        updateGenreFilter();

        // Restore saved filter values to UI elements
        restoreSavedFiltersToUI();

        // Update statistics badges
        updateStatistics();

        // Show Deal of the Day
        showFreeGames();
        showDealOfTheDay();

        // Apply initial filters and render
        updateFiltersAndRender();

        // Setup event listeners
        setupEventListeners();

        // Start auto-refresh
        startAutoRefresh();

    } catch (error) {
        elements.resultCount.textContent = 'Failed to load deals. Please refresh the page.';
        elements.gamesGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
                <h3>Oops! Something went wrong</h3>
                <p>We couldn't load the deals. Please check your internet connection and refresh the page.</p>
                <button onclick="location.reload()" style="
                    margin-top: 1rem;
                    padding: 0.75rem 1.5rem;
                    background: var(--gradient-primary);
                    border: none;
                    border-radius: var(--radius-md);
                    color: white;
                    font-weight: 600;
                    cursor: pointer;
                    font-size: 1rem;
                ">Refresh Page</button>
            </div>
        `;
    } finally {
        setLoading(false);
    }
}

// ===== Auto-Refresh Functionality =====
let refreshInterval = null;

async function autoRefreshDeals() {
    try {
        console.log('Auto-refreshing deals...');

        // Save current scroll position
        const scrollPosition = window.pageYOffset;

        // Fetch fresh deals (will use cache if still valid)
        const deals = await fetchDeals();

        // Check if we got new data
        if (deals.length > 0) {
            // Deduplicate deals to show only unique games
            state.allDeals = deduplicateDeals(deals);

            // Update everything
            updateStoreFilter();
            updateGenreFilter();
            updateStatistics();
            showFreeGames();
            showDealOfTheDay();
            updateFiltersAndRender();

            // Restore scroll position
            window.scrollTo(0, scrollPosition);

            // Show notification
            showUpdateNotification();
        }
    } catch (error) {
        console.error('Auto-refresh failed:', error);
        // Silently fail - don't disturb the user
    }
}

function showUpdateNotification() {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = '✨ Deals updated with latest offers!';
    document.body.appendChild(notification);

    // Show notification
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);

    // Hide and remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

function startAutoRefresh() {
    // Refresh every 5 minutes (300000 milliseconds)
    refreshInterval = setInterval(autoRefreshDeals, 300000);
    console.log('Auto-refresh started: Updates every 5 minutes');
}

function stopAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
        refreshInterval = null;
        console.log('Auto-refresh stopped');
    }
}

// ===== Mobile Header Auto-Hide =====
let lastScrollTop = 0;
let scrollTimeout = null;

function handleHeaderScroll() {
    const header = document.querySelector('.header');
    const currentScroll = window.pageYOffset || document.documentElement.scrollTop;

    // Clear any existing timeout
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
    }

    // Don't hide header when at the top of the page
    if (currentScroll <= 100) {
        header.classList.remove('hidden');
        lastScrollTop = currentScroll;
        return;
    }

    // Scrolling down - hide header
    if (currentScroll > lastScrollTop && currentScroll > 100) {
        header.classList.add('hidden');
    }
    // Scrolling up - show header
    else if (currentScroll < lastScrollTop) {
        header.classList.remove('hidden');
    }

    lastScrollTop = currentScroll <= 0 ? 0 : currentScroll;
}

// Add scroll listener with throttling for better performance
window.addEventListener('scroll', function() {
    if (scrollTimeout) {
        clearTimeout(scrollTimeout);
    }
    scrollTimeout = setTimeout(handleHeaderScroll, 10);
}, { passive: true });

// ===== Back to Top Button =====
const backToTopButton = document.getElementById('backToTop');

function handleBackToTopButton() {
    const scrollPosition = window.pageYOffset || document.documentElement.scrollTop;

    if (scrollPosition > 500) {
        backToTopButton.classList.add('visible');
    } else {
        backToTopButton.classList.remove('visible');
    }
}

// Scroll to top smoothly when button is clicked
backToTopButton.addEventListener('click', function() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
});

// Show/hide button on scroll
window.addEventListener('scroll', handleBackToTopButton, { passive: true });

// ===== Start the App =====
// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ===== Expose functions to global scope for onclick handlers =====
window.openDeal = openDeal;
window.removeFilter = removeFilter;
window.clearAllFilters = clearAllFilters;
window.loadMoreDeals = loadMoreDeals;
