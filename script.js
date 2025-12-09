// ===== Configuration =====
const CONFIG = {
    // API Endpoint
    CHEAPSHARK_API_BASE: 'https://www.cheapshark.com/api/1.0',

    CACHE_DURATION: 15 * 60 * 1000, // 15 minutes
    INITIAL_LOAD: 60,  // Show 60 initially
    LOAD_MORE_COUNT: 60,  // Load 60 more each time
    MAX_FETCH: 200,  // ⚡ Fetch 200 deals - fast loading, users can load more if needed

    // Offline backup
    OFFLINE_BACKUP_KEY: 'gamevault_offline_backup', // localStorage key for offline data
    OFFLINE_BACKUP_MAX_AGE: 7 * 24 * 60 * 60 * 1000 // 7 days
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
    popularGameDealIDs: [],  // Track dealIDs shown in "Most Popular" section to avoid duplicates
    filters: {
        search: '',
        store: savedFilters?.store || 'all',
        genre: savedFilters?.genre || 'all',
        discount: savedFilters?.discount || 0,
        maxPrice: savedFilters?.maxPrice || 100,
        sort: savedFilters?.sort || 'Most Popular'
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

// ===== Offline Backup Functions =====
function saveOfflineBackup(deals) {
    try {
        const backup = {
            deals: deals,
            timestamp: Date.now()
        };
        localStorage.setItem(CONFIG.OFFLINE_BACKUP_KEY, JSON.stringify(backup));
        console.log('✅ Offline backup saved:', deals.length, 'deals');
    } catch (error) {
        console.warn('Failed to save offline backup:', error);
    }
}

function loadOfflineBackup() {
    try {
        const backupStr = localStorage.getItem(CONFIG.OFFLINE_BACKUP_KEY);
        if (!backupStr) return null;

        const backup = JSON.parse(backupStr);
        const age = Date.now() - backup.timestamp;

        // Check if backup is too old (7 days)
        if (age > CONFIG.OFFLINE_BACKUP_MAX_AGE) {
            console.warn('Offline backup is too old, discarding');
            localStorage.removeItem(CONFIG.OFFLINE_BACKUP_KEY);
            return null;
        }

        console.log('📦 Loaded offline backup:', backup.deals.length, 'deals');
        return backup.deals;
    } catch (error) {
        console.warn('Failed to load offline backup:', error);
        return null;
    }
}

function showOfflineIndicator() {
    // Remove existing indicator if any
    hideOfflineIndicator();

    // Create offline mode banner
    const banner = document.createElement('div');
    banner.id = 'offline-indicator';
    banner.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
        color: white;
        padding: 12px 20px;
        text-align: center;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    `;
    banner.innerHTML = `
        📡 <strong>Offline Mode:</strong> Showing cached deals. You'll get fresh deals when back online.
    `;

    document.body.insertBefore(banner, document.body.firstChild);
    document.body.style.paddingTop = '48px'; // Adjust for banner height
}

function hideOfflineIndicator() {
    const indicator = document.getElementById('offline-indicator');
    if (indicator) {
        indicator.remove();
        document.body.style.paddingTop = '0';
    }
}

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
        // Fetch fresh deals from CheapShark
        const deals = await fetchDealsFromCheapShark();

        // Save to offline backup (localStorage)
        saveOfflineBackup(deals);

        // Hide offline mode indicator if showing
        hideOfflineIndicator();

        return deals;
    } catch (error) {
        console.error('Failed to fetch fresh deals, trying offline backup:', error);

        // Try to load from offline backup
        const offlineDeals = loadOfflineBackup();

        if (offlineDeals && offlineDeals.length > 0) {
            // Show offline mode indicator
            showOfflineIndicator();
            return offlineDeals;
        }

        // No backup available, throw error
        throw new Error('Unable to load deals - no internet connection and no offline backup available');
    }
}

// Fetch deals from CheapShark (Original method)
async function fetchDealsFromCheapShark() {
    try {
        const allDeals = [];
        const pageSize = 60;
        const maxPages = Math.ceil(CONFIG.MAX_FETCH / pageSize);

        for (let page = 0; page < maxPages; page++) {
            const response = await fetch(
                `${CONFIG.CHEAPSHARK_API_BASE}/deals?pageSize=${pageSize}&pageNumber=${page}&onSale=1`
            );

            if (!response.ok) break;
            const deals = await response.json();
            if (deals.length === 0) break;

            allDeals.push(...deals);
            if (deals.length < pageSize) break;
        }

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
                genres: []
            }));

        fetchGenresForDeals(enrichedDeals);

        state.cache.data = enrichedDeals;
        state.cache.timestamp = Date.now();

        return enrichedDeals;
    } catch (error) {
        throw error;
    }
}

// ===== Genre Detection =====
// Comprehensive genre keywords for title-based detection
const GENRE_KEYWORDS = {
    'Action': [
        'action', 'shooter', 'fps', 'tps', 'combat', 'fighting', 'beat em up', 'brawler',
        'hack and slash', 'slasher', 'gunplay', 'bullet hell', 'shmup', 'run and gun',
        'call of duty', 'battlefield', 'doom', 'halo', 'gears of war', 'mortal kombat',
        'street fighter', 'tekken', 'ninja gaiden', 'devil may cry', 'bayonetta'
    ],
    'RPG': [
        'rpg', 'role-playing', 'jrpg', 'crpg', 'arpg', 'mmorpg', 'dungeon crawler',
        'loot', 'leveling', 'character build', 'witcher', 'elder scrolls', 'skyrim',
        'fallout', 'final fantasy', 'dragon quest', 'persona', 'tales of', 'elden ring',
        'dark souls', 'bloodborne', 'mass effect', 'baldur', 'divinity', 'pathfinder'
    ],
    'Strategy': [
        'strategy', 'tactics', 'rts', 'turn-based', '4x', 'grand strategy', 'tower defense',
        'td', 'real-time strategy', 'tactical rpg', 'wargame', 'civilization', 'total war',
        'starcraft', 'age of empires', 'company of heroes', 'xcom', 'fire emblem',
        'advance wars', 'heroes of might', 'crusader kings', 'europa universalis'
    ],
    'Simulation': [
        'simulator', 'simulation', 'sim', 'tycoon', 'management', 'builder', 'city builder',
        'farming', 'flight sim', 'truck', 'bus', 'train', 'euro truck', 'farming simulator',
        'cities skylines', 'planet coaster', 'zoo tycoon', 'sims', 'stardew', 'harvest moon'
    ],
    'Sports': [
        'football', 'soccer', 'basketball', 'baseball', 'hockey', 'tennis', 'golf',
        'nba', 'nfl', 'fifa', 'nhl', 'mlb', 'madden', 'pes', 'pro evolution',
        'nba 2k', 'wwe', 'ufc', 'boxing', 'cricket', 'rugby'
    ],
    'Racing': [
        'racing', 'rally', 'kart', 'drift', 'motorsport', 'karting', 'formula',
        'f1', 'nascar', 'gt', 'gran turismo', 'forza', 'need for speed', 'nfs',
        'mario kart', 'burnout', 'dirt', 'wreckfest', 'assetto corsa', 'project cars'
    ],
    'Adventure': [
        'adventure', 'point and click', 'narrative', 'story-rich', 'cinematic',
        'walking simulator', 'exploration', 'tomb raider', 'uncharted', 'life is strange',
        'telltale', 'monkey island', 'grim fandango', 'broken sword', 'syberia'
    ],
    'Puzzle': [
        'puzzle', 'match-3', 'brain', 'logic', 'riddle', 'maze', 'sokoban',
        'portal', 'tetris', 'baba is you', 'witness', 'talos principle', 'myst',
        'puzzle quest', 'professor layton', 'picross', 'sudoku'
    ],
    'Horror': [
        'horror', 'survival horror', 'zombie', 'scary', 'fear', 'terror', 'creepy',
        'resident evil', 'silent hill', 'dead space', 'outlast', 'amnesia',
        'phasmophobia', 'dying light', 'left 4 dead', 'dead rising', 'evil within'
    ],
    'Survival': [
        'survival', 'crafting', 'building', 'sandbox survival', 'open world survival',
        'minecraft', 'terraria', 'ark', 'rust', 'valheim', 'subnautica', 'dont starve',
        'the forest', 'green hell', 'raft', 'stranded'
    ],
    'Indie': [
        'indie', 'pixel art', 'retro', '8-bit', '16-bit', 'roguelike', 'roguelite',
        'metroidvania', 'souls-like', 'soulslike'
    ],
    'Casual': [
        'casual', 'relaxing', 'chill', 'cozy', 'wholesome', 'family-friendly',
        'party game', 'mini-games'
    ],
    'Platformer': [
        'platformer', 'platform', 'metroidvania', 'side-scroller', '2d platformer',
        'mario', 'sonic', 'crash bandicoot', 'rayman', 'celeste', 'hollow knight',
        'ori and', 'super meat boy', 'shovel knight'
    ],
    'Shooter': [
        'shooter', 'fps', 'first-person shooter', 'third-person shooter', 'tps',
        'sniper', 'battle royale', 'extraction shooter', 'looter shooter',
        'borderlands', 'destiny', 'warframe', 'apex', 'pubg', 'fortnite', 'overwatch'
    ],
    'Stealth': [
        'stealth', 'assassin', 'infiltration', 'espionage', 'spy', 'hitman',
        'metal gear', 'splinter cell', 'dishonored', 'thief', 'aragami', 'styx'
    ],
    'Open World': [
        'open world', 'sandbox', 'free roam', 'gta', 'grand theft auto', 'red dead',
        'watch dogs', 'saints row', 'sleeping dogs', 'just cause', 'mafia'
    ],
    'MOBA': [
        'moba', 'multiplayer online battle arena', 'dota', 'league of legends', 'lol',
        'smite', 'heroes of the storm'
    ],
    'Card Game': [
        'card game', 'ccg', 'tcg', 'collectible card', 'deck builder', 'deckbuilding',
        'hearthstone', 'gwent', 'magic', 'mtg', 'slay the spire', 'monster train'
    ],
    'Co-op': [
        'co-op', 'coop', 'cooperative', 'multiplayer', 'local co-op', 'online co-op',
        'split-screen', '2-player', '4-player'
    ],
    'VR': [
        'vr', 'virtual reality', 'oculus', 'meta quest', 'vive', 'psvr', 'valve index'
    ]
};

async function fetchGenresForDeals(deals) {
    // Apply enhanced keyword-based genre detection for all games
    deals.forEach(deal => {
        const titleLower = deal.title.toLowerCase();
        const detectedGenres = [];

        // Check each genre's keywords with better matching
        for (const [genre, keywords] of Object.entries(GENRE_KEYWORDS)) {
            for (const keyword of keywords) {
                // For single words, require word boundaries to avoid false positives
                if (keyword.split(' ').length === 1 && keyword.length > 3) {
                    // Use word boundary regex for single-word keywords
                    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
                    if (regex.test(titleLower)) {
                        detectedGenres.push(genre);
                        break; // Found match for this genre, move to next
                    }
                } else {
                    // For phrases or short words, use simple includes
                    if (titleLower.includes(keyword)) {
                        detectedGenres.push(genre);
                        break; // Found match for this genre, move to next
                    }
                }
            }
        }

        // Assign detected genres (remove duplicates)
        if (detectedGenres.length > 0) {
            deal.genres = [...new Set(detectedGenres)];
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

    // Exclude games already shown in "Most Popular" section
    if (state.popularGameDealIDs.length > 0) {
        filtered = filtered.filter(deal => !state.popularGameDealIDs.includes(deal.dealID));
    }

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
        case 'Most Popular':
            return sorted.sort((a, b) => {
                // Sort by popularity score first
                const scoreA = getGamePopularityScore(a.title);
                const scoreB = getGamePopularityScore(b.title);

                if (scoreB !== scoreA) {
                    return scoreB - scoreA;
                }
                // If same popularity, sort by deal rating
                return b.dealRating - a.dealRating;
            });
        case 'Best Deals':
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

// Get platform icon based on store name
function getPlatformIcon(storeName) {
    const icons = {
        'Steam': '🎮',
        'GOG': '🎯',
        'Epic Games': '🎮',
        'Humble Store': '🎁',
        'Humble Bundle': '🎁',
        'GreenManGaming': '🟢',
        'Fanatical': '⚡',
        'GamersGate': '🎪',
        'Gamesplanet': '🌍',
        'Ubisoft Connect': '🔵',
        'EA App': '🎮',
        'Microsoft Store': '🪟',
        'GameBillet': '🎫',
        'WinGameStore': '🏆',
        'Direct2Drive': '💿',
        'IndieGala': '🎨',
        'Amazon': '📦'
    };

    return icons[storeName] || '🎮';
}

// Detect actual platform/launcher for the game
function detectPlatform(deal) {
    // Direct platform stores (store = platform)
    const directPlatforms = ['Steam', 'GOG', 'Epic Games', 'EA App', 'Ubisoft Connect', 'Microsoft Store'];

    if (directPlatforms.includes(deal.storeName)) {
        return { name: deal.storeName, icon: getPlatformIcon(deal.storeName) };
    }

    // Third-party stores - check if it's a Steam key
    if (deal.steamAppID && deal.steamAppID !== null && deal.steamAppID !== 'null') {
        return { name: 'Steam', icon: '🎮', note: 'via ' + deal.storeName };
    }

    // If unknown but from known third-party stores, likely Steam
    const thirdPartyStores = ['GreenManGaming', 'Fanatical', 'Humble Store', 'Humble Bundle', 'GamersGate',
                              'Gamesplanet', 'GameBillet', 'WinGameStore', 'IndieGala', 'Direct2Drive'];
    if (thirdPartyStores.includes(deal.storeName)) {
        return { name: 'Steam', icon: '🎮', note: 'via ' + deal.storeName };
    }

    // Fallback to store name
    return { name: deal.storeName, icon: getPlatformIcon(deal.storeName) };
}

function createGameCard(deal) {
    const discountPercent = Math.round(deal.savings);
    const dealRatingStars = '⭐'.repeat(Math.min(Math.round(deal.dealRating / 2), 5));

    // Get actual platform (not just store)
    const platform = detectPlatform(deal);

    // Sort alternative stores by price
    const altStores = deal.alternativeStores || [];
    const sortedAltStores = altStores.sort((a, b) => parseFloat(a.salePrice) - parseFloat(b.salePrice));

    return `
        <div class="game-card">
            <div onclick="openDeal('${deal.dealID}')" style="cursor: pointer;">
                <div style="position: relative;">
                    <img
                        src="${deal.thumb}"
                        alt="${deal.title}"
                        class="game-image"
                        loading="lazy"
                        onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 460 215%22><rect fill=%22%231A1A3E%22 width=%22460%22 height=%22215%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23B8B8D4%22 font-family=%22Arial%22 font-size=%2218%22>Game Image</text></svg>'"
                    />
                    <div class="platform-badge">${platform.icon} ${platform.name}</div>
                </div>
                <div class="game-content">
                    <h3 class="game-title">${escapeHtml(deal.title)}</h3>
                    <span class="game-store">${platform.note ? `📍 ${platform.note}` : ''} <span style="color: #4CAF50; font-size: 0.85em;">⭐ Best Price</span></span>

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
    state.filters.sort = 'Most Popular';

    // Reset all UI elements
    elements.searchInput.value = '';
    elements.storeFilter.value = 'all';
    elements.genreFilter.value = 'all';
    elements.discountFilter.value = '0';
    elements.priceFilter.value = '100';
    elements.sortFilter.value = 'Most Popular';

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

// ===== Most Popular Games =====
// Ranked by real-world popularity (Steam charts, Twitch, general awareness)
const POPULAR_GAMES_RANKED = {
    // Tier 1: Most popular (100+ points)
    'Counter-Strike': 100, 'CS:GO': 100, 'CS2': 100, 'Counter Strike': 100,
    'Grand Theft Auto': 95, 'GTA V': 95, 'GTA 5': 95, 'GTA VI': 95, 'GTA 6': 95,
    'Minecraft': 95,
    'Fortnite': 90,
    'Valorant': 90,
    'League of Legends': 90,
    'Dota 2': 85,
    'PUBG': 85, 'PlayerUnknown': 85,
    'Apex Legends': 85,
    'Call of Duty': 85, 'COD': 85, 'Modern Warfare': 85, 'Warzone': 85,

    // Tier 2: Very popular (70-84 points)
    'Elden Ring': 80,
    'Red Dead Redemption': 80,
    'The Witcher': 80,
    'Cyberpunk 2077': 75,
    'Overwatch': 75,
    'Rainbow Six Siege': 75,
    'Rocket League': 75,
    'Destiny 2': 75,
    'Battlefield': 75,
    'FC 24': 75, 'FC 25': 75, 'FIFA': 75,

    // Tier 3: Popular (50-69 points)
    'Hogwarts Legacy': 70,
    'Baldur\'s Gate': 70,
    'Dark Souls': 70,
    'Resident Evil': 65,
    'God of War': 65,
    'Spider-Man': 65,
    'Starfield': 60,
    'Palworld': 60,
    'Helldivers': 60,
    'Terraria': 55,
    'Stardew Valley': 55,
    'Rust': 55,
    'ARK': 55,
    'Dead by Daylight': 55,
    'Monster Hunter': 55,
    'Final Fantasy': 55,
    'Fallout': 50,
    'Skyrim': 50,
    'Elder Scrolls': 50
};

function getGamePopularityScore(title) {
    const titleLower = title.toLowerCase();
    let maxScore = 0;

    for (const [gameName, score] of Object.entries(POPULAR_GAMES_RANKED)) {
        if (titleLower.includes(gameName.toLowerCase())) {
            maxScore = Math.max(maxScore, score);
        }
    }

    return maxScore;
}

function isPopularGame(title) {
    return getGamePopularityScore(title) > 0;
}

function showMostPopularGames() {
    // Find popular games from the deals
    const popularDeals = state.allDeals
        .filter(deal => isPopularGame(deal.title))
        .sort((a, b) => {
            // Sort by deal rating first, then by discount
            if (b.dealRating !== a.dealRating) {
                return b.dealRating - a.dealRating;
            }
            return b.savings - a.savings;
        })
        .slice(0, 6); // Show up to 6 popular games

    if (popularDeals.length === 0) {
        state.popularGameDealIDs = [];
        return;
    }

    // Store dealIDs to exclude from main list
    state.popularGameDealIDs = popularDeals.map(deal => deal.dealID);

    const popularGamesSection = document.getElementById('popularGames');
    const popularGamesGrid = document.getElementById('popularGamesGrid');

    popularGamesGrid.innerHTML = popularDeals.map(deal => {
        const discountPercent = Math.round(deal.savings);
        return `
            <div class="popular-game-card" onclick="openDeal('${deal.dealID}')" style="cursor: pointer;">
                <div class="popular-badge">🔥 POPULAR</div>
                <img
                    src="${deal.thumb}"
                    alt="${escapeHtml(deal.title)}"
                    class="popular-game-image"
                    loading="eager"
                    onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 460 215%22><rect fill=%22%231A1A3E%22 width=%22460%22 height=%22215%22/><text x=%2250%25%22 y=%2250%25%22 dominant-baseline=%22middle%22 text-anchor=%22middle%22 fill=%22%23B8B8D4%22 font-family=%22Arial%22 font-size=%2218%22>Game Image</text></svg>'"
                />
                <div class="popular-game-content">
                    <h4 class="popular-game-title">${escapeHtml(deal.title)}</h4>
                    <span class="popular-game-store">📍 ${deal.storeName}</span>

                    <div class="popular-game-pricing">
                        <div class="popular-game-discount">-${discountPercent}%</div>
                        <div class="popular-game-prices">
                            <span class="popular-game-original">$${deal.normalPrice.toFixed(2)}</span>
                            <span class="popular-game-current">$${deal.salePrice.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Show the section
    popularGamesSection.style.display = 'block';
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

        // Show Most Popular Games
        showMostPopularGames();

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
            showMostPopularGames();
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
    // Refresh every 15 minutes (900000 milliseconds)
    refreshInterval = setInterval(autoRefreshDeals, 900000);
    console.log('Auto-refresh started: Updates every 15 minutes');
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
