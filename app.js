/**
 * Inventory Manager - Frontend Application
 * Supports: Product Stock & Raw Materials
 */

// ============================================
// GLOBAL STATE
// ============================================

let APP_CONFIG = {
    scriptUrl: '',
    userName: '',
    authCode: '',
    userRole: '',
    fullName: '',
    profilePicture: ''
};

let productsData = [];
let materialsData = [];
let logsData = [];
let currentLogTab = 'product';
let currentView = 'dashboard';
let currentInventoryType = 'product';

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
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

function loadSettings() {
    const savedUrl = localStorage.getItem('inventoryScriptUrl');
    const savedName = sessionStorage.getItem('inventoryUserName');
    const savedCode = sessionStorage.getItem('inventoryAuthCode');
    const savedRole = sessionStorage.getItem('inventoryUserRole');

    if (savedUrl) {
        APP_CONFIG.scriptUrl = savedUrl;

        if (savedName && savedCode) {
            APP_CONFIG.userName = savedName;
            APP_CONFIG.authCode = savedCode;
            APP_CONFIG.userRole = savedRole || 'User';
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
            e.preventDefault();
            const view = item.dataset.view;
            switchView(view);
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

    // Reset visibility
    navUsers.classList.add('hidden');
    navLogs.classList.remove('hidden');
    if (navOverview) navOverview.classList.remove('hidden');

    if (APP_CONFIG.userRole === 'Admin') {
        navUsers.classList.remove('hidden');
    } else {
        // Hide Admin-only features
        if (APP_CONFIG.userRole === 'Viewer') {
            navLogs.classList.add('hidden');
        }

        // Hide settings for non-admins
        const settingsIds = ['sidebarSettingsBtn', 'headerSettingsBtn', 'alertSettingsBtn'];
        settingsIds.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) btn.classList.add('hidden');
        });

        // Hide Add Item for Viewers
        if (APP_CONFIG.userRole === 'Viewer') {
            const addItemBtn = document.getElementById('addItemBtn');
            if (addItemBtn) addItemBtn.classList.add('hidden');
        }
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

    if (!username || pin.length !== 4) {
        showToast('Username and 4-digit pin are required', 'error');
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
            APP_CONFIG.userName = result.username;
            APP_CONFIG.authCode = pin;
            APP_CONFIG.userRole = result.role;
            APP_CONFIG.fullName = result.fullName || '';
            APP_CONFIG.profilePicture = result.profilePicture || '';

            sessionStorage.setItem('inventoryUserName', result.username);
            sessionStorage.setItem('inventoryAuthCode', pin);
            sessionStorage.setItem('inventoryUserRole', result.role);
            sessionStorage.setItem('inventoryUserFullName', APP_CONFIG.fullName);
            sessionStorage.setItem('inventoryUserProfilePic', APP_CONFIG.profilePicture);

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
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('inventoryUserName');
        sessionStorage.removeItem('inventoryAuthCode');
        sessionStorage.removeItem('inventoryUserRole');
        APP_CONFIG.userName = '';
        APP_CONFIG.authCode = '';
        APP_CONFIG.userRole = '';
        document.getElementById('app').classList.add('hidden');
        openModal('loginModal');
    }
}

function openSettingsModal() {
    if (APP_CONFIG.userRole !== 'Admin') {
        showToast('Settings are only available for Administrators', 'error');
        return;
    }
    document.getElementById('settingsUrl').value = APP_CONFIG.scriptUrl;
    document.getElementById('settingsName').value = APP_CONFIG.userName;
    openModal('settingsModal');
}

function updateSettings() {
    const url = document.getElementById('settingsUrl').value.trim();
    const name = document.getElementById('settingsName').value.trim();

    if (!url || !name) {
        showToast('Please fill in all fields', 'error');
        return;
    }

    APP_CONFIG.scriptUrl = url;
    APP_CONFIG.userName = name;

    localStorage.setItem('inventoryScriptUrl', url);
    localStorage.setItem('inventoryUserName', name);

    document.getElementById('userNameDisplay').textContent = name;

    closeModal('settingsModal');
    refreshData();
    showToast('Settings updated!', 'success');
}

