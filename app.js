/**
 * Inventory Manager - Frontend Application
 * Supports: Product Stock & Raw Materials
 */

// ============================================
// GLOBAL STATE
// ============================================

let APP_CONFIG = {
    scriptUrl: 'https://script.google.com/macros/s/AKfycbywptbw5CJ7mEu-xE6KID-eXSSiOybWnnOPc0xW5s1iU_PeHqYIpOj7bRUEE3UuqYlS/exec', // Hardcoded Inventory backend
    financeScriptUrl: 'https://script.google.com/macros/s/AKfycbwQ-dUZCdLUjLkejq_nfPOdGJew0pM8AbHh64fqUjW_ZDH9SUteKWykJH-5f3-pph2xzA/exec', // Hardcoded Finance backend
    userName: '',
    authCode: '',
    userRole: '',
    fullName: '',
    profilePicture: '',
    allowedPages: '*' // Comma separated list of allowed data-view values, or '*' for all
};

let productsData = [];
let materialsData = [];
let logsData = [];
let financeData = {
    transactions: [],
    categories: {}
};
let currentLogTab = 'product';
let currentView = 'dashboard';
let currentInventoryType = 'product';

// Chart.js instances
let expenseDoughnutChartInstance = null;
let incomeExpenseBarChartInstance = null;
let annualTrendChartInstance = null;
let annualSavingsChartInstance = null;

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    populateFinanceDateFilters(); // Populate dates first
    loadSettings();
    setupEventListeners();

    // Restore sidebar state
    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        document.getElementById('sidebar').classList.add('collapsed');
    }

    // For number inputs: restore 0 when left empty (works with placeholder approach)
    document.addEventListener('blur', (e) => {
        if (e.target.tagName === 'INPUT' && e.target.type === 'number') {
            if (e.target.value === '' || e.target.value.trim() === '') {
                e.target.value = '0';
            }
        }
    }, true);
});
// Define renderInventoryInsights before loadSettings or near other renders
function renderInventoryInsights(dashboardData) {
    const container = document.getElementById('inventoryInsights');
    if (!container) return;

    // Check if we have data
    if (!dashboardData || (!dashboardData.productSummary && !dashboardData.materialSummary)) {
        container.style.display = 'none';
        return;
    }

    const { productSummary, materialSummary, productDetails, materialDetails } = dashboardData;

    const totalProductsMoved = productSummary.in + productSummary.out;
    const totalMaterialsMoved = materialSummary.in + materialSummary.out;
    const activeProductsCount = productDetails.length;
    const activeMaterialsCount = materialDetails.length;

    container.innerHTML = `
        <div class="insight-item" title="Products with movements">
            <span class="insight-label">Active Products</span>
            <span class="insight-value highlight">${activeProductsCount}</span>
        </div>
        <div class="insight-item" title="Total Product In + Out">
            <span class="insight-label">Product Movements</span>
            <span class="insight-value">${Math.round(totalProductsMoved).toLocaleString()}</span>
        </div>
        <div class="insight-item" title="Materials with movements">
            <span class="insight-label">Active Materials</span>
            <span class="insight-value highlight">${activeMaterialsCount}</span>
        </div>
        <div class="insight-item" title="Total Material In + Out">
            <span class="insight-label">Material Movements</span>
            <span class="insight-value">${Math.round(totalMaterialsMoved).toLocaleString()}</span>
        </div>
    `;
    container.style.display = 'flex';
}

// Ensure settings loaded correctly
function loadSettings() {
    const savedUrl = localStorage.getItem('inventoryScriptUrl');
    const savedFinanceUrl = localStorage.getItem('financeScriptUrl');
    const savedName = sessionStorage.getItem('inventoryUserName');
    const savedCode = sessionStorage.getItem('inventoryAuthCode');
    const savedRole = sessionStorage.getItem('inventoryUserRole');
    const savedAllowedPages = sessionStorage.getItem('inventoryAllowedPages');

    if (savedUrl) {
        APP_CONFIG.scriptUrl = savedUrl;
    }
    if (savedFinanceUrl) {
        APP_CONFIG.financeScriptUrl = savedFinanceUrl;
    }

    // Ensure we have at least the hardcoded URLs if nothing is saved
    if (!APP_CONFIG.scriptUrl) {
        APP_CONFIG.scriptUrl = 'https://script.google.com/macros/s/AKfycbywptbw5CJ7mEu-xE6KID-eXSSiOybWnnOPc0xW5s1iU_PeHqYIpOj7bRUEE3UuqYlS/exec';
    }
    if (!APP_CONFIG.financeScriptUrl) {
        APP_CONFIG.financeScriptUrl = 'https://script.google.com/macros/s/AKfycbwQ-dUZCdLUjLkejq_nfPOdGJew0pM8AbHh64fqUjW_ZDH9SUteKWykJH-5f3-pph2xzA/exec';
    }

    if (APP_CONFIG.scriptUrl) {
        if (savedName && savedCode) {
            APP_CONFIG.userName = savedName;
            APP_CONFIG.authCode = savedCode;
            APP_CONFIG.userRole = savedRole || 'User';
            APP_CONFIG.allowedPages = savedAllowedPages || '*';
            APP_CONFIG.fullName = sessionStorage.getItem('inventoryUserFullName') || '';
            APP_CONFIG.profilePicture = sessionStorage.getItem('inventoryUserProfilePic') || '';

            showApp();
            updateUserDisplay();
            refreshData();
        } else {
            checkSheetConnection();
        }
    } else {
        showSetupModal();
    }
}

async function checkSheetConnection() {
    if (!APP_CONFIG.scriptUrl) return;

    showLoading(true);
    try {
        const response = await fetch(`${APP_CONFIG.scriptUrl}?action=checkConnection`);
        const data = await response.json();

        if (data.success) {
            if (data.hasUsers) {
                openModal('loginModal');
            } else {
                openModal('adminSetupModal');
            }
        } else {
            showToast('Connection error: ' + data.error, 'error');
            showSetupModal();
        }
    } catch (error) {
        console.error('Connection failed:', error);
        showToast('Could not connect to Google Script', 'error');
        showSetupModal();
    } finally {
        showLoading(false);
    }
}

function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const view = item.dataset.view;
            if (view) {
                e.preventDefault();
                switchView(view);
            } else if (item.classList.contains('dropdown-toggle')) {
                // Dropdown toggles use hover for pop-out, but prevent default if clicked
                e.preventDefault();
            }
        });
    });

    // Search
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            handleSearch(e.target.value);
        }, 300);
    });

    // Item Form
    // Removed old event listener as we use direct function call now

    // Log Entry Form
    document.getElementById('logEntryForm').addEventListener('submit', handleLogEntrySubmit);

    // Finance Category change listener for Transaction Modal
    const financeCatSelect = document.getElementById('financeCategory');
    if (financeCatSelect) {
        financeCatSelect.addEventListener('change', updateFinanceSubcategories);
    }
}

// ============================================
// SETTINGS & SETUP
// ============================================

function showSetupModal() {
    document.getElementById('app').classList.add('hidden');
    openModal('setupModal');
}

function showApp() {
    document.getElementById('app').classList.remove('hidden');
    document.getElementById('userNameDisplay').textContent = APP_CONFIG.userName;

    // Role-based navigation
    const navUsers = document.getElementById('navUsers');
    const navLogs = document.getElementById('navLogs');
    const navOverview = document.querySelector('a[data-view="overview"]');

    // Page-level access control
    const allowed = APP_CONFIG.allowedPages ? APP_CONFIG.allowedPages.split(',') : [];
    const isAllAllowed = APP_CONFIG.allowedPages === '*';

    console.log('[Access Control] allowedPages:', APP_CONFIG.allowedPages, '| isAllAllowed:', isAllAllowed, '| allowed array:', allowed);

    // Hide or show all nav items with data-view based on the checklist
    document.querySelectorAll('.nav-item').forEach(item => {
        const view = item.dataset.view;
        // Don't hide items without data-view (like the dropdown toggles) or users (handled later)
        if (view && view !== 'users') {
            if (isAllAllowed || allowed.includes(view + 'View')) {
                item.classList.remove('hidden');
            } else {
                item.classList.add('hidden');
            }
        }
    });

    // Hide dropdown containers if ALL their sub-items are hidden
    document.querySelectorAll('.nav-dropdown').forEach(dropdown => {
        const subItems = dropdown.querySelectorAll('.nav-item.sub-item');
        const allHidden = Array.from(subItems).every(item => item.classList.contains('hidden'));
        if (allHidden && subItems.length > 0) {
            dropdown.classList.add('hidden');
        } else {
            dropdown.classList.remove('hidden');
        }
    });

    // Reset specific visibility overrides
    navUsers.classList.add('hidden');

    // Restore last active view or default to dashboard
    const savedView = sessionStorage.getItem('currentView');
    const isViewAllowed = (v) => isAllAllowed || allowed.includes(v + 'View');

    if (savedView && isViewAllowed(savedView)) {
        switchView(savedView);
    } else {
        // Find first allowed view to show if default dashboard is not allowed
        if (isViewAllowed('dashboard')) {
            switchView('dashboard');
        } else if (allowed.length > 0) {
            switchView(allowed[0].replace('View', ''));
        }
    }

    if (APP_CONFIG.userRole === 'Admin') {
        navUsers.classList.remove('hidden');
    } else {
        // Hide settings for non-admins
        const settingsIds = ['sidebarSettingsBtn', 'headerSettingsBtn', 'alertSettingsBtn'];
        settingsIds.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.add('hidden');
        });

        // Hide Add Item and edit/delete logs for Editor & Viewers
        const addItemBtn = document.getElementById('addItemBtn');
        if (addItemBtn) addItemBtn.classList.add('hidden');

        // Hide Add, Select, and Edit buttons for Editor role
        const editorHiddenBtns = [
            'addProductBtn', 'addMaterialBtn',
            'logsSelectBtn',
            'financeSelectBtn'
        ];
        editorHiddenBtns.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.add('hidden');
        });
    }


    // Initialize overview dates
    const today = new Date().toISOString().split('T')[0];
    const osStart = document.getElementById('overviewStartDate');
    const osEnd = document.getElementById('overviewEndDate');
    if (osStart && !osStart.value) osStart.value = today;
    if (osEnd && !osEnd.value) osEnd.value = today;

    closeModal('setupModal');
}

function saveSettings() {
    const url = document.getElementById('scriptUrl').value.trim();
    const name = document.getElementById('userName').value.trim();

    if (!url || !name) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    if (!url.startsWith('https://script.google.com/')) {
        showToast('Invalid Google Apps Script URL', 'error');
        return;
    }

    APP_CONFIG.scriptUrl = url;
    APP_CONFIG.userName = name;

    localStorage.setItem('inventoryScriptUrl', url);
    localStorage.setItem('inventoryUserName', name);

    showApp();
    refreshData();
    refreshFinanceData();
    showToast('Connected successfully!', 'success');
}

function saveInitialSetup() {
    const url = document.getElementById('setupScriptUrl').value.trim();

    if (!url) {
        showToast('Please enter the Script URL', 'error');
        return;
    }

    if (!url.startsWith('https://script.google.com/')) {
        showToast('Invalid Google Apps Script URL', 'error');
        return;
    }

    APP_CONFIG.scriptUrl = url;
    localStorage.setItem('inventoryScriptUrl', url);

    closeModal('setupModal');
    checkSheetConnection();
}

async function handleAdminSetupSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('adminUsername').value.trim();
    const pin = document.getElementById('adminPin').value.trim();

    if (!username || !pin) {
        showToast('Username and password are required', 'error');
        return;
    }

    try {
        const response = await fetch(`${APP_CONFIG.scriptUrl}?action=setupAdmin`, {
            method: 'POST',
            body: JSON.stringify({ action: 'setupAdmin', data: JSON.stringify({ username, pin }) })
        });
        const result = await response.json();

        if (result.success) {
            showToast('Admin account created! Please login.', 'success');
            closeModal('adminSetupModal');
            openModal('loginModal');
        } else {
            showToast(result.error || 'Failed to create admin', 'error');
        }
    } catch (error) {
        showToast('Error setting up admin account', 'error');
    }
}

async function handleLoginSubmit(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const pin = document.getElementById('loginPin').value.trim();

    if (!username || !pin) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    showLoading(true);
    try {
        const response = await fetch(`${APP_CONFIG.scriptUrl}?action=login&data=${encodeURIComponent(JSON.stringify({ username, pin }))}`);
        const result = await response.json();

        if (result.success) {
            console.log('[Login] Backend returned allowedPages:', result.allowedPages);
            APP_CONFIG.userName = result.username;
            APP_CONFIG.authCode = pin;
            APP_CONFIG.userRole = result.role;
            APP_CONFIG.allowedPages = result.allowedPages || '*';
            APP_CONFIG.fullName = result.fullName || '';
            APP_CONFIG.profilePicture = result.profilePicture || '';

            sessionStorage.setItem('inventoryUserName', result.username);
            sessionStorage.setItem('inventoryAuthCode', pin);
            sessionStorage.setItem('inventoryUserRole', result.role);
            sessionStorage.setItem('inventoryAllowedPages', APP_CONFIG.allowedPages);
            sessionStorage.setItem('inventoryUserFullName', APP_CONFIG.fullName);
            sessionStorage.setItem('inventoryUserProfilePic', APP_CONFIG.profilePicture);

            sessionStorage.setItem('currentView', 'dashboard');
            closeModal('loginModal');
            showApp();
            updateUserDisplay();
            refreshData();
            showToast('Welcome back, ' + (APP_CONFIG.fullName || result.username) + '!', 'success');
        } else {
            showToast(result.error || 'Invalid credentials', 'error');
        }
    } catch (error) {
        showToast('Login failed. Please check your connection.', 'error');
    } finally {
        showLoading(false);
    }
}

function handleLogout() {
    showConfirmModal('Logout', 'Are you sure you want to logout?', () => {
        sessionStorage.removeItem('inventoryUserName');
        sessionStorage.removeItem('inventoryAuthCode');
        sessionStorage.removeItem('inventoryUserRole');
        sessionStorage.removeItem('inventoryAllowedPages');
        APP_CONFIG.userName = '';
        APP_CONFIG.authCode = '';
        APP_CONFIG.userRole = '';
        APP_CONFIG.allowedPages = '*';
        document.getElementById('app').classList.add('hidden');
        openModal('loginModal');
    }, 'Logout');
}

function openSettingsModal() {
    if (APP_CONFIG.userRole !== 'Admin') {
        showToast('Settings are only available for Administrators', 'error');
        return;
    }
    document.getElementById('settingsUrl').value = APP_CONFIG.scriptUrl;
    document.getElementById('settingsFinanceUrl').value = APP_CONFIG.financeScriptUrl || '';
    document.getElementById('settingsName').value = APP_CONFIG.userName;
    openModal('settingsModal');
}

function updateSettings() {
    const url = document.getElementById('settingsUrl').value.trim();
    const financeUrl = document.getElementById('settingsFinanceUrl').value.trim();
    const name = document.getElementById('settingsName').value.trim();

    if (!url || !name) {
        showToast('Inventory URL and Name are required', 'error');
        return;
    }

    APP_CONFIG.scriptUrl = url;
    APP_CONFIG.financeScriptUrl = financeUrl;
    APP_CONFIG.userName = name;

    localStorage.setItem('inventoryScriptUrl', url);
    localStorage.setItem('financeScriptUrl', financeUrl);
    localStorage.setItem('inventoryUserName', name);

    document.getElementById('userNameDisplay').textContent = name;

    closeModal('settingsModal');
    refreshData();
    if (financeUrl) refreshFinanceData();
    showToast('Settings updated!', 'success');
}

