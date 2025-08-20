// API Test Runner JavaScript
// Manages settings, loads XHR logs, and executes API tests

// Global variables to store current state
let currentLogs = [];
let filteredLogs = [];
let testResults = [];

// Default settings
const defaultSettings = {
    baseUrl: '',
    allowedStatus: '200,201,202,204',
    timeoutMs: 2000,
    authToken: ''
};

/**
 * Initialize the application on page load
 */
document.addEventListener('DOMContentLoaded', () => {
    // Check for clearPrompt parameter
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('clearPrompt') === '1') {
        showClearModal();
    }
    
    // Load saved settings
    loadSettings();
    
    // Load XHR logs
    loadXHRLogs();
    
    // Setup event listeners
    setupEventListeners();
    
    // Apply dark mode if previously set
    if (localStorage.getItem("darkMode") === "enabled") {
        document.body.classList.add("dark-mode");
    }
});

/**
 * Setup all event listeners for the UI
 */
function setupEventListeners() {
    // Settings and action buttons
    document.getElementById('reloadBtn').addEventListener('click', loadXHRLogs);
    document.getElementById('selectAllBtn').addEventListener('click', selectAllRequests);
    document.getElementById('clearSelectionBtn').addEventListener('click', clearSelection);
    document.getElementById('clearCapturedBtn').addEventListener('click', showClearModal);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
    document.getElementById('runSelectedBtn').addEventListener('click', runSelectedTests);
    
    // Filter and search
    document.getElementById('actionFilter').addEventListener('change', applyFilters);
    document.getElementById('searchBox').addEventListener('input', applyFilters);
    
    // Select all checkbox
    document.getElementById('selectAllCheckbox').addEventListener('change', toggleAllSelection);
    
    // Modal event listeners
    document.getElementById('clearCancel').addEventListener('click', hideClearModal);
    document.getElementById('clearConfirm').addEventListener('click', confirmClearRequests);
    
    // Response viewer event listeners
    document.getElementById('closeResponseBtn').addEventListener('click', hideResponseViewer);
    document.getElementById('copyResponseBtn').addEventListener('click', copyResponse);
    
    // Click outside modal to close
    document.getElementById('clearModal').addEventListener('click', (e) => {
        if (e.target.id === 'clearModal') hideClearModal();
    });
    document.getElementById('responseViewer').addEventListener('click', (e) => {
        if (e.target.id === 'responseViewer') hideResponseViewer();
    });
}

/**
 * Load settings from chrome.storage.sync or localStorage fallback
 */
function loadSettings() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['apiTestSettings'], (result) => {
            const settings = result.apiTestSettings || defaultSettings;
            populateSettingsUI(settings);
        });
    } else {
        // Fallback to localStorage for testing outside extension
        const settings = JSON.parse(localStorage.getItem('apiTestSettings') || JSON.stringify(defaultSettings));
        populateSettingsUI(settings);
    }
}

/**
 * Save settings to chrome.storage.sync or localStorage fallback
 */
function saveSettings() {
    const settings = {
        baseUrl: document.getElementById('baseUrl').value.trim(),
        allowedStatus: document.getElementById('allowedStatus').value.trim(),
        timeoutMs: parseInt(document.getElementById('timeoutMs').value) || 2000,
        authToken: document.getElementById('authToken').value.trim()
    };
    
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set({ apiTestSettings: settings }, () => {
            showToast('Settings saved successfully!', 'success');
        });
    } else {
        localStorage.setItem('apiTestSettings', JSON.stringify(settings));
        showToast('Settings saved successfully!', 'success');
    }
}

/**
 * Populate settings UI with loaded values
 */
function populateSettingsUI(settings) {
    document.getElementById('baseUrl').value = settings.baseUrl || '';
    document.getElementById('allowedStatus').value = settings.allowedStatus || '200,201,202,204';
    document.getElementById('timeoutMs').value = settings.timeoutMs || 2000;
    document.getElementById('authToken').value = settings.authToken || '';
}

/**
 * Load XHR logs from chrome.storage.local
 */
function loadXHRLogs() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['urls'], (result) => {
            currentLogs = result.urls || [];
            processLogs();
            showToast('XHR logs loaded successfully!', 'info');
        });
    } else {
        // Fallback for testing - load sample data
        currentLogs = generateSampleData();
        processLogs();
        showToast('Sample data loaded for testing!', 'info');
    }
}