function clearSettings() {
    if (confirm('This will disconnect from your Google Sheet. Continue?')) {
        localStorage.removeItem('inventoryScriptUrl');
        localStorage.removeItem('inventoryUserName');
        APP_CONFIG.scriptUrl = '';
        APP_CONFIG.userName = '';
        closeModal('settingsModal');
        showSetupModal();
    }
}

// ============================================
// API CALLS
// ============================================

async function apiCall(params) {
    showLoading(true);

    try {
        const url = APP_CONFIG.scriptUrl;

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
    currentView = view;


    // Set current inventory type based on view
    if (view === 'products') {
        currentInventoryType = 'product';
    } else if (view === 'materials') {
        currentInventoryType = 'material';
    }

    // Update nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === view);
    });

    // Update views
    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
    });
    document.getElementById(view + 'View').classList.add('active');

    // Update title
    const titles = {
        overview: 'Overview',
        dashboard: 'Dashboard',
        products: 'Product Stock',
        materials: 'Raw Materials',
        logs: 'Stock Movement Logs',
        lowstock: 'Low Stock Alerts',
        users: 'User Management'
    };
    document.getElementById('pageTitle').textContent = titles[view] || 'Inventory';

    // Show/hide add button based on role and view
    const addItemBtn = document.getElementById('addItemBtn');
    const isViewer = APP_CONFIG.userRole === 'Viewer';

    if (addItemBtn) {
        if (view === 'lowstock' || view === 'users' || view === 'overview' || isViewer) {
            addItemBtn.classList.add('hidden');
        } else {
            addItemBtn.classList.remove('hidden');
        }
    }

    if (view === 'logs' && isViewer) {
        switchView('dashboard');
        return;
    }

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

    // Update table header visibility for action column
    const tableHeaders = tbody.closest('table').querySelector('thead tr');
    const actionHeader = tableHeaders.querySelector('th:last-child');
    if (actionHeader) { // Ensure actionHeader exists
        actionHeader.style.display = isViewer ? 'none' : '';
    }

    if (items.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="${isViewer ? 7 : 8}" class="empty-state">
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
                ${isViewer ? '' : `
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
    if (!confirm(`Are you sure you want to delete ${typeLabel} "${name}"?`)) {
        return;
    }

    try {
        await apiCall({ action: 'delete', type: type, id: id });
        showToast('Item deleted successfully!', 'success');
        invalidateCache();
        refreshData(true);
    } catch (error) {
        console.error('Delete failed:', error);
    }
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
            <tr>
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
        dateStr = new Date(dateStr).toISOString().split('T')[0];
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
    if (!confirm('Are you sure you want to delete this log entry? Current stock will be adjusted accordingly.')) {
        return;
    }

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
            }
        } catch (error) {
            showToast('Error loading user data', 'error');
        }
    } else {
        document.getElementById('userModalTitle').textContent = 'Create User';
        document.getElementById('userSubmitBtn').textContent = 'Create User';
    }

    openModal('userModal');
}

async function handleUserFormSubmit(e) {
    e.preventDefault();
    const userId = document.getElementById('mgmtUserId').value;
    const data = {
        fullName: document.getElementById('mgmtFullName').value.trim(),
        username: document.getElementById('mgmtUsername').value.trim(),
        pin: document.getElementById('mgmtPin').value.trim(),
        role: document.getElementById('mgmtRole').value
    };

    if (!data.username || data.pin.length !== 4) {
        showToast('Username and 4-digit pin are required', 'error');
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

    if (!confirm(`Are you sure you want to delete user "${username}"?`)) {
        return;
    }

    try {
        await apiCall({ action: 'deleteUser', id: userId });
        showToast('User deleted successfully', 'success');
        refreshUsers();
    } catch (error) {
        console.error('Delete failed:', error);
    }
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
        e.target.classList.remove('active');
    }
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            if (modal.id !== 'setupModal') {
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

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    toast.className = 'toast show ' + type;
    toastMessage.textContent = message;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
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
    if (!confirm('Are you sure you want to delete this batch?')) return;

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