function clearSettings() {
    showConfirmModal('Disconnect Sheets', 'This will disconnect from all Google Sheets. Continue?', () => {
        localStorage.removeItem('inventoryScriptUrl');
        localStorage.removeItem('financeScriptUrl');
        localStorage.removeItem('inventoryUserName');
        APP_CONFIG.scriptUrl = '';
        APP_CONFIG.financeScriptUrl = '';
        APP_CONFIG.userName = '';
        closeModal('settingsModal');
        document.getElementById('app').classList.add('hidden');
        showSetupModal();
    });
}

// ============================================
// API CALLS
// ============================================

async function apiCall(params, url = APP_CONFIG.scriptUrl) {
    if (!url) {
        showToast('Script URL not configured', 'error');
        throw new Error('Script URL not configured');
    }

    showLoading(true);
    try {
        // Add auth parameters
        params.username = APP_CONFIG.userName;
        params.authCode = APP_CONFIG.authCode;

        // Use POST for all authenticated actions to support large payloads
        const response = await fetch(url, {
            method: 'POST',
            mode: 'cors',
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            },
            body: JSON.stringify(params)
        });

        const data = await response.json();

        if (!data.success) {
            if (data.error && data.error.includes('Unauthorized')) {
                handleLogout();
            }
            throw new Error(data.error || 'Unknown error');
        }

        return data;
    } catch (error) {
        console.error('API Error:', error);
        showToast('Error: ' + error.message, 'error');
        throw error;
    } finally {
        showLoading(false);
    }
}

async function refreshData(skipCache = false) {
    const warning = document.getElementById('connectionWarning');
    if (!APP_CONFIG.scriptUrl || APP_CONFIG.scriptUrl.includes('...')) {
        warning.classList.remove('hidden');
        return;
    } else {
        warning.classList.add('hidden');
    }

    // Try to load cached data first for instant display
    if (!skipCache) {
        const cachedData = localStorage.getItem('inventoryCache');
        const cacheTime = localStorage.getItem('inventoryCacheTime');
        const cacheAge = cacheTime ? (Date.now() - parseInt(cacheTime)) / 1000 / 60 : Infinity; // minutes

        if (cachedData && cacheAge < 30) { // Cache valid for 30 minutes
            try {
                const cached = JSON.parse(cachedData);
                productsData = cached.products || [];
                materialsData = cached.materials || [];

                updateDashboard();
                renderProductsTable();
                renderMaterialsTable();
                renderLowStockItems(cached.lowStock || [], cached.lowStockProductCount, cached.lowStockMaterialCount);

                console.log('Loaded from cache (age: ' + Math.round(cacheAge) + ' min)');

                // Refresh in background without loading indicator
                refreshDataInBackground();
                return;
            } catch (e) {
                console.warn('Cache parse error, fetching fresh data');
            }
        }
    }

    try {
        const response = await apiCall({ action: 'getDashboardData' });

        productsData = response.products || [];
        materialsData = response.materials || [];

        // Update UI
        updateDashboard();
        renderProductsTable();
        renderMaterialsTable();
        renderLowStockItems(response.lowStock || [], response.lowStockProductCount, response.lowStockMaterialCount);

        // Cache the data
        localStorage.setItem('inventoryCache', JSON.stringify({
            products: productsData,
            materials: materialsData,
            lowStock: response.lowStock || [],
            lowStockProductCount: response.lowStockProductCount,
            lowStockMaterialCount: response.lowStockMaterialCount
        }));
        localStorage.setItem('inventoryCacheTime', Date.now().toString());
    } catch (error) {
        console.error('Failed to refresh data:', error);
    }
}

// Background refresh without loading spinner
async function refreshDataInBackground() {
    try {
        const url = APP_CONFIG.scriptUrl;
        const params = {
            action: 'getDashboardData',
            username: APP_CONFIG.userName,
            authCode: APP_CONFIG.authCode
        };

        const response = await fetch(url, {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(params)
        });

        const data = await response.json();
        if (!data.success) return;

        productsData = data.products || [];
        materialsData = data.materials || [];

        updateDashboard();
        renderProductsTable();
        renderMaterialsTable();
        renderLowStockItems(data.lowStock || [], data.lowStockProductCount, data.lowStockMaterialCount);

        // Update cache
        localStorage.setItem('inventoryCache', JSON.stringify({
            products: productsData,
            materials: materialsData,
            lowStock: data.lowStock || [],
            lowStockProductCount: data.lowStockProductCount,
            lowStockMaterialCount: data.lowStockMaterialCount
        }));
        localStorage.setItem('inventoryCacheTime', Date.now().toString());
        console.log('Background refresh complete');
    } catch (error) {
        console.warn('Background refresh failed:', error);
    }
}

// Invalidate cache (call after any write operation)
function invalidateCache() {
    localStorage.removeItem('inventoryCache');
    localStorage.removeItem('inventoryCacheTime');
}

async function loadAllLowStock() {
    // Redundant - functionality moved into getDashboardData action
}

async function handleSearch(query) {
    if (!query.trim()) {
        renderProductsTable(productsData);
        renderMaterialsTable(materialsData);
        return;
    }

    try {
        if (currentView === 'products' || currentView === 'dashboard') {
            const data = await apiCall({ action: 'search', type: 'product', query: query });
            renderProductsTable(data.items || []);
        }
        if (currentView === 'materials' || currentView === 'dashboard') {
            const data = await apiCall({ action: 'search', type: 'material', query: query });
            renderMaterialsTable(data.items || []);
        }
    } catch (error) {
        console.error('Search failed:', error);
    }
}

// ============================================
// VIEW MANAGEMENT
// ============================================


function switchView(view) {
    const isAllAllowed = APP_CONFIG.allowedPages === '*';
    const allowed = APP_CONFIG.allowedPages ? APP_CONFIG.allowedPages.split(',') : [];

    // Redirect if page is not allowed
    if (!isAllAllowed && !allowed.includes(view + 'View')) {
        console.warn(`Access denied to ${view}`);
        // Find first allowed view
        if (allowed.length > 0) {
            switchView(allowed[0].replace('View', ''));
        }
        return;
    }

    currentView = view;
    sessionStorage.setItem('currentView', view);

    // Set current inventory type based on view
    if (view === 'products') {
        currentInventoryType = 'product';
    } else if (view === 'materials') {
        currentInventoryType = 'material';
    }

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        const isActive = item.dataset.view === view;
        item.classList.toggle('active', isActive);

        // If it's a sub-item and active, also highlight the parent dropdown toggle
        if (isActive && item.classList.contains('sub-item')) {
            const dropdown = item.closest('.nav-dropdown');
            if (dropdown) {
                dropdown.querySelector('.dropdown-toggle').classList.add('active');
            }
        }
    });

    // Special case: if we are not in an inventory view, make sure the dropdown toggle is not active
    const inventoryViews = ['overview', 'products', 'materials', 'logs', 'lowstock'];
    if (!inventoryViews.includes(view)) {
        const invToggle = document.querySelector('#inventoryDropdown .dropdown-toggle');
        if (invToggle) invToggle.classList.remove('active');
    }

    // Update views
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
    });

    const targetView = document.getElementById(view + 'View');
    if (targetView) {
        targetView.classList.add('active');
    }

    // Update title
    const titles = {
        overview: 'Overview',
        dashboard: 'Dashboard',
        products: 'Product Stock',
        materials: 'Raw Materials',
        logs: 'Stock Movement Logs',
        lowstock: 'Low Stock Alerts',
        users: 'User Management',
        financeOverview: 'Finance Overview',
        financeTransactions: 'Transaction Logs',
        financeAnnual: 'Annual Finance Report',
        financeSetup: 'Finance Configuration'
    };
    document.getElementById('pageTitle').textContent = titles[view] || 'Inventory';

    // Show/hide add button based on role and view
    const addItemBtn = document.getElementById('addItemBtn');
    const isViewer = APP_CONFIG.userRole === 'Viewer';

    const financeViews = ['financeOverview', 'financeTransactions', 'financeAnnual', 'financeSetup'];
    const nonAddViews = ['lowstock', 'users', 'overview', ...financeViews];

    if (addItemBtn) {
        if (nonAddViews.includes(view) || isViewer) {
            addItemBtn.classList.add('hidden');
        } else {
            addItemBtn.classList.remove('hidden');
        }
    }

    // Hide action buttons for Viewer role
    const addTransactionBtn = document.getElementById('addTransactionBtn');
    const financeSelectBtn = document.getElementById('financeSelectBtn');
    const addCategoryBtn = document.getElementById('addCategoryBtn');
    const addLogEntryBtn = document.getElementById('addLogEntryBtn');
    const logsSelectBtn = document.getElementById('logsSelectBtn');
    if (addTransactionBtn) addTransactionBtn.style.display = isViewer ? 'none' : '';
    if (financeSelectBtn) financeSelectBtn.style.display = isViewer ? 'none' : '';
    if (addCategoryBtn) addCategoryBtn.style.display = isViewer ? 'none' : '';
    if (addLogEntryBtn) addLogEntryBtn.style.display = isViewer ? 'none' : '';
    if (logsSelectBtn) logsSelectBtn.style.display = isViewer ? 'none' : '';

    if (view === 'users' && APP_CONFIG.userRole !== 'Admin') {
        switchView('dashboard');
        return;
    }

    if (view === 'logs') {
        refreshLogs();
    } else if (view === 'users') {
        refreshUsers();
    } else if (view === 'overview') {
        loadOverviewData();
    } else if (financeViews.includes(view)) {
        if (view === 'financeOverview' || view === 'financeAnnual') populateFinanceDateFilters();
        if (view === 'financeAnnual') renderFinanceAnnual();
        else refreshFinanceData();
    }

    // Reset select modes when switching pages
    if (financeSelectMode) {
        financeSelectMode = false;
        const fTable = document.getElementById('financeTransactionsTable');
        if (fTable) fTable.classList.remove('select-mode');
        const fBtn = document.getElementById('financeSelectBtn');
        if (fBtn) fBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> Select`;
        document.querySelectorAll('#financeTransactionsTable .row-checkbox').forEach(cb => cb.checked = false);
        const fSelectAll = document.getElementById('selectAllFinance');
        if (fSelectAll) fSelectAll.checked = false;
        const fBulkBar = document.getElementById('financeBulkActions');
        if (fBulkBar) fBulkBar.classList.add('hidden');
    }
    if (logsSelectMode) {
        logsSelectMode = false;
        const lTable = document.getElementById('logsTable');
        if (lTable) lTable.classList.remove('select-mode');
        const lBtn = document.getElementById('logsSelectBtn');
        if (lBtn) lBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> Select`;
        document.querySelectorAll('#logsTable .row-checkbox').forEach(cb => cb.checked = false);
        const lSelectAll = document.getElementById('selectAllLogs');
        if (lSelectAll) lSelectAll.checked = false;
        const lBulkBar = document.getElementById('logsBulkActions');
        if (lBulkBar) lBulkBar.classList.add('hidden');
    }
}

async function loadOverviewData() {
    let startDate = document.getElementById('overviewStartDate').value;
    let endDate = document.getElementById('overviewEndDate').value;

    if (!startDate || !endDate) return;

    showLoading(true);
    try {
        const result = await apiCall({
            action: 'getOverview',
            startDate: startDate,
            endDate: endDate
        });

        if (result.success) {
            // Update Summary
            document.getElementById('ovProductIn').textContent = result.productSummary.in.toFixed(0);
            document.getElementById('ovProductOut').textContent = result.productSummary.out.toFixed(0);
            document.getElementById('ovProductReturn').textContent = result.productSummary.return.toFixed(0);

            document.getElementById('ovMaterialIn').textContent = result.materialSummary.in.toFixed(3);
            document.getElementById('ovMaterialOut').textContent = result.materialSummary.out.toFixed(3);

            // Render Product List
            const productList = document.getElementById('ovProductList');
            if (result.productDetails.length === 0) {
                productList.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No movements found</td></tr>';
            } else {
                productList.innerHTML = result.productDetails.map(item => `
                    <tr>
                        <td><strong>${escapeHtml(item.name)}</strong></td>
                        <td class="text-center text-success">${item.in}</td>
                        <td class="text-center text-danger">${item.out}</td>
                        <td class="text-center text-warning">${item.return}</td>
                    </tr>
                `).join('');
            }

            // Render Material List
            const materialList = document.getElementById('ovMaterialList');
            if (result.materialDetails.length === 0) {
                materialList.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No movements found</td></tr>';
            } else {
                materialList.innerHTML = result.materialDetails.map(item => `
                    <tr>
                        <td><strong>${escapeHtml(item.name)}</strong></td>
                        <td class="text-center text-success">${item.in.toFixed(3)}</td>
                        <td class="text-center text-danger">${item.out.toFixed(3)}</td>
                    </tr>
                `).join('');
            }

            // Render Header Insights
            renderInventoryInsights(result);

        } else {
            showToast(result.error || 'Failed to load overview data', 'error');
        }
    } catch (error) {
        console.error('Error loading overview:', error);
        showToast('Error connecting to system', 'error');
    } finally {
        showLoading(false);
    }
}

// ============================================
// DASHBOARD
// ============================================

function updateDashboard() {
    const totalProducts = productsData.length;
    const totalMaterials = materialsData.length;

    const allItems = [...productsData, ...materialsData];
    const lowStockCount = allItems.filter(item => {
        const qty = parseFloat(item['Quantity']) || 0;
        const reorder = parseFloat(item['Reorder Level']) || 10;
        return qty <= reorder;
    }).length;

    const productValue = productsData.reduce((sum, item) => {
        const qty = parseFloat(item['Quantity']) || 0;
        const price = parseFloat(item['Unit Price']) || 0;
        return sum + (qty * price);
    }, 0);

    const materialValue = materialsData.reduce((sum, item) => {
        const qty = parseFloat(item['Quantity']) || 0;
        const price = parseFloat(item['Unit Price']) || 0;
        return sum + (qty * price);
    }, 0);

    document.getElementById('totalProducts').textContent = totalProducts;
    document.getElementById('totalMaterials').textContent = totalMaterials;
    document.getElementById('lowStockCount').textContent = lowStockCount;
    document.getElementById('totalProductValue').textContent = 'Rs' + productValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    document.getElementById('totalMaterialValue').textContent = 'Rs' + materialValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Update badge
    document.getElementById('lowStockBadge').textContent = lowStockCount;
    document.getElementById('lowStockBadge').style.display = lowStockCount > 0 ? 'inline' : 'none';

    // Render recent items
    renderRecentItems('recentProductsBody', productsData.slice(-5).reverse(), 'product');
    renderRecentItems('recentMaterialsBody', materialsData.slice(-5).reverse(), 'material');
}