/**
 * Process loaded logs and update UI
 */
function processLogs() {
    // Group logs by action for the filter dropdown
    const actionMap = {};
    currentLogs.forEach(log => {
        if (!actionMap[log.action]) actionMap[log.action] = [];
        actionMap[log.action].push(log);
    });
    
    // Update action filter dropdown
    const actionFilter = document.getElementById('actionFilter');
    actionFilter.innerHTML = '<option value="All">All</option>';
    Object.keys(actionMap).sort().forEach(action => {
        const option = document.createElement('option');
        option.value = action;
        option.textContent = action;
        actionFilter.appendChild(option);
    });
    
    // Apply current filters
    applyFilters();
}

/**
 * Apply current filters and search to the logs
 */
function applyFilters() {
    const selectedAction = document.getElementById('actionFilter').value;
    const searchText = document.getElementById('searchBox').value.toLowerCase();
    
    filteredLogs = currentLogs.filter(log => {
        // Filter by action
        const actionMatch = selectedAction === 'All' || log.action === selectedAction;
        
        // Filter by search text (URL, method, payload)
        const searchMatch = searchText === '' || 
            log.url.toLowerCase().includes(searchText) ||
            log.method.toLowerCase().includes(searchText) ||
            (log.payload && JSON.stringify(log.payload).toLowerCase().includes(searchText));
        
        return actionMatch && searchMatch;
    });
    
    renderRequestsTable();
}

/**
 * Render the requests table with current filtered logs
 */
