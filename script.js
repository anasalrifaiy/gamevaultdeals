// ===== Configuration =====
const CONFIG = {
    API_BASE: 'https://www.cheapshark.com/api/1.0',
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
    INITIAL_LOAD: 60,  // Show 60 initially
    LOAD_MORE_COUNT: 60,  // Load 60 more each time
    MAX_FETCH: 300  // Fetch up to 300 deals total
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
        // Normalize multiple spaces to single space
        .replace(/\s+/g, ' ')
        // Remove leading/trailing punctuation and spaces
        .replace(/^[\s\-:]+|[\s\-:]+$/g, '');
}

// Deduplicate games - keep only the best deal per game title
function deduplicateDeals(deals) {
    const gameMap = new Map();

    deals.forEach(deal => {
        const titleKey = normalizeTitle(deal.title);
        const existing = gameMap.get(titleKey);

        if (!existing) {
            gameMap.set(titleKey, deal);
        } else {
            // Keep the deal with the lower sale price
            // If prices are equal, keep the one with better deal rating
            if (deal.salePrice < existing.salePrice ||
                (deal.salePrice === existing.salePrice && deal.dealRating > existing.dealRating)) {
                gameMap.set(titleKey, deal);
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

    // Deduplicate - show only the best deal per game
    filtered = deduplicateDeals(filtered);

    // Sort
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

    return `
        <div class="game-card" onclick="openDeal('${deal.dealID}')">
            <img
                src="${deal.thumb}"
                alt="${deal.title}"
                class="game-image"
                loading="lazy"
                onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 460 215%22><rect fill=%22%231A1A3E%22 width=%22460%22 height=%22215%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23B8B8D4%22 font-family=%22Arial%22 font-size=%2218%22>Game Image</text></svg>'"
            />
            <div class="game-content">
                <h3 class="game-title">${escapeHtml(deal.title)}</h3>
                <span class="game-store">${deal.storeName}</span>

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

// ===== Initialization =====
async function init() {
    try {
        setLoading(true);

        // Fetch deals
        const deals = await fetchDeals();
        state.allDeals = deals;

        // Update store filter with available stores
        updateStoreFilter();

        // Update genre filter (populated by keyword detection)
        updateGenreFilter();

        // Restore saved filter values to UI elements
        restoreSavedFiltersToUI();

        // Apply initial filters and render
        updateFiltersAndRender();

        // Setup event listeners
        setupEventListeners();

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