function renderRecentItems(tbodyId, items, type) {
    const tbody = document.getElementById(tbodyId);

    if (items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" class="empty-state">
                    <div class="empty-state-text">No items yet</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = items.map(item => {
        const status = getStockStatus(item);
        const unit = item['Unit'] || 'pcs';
        const formattedQty = type === 'material' ? parseFloat(item['Quantity']).toFixed(3) : parseInt(item['Quantity']);
        return `
            <tr>
                <td><strong>${escapeHtml(item['Item Name'])}</strong></td>
                <td>${formattedQty} ${unit}</td>
                <td><span class="status ${status.class}">${status.label}</span></td>
            </tr>
        `;
    }).join('');
}

// ============================================
// PRODUCTS TABLE
// ============================================

function renderProductsTable(items = productsData) {
    const tbody = document.getElementById('productsTableBody');
    renderInventoryTable(tbody, items, 'product');
}

// ============================================
// MATERIALS TABLE
// ============================================

function renderMaterialsTable(items = materialsData) {
    const tbody = document.getElementById('materialsTableBody');
    renderInventoryTable(tbody, items, 'material');
}

// ============================================
// SHARED TABLE RENDERER
// ============================================

function renderInventoryTable(tbody, items, type) {
    const isViewer = APP_CONFIG.userRole === 'Viewer';
    const isAdmin = APP_CONFIG.userRole === 'Admin';
    const hideActions = !isAdmin; // Hide actions for both Editor and Viewer

    // Update table header visibility for action column
    const tableHeaders = tbody.closest('table').querySelector('thead tr');
    const actionHeader = tableHeaders.querySelector('th:last-child');
    if (actionHeader) { // Ensure actionHeader exists
        actionHeader.style.display = hideActions ? 'none' : '';
    }

    if (items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${hideActions ? 7 : 8}" class="empty-state">
                    <div class="empty-state-text">No items found</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = items.map(item => {
        const status = getStockStatus(item);
        const lastUpdated = formatDate(item['Last Updated']);
        const unit = item['Unit'] || 'pcs';

        const formattedQty = type === 'material' ? parseFloat(item['Quantity']).toFixed(3) : parseInt(item['Quantity']);

        return `
            <tr>
                <td><code>${item['Item ID']}</code></td>
                <td><strong>${escapeHtml(item['Item Name'])}</strong></td>
                <td>
                    <div class="qty-control">
                        ${isAdmin ? `<button class="qty-btn" onclick="quickAdjustItem('${item['Item ID']}', '${type}', 'remove')">−</button>` : ''}
                        <span class="qty-val">${formattedQty}</span>
                        ${isAdmin ? `<button class="qty-btn" onclick="quickAdjustItem('${item['Item ID']}', '${type}', 'add')">+</button>` : ''}
                    </div>
                </td>
                <td>${unit}</td>
                <td>Rs${parseFloat(item['Unit Price']).toFixed(2)}</td>
                <td>${item['Reorder Level']}</td>
                <td><span class="status ${status.class}">${status.label}</span></td>
                ${hideActions ? '' : `
                <td>
                    <div class="action-buttons">
                        <button class="btn-action" onclick="openEditModal('${item['Item ID']}', '${type}')" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </button>
                        <button class="btn-action delete" onclick="deleteItemConfirm('${item['Item ID']}', '${type}', '${escapeHtml(item['Item Name'])}')" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                    </div>
                </td>
                `}
            </tr>
        `;
    }).join('');
}

// ============================================
// LOW STOCK
// ============================================

function renderLowStockItems(items, productCount, materialCount) {
    // Dashboard alert
    const alertList = document.getElementById('lowStockList');
    const isViewer = APP_CONFIG.userRole === 'Viewer';

    if (items.length === 0) {
        alertList.innerHTML = '<div class="empty-state"><div class="empty-state-text">All items are well stocked!</div></div>';
    } else {
        alertList.innerHTML = items.map(item => {
            const type = item.inventoryType || 'product';
            const typeLabel = type === 'material' ? 'Material' : 'Product';
            const unit = item['Unit'] || 'pcs';
            const formattedQty = type === 'material' ? parseFloat(item['Quantity']).toFixed(3) : parseInt(item['Quantity']);
            const formattedReorder = type === 'material' ? parseFloat(item['Reorder Level']).toFixed(3) : parseInt(item['Reorder Level']);
            return `
                <div class="alert-item">
                    <span class="alert-item-type ${type}">${typeLabel}</span>
                    <span class="alert-item-name">${escapeHtml(item['Item Name'])}</span>
                    <span class="alert-item-qty">${formattedQty} / ${formattedReorder} ${unit}</span>
                    ${isViewer ? '' : `<button class="btn btn-sm btn-success" onclick="openStockModal('${item['ID'] || item['Item ID']}', '${type}', '${escapeHtml(item['Item Name'])}', ${item['Quantity']}, '${unit}')">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                        Restock
                    </button>`}
                </div>
            `;
        }).join('');
    }

    // Low stock view - Products
    const productsItems = items.filter(i => i.inventoryType === 'product');
    const productsBody = document.getElementById('lowStockProductsBody');
    renderLowStockTable(productsBody, productsItems, 'product');

    // Low stock view - Materials
    const materialsItems = items.filter(i => i.inventoryType === 'material');
    const materialsBody = document.getElementById('lowStockMaterialsBody');
    renderLowStockTable(materialsBody, materialsItems, 'material');
}

function renderLowStockTable(tbody, items, type) {
    // Update table header visibility for action column - always hide for low stock
    const tableHeaders = tbody.closest('table').querySelector('thead tr');
    const actionHeader = tableHeaders.querySelector('th:last-child');
    if (actionHeader) {
        actionHeader.style.display = 'none';
    }

    if (items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="empty-state">
                    <div class="empty-state-text">All ${type === 'material' ? 'materials' : 'products'} properly stocked!</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = items.map(item => {
        const shortage = Math.max(0, parseFloat(item['Reorder Level']) - parseFloat(item['Quantity']));
        const unit = item['Unit'] || 'pcs';
        const formattedQty = type === 'material' ? parseFloat(item['Quantity']).toFixed(3) : parseInt(item['Quantity']);
        const formattedReorder = type === 'material' ? parseFloat(item['Reorder Level']).toFixed(3) : parseInt(item['Reorder Level']);
        const formattedShortage = type === 'material' ? shortage.toFixed(3) : Math.ceil(shortage);

        return `
            <tr>
                <td><strong>${escapeHtml(item['Item Name'])}</strong></td>
                <td class="status-critical">
                    <span class="qty-val">${formattedQty} ${unit}</span>
                </td>
                <td>${formattedReorder} ${unit}</td>
                <td class="status-low">−${formattedShortage} ${unit}</td>
            </tr>
        `;
    }).join('');
}

// ============================================
// ITEM CRUD OPERATIONS
// ============================================

function openAddModal(preselectedType) {
    if (APP_CONFIG.userRole === 'Viewer') {
        showToast('Viewing only - adding items restricted', 'error');
        return;
    }
    document.getElementById('modalTitle').textContent = 'Add New Item';
    document.getElementById('submitBtn').textContent = 'Add Item';
    document.getElementById('itemForm').reset();
    document.getElementById('itemId').value = '';
    document.getElementById('itemReorderLevel').value = '10';

    // Show type selector and set default
    document.getElementById('itemTypeGroup').classList.remove('hidden');
    const typeSelect = document.getElementById('itemTypeSelect');

    // Pre-select type based on current view or parameter
    if (preselectedType) {
        typeSelect.value = preselectedType;
    } else if (currentView === 'materials') {
        typeSelect.value = 'material';
    } else {
        typeSelect.value = 'product';
    }

    // Set unit and step based on type
    const isMaterial = typeSelect.value === 'material';
    document.getElementById('itemUnit').value = isMaterial ? 'kg' : 'pcs';
    document.getElementById('itemQuantity').step = isMaterial ? '0.001' : '1';

    // Update unit and step when type changes
    typeSelect.onchange = function () {
        const material = this.value === 'material';
        document.getElementById('itemUnit').value = material ? 'kg' : 'pcs';
        document.getElementById('itemQuantity').step = material ? '0.001' : '1';
    };

    openModal('itemModal');
}

function openEditModal(id, type) {
    const items = type === 'material' ? materialsData : productsData;
    const item = items.find(i => i['Item ID'] === id);

    if (!item) {
        showToast('Item not found', 'error');
        return;
    }

    const typeLabel = type === 'material' ? 'Raw Material' : 'Product';

    document.getElementById('modalTitle').textContent = `Edit ${typeLabel}`;
    document.getElementById('submitBtn').textContent = 'Save Changes';
    document.getElementById('itemId').value = id;

    // Hide type selector when editing (can't change type)
    document.getElementById('itemTypeGroup').classList.add('hidden');
    document.getElementById('itemTypeSelect').value = type;

    document.getElementById('itemName').value = item['Item Name'];
    document.getElementById('itemQuantity').value = type === 'material' ? parseFloat(item['Quantity']).toFixed(3) : item['Quantity'];
    document.getElementById('itemQuantity').step = type === 'material' ? '0.001' : '1';
    document.getElementById('itemUnit').value = item['Unit'] || 'pcs';
    document.getElementById('itemPrice').value = item['Unit Price'];
    document.getElementById('itemReorderLevel').value = item['Reorder Level'];
    document.getElementById('itemReorderLevel').step = type === 'material' ? '0.001' : '1';

    openModal('itemModal');
}

async function triggerFormSubmit() {
    const form = document.getElementById('itemForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }

    const id = document.getElementById('itemId').value;
    const type = document.getElementById('itemTypeSelect').value || currentInventoryType;
    const data = {
        name: document.getElementById('itemName').value.trim(),
        quantity: document.getElementById('itemQuantity').value,
        unit: document.getElementById('itemUnit').value,
        price: document.getElementById('itemPrice').value,
        reorderLevel: document.getElementById('itemReorderLevel').value,
        user: APP_CONFIG.userName
    };

    if (!data.name) {
        showToast('Please enter item name', 'error');
        return;
    }

    try {
        if (id) {
            await apiCall({
                action: 'update',
                type: type,
                id: id,
                data: JSON.stringify(data)
            });
            showToast('Item updated successfully!', 'success');
        } else {
            await apiCall({
                action: 'add',
                type: type,
                data: JSON.stringify(data)
            });
            showToast('Item added successfully!', 'success');
        }

        closeModal('itemModal');
        invalidateCache();
        refreshData(true); // Skip cache, fetch fresh
    } catch (error) {
        console.error('Save failed:', error);
    }
}

async function deleteItemConfirm(id, type, name) {
    const typeLabel = type === 'material' ? 'material' : 'product';
    showConfirmModal('Delete Item', `Are you sure you want to delete ${typeLabel} "${name}"?`, async () => {
        try {
            await apiCall({ action: 'delete', type: type, id: id });
            showToast('Item deleted successfully!', 'success');
            invalidateCache();
            refreshData(true);
        } catch (error) {
            console.error('Delete failed:', error);
        }
    });
}

// ============================================
// STOCK MANAGEMENT
// ============================================

function openStockModal(id, type, name, currentQty, unit) {
    document.getElementById('stockItemId').value = id;
    document.getElementById('stockItemType').value = type;
    document.getElementById('stockItemName').textContent = name;
    document.getElementById('stockCurrent').textContent = type === 'material' ? parseFloat(currentQty).toFixed(3) : currentQty;
    document.getElementById('stockUnit').textContent = unit || 'pcs';
    document.getElementById('stockAmount').value = 1;
    document.getElementById('stockAmount').step = type === 'material' ? '0.001' : '1';
    openModal('stockModal');
}

async function quickAdjust(adjustType) {
    const id = document.getElementById('stockItemId').value;
    const type = document.getElementById('stockItemType').value;
    const amount = parseFloat(document.getElementById('stockAmount').value) || 1;

    try {
        const result = await apiCall({
            action: 'adjustStock',
            type: type,
            id: id,
            quantity: amount,
            adjustType: adjustType,
            user: APP_CONFIG.userName
        });

        document.getElementById('stockCurrent').textContent = result.newQuantity;
        showToast(`Stock ${adjustType === 'add' ? 'added' : 'removed'} successfully!`, 'success');
        refreshData();
    } catch (error) {
        console.error('Stock adjustment failed:', error);
    }
}

async function quickAdjustItem(id, type, adjustType) {
    try {
        await apiCall({
            action: 'adjustStock',
            type: type,
            id: id,
            quantity: 1,
            adjustType: adjustType,
            user: APP_CONFIG.userName
        });

        showToast(`Stock ${adjustType === 'add' ? 'added' : 'removed'}!`, 'success');
        refreshData();
    } catch (error) {
        console.error('Quick adjust failed:', error);
    }
}

async function quickRestockItem(id, type, amount) {
    try {
        await apiCall({
            action: 'adjustStock',
            type: type,
            id: id,
            quantity: amount,
            adjustType: 'add',
            user: APP_CONFIG.userName
        });

        showToast(`Restocked +${amount} units!`, 'success');
        refreshData();
    } catch (error) {
        console.error('Restock failed:', error);
    }
}

// ============================================
// STOCK MOVEMENT LOGS
// ============================================

async function switchLogTab(type) {
    currentLogTab = type;

    // Update tab-btn active state
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const isActive = (type === 'product' && btn.textContent.includes('Product')) ||
            (type === 'material' && btn.textContent.includes('Material'));
        btn.classList.toggle('active', isActive);
    });

    await refreshLogs();
}

async function refreshLogs() {
    const tbody = document.getElementById('logsTableBody');
    const isAdmin = APP_CONFIG.userRole === 'Admin';

    // Show loading state
    tbody.innerHTML = `
        <tr>
            <td colspan="${isAdmin ? 8 : 7}" class="empty-state">
                <div class="spinner-small" style="margin: 0 auto 10px;"></div>
                <div>Loading logs...</div>
            </td>
        </tr>
    `;

    try {
        const result = await apiCall({
            action: 'getLogs',
            type: currentLogTab
        });
        logsData = result.logs || [];
        renderLogsTable();
    } catch (error) {
        console.error('Failed to fetch logs:', error);
        tbody.innerHTML = `
            <tr>
                <td colspan="${isAdmin ? 8 : 7}" class="empty-state">
                    <div class="empty-state-text" style="color: var(--danger);">
                        Error loading logs: ${escapeHtml(error.message)}<br>
                        <button class="btn btn-sm btn-secondary" onclick="refreshLogs()" style="margin-top: 10px;">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px;"><path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/></svg>
                            Try Again
                        </button>
                    </div>
                </td>
            </tr>
        `;
        showToast('Failed to load logs', 'error');
    }
}

function renderLogsTable() {
    const tbody = document.getElementById('logsTableBody');
    const isAdmin = APP_CONFIG.userRole === 'Admin';

    // Show/hide actions header
    const actionsHeader = document.getElementById('logActionsHeader');
    if (actionsHeader) actionsHeader.style.display = isAdmin ? '' : 'none';

    if (logsData.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${isAdmin ? 8 : 7}" class="empty-state">
                    <div class="empty-state-text">No movement logs found</div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = logsData.map(log => {
        const inQty = log['Stock In'] || 0;
        const outQty = log['Stock Out'] || 0;
        const returnQty = log['Returns'] || 0;
        const logId = log['Log ID'];

        const formattedIn = inQty > 0 ? (currentLogTab === 'material' ? parseFloat(inQty).toFixed(3) : parseInt(inQty)) : '—';
        const formattedOut = outQty > 0 ? (currentLogTab === 'material' ? parseFloat(outQty).toFixed(3) : parseInt(outQty)) : '—';
        const formattedReturns = returnQty > 0 ? (currentLogTab === 'material' ? parseFloat(returnQty).toFixed(3) : parseInt(returnQty)) : '—';
        const formattedBalance = currentLogTab === 'material' ? parseFloat(log['Balance After']).toFixed(3) : parseInt(log['Balance After']);

        return `
            <tr data-id="${logId}">
                <td class="checkbox-col logs-checkbox-col"><input type="checkbox" class="row-checkbox" onchange="updateBulkActionsVisibility('logs')"></td>
                <td>${formatDate(log['Date']).split(',')[0]}</td>
                <td><strong>${escapeHtml(log['Item Name'])}</strong></td>
                <td class="${inQty > 0 ? 'status-ok' : ''}">${inQty > 0 ? '+' + formattedIn : '—'}</td>
                <td class="${outQty > 0 ? 'status-critical' : ''}">${outQty > 0 ? '−' + formattedOut : '—'}</td>
                <td class="${returnQty > 0 ? 'status-ok' : ''}">${returnQty > 0 ? '+' + formattedReturns : '—'}</td>
                <td>${formattedBalance}</td>
                <td class="text-muted"><small>${escapeHtml(log['Notes'] || '—')}</small></td>
                <td><small>${escapeHtml(log['User'])}</small></td>
                ${isAdmin ? `
                <td>
                    <div class="action-buttons">
                        <button class="btn-action" onclick="openEditLogModal('${logId}')" title="Edit Log">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                        </button>
                        <button class="btn-action delete" onclick="deleteLogConfirm('${logId}')" title="Delete Log">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                        </button>
                    </div>
                </td>
                ` : ''}
            </tr>
        `;
    }).join('');

    // Reset select all checkbox
    const selectAll = document.getElementById('selectAllLogs');
    if (selectAll) selectAll.checked = false;
    updateBulkActionsVisibility('logs');
}

function openLogEntryModal() {
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('logDate').value = today;

    // Set current log tab as default inventory type
    document.getElementById('logItemType').value = currentLogTab;

    // Load items for bulk entry
    loadBulkLogItems();

    openModal('logEntryModal');
}

async function loadBulkLogItems() {
    const type = document.getElementById('logItemType').value;
    const tbody = document.getElementById('bulkLogList');

    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Loading items...</td></tr>';

    // Batch Management Integration
    const batchArea = document.getElementById('batchSelectionArea');
    if (type === 'material') {
        batchArea.classList.remove('hidden');
        renderBatchList();
    } else {
        batchArea.classList.add('hidden');
    }

    try {
        const result = await apiCall({
            action: 'getItemsForDropdown',
            type: type
        });

        if (result.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No items found</td></tr>';
        } else {
            tbody.innerHTML = result.items.map(item => `
                <tr class="bulk-log-row" data-id="${item.id}" data-name="${item.name}">
                    <td>
                        <strong>${escapeHtml(item.name)}</strong><br>
                        <small class="text-muted">Current: ${type === 'material' ? parseFloat(item.quantity).toFixed(3) : item.quantity} ${item.unit}</small>
                    </td>
                    <td><input type="number" class="bulk-in" min="0" placeholder="0" step="${type === 'material' ? '0.001' : '1'}"></td>
                    <td><input type="number" class="bulk-out" min="0" placeholder="0" step="${type === 'material' ? '0.001' : '1'}"></td>
                    <td><input type="number" class="bulk-returns" min="0" placeholder="0" step="${type === 'material' ? '0.001' : '1'}"></td>
                    <td><input type="text" class="bulk-notes" placeholder="Notes"></td>
                </tr>
            `).join('');
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Error loading items</td></tr>';
        console.error('Failed to load items for bulk entry:', error);
    }
}

function openEditLogModal(logId) {
    const log = logsData.find(l => l['Log ID'] === logId);
    if (!log) return;

    document.getElementById('editLogId').value = logId;
    document.getElementById('editLogType').value = currentLogTab;

    // Parse date for input type=date
    let dateStr = log['Date'];
    if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        dateStr = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
    } else {
        const d = new Date(dateStr);
        // Extract local year, month, day to avoid UTC timezone shifts
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
    }

    document.getElementById('editLogDate').value = dateStr;

    // Set values: use empty string for 0 so placeholder shows
    const stockIn = parseFloat(log['Stock In']) || 0;
    const stockOut = parseFloat(log['Stock Out']) || 0;
    const returns = parseFloat(log['Returns']) || 0;

    document.getElementById('editLogStockIn').value = stockIn === 0 ? '' : stockIn;
    document.getElementById('editLogStockIn').step = currentLogTab === 'material' ? '0.001' : '1';
    document.getElementById('editLogStockOut').value = stockOut === 0 ? '' : stockOut;
    document.getElementById('editLogStockOut').step = currentLogTab === 'material' ? '0.001' : '1';
    document.getElementById('editLogReturns').value = returns === 0 ? '' : returns;
    document.getElementById('editLogReturns').step = currentLogTab === 'material' ? '0.001' : '1';
    document.getElementById('editLogNotes').value = log['Notes'] || '';

    openModal('editLogModal');
}

async function handleEditLogSubmit(e) {
    e.preventDefault();
    const logId = document.getElementById('editLogId').value;
    const type = document.getElementById('editLogType').value;

    const data = {
        date: document.getElementById('editLogDate').value,
        stockIn: parseFloat(document.getElementById('editLogStockIn').value) || 0,
        stockOut: parseFloat(document.getElementById('editLogStockOut').value) || 0,
        returns: parseFloat(document.getElementById('editLogReturns').value) || 0,
        notes: document.getElementById('editLogNotes').value.trim(),
        user: APP_CONFIG.userName
    };

    try {
        await apiCall({
            action: 'updateLogEntry',
            type: type,
            id: logId,
            data: JSON.stringify(data)
        });

        showToast('Log entry updated successfully', 'success');
        closeModal('editLogModal');
        refreshLogs();
        refreshData(); // Sync inventory data after log update
    } catch (error) {
        console.error('Log update failed:', error);
    }
}

async function deleteLogConfirm(logId) {
    showConfirmModal('Delete Log Entry', 'Are you sure you want to delete this log entry? Current stock will be adjusted accordingly.', async () => {
        try {
            await apiCall({
                action: 'deleteLogEntry',
                type: currentLogTab,
                id: logId,
                user: APP_CONFIG.userName
            });

            showToast('Log entry deleted and stock adjusted', 'success');
            refreshLogs();
            refreshData(); // Sync inventory data after log deletion
        } catch (error) {
            console.error('Log deletion failed:', error);
            showToast('System error deleting log', 'error');
        }
    });
}

// ============================================
// USER MANAGEMENT
// ============================================

async function refreshUsers() {
    try {
        const result = await apiCall({ action: 'getUsers' });
        renderUsersTable(result.users || []);
    } catch (error) {
        console.error('Failed to fetch users:', error);
    }
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    const isViewer = APP_CONFIG.userRole === 'Viewer'; // Viewer role cannot manage users

    // Update table header visibility for action column
    const tableHeaders = tbody.closest('table').querySelector('thead tr');
    const actionHeader = tableHeaders.querySelector('th:last-child');
    if (actionHeader) { // Ensure actionHeader exists
        actionHeader.style.display = isViewer ? 'none' : '';
    }

    if (users.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isViewer ? 5 : 6}" class="empty-state">No users found</td></tr>`;
        return;
    }

    tbody.innerHTML = users.map(user => `
        <tr>
            <td><strong>${escapeHtml(user['Username'])}</strong></td>
            <td>${escapeHtml(user['Full Name'] || '-')}</td>
            <td><span class="status ${user['Role'] === 'Admin' ? 'status-ok' : 'status-low'}">${user['Role']}</span></td>
            <td><code>${user['Access Pin']}</code></td>
            <td><small>${formatDate(user['Created At'])}</small></td>
            ${isViewer ? '' : `
            <td>
                <div class="action-buttons">
                    <button class="btn-action" onclick="openUserModal('${user['User ID']}')" title="Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button class="btn-action delete" onclick="deleteUserConfirm('${user['User ID']}', '${escapeHtml(user['Username'])}')" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </div>
            </td>
            `}
        </tr>
    `).join('');
}

function toggleAllowedPages() {
    const role = document.getElementById('mgmtRole').value;
    const group = document.getElementById('allowedPagesGroup');
    if (role === 'Admin') {
        group.style.display = 'none';
        // Check all by default for visual consistency though backend handles it
        document.querySelectorAll('.page-checkbox').forEach(cb => cb.checked = true);
    } else {
        group.style.display = 'block';
    }
}

let allUsersData = []; // Helper to store users for editing

async function openUserModal(userId = null) {
    document.getElementById('userForm').reset();
    document.getElementById('mgmtUserId').value = userId || '';
    document.getElementById('mgmtFullName').value = '';

    if (userId) {
        document.getElementById('userModalTitle').textContent = 'Edit User';
        document.getElementById('userSubmitBtn').textContent = 'Save Changes';

        // Fetch current data for editing
        try {
            const result = await apiCall({ action: 'getUsers' });
            const user = result.users.find(u => u['User ID'] === userId);
            if (user) {
                document.getElementById('mgmtFullName').value = user['Full Name'] || '';
                document.getElementById('mgmtUsername').value = user['Username'];
                document.getElementById('mgmtPin').value = user['Access Pin'];
                document.getElementById('mgmtRole').value = user['Role'];

                // Set allowed pages checkboxes
                const allowedPagesStr = user['Allowed Pages'] || '*';
                const isAllAllowed = allowedPagesStr === '*';
                const allowedArr = allowedPagesStr.split(',');

                document.querySelectorAll('.page-checkbox').forEach(cb => {
                    cb.checked = isAllAllowed || allowedArr.includes(cb.value);
                });
            }
        } catch (error) {
            showToast('Error loading user data', 'error');
        }
    } else {
        document.getElementById('userModalTitle').textContent = 'Create User';
        document.getElementById('userSubmitBtn').textContent = 'Create User';

        // Default to all checked for new users
        document.querySelectorAll('.page-checkbox').forEach(cb => cb.checked = true);
    }

    toggleAllowedPages();
    openModal('userModal');
}

async function handleUserFormSubmit(e) {
    e.preventDefault();
    const userId = document.getElementById('mgmtUserId').value;
    const role = document.getElementById('mgmtRole').value;

    // Gather allowed pages
    let allowedPages = '*';
    if (role !== 'Admin') {
        const checkedBoxes = Array.from(document.querySelectorAll('.page-checkbox:checked'));
        if (checkedBoxes.length === 0) {
            showToast('Please select at least one allowed page for this role.', 'error');
            return;
        }
        allowedPages = checkedBoxes.map(cb => cb.value).join(',');
    }

    const data = {
        fullName: document.getElementById('mgmtFullName').value.trim(),
        username: document.getElementById('mgmtUsername').value.trim(),
        pin: document.getElementById('mgmtPin').value.trim(),
        role: role,
        allowedPages: allowedPages
    };

    if (!data.username || !data.pin) {
        showToast('Username and password are required', 'error');
        return;
    }

    try {
        if (userId) {
            await apiCall({ action: 'updateUser', id: userId, data: JSON.stringify(data) });
            showToast('User updated successfully', 'success');
        } else {
            await apiCall({ action: 'addUser', data: JSON.stringify(data) });
            showToast('User created successfully', 'success');
        }
        closeModal('userModal');
        refreshUsers();
    } catch (error) {
        console.error('User save failed:', error);
    }
}

async function deleteUserConfirm(userId, username) {
    if (APP_CONFIG.userName === username) {
        showToast('You cannot delete your own account', 'error');
        return;
    }

    showConfirmModal('Delete User', `Are you sure you want to delete user "${username}"?`, async () => {
        try {
            await apiCall({ action: 'deleteUser', id: userId });
            showToast('User deleted successfully', 'success');
            refreshUsers();
        } catch (error) {
            console.error('Delete failed:', error);
        }
    });
}

async function handleLogEntrySubmit(e) {
    e.preventDefault();

    const date = document.getElementById('logDate').value;
    const type = document.getElementById('logItemType').value;
    const rows = document.querySelectorAll('.bulk-log-row');
    const entries = [];

    console.log('handleLogEntrySubmit called');
    console.log('Date:', date, 'Type:', type);
    console.log('Found rows:', rows.length);

    rows.forEach((row, idx) => {
        const itemId = row.dataset.id;
        const rawIn = row.querySelector('.bulk-in').value;
        const rawOut = row.querySelector('.bulk-out').value;
        const rawReturns = row.querySelector('.bulk-returns').value;

        const stockIn = parseFloat(rawIn) || 0;
        const stockOut = parseFloat(rawOut) || 0;
        const returns = parseFloat(rawReturns) || 0;
        const notes = row.querySelector('.bulk-notes').value.trim();

        console.log(`Row ${idx}: itemId=${itemId}, rawIn='${rawIn}', rawOut='${rawOut}', stockIn=${stockIn}, stockOut=${stockOut}, returns=${returns}`);

        if (stockIn > 0 || stockOut > 0 || returns > 0) {
            entries.push({
                itemId,
                stockIn,
                stockOut,
                returns,
                notes
            });
        }
    });

    console.log('Entries to submit:', entries.length, entries);

    if (entries.length === 0) {
        showToast('Please enter stock changes for at least one item', 'error');
        return;
    }

    try {
        console.log('Calling API with action: addBulkLogEntries');
        const result = await apiCall({
            action: 'addBulkLogEntries',
            type: type,
            data: JSON.stringify({
                date,
                user: APP_CONFIG.userName,
                entries
            })
        });
        console.log('API result:', result);

        showToast(`Successfully saved ${entries.length} log entries!`, 'success');
        closeModal('logEntryModal');

        // Refresh data and logs
        invalidateCache();
        refreshData(true);
        if (currentView === 'logs') {
            refreshLogs();
        }
    } catch (error) {
        console.error('Bulk log submission failed:', error);
    }
}

// ============================================
// MODAL MANAGEMENT
// ============================================

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Close modal on outside click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        const id = e.target.id;
        if (id !== 'loginModal' && id !== 'setupModal' && id !== 'adminSetupModal') {
            e.target.classList.remove('active');
        }
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            if (modal.id !== 'setupModal' && modal.id !== 'loginModal' && modal.id !== 'adminSetupModal') {
                modal.classList.remove('active');
            }
        });
    }
});