function renderRequestsTable() {
    const tbody = document.getElementById('requestsBody');
    
    if (filteredLogs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: var(--space-xl); color: #666;">
                    No requests found matching current filters.
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filteredLogs.map((log, index) => {
        const payloadSummary = getPayloadSummary(log.payload);
        const canEditBody = log.method !== 'GET' && log.method !== 'HEAD';
        
        return `
            <tr>
                <td>
                    <input type="checkbox" class="request-checkbox" data-index="${index}">
                </td>
                <td><span class="method-badge method-${log.method.toLowerCase()}">${log.method}</span></td>
                <td style="font-family: monospace; font-size: 0.9rem; word-break: break-all;">${log.url}</td>
                <td>${log.action}</td>
                <td class="payload-cell" title="${payloadSummary}">${payloadSummary}</td>
                <td>
                    ${canEditBody ? `<button class="btn-secondary" onclick="toggleEditBody(${index})" style="font-size: 0.8rem;">✏️ Edit</button>` : '<span style="color: #888;">N/A</span>'}
                </td>
                <td>${new Date(log.time).toLocaleString()}</td>
            </tr>
            ${canEditBody ? `
            <tr class="expanded-row" id="editRow${index}">
                <td colspan="7">
                    <div class="edit-body-panel">
                        <label style="font-weight: 600; margin-bottom: var(--space-sm); display: block;">Edit Request Body:</label>
                        <textarea class="edit-body-textarea" id="editBody${index}" placeholder="Enter JSON or form data...">${log.payload ? (typeof log.payload === 'object' ? JSON.stringify(log.payload, null, 2) : log.payload) : ''}</textarea>
                        <div class="edit-body-buttons">
                            <button class="btn-secondary" onclick="cancelEditBody(${index})">Cancel</button>
                            <button class="btn-primary" onclick="validateBody(${index})">Validate & Save</button>
                        </div>
                        <div id="validationMessage${index}" style="margin-top: var(--space-sm); font-size: 0.9em;"></div>
                    </div>
                </td>
            </tr>
            ` : ''}
        `;
    }).join('');
}

/**
 * Generate a summary of the payload for display
 */
function getPayloadSummary(payload) {
    if (!payload) return 'No payload';
    
    if (typeof payload === 'object') {
        return JSON.stringify(payload).substring(0, 50) + '...';
    }
    
    if (typeof payload === 'string') {
        return payload.length > 50 ? payload.substring(0, 50) + '...' : payload;
    }
    
    return String(payload).substring(0, 50) + '...';
}

/**
 * Select all visible requests
 */
function selectAllRequests() {
    document.querySelectorAll('.request-checkbox').forEach(checkbox => {
        checkbox.checked = true;
    });
    document.getElementById('selectAllCheckbox').checked = true;
}

/**
 * Clear all selections
 */
function clearSelection() {
    document.querySelectorAll('.request-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });
    document.getElementById('selectAllCheckbox').checked = false;
}

/**
 * Toggle all checkboxes based on the main checkbox
 */
function toggleAllSelection() {
    const selectAll = document.getElementById('selectAllCheckbox').checked;
    document.querySelectorAll('.request-checkbox').forEach(checkbox => {
        checkbox.checked = selectAll;
    });
}

/**
 * Run tests for selected requests
 */
async function runSelectedTests() {
    const selectedCheckboxes = document.querySelectorAll('.request-checkbox:checked');
    
    if (selectedCheckboxes.length === 0) {
        showToast('Please select at least one request to test', 'error');
        return;
    }
    
    // Get current settings
    const settings = {
        baseUrl: document.getElementById('baseUrl').value.trim(),
        allowedStatus: document.getElementById('allowedStatus').value.trim(),
        timeoutMs: parseInt(document.getElementById('timeoutMs').value) || 2000,
        authToken: document.getElementById('authToken').value.trim()
    };
    
    // Parse allowed status codes
    const allowedStatusCodes = settings.allowedStatus
        .split(',')
        .map(s => parseInt(s.trim()))
        .filter(n => !isNaN(n));
    
    // Clear previous results
    testResults = [];
    updateSummary();
    
    showToast(`Running ${selectedCheckboxes.length} tests...`, 'info');
    
    // Run tests for each selected request
    for (const checkbox of selectedCheckboxes) {
        const index = parseInt(checkbox.dataset.index);
        const log = filteredLogs[index];
        
        try {
            const result = await runSingleTest(log, settings, allowedStatusCodes);
            testResults.push(result);
            updateResultsTable();
            updateSummary();
        } catch (error) {
            console.error('Test execution error:', error);
            testResults.push({
                method: log.method,
                url: log.url,
                status: 'ERROR',
                time: 0,
                note: `Error: ${error.message}`,
                passed: false
            });
            updateResultsTable();
            updateSummary();
        }
    }
    
    showToast('All tests completed!', 'success');
}

/**
 * Run a single API test
 */
async function runSingleTest(log, settings, allowedStatusCodes) {
    const startTime = Date.now();
    
    try {
        // Resolve the URL
        const resolvedUrl = resolveUrl(log.url, settings.baseUrl);
        
        // Use edited payload if available, otherwise use original
        const payloadToUse = log.editedPayload !== undefined ? log.editedPayload : log.payload;
        
        // Detect body type and prepare headers
        const { headers, body } = prepareRequestOptions(payloadToUse, settings.authToken);
        
        // Create abort controller for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), settings.timeoutMs);
        
        // Make the request
        const response = await fetch(resolvedUrl, {
            method: log.method,
            headers,
            body: log.method !== 'GET' && log.method !== 'HEAD' ? body : undefined,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        // Get response text
        let responseText = '';
        let contentType = '';
        try {
            contentType = response.headers.get('content-type') || '';
            responseText = await response.text();
        } catch (e) {
            responseText = 'Failed to read response body';
        }
        
        const elapsedTime = Date.now() - startTime;
        const passed = allowedStatusCodes.includes(response.status);
        
        return {
            method: log.method,
            url: resolvedUrl,
            status: response.status,
            time: elapsedTime,
            note: response.statusText,
            passed,
            responseText,
            contentType
        };
        
    } catch (error) {
        const elapsedTime = Date.now() - startTime;
        
        if (error.name === 'AbortError') {
            return {
                method: log.method,
                url: resolveUrl(log.url, settings.baseUrl),
                status: 'TIMEOUT',
                time: elapsedTime,
                note: `Request timed out after ${settings.timeoutMs}ms`,
                passed: false,
                responseText: 'Request timed out',
                contentType: 'text/plain'
            };
        }
        
        return {
            method: log.method,
            url: resolveUrl(log.url, settings.baseUrl),
            status: 'ERROR',
            time: elapsedTime,
            note: error.message,
            passed: false,
            responseText: error.message,
            contentType: 'text/plain'
        };
    }
}

/**
 * Resolve URL - if relative, prefix with baseUrl
 */
function resolveUrl(url, baseUrl) {
    if (!url) return '';
    
    // If URL is already absolute, return as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    
    // If no base URL provided, return the original URL
    if (!baseUrl) return url;
    
    // Remove trailing slash from baseUrl and leading slash from url to avoid double slashes
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    const cleanUrl = url.replace(/^\//, '');
    
    return `${cleanBaseUrl}/${cleanUrl}`;
}

/**
 * Prepare request headers and body based on payload type
 */
function prepareRequestOptions(payload, authToken) {
    const headers = {
        'Accept': 'application/json'
    };
    
    // Add authorization header if token is provided
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    let body = null;
    
    if (payload) {
        if (typeof payload === 'object') {
            // JSON payload
            headers['Content-Type'] = 'application/json';
            body = JSON.stringify(payload);
        } else if (typeof payload === 'string') {
            // Check if it's form data (contains = and &)
            if (payload.includes('=') && payload.includes('&')) {
                headers['Content-Type'] = 'application/x-www-form-urlencoded';
                body = payload;
            } else {
                // Try to parse as JSON, otherwise treat as plain text
                try {
                    JSON.parse(payload);
                    headers['Content-Type'] = 'application/json';
                    body = payload;
                } catch {
                    headers['Content-Type'] = 'text/plain';
                    body = payload;
                }
            }
        }
    }
    
    return { headers, body };
}

/**
 * Update the results table with current test results
 */
function updateResultsTable() {
    const tbody = document.getElementById('resultsBody');
    
    if (testResults.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: var(--space-xl); color: #666;">
                    No tests run yet...
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = testResults.map((result, index) => {
        const statusClass = result.passed ? 'status-success' : 'status-error';
        const statusText = typeof result.status === 'number' ? result.status : result.status;
        
        return `
            <tr>
                <td><span class="method-badge method-${result.method.toLowerCase()}">${result.method}</span></td>
                <td style="font-family: monospace; font-size: 0.9rem; word-break: break-all;">${result.url}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${result.time}</td>
                <td>${result.note}</td>
                <td>
                    ${result.responseText ? `<button class="btn-secondary" onclick="viewResponse(${index})" style="font-size: 0.8rem;">👁️ View</button>` : '<span style="color: #888;">N/A</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * View response for a test result
 */
function viewResponse(index) {
    const result = testResults[index];
    if (result.responseText) {
        showResponseViewer(
            `Response for ${result.method} ${result.url}`,
            result.responseText,
            result.contentType || ''
        );
    }
}

/**
 * Update the summary counters
 */
function updateSummary() {
    const passed = testResults.filter(r => r.passed).length;
    const failed = testResults.filter(r => !r.passed).length;
    const total = testResults.length;
    
    document.getElementById('passedCount').textContent = passed;
    document.getElementById('failedCount').textContent = failed;
    document.getElementById('totalCount').textContent = total;
}

/**
 * Show a toast notification
 */
function showToast(message, type = 'info') {
    // Remove any existing toasts
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    // Show the toast
    setTimeout(() => {
        toast.classList.add('show');
    }, 100);
    
    // Hide and remove the toast after 3 seconds
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

/**
 * Show clear confirmation modal
 */
function showClearModal() {
    document.getElementById('clearModal').style.display = 'block';
}

/**
 * Hide clear confirmation modal
 */
function hideClearModal() {
    document.getElementById('clearModal').style.display = 'none';
}

/**
 * Confirm and execute clearing of captured requests
 */
function confirmClearRequests() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ urls: [], actions: [] }, () => {
            showToast('Captured requests cleared!', 'success');
            loadXHRLogs(); // Reload the empty data
        });
    } else {
        // Fallback for testing
        currentLogs = [];
        processLogs();
        showToast('Captured requests cleared!', 'success');
    }
    hideClearModal();
}

/**
 * Show response viewer modal
 */
function showResponseViewer(title, responseText, contentType) {
    document.getElementById('responseTitle').textContent = title;
    const responseElement = document.getElementById('responseJson');
    
    // Try to format as JSON if it's JSON content
    if (contentType && contentType.includes('application/json')) {
        try {
            const parsed = JSON.parse(responseText);
            responseElement.textContent = JSON.stringify(parsed, null, 2);
        } catch (e) {
            responseElement.textContent = responseText;
        }
    } else {
        responseElement.textContent = responseText;
    }
    
    document.getElementById('responseViewer').style.display = 'flex';
}

/**
 * Hide response viewer modal
 */
function hideResponseViewer() {
    document.getElementById('responseViewer').style.display = 'none';
}

/**
 * Toggle edit body panel for a request
 */
function toggleEditBody(index) {
    const editRow = document.getElementById(`editRow${index}`);
    const isVisible = editRow.classList.contains('show');
    
    // Hide all other edit panels first
    document.querySelectorAll('.expanded-row').forEach(row => {
        row.classList.remove('show');
    });
    
    if (!isVisible) {
        editRow.classList.add('show');
    }
}

/**
 * Cancel edit body operation
 */
function cancelEditBody(index) {
    document.getElementById(`editRow${index}`).classList.remove('show');
    // Reset textarea to original payload
    const log = filteredLogs[index];
    const textarea = document.getElementById(`editBody${index}`);
    textarea.value = log.payload ? (typeof log.payload === 'object' ? JSON.stringify(log.payload, null, 2) : log.payload) : '';
    document.getElementById(`validationMessage${index}`).textContent = '';
}

/**
 * Validate and save edited body
 */
function validateBody(index) {
    const textarea = document.getElementById(`editBody${index}`);
    const messageDiv = document.getElementById(`validationMessage${index}`);
    const bodyText = textarea.value.trim();
    
    let isValid = true;
    let message = '';
    
    if (bodyText) {
        // Try to validate as JSON
        try {
            JSON.parse(bodyText);
            message = '✅ Valid JSON';
        } catch (e) {
            // Check if it looks like form data
            if (bodyText.includes('=')) {
                message = '✅ Form data detected';
            } else {
                message = '⚠️ Plain text (will be sent as-is)';
            }
        }
    } else {
        message = '✅ Empty body';
    }
    
    messageDiv.innerHTML = `<span style="color: ${isValid ? '#10b981' : '#ef4444'}">${message}</span>`;
    
    // Save the edited body to the log
    if (isValid) {
        try {
            filteredLogs[index].editedPayload = bodyText ? (bodyText.startsWith('{') || bodyText.startsWith('[') ? JSON.parse(bodyText) : bodyText) : null;
        } catch (e) {
            filteredLogs[index].editedPayload = bodyText || null;
        }
        
        setTimeout(() => {
            document.getElementById(`editRow${index}`).classList.remove('show');
            messageDiv.textContent = '';
            showToast('Body saved for request!', 'success');
        }, 1000);
    }
}
function generateSampleData() {
    return [
        {
            action: 'login',
            url: '/api/auth/login',
            method: 'POST',
            time: new Date().toISOString(),
            payload: { username: 'test@example.com', password: 'password123' }
        },
        {
            action: 'users',
            url: 'https://jsonplaceholder.typicode.com/users',
            method: 'GET',
            time: new Date(Date.now() - 5000).toISOString(),
            payload: null
        },
        {
            action: 'posts',
            url: '/api/posts',
            method: 'POST',
            time: new Date(Date.now() - 10000).toISOString(),
            payload: { title: 'Test Post', content: 'This is a test post content.' }
        },
        {
            action: 'update',
            url: '/api/user/profile',
            method: 'PUT',
            time: new Date(Date.now() - 15000).toISOString(),
            payload: 'name=John+Doe&email=john@example.com&age=30'
        },
        {
            action: 'delete',
            url: '/api/posts/123',
            method: 'DELETE',
            time: new Date(Date.now() - 20000).toISOString(),
            payload: null
        }
    ];
}

// Add CSS for method badges dynamically
const style = document.createElement('style');
style.textContent = `
    .method-badge {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.8rem;
        font-weight: 600;
        color: white;
    }
    
    .method-get { background: #10b981; }
    .method-post { background: #3b82f6; }
    .method-put { background: #f59e0b; }
    .method-patch { background: #8b5cf6; }
    .method-delete { background: #ef4444; }
    .method-head { background: #6b7280; }
    .method-options { background: #6b7280; }
`;
document.head.appendChild(style);