// ============================================
// UTILITIES
// ============================================

function getStockStatus(item) {
    const qty = parseFloat(item['Quantity']) || 0;
    const reorder = parseFloat(item['Reorder Level']) || 10;

    if (qty === 0) {
        return { label: 'Out of Stock', class: 'status-critical' };
    } else if (qty <= reorder) {
        return { label: 'Low Stock', class: 'status-low' };
    } else {
        return { label: 'In Stock', class: 'status-ok' };
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '—';

    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch {
        return dateStr;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(show) {
    document.getElementById('loadingOverlay').classList.toggle('hidden', !show);
}

// ------ CUSTOM CONFIRM MODAL ------
let confirmAppCallback = null;

function showConfirmModal(title, message, callback, confirmText = 'Confirm', confirmStyle = 'danger') {
    document.getElementById('confirmModalTitle').textContent = title;
    document.getElementById('confirmModalMessage').textContent = message;

    const btn = document.getElementById('confirmModalBtn');
    btn.textContent = confirmText;
    btn.className = `btn btn-${confirmStyle}`;

    confirmAppCallback = callback;
    openModal('confirmAppModal');
}

function closeConfirmModal() {
    closeModal('confirmAppModal');
    confirmAppCallback = null;
}

function executeConfirmAction() {
    if (confirmAppCallback) {
        confirmAppCallback();
    }
    closeConfirmModal();
}
// -----------------------------------

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    toast.className = 'toast show ' + type;
    toastMessage.textContent = message;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const btn = input.nextElementSibling;
    const isPassword = input.type === 'password';

    input.type = isPassword ? 'text' : 'password';

    // Update icon style to show active state
    if (input.type === 'text') {
        btn.style.color = 'var(--accent-blue)';
    } else {
        btn.style.color = 'var(--text-muted)';
    }
}
function updateUserDisplay() {
    const nameDisplay = document.getElementById('userNameDisplay');
    const avatarContent = document.getElementById('userAvatarContent');

    if (nameDisplay) {
        nameDisplay.textContent = APP_CONFIG.fullName || APP_CONFIG.userName || 'User';
    }

    if (avatarContent) {
        if (APP_CONFIG.profilePicture) {
            avatarContent.innerHTML = `<img src="${APP_CONFIG.profilePicture}" alt="Profile">`;
        } else {
            avatarContent.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            `;
        }
    }
}

// ============================================
// PROFILE MANAGEMENT
// ============================================

let currentProfileImageBase64 = '';

function openProfileModal() {
    document.getElementById('profileFullName').value = APP_CONFIG.fullName || '';
    document.getElementById('profileUsername').value = APP_CONFIG.userName || '';
    document.getElementById('profilePin').value = '';

    currentProfileImageBase64 = APP_CONFIG.profilePicture || '';
    updateProfilePreview();

    openModal('profileModal');
}

function previewProfilePic(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Show loading toast for compression
    showToast('Processing image...', 'info');

    const reader = new FileReader();
    reader.onload = (e) => {
        resizeImage(e.target.result, 128, 128, (compressedBase64) => {
            currentProfileImageBase64 = compressedBase64;
            updateProfilePreview();
            showToast('Image ready!', 'success');
        });
    };
    reader.readAsDataURL(file);
}

function resizeImage(base64Str, maxWidth, maxHeight, callback) {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
        const canvas = document.createElement('canvas');

        // Target: Square aspect ratio
        const size = Math.min(img.width, img.height);
        const sourceX = (img.width - size) / 2;
        const sourceY = (img.height - size) / 2;

        canvas.width = maxWidth;
        canvas.height = maxHeight;

        const ctx = canvas.getContext('2d');

        // Draw the center-cropped square from the source image onto the canvas
        ctx.drawImage(img, sourceX, sourceY, size, size, 0, 0, maxWidth, maxHeight);

        // Convert to highly compressed JPEG to ensure it fits in Sheet cell (50k chars)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        callback(compressedBase64);
    };
}

function updateProfilePreview() {
    const preview = document.getElementById('profilePicPreview');
    const removeBtn = document.getElementById('removePhotoBtn');

    if (currentProfileImageBase64) {
        preview.innerHTML = `<img src="${currentProfileImageBase64}" alt="Preview">`;
        if (removeBtn) removeBtn.style.display = 'inline-block';
    } else {
        preview.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="profile-placeholder"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        `;
        if (removeBtn) removeBtn.style.display = 'none';
    }
}

function removeProfilePic() {
    currentProfileImageBase64 = '';
    updateProfilePreview();
}

async function handleProfileUpdate(event) {
    event.preventDefault();

    const fullName = document.getElementById('profileFullName').value.trim();
    const newUsername = document.getElementById('profileUsername').value.trim();
    const newPin = document.getElementById('profilePin').value.trim();

    const profileData = {
        fullName: fullName,
        newUsername: newUsername !== APP_CONFIG.userName ? newUsername : undefined,
        newPin: newPin || undefined,
        profilePicture: currentProfileImageBase64
    };

    showLoading(true);
    try {
        const result = await apiCall({
            action: 'updateProfile',
            data: JSON.stringify(profileData)
        });

        if (result.success) {
            // Update global config and session storage
            APP_CONFIG.fullName = fullName;
            if (profileData.newUsername) APP_CONFIG.userName = newUsername;
            if (profileData.newPin) APP_CONFIG.authCode = newPin;
            APP_CONFIG.profilePicture = currentProfileImageBase64;

            sessionStorage.setItem('inventoryUserName', APP_CONFIG.userName);
            sessionStorage.setItem('inventoryAuthCode', APP_CONFIG.authCode);
            sessionStorage.setItem('inventoryUserFullName', APP_CONFIG.fullName);
            sessionStorage.setItem('inventoryUserProfilePic', APP_CONFIG.profilePicture);

            updateUserDisplay();
            closeModal('profileModal');
            showToast('Profile updated successfully!', 'success');
        } else {
            showToast(result.error || 'Failed to update profile', 'error');
        }
    } catch (error) {
        showToast('System error updating profile', 'error');
    } finally {
        showLoading(false);
    }
}
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
    localStorage.setItem('sidebarCollapsed', sidebar.classList.contains('collapsed'));
}

// ============================================
// EXPORT & DOWNLOAD
// ============================================

/**
 * Downloads a CSV file of low stock items
 * @param {string} type - 'product' or 'material'
 */
function downloadLowStockCSV(type) {
    const data = type === 'material' ? materialsData : productsData;
    const lowStockItems = data.filter(item => {
        const qty = parseFloat(item['Quantity']) || 0;
        const reorder = parseFloat(item['Reorder Level']) || 10;
        return qty <= reorder;
    });

    if (lowStockItems.length === 0) {
        showToast(`No low stock ${type === 'material' ? 'materials' : 'products'} found to download.`, 'info');
        return;
    }

    // Define CSV headers and mapping
    const headers = ['Item Name', 'Current Quantity', 'Unit', 'Reorder Level', 'Shortage'];
    const rows = lowStockItems.map(item => {
        const qty = parseFloat(item['Quantity']) || 0;
        const reorder = parseFloat(item['Reorder Level']) || 0;
        const shortage = Math.max(0, reorder - qty);
        const formattedQty = type === 'material' ? qty.toFixed(3) : Math.floor(qty);
        const formattedShortage = type === 'material' ? shortage.toFixed(3) : Math.ceil(shortage);

        return [
            item['Item Name'],
            formattedQty,
            item['Unit'] || 'pcs',
            item['Reorder Level'],
            formattedShortage
        ];
    });

    // Create CSV content
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];

    link.setAttribute('href', url);
    link.setAttribute('download', `low_stock_${type}s_${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Low stock ${type}s CSV downloaded successfully!`, 'success');
}

/**
 * Downloads a CSV file of all items (Products or Materials)
 * @param {string} type - 'product' or 'material'
 */
function downloadFullCSV(type) {
    const data = type === 'material' ? materialsData : productsData;

    if (data.length === 0) {
        showToast(`No ${type === 'material' ? 'materials' : 'products'} found to download.`, 'info');
        return;
    }

    // Define CSV headers and mapping
    const headers = ['Item ID', 'Item Name', 'Quantity', 'Unit', 'Unit Price', 'Reorder Level', 'Last Updated'];
    const rows = data.map(item => [
        item['Item ID'],
        item['Item Name'],
        type === 'material' ? parseFloat(item['Quantity']).toFixed(3) : item['Quantity'],
        item['Unit'] || 'pcs',
        item['Unit Price'],
        item['Reorder Level'],
        item['Last Updated']
    ]);

    // Create CSV content
    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];

    link.setAttribute('href', url);
    link.setAttribute('download', `inventory_${type}s_${date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast(`Full ${type}s CSV downloaded successfully!`, 'success');
}

// ============================================
// BATCH MANAGEMENT
// ============================================

let cachedBatches = [];

async function fetchBatches() {
    try {
        const response = await apiCall({ action: 'getBatches' });
        if (response.success) {
            cachedBatches = response.data;
            return response.data;
        }
    } catch (error) {
        console.error('Error fetching batches:', error);
    }
    return [];
}

async function renderBatchList() {
    const list = document.getElementById('batchList');
    list.innerHTML = '<p class="text-muted"><small>Loading batches...</small></p>';

    const batches = await fetchBatches();

    if (batches.length === 0) {
        list.innerHTML = '<p class="text-muted"><small>No batches defined yet.</small></p>';
        return;
    }

    list.innerHTML = batches.map(batch => `
        <div class="batch-card" onclick="openMultiplierModal('${batch['Batch ID']}')">
            <span class="batch-name">${escapeHtml(batch['Batch Name'])}</span>
            <div class="batch-actions">
                <button class="batch-btn-edit" onclick="event.stopPropagation(); editBatch('${batch['Batch ID']}')" title="Edit">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
                <button class="batch-btn-delete" onclick="event.stopPropagation(); deleteBatchConfirm('${batch['Batch ID']}')" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        </div>
    `).join('');
}

let currentBatchMaterials = [];

async function openBatchManagement(batchToEdit = null) {
    showLoading(true);
    try {
        const response = await apiCall({ action: 'getItemsForDropdown', type: 'material' });
        if (response.success) {
            currentBatchMaterials = response.items;
        }
    } catch (error) {
        console.error('Error fetching materials for batch:', error);
    } finally {
        showLoading(false);
    }

    document.getElementById('batchId').value = batchToEdit ? batchToEdit['Batch ID'] : '';
    document.getElementById('batchName').value = batchToEdit ? batchToEdit['Batch Name'] : '';
    document.getElementById('batchModalTitle').textContent = batchToEdit ? 'Edit Material Batch' : 'Create Material Batch';

    const list = document.getElementById('batchItemsList');
    list.innerHTML = '';

    // Map existing items for quick lookup
    const existingItems = {};
    if (batchToEdit && batchToEdit.items) {
        batchToEdit.items.forEach(item => {
            existingItems[item.itemId] = item.qty;
        });
    }

    // Add one row for EVERY material
    currentBatchMaterials.forEach(m => {
        const qty = existingItems[m.id] || 0;
        addBatchItemRow(m, qty);
    });

    openModal('batchModal');
}

function editBatch(id) {
    const batch = cachedBatches.find(b => b['Batch ID'] === id.toString());
    if (batch) {
        openBatchManagement(batch);
    }
}

function addBatchItemRow(material, qty = 0) {
    const list = document.getElementById('batchItemsList');
    const row = document.createElement('tr');
    row.dataset.id = material.id;

    row.innerHTML = `
        <td>
            <div style="font-weight: 500;">${escapeHtml(material.name)}</div>
            <div style="font-size: 11px; color: var(--text-muted);">${material.id}</div>
        </td>
        <td>
            <input type="number" class="batch-item-qty" step="0.001" min="0" value="${qty}" required placeholder="0">
        </td>
        <td></td>
    `;
    list.appendChild(row);
}

async function handleBatchSave(event) {
    event.preventDefault();

    const name = document.getElementById('batchName').value.trim();
    const id = document.getElementById('batchId').value;
    const itemRows = document.querySelectorAll('#batchItemsList tr');

    const items = [];
    itemRows.forEach(row => {
        const itemId = row.dataset.id;
        const qty = parseFloat(row.querySelector('.batch-item-qty').value) || 0;
        if (itemId && qty > 0) {
            items.push({ itemId, qty });
        }
    });

    if (items.length === 0) {
        showToast('Please add at least one material with quantity', 'error');
        return;
    }

    try {
        const data = {
            'Batch ID': id,
            'Batch Name': name,
            items: items
        };

        showLoading(true);
        const response = await apiCall({
            action: 'saveBatch',
            data: JSON.stringify(data)
        });

        if (response.success) {
            showToast('Batch saved successfully', 'success');
            closeModal('batchModal');
            renderBatchList();
        } else {
            showToast(response.error, 'error');
        }
    } catch (error) {
        showToast('Error saving batch: ' + error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteBatchConfirm(id) {
    showConfirmModal('Delete Batch', 'Are you sure you want to delete this batch?', async () => {
        try {
            showLoading(true);
            const response = await apiCall({
                action: 'deleteBatch',
                id: id
            });

            if (response.success) {
                showToast('Batch deleted successfully', 'success');
                renderBatchList();
            } else {
                showToast(response.error, 'error');
            }
        } catch (error) {
            showToast('Error deleting batch: ' + error.message, 'error');
        } finally {
            showLoading(false);
        }
    });
}

let activeBatchId = null;

function openMultiplierModal(batchId) {
    activeBatchId = batchId;
    const batch = cachedBatches.find(b => b['Batch ID'] === batchId);
    if (!batch) return;

    document.getElementById('multiplierBatchName').textContent = 'Applying recipe: ' + batch['Batch Name'];
    document.getElementById('customMultiplier').value = 1;
    openModal('batchMultiplierModal');
}

function applyBatchWithMultiplier(multiplier) {
    multiplier = parseFloat(multiplier);
    if (isNaN(multiplier) || multiplier <= 0) {
        showToast('Please enter a valid multiplier', 'error');
        return;
    }

    const batch = cachedBatches.find(b => b['Batch ID'] === activeBatchId);
    if (!batch) return;

    // Fill the bulk entry form
    const bulkRows = document.querySelectorAll('#bulkLogList tr');

    batch.items.forEach(batchItem => {
        bulkRows.forEach(row => {
            if (row.dataset.id === batchItem.itemId) {
                const stockOutInput = row.querySelector('.bulk-out');
                const calculatedValue = (batchItem.qty * multiplier).toFixed(3);
                stockOutInput.value = calculatedValue;
            }
        });
    });

    closeModal('batchMultiplierModal');
    showToast(`Applied ${batch['Batch Name']} x${multiplier}`, 'info');
}

// ============================================
// UI HELPERS
// ============================================

// ============================================
// FINANCE MANAGEMENT
// ============================================

let modalSubcategories = []; // Temporary list for category modal
let currentlyEditingSubId = null; // Track subcategory being edited

function populateFinanceDateFilters() {
    const monthSelect = document.getElementById('financeMonthSelect');
    const yearSelect = document.getElementById('financeYearSelect');
    const annualYearSelect = document.getElementById('annualYearSelect');

    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (monthSelect) {
        monthSelect.innerHTML = months.map((m, i) => `<option value="${i + 1}" ${new Date().getMonth() === i ? 'selected' : ''}>${m}</option>`).join('');
    }

    const currentYear = new Date().getFullYear();
    const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];
    const yearOptions = years.sort((a, b) => b - a).map(y => `<option value="${y}" ${y === currentYear ? 'selected' : ''}>${y}</option>`).join('');

    if (yearSelect) yearSelect.innerHTML = yearOptions;
    if (annualYearSelect) annualYearSelect.innerHTML = yearOptions;
}

async function refreshFinanceData() {
    if (!APP_CONFIG.financeScriptUrl) {
        showToast('Finance Script URL not configured', 'warning');
        return;
    }

    const month = document.getElementById('financeMonthSelect').value;
    const year = document.getElementById('financeYearSelect').value;

    try {
        const response = await apiCall({
            action: 'getFinanceData',
            month,
            year
        }, APP_CONFIG.financeScriptUrl);

        if (response.success) {
            financeData = {
                transactions: response.transactions || [],
                categories: response.categories || {}
            };
            populateFinanceCategoryDropdown();
            renderFinanceOverview();
            renderFinanceTransactions();
            // Also update setup view if it's currently active
            if (currentView === 'financeSetup') {
                renderFinanceSetup();
            }
        }
    } catch (error) {
        console.error('Finance error:', error);
    }
}

function renderFinanceOverview() {
    const grid = document.getElementById('financeOverviewGrid');
    if (!grid) return;

    const month = parseInt(document.getElementById('financeMonthSelect').value);
    const year = parseInt(document.getElementById('financeYearSelect').value);

    // Calculate previous month/year for comparison
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
    }

    // Filter transactions by month/year (Current)
    const filtered = financeData.transactions.filter(t => {
        const d = new Date(t.date);
        return (d.getMonth() + 1) == month && d.getFullYear() == year;
    });

    // Filter transactions by month/year (Previous)
    const prevFiltered = financeData.transactions.filter(t => {
        const d = new Date(t.date);
        return (d.getMonth() + 1) == prevMonth && d.getFullYear() == prevYear;
    });

    const totals = {};
    const categoryBreakdown = {};
    const prevCategoryBreakdown = {};

    // Initialize totals for ALL configured categories using IDs as keys
    Object.keys(financeData.categories).forEach(catId => {
        totals[catId] = 0;
        categoryBreakdown[catId] = {};
        prevCategoryBreakdown[catId] = {};
    });

    // Process current month
    filtered.forEach(t => {
        const catId = t.categoryId || t.category;
        const subId = t.subcategoryId || t.subcategory;

        if (totals[catId] !== undefined) {
            totals[catId] += parseFloat(t.amount);

            if (!categoryBreakdown[catId][subId]) categoryBreakdown[catId][subId] = 0;
            categoryBreakdown[catId][subId] += parseFloat(t.amount);
        }
    });

    // Process previous month
    prevFiltered.forEach(t => {
        const catId = t.categoryId || t.category;
        const subId = t.subcategoryId || t.subcategory;

        if (prevCategoryBreakdown[catId]) {
            if (!prevCategoryBreakdown[catId][subId]) prevCategoryBreakdown[catId][subId] = 0;
            prevCategoryBreakdown[catId][subId] += parseFloat(t.amount);
        }
    });

    // Use category type to compute income vs expenses
    let totalEarning = 0;
    let totalSpending = 0;
    Object.entries(totals).forEach(([catId, amt]) => {
        const catDef = financeData.categories[catId];
        const type = catDef ? (catDef.type || 'spending') : 'spending';
        if (type === 'earning') {
            totalEarning += amt;
        } else {
            totalSpending += amt;
        }
    });

    document.getElementById('financeTotalIncome').textContent = 'Rs' + totalEarning.toLocaleString();
    document.getElementById('financeTotalExpenses').textContent = 'Rs' + totalSpending.toLocaleString();

    const profit = totalEarning - totalSpending;
    const profitEl = document.getElementById('financeTotalProfit');
    profitEl.textContent = 'Rs' + profit.toLocaleString();
    profitEl.className = `stat-value ${profit >= 0 ? 'text-success' : 'text-danger'}`;

    // Calculate Insights
    renderFinanceInsights(totalEarning, totalSpending, totals, month, year);

    // Prepare and render charts
    const expenseLabels = [];
    const expenseData = [];
    const bgColors = ['#ff4757', '#ffa502', '#1e90ff', '#3742fa', '#ff7f50', '#a4b0be', '#eb4d4b', '#f0932b', '#2ed573'];

    Object.entries(totals).forEach(([catId, amt]) => {
        const catDef = financeData.categories[catId] || {};
        if ((catDef.type || 'spending') !== 'earning' && amt > 0) {
            const pct = totalSpending > 0 ? Math.round((amt / totalSpending) * 100) : 0;
            expenseLabels.push(`${catDef.name || catId} - ${pct}%`);
            expenseData.push(amt);
        }
    });

    if (typeof Chart !== 'undefined') {
        renderFinanceCharts(expenseLabels, expenseData, bgColors, totalEarning, totalSpending);
    }

    // Dynamically render the category cards — earning first, then spending
    const sortedCatIds = Object.keys(financeData.categories).sort((a, b) => {
        const typeA = (financeData.categories[a] || {}).type || 'spending';
        const typeB = (financeData.categories[b] || {}).type || 'spending';
        if (typeA === 'earning' && typeB !== 'earning') return -1;
        if (typeB === 'earning' && typeA !== 'earning') return 1;
        return (financeData.categories[a].name || '').localeCompare(financeData.categories[b].name || '');
    });

    grid.innerHTML = sortedCatIds.map(catId => {
        const catDef = financeData.categories[catId] || {};
        const subData = categoryBreakdown[catId] || {};
        const prevSubData = prevCategoryBreakdown[catId] || {};
        const catTotal = totals[catId] || 0;
        const catType = catDef.type || 'spending';
        const bgClass = catType === 'earning' ? 'bg-income' : 'bg-other';
        const typeLabel = catType === 'earning' ? 'Earning' : 'Spending';
        const typeBadgeClass = catType === 'earning' ? 'badge-earning' : 'badge-spending';

        // Get subcategory names
        const subNamesMap = {};
        (catDef.subcategories || []).forEach(s => subNamesMap[s.id] = s.name);

        // Combine all distinct subcategories from current and previous month
        const allSubIds = new Set([...Object.keys(subData), ...Object.keys(prevSubData)]);

        let rows = Array.from(allSubIds).sort((a, b) => {
            const amtA = subData[a] || 0;
            const amtB = subData[b] || 0;
            return amtB - amtA;
        }).map(subId => {
            const displayName = subNamesMap[subId] || subId;
            const currentAmt = subData[subId] || 0;
            const prevAmt = prevSubData[subId] || 0;

            return `
                <tr>
                    <td>${escapeHtml(displayName)}</td>
                    <td class="text-center amount-col"><strong>Rs${currentAmt.toLocaleString()}</strong></td>
                    <td class="text-right text-muted prev-col" style="font-size: 12px;">Rs${prevAmt.toLocaleString()}</td>
                </tr>
            `;
        }).join('');

        if (rows === '') {
            rows = '<tr><td colspan="3" class="text-muted text-center">No data</td></tr>';
        }

        return `
            <div class="card">
                <div class="card-header ${bgClass}">
                    <h3>${escapeHtml(catDef.name || catId)} <span class="type-badge ${typeBadgeClass}">${typeLabel}</span></h3>
                    <span class="total-badge">Rs${catTotal.toLocaleString()}</span>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Subcategory</th>
                                <th class="text-center amount-col">Amount</th>
                                <th class="text-right prev-col">Last Month</th>
                            </tr>
                        </thead>
                        <tbody>${rows}</tbody>
                    </table>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Calculate and render the financial insights section
 */
function renderFinanceInsights(income, expenses, categoryTotals, month, year) {
    const container = document.getElementById('financeInsights');
    if (!container) return;

    if (income === 0 && expenses === 0) {
        container.style.display = 'none';
        return;
    }

    // 1. Savings Rate
    let savingsRate = 0;
    if (income > 0) {
        savingsRate = ((income - expenses) / income) * 100;
    }
    const savingsClass = savingsRate >= 20 ? 'positive' : (savingsRate < 0 ? 'negative' : 'highlight');

    // 2. Top Income and Spending Categories
    let topSpendCatId = null;
    let maxSpend = 0;
    let topEarnCatId = null;
    let maxEarn = 0;

    Object.entries(categoryTotals).forEach(([cid, amt]) => {
        const cat = financeData.categories[cid] || {};
        const type = cat.type || 'spending';
        if (type === 'earning') {
            if (amt > maxEarn) {
                maxEarn = amt;
                topEarnCatId = cid;
            }
        } else {
            if (amt > maxSpend) {
                maxSpend = amt;
                topSpendCatId = cid;
            }
        }
    });

    const topSpendName = topSpendCatId ? (financeData.categories[topSpendCatId].name || topSpendCatId) : 'N/A';

    // 3. Daily Average Spending
    const daysInMonth = new Date(year, month, 0).getDate();
    const dailyAvg = expenses / daysInMonth;

    container.innerHTML = `
        <div class="insight-item">
            <span class="insight-label">Savings Rate</span>
            <span class="insight-value ${savingsClass}">${savingsRate.toFixed(1)}%</span>
        </div>
        <div class="insight-item">
            <span class="insight-label">Top Spending</span>
            <span class="insight-value negative">${escapeHtml(topSpendName)}</span>
        </div>
        <div class="insight-item">
            <span class="insight-label">Daily Average</span>
            <span class="insight-value highlight">Rs${Math.round(dailyAvg).toLocaleString()}</span>
        </div>
    `;
    container.style.display = 'flex';
}

function renderFinanceCharts(expenseLabels, expenseData, bgColors, totalEarning, totalSpending) {
    const chartsContainer = document.getElementById('financeChartsGrid');
    if (!chartsContainer) return;

    // Show or hide based on data existence
    const hasData = totalEarning > 0 || totalSpending > 0 || expenseData.length > 0;
    chartsContainer.style.display = hasData ? 'grid' : 'none';

    if (!hasData) return;

    // Destroy existing instances if any
    if (expenseDoughnutChartInstance) expenseDoughnutChartInstance.destroy();
    if (incomeExpenseBarChartInstance) incomeExpenseBarChartInstance.destroy();

    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    color: '#aab2c8',
                    font: { family: "'Inter', sans-serif", size: 11 },
                    usePointStyle: true,
                    pointStyle: 'rectRounded',
                    boxWidth: 10
                },
                position: 'bottom'
            },
            tooltip: {
                backgroundColor: 'rgba(30, 31, 41, 0.95)',
                titleFont: { family: "'Inter', sans-serif" },
                bodyFont: { family: "'Inter', sans-serif" },
                padding: 12,
                cornerRadius: 8,
                callbacks: {
                    label: function (context) {
                        return ' Rs' + context.raw.toLocaleString();
                    }
                }
            }
        }
    };

    // 1. Expense Doughnut Chart
    const doughnutCtx = document.getElementById('expenseDoughnutChart');
    if (doughnutCtx) {
        expenseDoughnutChartInstance = new Chart(doughnutCtx, {
            type: 'doughnut',
            data: {
                labels: expenseLabels.length ? expenseLabels : ['No Expenses'],
                datasets: [{
                    data: expenseData.length ? expenseData : [1],
                    backgroundColor: expenseData.length ? bgColors.slice(0, expenseData.length) : ['#3f4455'],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                ...commonOptions,
                cutout: '70%'
            }
        });
    }

    // 2. Income vs Expense Bar Chart
    const barCtx = document.getElementById('incomeExpenseBarChart');
    if (barCtx) {
        incomeExpenseBarChartInstance = new Chart(barCtx, {
            type: 'bar',
            data: {
                labels: ['Income', 'Expenses'],
                datasets: [{
                    label: 'Amount (Rs)',
                    data: [totalEarning, totalSpending],
                    backgroundColor: ['#00d68f', '#ff4757'],
                    borderRadius: 6,
                    borderWidth: 0,
                    barPercentage: 0.6
                }]
            },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                        ticks: { color: '#aab2c8', font: { family: "'Inter', sans-serif" } }
                    },
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { color: '#aab2c8', font: { family: "'Inter', sans-serif" } }
                    }
                }
            }
        });
    }
}

/**
 * Populate the category dropdown in the Add Transaction modal
 */
function populateFinanceCategoryDropdown() {
    const catSelect = document.getElementById('financeCategory');
    if (!catSelect) return;

    const currentVal = catSelect.value;
    const catIds = Object.keys(financeData.categories);

    if (catIds.length === 0) {
        catSelect.innerHTML = '<option value="">No categories found</option>';
        return;
    }

    const options = catIds.map(id => {
        const cat = financeData.categories[id];
        return `<option value="${id}" ${id === currentVal ? 'selected' : ''}>${escapeHtml(cat.name)}</option>`;
    });

    catSelect.innerHTML = '<option value="">Select Category</option>' + options.join('');

    if (!currentVal || !catIds.includes(currentVal)) {
        updateFinanceSubcategories();
    }
}

function renderFinanceTransactions() {
    const tbody = document.getElementById('financeTransactionsBody');
    if (!tbody) return;

    const isAdmin = APP_CONFIG.userRole === 'Admin';
    const isEditor = APP_CONFIG.userRole === 'Editor';

    // Show/hide actions header and bulk actions
    const actionsHeader = document.querySelector('#financeTransactionsTable th:last-child');
    if (actionsHeader && actionsHeader.textContent.trim() === 'Actions') {
        actionsHeader.style.display = isAdmin ? '' : 'none';
    }

    if (financeData.transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${isAdmin ? 8 : 7}" class="empty-state">No transactions found</td></tr>`;
        return;
    }

    tbody.innerHTML = [...financeData.transactions].reverse().map(t => {
        const catId = t.categoryId || t.category;
        const catDef = financeData.categories[catId] || {};
        const isEarning = (catDef.type || 'spending') === 'earning';
        const catBadgeClass = isEarning ? 'status-ok' : 'status-low';
        return `
        <tr data-id="${t.id}">
            <td class="checkbox-col finance-checkbox-col"><input type="checkbox" class="row-checkbox" onchange="updateBulkActionsVisibility('finance')"></td>
            <td>${new Date(t.date).toLocaleDateString()}</td>
            <td><span class="status ${catBadgeClass}">${escapeHtml(t.category)}</span></td>
            <td>${escapeHtml(t.subcategory)}</td>
            <td class="text-right"><strong>Rs${parseFloat(t.amount).toLocaleString()}</strong></td>
            <td><small class="text-muted">${escapeHtml(t.notes || '-')}</small></td>
            <td><strong>${escapeHtml(t.user || 'Unknown')}</strong></td>
            ${isAdmin ? `
            <td>
                <div class="action-buttons">
                    <button class="btn-action" onclick="openEditFinanceModal(${t.id})" title="Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button class="btn-action delete" onclick="deleteFinanceTransaction(${t.id})" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
            </td>
            ` : ''}
        </tr>`;
    }).join('');

    // Reset select all checkbox
    const selectAll = document.getElementById('selectAllFinance');
    if (selectAll) selectAll.checked = false;
    updateBulkActionsVisibility('finance');
}

async function handleFinanceSubmit(e) {
    e.preventDefault();
    if (!APP_CONFIG.financeScriptUrl) return;

    const rows = document.querySelectorAll('#multiTransactionBody tr');
    const transactions = [];

    for (const row of rows) {
        const date = row.querySelector('.finance-row-date').value;
        const categoryId = row.querySelector('.finance-row-category').value;
        const subcategoryId = row.querySelector('.finance-row-subcategory').value;
        const amount = parseFloat(row.querySelector('.finance-row-amount').value);
        const notes = row.querySelector('.finance-row-notes').value.trim();

        if (!date || !categoryId || !subcategoryId || isNaN(amount) || amount <= 0) {
            showToast('Please fill in all required fields for each row', 'error');
            return;
        }

        transactions.push({ date, categoryId, subcategoryId, amount, notes, user: APP_CONFIG.userName });
    }

    if (transactions.length === 0) {
        showToast('Add at least one transaction', 'error');
        return;
    }

    showLoading(true);
    try {
        for (const data of transactions) {
            await apiCall({
                action: 'addTransaction',
                data: JSON.stringify(data)
            }, APP_CONFIG.financeScriptUrl);
        }

        showToast(`${transactions.length} transaction(s) saved!`, 'success');
        closeModal('addFinanceModal');
        refreshFinanceData();
    } catch (error) {
        console.error('Save finance error:', error);
        showToast('Failed to save transactions', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Open modal to edit an individual transaction
 */
function openEditFinanceModal(id) {
    const transaction = financeData.transactions.find(t => t.id === id);
    if (!transaction) {
        showToast('Transaction not found', 'error');
        return;
    }

    document.getElementById('editFinanceId').value = transaction.id;

    // Parse date keeping local timezone to prevent off-by-one-day shift
    const d = new Date(transaction.date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    document.getElementById('editFinanceDate').value = `${year}-${month}-${day}`;
    document.getElementById('editFinanceCategory').value = transaction.category || '';
    document.getElementById('editFinanceSubcategory').value = transaction.subcategory || '';
    document.getElementById('editFinanceAmount').value = transaction.amount;
    document.getElementById('editFinanceNotes').value = transaction.notes || '';

    openModal('editFinanceModal');
}

/**
 * Handle individual transaction edit submission
 */
async function handleEditFinanceSubmit(e) {
    e.preventDefault();
    if (!APP_CONFIG.financeScriptUrl) return;

    const id = document.getElementById('editFinanceId').value;
    const date = document.getElementById('editFinanceDate').value;
    const amount = parseFloat(document.getElementById('editFinanceAmount').value);
    const notes = document.getElementById('editFinanceNotes').value.trim();

    if (!date || isNaN(amount) || amount <= 0) {
        showToast('Please fill in all required fields', 'error');
        return;
    }

    const updatedData = {
        id: id,
        date: date,
        amount: amount,
        notes: notes,
        user: APP_CONFIG.userName
    };

    showLoading(true);
    try {
        const response = await apiCall({
            action: 'bulkUpdateFinance',
            data: JSON.stringify([updatedData])
        }, APP_CONFIG.financeScriptUrl);

        if (response.success) {
            showToast('Transaction updated successfully', 'success');
            closeModal('editFinanceModal');
            refreshFinanceData();
        } else {
            showToast(response.error || 'Failed to update transaction', 'error');
        }
    } catch (error) {
        console.error('Update finance error:', error);
        showToast('Failed to update transaction', 'error');
    } finally {
        showLoading(false);
    }
}

async function deleteFinanceTransaction(rowId) {
    showConfirmModal('Delete Transaction', 'Delete this transaction?', async () => {
        try {
            await apiCall({
                action: 'deleteTransaction',
                data: JSON.stringify({ rowId })
            }, APP_CONFIG.financeScriptUrl);

            showToast('Transaction deleted', 'success');
            refreshFinanceData();
        } catch (error) {
            console.error('Delete finance error:', error);
        }
    });
}

function updateFinanceSubcategories() {
    const catId = document.getElementById('financeCategory').value;
    const subSelect = document.getElementById('financeSubcategory');
    if (!subSelect) return;

    const catDef = financeData.categories[catId];
    const subcats = catDef ? (catDef.subcategories || []) : [];

    subSelect.innerHTML = subcats.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    if (subcats.length === 0) {
        subSelect.innerHTML = '<option value="">Select Category First</option>';
    }
}

function openAddFinanceModal() {
    const tbody = document.getElementById('multiTransactionBody');
    tbody.innerHTML = '';
    addFinanceRow();
    openModal('addFinanceModal');
}

let financeRowCounter = 0;

function addFinanceRow() {
    const tbody = document.getElementById('multiTransactionBody');
    const rowId = financeRowCounter++;
    const today = new Date().toISOString().split('T')[0];

    // Build category options
    let categoryOptions = '<option value="" disabled selected hidden>Select Category</option>';
    if (financeData && financeData.categories) {
        Object.entries(financeData.categories).forEach(([id, cat]) => {
            categoryOptions += `<option value="${id}">${escapeHtml(cat.name)}</option>`;
        });
    }

    const row = document.createElement('tr');
    row.dataset.rowId = rowId;
    row.innerHTML = `
        <td><input type="date" class="finance-row-date" value="${today}" required></td>
        <td><select class="finance-row-category" required onchange="updateFinanceRowSubcategories(this)">
            ${categoryOptions}
        </select></td>
        <td><select class="finance-row-subcategory" required>
            <option value="" disabled selected hidden>Select Subcategory</option>
        </select></td>
        <td><input type="number" class="finance-row-amount" step="0.01" min="0" required placeholder="0.00"></td>
        <td><input type="text" class="finance-row-notes" placeholder="Optional..."></td>
        <td><button type="button" class="btn-action delete" onclick="removeFinanceRow(this)" title="Remove">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
        </button></td>
    `;
    tbody.appendChild(row);
}

function removeFinanceRow(btn) {
    const tbody = document.getElementById('multiTransactionBody');
    if (tbody.children.length <= 1) {
        showToast('At least one row is required', 'error');
        return;
    }
    btn.closest('tr').remove();
}

function updateFinanceRowSubcategories(selectEl) {
    const row = selectEl.closest('tr');
    const subSelect = row.querySelector('.finance-row-subcategory');
    const catId = selectEl.value;

    subSelect.innerHTML = '<option value="" disabled selected hidden>Select Subcategory</option>';
    if (catId && financeData && financeData.categories && financeData.categories[catId]) {
        const subs = financeData.categories[catId].subcategories || [];
        subs.forEach(sub => {
            subSelect.innerHTML += `<option value="${sub.id}">${escapeHtml(sub.name)}</option>`;
        });
    }
}

function openAddProductModal() {
    document.getElementById('itemForm').reset();
    document.getElementById('itemId').value = '';
    document.getElementById('modalTitle').innerText = 'Add New Product';
    document.getElementById('submitBtn').textContent = 'Add Product';

    // Set default unit to pcs for products
    const itemUnit = document.getElementById('itemUnit');
    if (itemUnit) itemUnit.value = 'pcs';

    // Reset step for integers (or standard precision)
    const qtyInput = document.getElementById('itemQuantity');
    if (qtyInput) qtyInput.setAttribute('step', '1');

    const typeSelect = document.getElementById('itemTypeSelect');
    typeSelect.value = 'product';

    // Hide the type selector since it is pre-determined
    document.getElementById('itemTypeGroup').classList.add('hidden');

    openModal('itemModal');
}

function openAddMaterialModal() {
    document.getElementById('itemForm').reset();
    document.getElementById('itemId').value = '';
    document.getElementById('modalTitle').innerText = 'Add New Raw Material';
    document.getElementById('submitBtn').textContent = 'Add Raw Material';

    // Set default unit to kg
    const itemUnit = document.getElementById('itemUnit');
    if (itemUnit) itemUnit.value = 'kg';

    // Set step for decimals
    const qtyInput = document.getElementById('itemQuantity');
    if (qtyInput) qtyInput.setAttribute('step', '0.001');

    const typeSelect = document.getElementById('itemTypeSelect');
    typeSelect.value = 'material';

    // Hide the type selector
    document.getElementById('itemTypeGroup').classList.add('hidden');

    openModal('itemModal');
}

/**
 * Finance Category Management UI
 */
function renderFinanceSetup() {
    const list = document.getElementById('financeCategoryList');
    if (!list) return;

    const isViewer = APP_CONFIG.userRole === 'Viewer';
    const cats = financeData.categories;
    const sortedCatIds = Object.keys(cats).sort((a, b) => {
        const typeA = (cats[a] || {}).type || 'spending';
        const typeB = (cats[b] || {}).type || 'spending';
        if (typeA === 'earning' && typeB !== 'earning') return -1;
        if (typeB === 'earning' && typeA !== 'earning') return 1;
        return (cats[a].name || '').localeCompare(cats[b].name || '');
    });

    if (sortedCatIds.length === 0) {
        list.innerHTML = `
            <div class="empty-state" style="padding: 40px;">
                <div class="empty-state-text">No categories yet. Click "+ Add Category" to get started.</div>
            </div>`;
        return;
    }

    list.innerHTML = sortedCatIds.map(id => {
        const catDef = cats[id] || {};
        const subNames = (catDef.subcategories || []).map(s => s.name);
        const catType = catDef.type || 'spending';
        const typeBadgeClass = catType === 'earning' ? 'badge-earning' : 'badge-spending';
        const typeLabel = catType === 'earning' ? 'Earning' : 'Spending';
        return `
            <div class="finance-category-card">
                <div class="finance-cat-info">
                    <div class="finance-cat-name">${escapeHtml(catDef.name)} <span class="type-badge ${typeBadgeClass}">${typeLabel}</span></div>
                    <div class="finance-cat-subcats">${subNames.length ? escapeHtml(subNames.join(', ')) : '<em>No subcategories</em>'}</div>
                </div>
                ${isViewer ? '' : `<div class="finance-cat-actions">
                    <button class="btn-action" onclick="openEditCategoryModal('${id}')" title="Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button class="btn-action delete" onclick="deleteCategoryConfirm('${id}')" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>`}
            </div>`;
    }).join('');
}

function openAddCategoryModal() {
    document.getElementById('categoryModalTitle').textContent = 'Add Category';
    document.getElementById('categoryForm').reset();
    document.getElementById('editingCategoryOriginalName').value = '';
    document.getElementById('categorySaveBtn').textContent = 'Add Category';
    // Default to earning
    document.getElementById('categoryTypeEarning').checked = true;

    modalSubcategories = [];
    currentlyEditingSubId = null;
    renderModalSubcategories();

    openModal('categoryModal');
}

function openEditCategoryModal(id) {
    document.getElementById('categoryModalTitle').textContent = 'Edit Category';
    document.getElementById('editingCategoryOriginalName').value = id;
    const catDef = financeData.categories[id] || {};
    document.getElementById('categoryNameInput').value = catDef.name || '';

    // Initialize temporary subcategories for the modal
    modalSubcategories = (catDef.subcategories || []).map(s => ({ ...s }));
    currentlyEditingSubId = null;
    renderModalSubcategories();

    // Pre-select the type
    const catType = catDef.type || 'earning';
    document.getElementById(catType === 'earning' ? 'categoryTypeEarning' : 'categoryTypeSpending').checked = true;
    document.getElementById('categorySaveBtn').textContent = 'Save Changes';
    openModal('categoryModal');
}

function renderModalSubcategories() {
    const container = document.getElementById('modalSubcategoriesList');
    if (!container) return;

    if (modalSubcategories.length === 0) {
        container.innerHTML = '<div class="empty-subcats-hint">No subcategories added yet</div>';
        return;
    }

    container.innerHTML = modalSubcategories.map((sub, index) => {
        const isEditing = sub.id === currentlyEditingSubId;
        const chipClass = isEditing ? 'subcategory-chip editing' : 'subcategory-chip';
        return `
            <div class="${chipClass}">
                <span class="chip-text">${escapeHtml(sub.name)}</span>
                <div class="chip-actions">
                    <button type="button" class="btn-chip-action edit" onclick="editSubcategoryFromModal(${index})" title="Edit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                    </button>
                    <button type="button" class="btn-chip-action delete" onclick="removeSubcategoryFromModal(${index})" title="Delete">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function addSubcategoryFromModal() {
    const input = document.getElementById('newSubcategoryInput');
    const name = input.value.trim();
    const btn = document.querySelector('.btn-add-inline');
    if (!name) return;

    // Check for duplicates (excluding the one being edited)
    if (modalSubcategories.some(s => s.id !== currentlyEditingSubId && s.name.toLowerCase() === name.toLowerCase())) {
        showToast('Subcategory already exists', 'warning');
        return;
    }

    if (currentlyEditingSubId) {
        // Update existing
        const subIndex = modalSubcategories.findIndex(s => s.id === currentlyEditingSubId);
        if (subIndex !== -1) {
            modalSubcategories[subIndex].name = name;
        }
        currentlyEditingSubId = null;
        if (btn) btn.textContent = 'Add';
    } else {
        // Add new
        modalSubcategories.push({
            id: generateId(),
            name: name
        });
    }

    input.value = '';
    renderModalSubcategories();
    input.focus();
}

function editSubcategoryFromModal(index) {
    const sub = modalSubcategories[index];
    const input = document.getElementById('newSubcategoryInput');
    const btn = document.querySelector('.btn-add-inline');

    currentlyEditingSubId = sub.id;
    input.value = sub.name;
    if (btn) btn.textContent = 'Update';

    renderModalSubcategories();
    input.focus();
}

function removeSubcategoryFromModal(index) {
    const sub = modalSubcategories[index];
    if (sub.id === currentlyEditingSubId) {
        currentlyEditingSubId = null;
        document.getElementById('newSubcategoryInput').value = '';
        const btn = document.querySelector('.btn-add-inline');
        if (btn) btn.textContent = 'Add';
    }
    modalSubcategories.splice(index, 1);
    renderModalSubcategories();
}

async function handleCategorySubmit(e) {
    e.preventDefault();
    const newName = document.getElementById('categoryNameInput').value.trim();
    const originalId = document.getElementById('editingCategoryOriginalName').value;
    const catType = document.querySelector('input[name="categoryType"]:checked');

    if (!newName) {
        showToast('Category name is required', 'error');
        return;
    }
    if (!catType) {
        showToast('Please select a category type (Earning or Spending)', 'error');
        return;
    }

    const updatedCategories = { ...financeData.categories };
    const categoryId = originalId || generateId();

    updatedCategories[categoryId] = {
        id: categoryId,
        name: newName,
        type: catType.value,
        subcategories: modalSubcategories
    };

    await persistCategories(updatedCategories);
}

function deleteCategoryConfirm(id) {
    const catName = (financeData.categories[id] || {}).name || id;
    showConfirmModal('Delete Category', `Are you sure you want to delete the category "${catName}"? This cannot be undone.`, () => {
        const updatedCategories = { ...financeData.categories };
        delete updatedCategories[id];
        persistCategories(updatedCategories);
    });
}

function generateId() {
    return 'cat_' + Math.random().toString(36).substr(2, 9);
}

async function persistCategories(categories) {
    if (!APP_CONFIG.financeScriptUrl) {
        showToast('Finance URL not configured. Go to Settings and add the Finance Script URL.', 'error');
        return;
    }

    try {
        const response = await apiCall({
            action: 'updateCategories',
            data: JSON.stringify({
                categories,
                user: APP_CONFIG.userName
            })
        }, APP_CONFIG.financeScriptUrl);

        if (response.success) {
            financeData.categories = categories;
            showToast('Categories saved!', 'success');
            closeModal('categoryModal');
            renderFinanceSetup();
            populateFinanceCategoryDropdown();
        }
    } catch (error) {
        console.error('Save categories error:', error);
        showToast('Failed to save: ' + (error.message || 'Unknown error'), 'error');
    }
}

// ============================================
// BULK ACTIONS LOGIC
// ============================================

let financeSelectMode = false;
let logsSelectMode = false;

function toggleFinanceSelectMode() {
    financeSelectMode = !financeSelectMode;
    const table = document.getElementById('financeTransactionsTable');
    const btn = document.getElementById('financeSelectBtn');
    const bulkBar = document.getElementById('financeBulkActions');

    if (financeSelectMode) {
        table.classList.add('select-mode');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg> Cancel`;
    } else {
        table.classList.remove('select-mode');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> Select`;
        // Uncheck all checkboxes
        document.querySelectorAll('#financeTransactionsTable .row-checkbox').forEach(cb => cb.checked = false);
        const selectAll = document.getElementById('selectAllFinance');
        if (selectAll) selectAll.checked = false;
        bulkBar.classList.add('hidden');
    }
}

function toggleLogsSelectMode() {
    logsSelectMode = !logsSelectMode;
    const table = document.getElementById('logsTable');
    const btn = document.getElementById('logsSelectBtn');
    const bulkBar = document.getElementById('logsBulkActions');

    if (logsSelectMode) {
        table.classList.add('select-mode');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg> Cancel`;
    } else {
        table.classList.remove('select-mode');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg> Select`;
        // Uncheck all checkboxes
        document.querySelectorAll('#logsTable .row-checkbox').forEach(cb => cb.checked = false);
        const selectAll = document.getElementById('selectAllLogs');
        if (selectAll) selectAll.checked = false;
        bulkBar.classList.add('hidden');
    }
}

function toggleSelectAll(type) {
    const tableId = type === 'logs' ? 'logsTable' : 'financeTransactionsTable';
    const selectAllCheckbox = document.getElementById(type === 'logs' ? 'selectAllLogs' : 'selectAllFinance');
    const checkboxes = document.querySelectorAll(`#${tableId} .row-checkbox`);

    checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
    updateBulkActionsVisibility(type);
}

function updateBulkActionsVisibility(viewType) {
    const tableId = viewType === 'logs' ? 'logsTable' : 'financeTransactionsTable';
    const barId = viewType === 'logs' ? 'logsBulkActions' : 'financeBulkActions';
    const checkboxes = document.querySelectorAll(`#${tableId} .row-checkbox:checked`);
    const bulkBar = document.getElementById(barId);

    if (checkboxes.length > 0) {
        bulkBar.classList.remove('hidden');
        bulkBar.querySelector('.selected-count').textContent = `${checkboxes.length} selected`;
    } else {
        bulkBar.classList.add('hidden');
    }
}

async function confirmBulkDelete(type) {
    const viewType = type === 'stock' ? 'logs' : 'finance';
    const tableId = viewType === 'logs' ? 'logsTable' : 'financeTransactionsTable';
    const selected = Array.from(document.querySelectorAll(`#${tableId} .row-checkbox:checked`))
        .map(cb => cb.closest('tr').dataset.id);

    if (selected.length === 0) return;

    showConfirmModal('Delete Entries', `Are you sure you want to delete ${selected.length} entries? This action cannot be undone.`, async () => {
        showLoading(true);
        try {
            if (type === 'stock') {
                await apiCall({
                    action: 'bulkDeleteLogs',
                    type: currentLogTab,
                    ids: JSON.stringify(selected),
                    user: APP_CONFIG.userName
                });
            } else {
                await apiCall({
                    action: 'bulkDeleteFinance',
                    data: JSON.stringify({ ids: JSON.stringify(selected), user: APP_CONFIG.userName })
                }, APP_CONFIG.financeScriptUrl);
            }

            showToast(`Successfully deleted ${selected.length} entries`, 'success');
            if (viewType === 'logs') refreshLogs();
            else refreshFinanceData();
        } catch (error) {
            console.error('Bulk delete failed:', error);
            showToast('Bulk delete failed', 'error');
        } finally {
            showLoading(false);
        }
    });
}

function openBulkEdit(type) {
    const viewType = type === 'stock' ? 'logs' : 'finance';
    const tableId = viewType === 'logs' ? 'logsTable' : 'financeTransactionsTable';
    const selectedIds = Array.from(document.querySelectorAll(`#${tableId} .row-checkbox:checked`))
        .map(cb => cb.closest('tr').dataset.id);

    if (selectedIds.length === 0) return;

    const header = document.getElementById('bulkEditHeader');
    const list = document.getElementById('bulkEditList');
    document.getElementById('bulkEditTitle').textContent = `Bulk Edit ${type === 'stock' ? 'Stock Logs' : 'Transactions'}`;

    if (type === 'stock') {
        const isAdmin = APP_CONFIG.userRole === 'Admin';
        header.innerHTML = `
            <tr>
                <th>Date</th>
                <th>Item Name</th>
                <th>In</th>
                <th>Out</th>
                <th>Returns</th>
                <th>Notes</th>
            </tr>
        `;

        list.innerHTML = selectedIds.map(id => {
            const log = logsData.find(l => l['Log ID'] == id);
            let dateStr = log['Date'];
            if (dateStr.includes('/')) {
                const parts = dateStr.split('/');
                dateStr = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`;
            } else {
                const d = new Date(dateStr);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                dateStr = `${year}-${month}-${day}`;
            }
            return `
                <tr data-id="${id}">
                    <td><input type="date" class="edit-date" value="${dateStr}" style="width: 140px;"></td>
                    <td><strong>${escapeHtml(log['Item Name'])}</strong></td>
                    <td><input type="number" class="edit-in" value="${log['Stock In'] || 0}" step="${currentLogTab === 'material' ? '0.001' : '1'}"></td>
                    <td><input type="number" class="edit-out" value="${log['Stock Out'] || 0}" step="${currentLogTab === 'material' ? '0.001' : '1'}"></td>
                    <td><input type="number" class="edit-returns" value="${log['Returns'] || 0}" step="${currentLogTab === 'material' ? '0.001' : '1'}"></td>
                    <td><input type="text" class="edit-notes" value="${escapeHtml(log['Notes'] || '')}"></td>
                </tr>
            `;
        }).join('');
    } else {
        header.innerHTML = `
            <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Subcategory</th>
                <th>Amount</th>
                <th>Notes</th>
            </tr>
        `;

        list.innerHTML = selectedIds.map(id => {
            const t = financeData.transactions.find(x => x.id == id);
            const d = new Date(t.date);
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            return `
                <tr data-id="${id}">
                    <td><input type="date" class="edit-date" value="${dateStr}" style="width: 140px;"></td>
                    <td>${escapeHtml(t.category)}</td>
                    <td>${escapeHtml(t.subcategory)}</td>
                    <td><input type="number" class="edit-amount" value="${t.amount}" step="0.01"></td>
                    <td><input type="text" class="edit-notes" value="${escapeHtml(t.notes || '')}"></td>
                </tr>
            `;
        }).join('');
    }

    document.getElementById('bulkEditForm').onsubmit = (e) => saveBulkEdits(e, type);
    openModal('bulkEditModal');
}

async function saveBulkEdits(e, type) {
    e.preventDefault();
    const rows = document.querySelectorAll('#bulkEditList tr');
    const updates = [];

    rows.forEach(row => {
        const id = row.dataset.id;
        if (type === 'stock') {
            updates.push({
                id: id,
                date: row.querySelector('.edit-date').value,
                stockIn: parseFloat(row.querySelector('.edit-in').value) || 0,
                stockOut: parseFloat(row.querySelector('.edit-out').value) || 0,
                returns: parseFloat(row.querySelector('.edit-returns').value) || 0,
                notes: row.querySelector('.edit-notes').value.trim()
            });
        } else {
            updates.push({
                id: id,
                date: row.querySelector('.edit-date').value,
                amount: parseFloat(row.querySelector('.edit-amount').value) || 0,
                notes: row.querySelector('.edit-notes').value.trim()
            });
        }
    });

    showLoading(true);
    try {
        if (type === 'stock') {
            await apiCall({
                action: 'bulkUpdateLogs',
                type: currentLogTab,
                updates: JSON.stringify(updates),
                user: APP_CONFIG.userName
            });
        } else {
            await apiCall({
                action: 'bulkUpdateFinance',
                data: JSON.stringify({ updates: JSON.stringify(updates), user: APP_CONFIG.userName })
            }, APP_CONFIG.financeScriptUrl);
        }

        showToast('Bulk update successful', 'success');
        closeModal('bulkEditModal');
        if (type === 'stock') {
            refreshLogs();
            refreshData();
        } else {
            refreshFinanceData();
        }
    } catch (error) {
        console.error('Bulk update failed:', error);
        showToast('Bulk update failed', 'error');
    } finally {
        showLoading(false);
    }
}

/**
 * Annual Finance Report Logic
 */
async function renderFinanceAnnual() {
    if (!APP_CONFIG.financeScriptUrl) return;

    const yearSelect = document.getElementById('annualYearSelect');
    if (!yearSelect) return;
    const year = parseInt(yearSelect.value);

    showLoading(true);
    try {
        // Fetch fresh data if needed, or use existing financeData
        // handleGetData returns ALL transactions, so we can filter locally
        const response = await apiCall({ action: 'getFinanceData', all: true }, APP_CONFIG.financeScriptUrl);
        if (response.success) {
            financeData.transactions = response.transactions || [];
            financeData.categories = response.categories || {};
        }

        const yearTransactions = financeData.transactions.filter(t => new Date(t.date).getFullYear() === year);

        // Aggregate data by month (1-12)
        const monthlyData = {};
        for (let m = 1; m <= 12; m++) {
            monthlyData[m] = { income: 0, expenses: 0, net: 0, categories: {} };
        }

        yearTransactions.forEach(t => {
            const date = new Date(t.date);
            const month = date.getMonth() + 1;
            const catId = t.categoryId || t.category;
            const subId = t.subcategoryId || t.subcategory;
            const amount = parseFloat(t.amount) || 0;
            const catDef = financeData.categories[catId] || {};
            const type = catDef.type || 'spending';

            if (type === 'earning') {
                monthlyData[month].income += amount;
            } else {
                monthlyData[month].expenses += amount;
            }

            if (!monthlyData[month].categories[catId]) {
                monthlyData[month].categories[catId] = { total: 0, subcategories: {} };
            }
            monthlyData[month].categories[catId].total += amount;

            if (!monthlyData[month].categories[catId].subcategories[subId]) {
                monthlyData[month].categories[catId].subcategories[subId] = 0;
            }
            monthlyData[month].categories[catId].subcategories[subId] += amount;
        });

        renderAnnualSummary(monthlyData);
        renderAnnualCharts(monthlyData);
        renderAnnualDataGrid(monthlyData, year);

    } catch (error) {
        console.error('Annual Report Error:', error);
        showToast('Failed to generate annual report', 'error');
    } finally {
        showLoading(false);
    }
}

function renderAnnualSummary(monthlyData) {
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalSavingsRate = 0;
    let monthsWithIncome = 0;

    Object.values(monthlyData).forEach(m => {
        totalIncome += m.income;
        totalExpenses += m.expenses;
        if (m.income > 0) {
            const rate = ((m.income - m.expenses) / m.income) * 100;
            totalSavingsRate += rate;
            monthsWithIncome++;
        }
    });

    const netProfit = totalIncome - totalExpenses;
    const avgSavingsRate = monthsWithIncome > 0 ? (totalSavingsRate / monthsWithIncome) : 0;

    document.getElementById('annualTotalIncome').textContent = 'Rs' + Math.round(totalIncome).toLocaleString();
    document.getElementById('annualTotalExpenses').textContent = 'Rs' + Math.round(totalExpenses).toLocaleString();

    const profitEl = document.getElementById('annualNetProfit');
    profitEl.textContent = 'Rs' + Math.round(netProfit).toLocaleString();
    profitEl.className = `stat-value ${netProfit >= 0 ? 'text-success' : 'text-danger'}`;

    const savingsEl = document.getElementById('annualSavingsRate');
    savingsEl.textContent = avgSavingsRate.toFixed(1) + '%';
    savingsEl.className = `stat-value ${avgSavingsRate >= 20 ? 'text-success' : (avgSavingsRate < 0 ? 'text-danger' : 'highlight')}`;
}

function renderAnnualCharts(monthlyData) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const incomeData = months.map((_, i) => monthlyData[i + 1].income);
    const expenseData = months.map((_, i) => monthlyData[i + 1].expenses);
    const savingsData = months.map((_, i) => {
        const m = monthlyData[i + 1];
        return m.income > 0 ? parseFloat((((m.income - m.expenses) / m.income) * 100).toFixed(1)) : 0;
    });

    if (annualTrendChartInstance) annualTrendChartInstance.destroy();
    if (annualSavingsChartInstance) annualSavingsChartInstance.destroy();

    const ctxTrend = document.getElementById('annualTrendChart');
    if (ctxTrend) {
        annualTrendChartInstance = new Chart(ctxTrend, {
            type: 'line',
            data: {
                labels: months,
                datasets: [
                    {
                        label: 'Income',
                        data: incomeData,
                        borderColor: '#22c55e', // var(--accent-green)
                        backgroundColor: 'rgba(34, 197, 94, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    },
                    {
                        label: 'Expenses',
                        data: expenseData,
                        borderColor: '#ef4444', // var(--accent-red)
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'top', labels: { color: '#a0a0b0', font: { family: "'Inter', sans-serif", size: 12 } } },
                    tooltip: {
                        backgroundColor: 'rgba(26, 26, 46, 0.95)',
                        padding: 12,
                        cornerRadius: 8,
                        titleColor: '#ffffff',
                        bodyColor: '#a0a0b0',
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: (context) => ` ${context.dataset.label}: Rs${context.raw.toLocaleString()}`
                        }
                    }
                },
                scales: {
                    y: { grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#6c6c7c', font: { size: 11 } } },
                    x: { grid: { display: false }, ticks: { color: '#6c6c7c', font: { size: 11 } } }
                }
            }
        });
    }

    const ctxSavings = document.getElementById('annualSavingsChart');
    if (ctxSavings) {
        annualSavingsChartInstance = new Chart(ctxSavings, {
            type: 'line',
            data: {
                labels: months,
                datasets: [{
                    label: 'Savings Rate %',
                    data: savingsData,
                    borderColor: '#f97316', // var(--accent-blue) which is Orange
                    backgroundColor: 'rgba(249, 115, 22, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: 'rgba(26, 26, 46, 0.95)',
                        padding: 12,
                        cornerRadius: 8,
                        borderColor: 'rgba(255, 255, 255, 0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: (context) => ` Savings Rate: ${context.raw}%`
                        }
                    }
                },
                scales: {
                    y: {
                        grid: { color: 'rgba(255,255,255,0.03)' },
                        ticks: { color: '#6c6c7c', callback: (value) => value + '%' }
                    },
                    x: { grid: { display: false }, ticks: { color: '#6c6c7c' } }
                }
            }
        });
    }
}

function renderAnnualDataGrid(monthlyData, year) {
    const table = document.getElementById('annualDataTable');
    const tbody = document.getElementById('annualDataTableBody');
    if (!table || !tbody) return;

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Header
    let headerHtml = '<thead><tr><th class="sticky-col">Subcategory</th>';
    months.forEach(m => headerHtml += `<th class="text-right">${m}</th>`);
    headerHtml += '<th class="text-right total-col">Total</th></tr></thead>';
    table.innerHTML = headerHtml + '<tbody id="annualDataTableBody"></tbody>';
    const newTbody = document.getElementById('annualDataTableBody');

    // Collect all subcategories that have any data this year
    const subcatMap = {}; // name -> { catName, type, months: { 1: amt, ... } }

    Object.keys(financeData.categories).forEach(catId => {
        const cat = financeData.categories[catId];
        const subs = cat.subcategories || [];
        subs.forEach(s => {
            subcatMap[s.id] = {
                name: s.name,
                catName: cat.name,
                type: cat.type || 'spending',
                monthly: Array(13).fill(0)
            };
        });
    });

    // Populate with actual data
    for (let m = 1; m <= 12; m++) {
        const monthCats = monthlyData[m].categories;
        Object.keys(monthCats).forEach(catId => {
            const subs = monthCats[catId].subcategories;
            Object.keys(subs).forEach(subId => {
                if (subcatMap[subId]) {
                    subcatMap[subId].monthly[m] = subs[subId];
                }
            });
        });
    }

    // Sort: Earning categories first, then by name
    const sortedSubIds = Object.keys(subcatMap).sort((a, b) => {
        const sA = subcatMap[a];
        const sB = subcatMap[b];
        if (sA.type === 'earning' && sB.type !== 'earning') return -1;
        if (sB.type === 'earning' && sA.type !== 'earning') return 1;
        if (sA.catName !== sB.catName) return sA.catName.localeCompare(sB.catName);
        return sA.name.localeCompare(sB.name);
    });

    let trs = sortedSubIds.map(subId => {
        const sub = subcatMap[subId];
        const typeClass = sub.type === 'earning' ? 'row-earning' : 'row-spending';
        let rowHtml = `<tr class="${typeClass}"><td class="sticky-col"><div>${escapeHtml(sub.name)}</div><small class="text-muted">${escapeHtml(sub.catName)}</small></td>`;
        let yearlyTotal = 0;
        for (let m = 1; m <= 12; m++) {
            const amt = sub.monthly[m];
            yearlyTotal += amt;
            rowHtml += `<td class="text-right ${amt > 0 ? 'has-val' : 'no-val'}">${amt > 0 ? Math.round(amt).toLocaleString() : '—'}</td>`;
        }
        rowHtml += `<td class="text-right total-col"><strong>${Math.round(yearlyTotal).toLocaleString()}</strong></td></tr>`;
        return yearlyTotal > 0 ? rowHtml : ''; // Only show subcategories with data
    }).join('');

    // Summary Rows
    let incomeRow = '<tr class="summary-row income"><td class="sticky-col">Total Income</td>';
    let expenseRow = '<tr class="summary-row expense"><td class="sticky-col">Total Expenses</td>';
    let netRow = '<tr class="summary-row net"><td class="sticky-col">Net Profit</td>';

    let totalYrInc = 0;
    let totalYrExp = 0;

    for (let m = 1; m <= 12; m++) {
        const inc = monthlyData[m].income;
        const exp = monthlyData[m].expenses;
        totalYrInc += inc;
        totalYrExp += exp;
        incomeRow += `<td class="text-right">${Math.round(inc).toLocaleString()}</td>`;
        expenseRow += `<td class="text-right">${Math.round(exp).toLocaleString()}</td>`;
        netRow += `<td class="text-right ${inc - exp >= 0 ? 'text-success' : 'text-danger'}">${Math.round(inc - exp).toLocaleString()}</td>`;
    }

    incomeRow += `<td class="text-right"><strong>${Math.round(totalYrInc).toLocaleString()}</strong></td></tr>`;
    expenseRow += `<td class="text-right"><strong>${Math.round(totalYrExp).toLocaleString()}</strong></td></tr>`;
    netRow += `<td class="text-right"><strong>${Math.round(totalYrInc - totalYrExp).toLocaleString()}</strong></td></tr>`;

    newTbody.innerHTML = incomeRow + expenseRow + netRow + '<tr class="spacer-row"><td colspan="14"></td></tr>' + trs;
}

function exportAnnualReport() {
    const table = document.getElementById('annualDataTable');
    if (!table) return;

    let csv = [];
    const rows = table.querySelectorAll('tr');

    for (const row of rows) {
        if (row.classList.contains('spacer-row')) continue;
        const cols = row.querySelectorAll('td, th');
        const rowData = [];
        for (const col of cols) {
            // Clean up text (remove newlines, extra spaces, Rs prefix)
            let text = col.innerText.replace(/Rs/g, '').replace(/,/g, '').trim().split('\n')[0];
            if (text === '—') text = '0';
            rowData.push(`"${text}"`);
        }
        csv.push(rowData.join(','));
    }

    const csvContent = csv.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const yearSelect = document.getElementById('annualYearSelect');
    const year = yearSelect ? yearSelect.value : new Date().getFullYear();

    link.setAttribute('href', url);
    link.setAttribute('download', `Annual_Report_${year}.csv`);
    link.click();
}
