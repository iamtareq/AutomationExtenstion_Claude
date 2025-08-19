// Import JMeter helpers (ES module style)
import { generateJMeterHttpSampler, wrapInJmx, downloadFile } from './jmeterGenerator.js';

// --- Modern popup.js with toast, modal, theme, FAB, and confirmations ---

document.addEventListener('DOMContentLoaded', () => {
    // UI element selectors
    const toggleSwitch = document.getElementById('toggleSwitch');
    const viewBtn = document.getElementById('viewBtn');
    const resetBtn = document.getElementById('resetBtn');
    const downloadExcelBtn = document.getElementById('downloadExcelBtn');
    const menuNameInput = document.getElementById('menuNameInput');
    const actionNameInput = document.getElementById('actionNameInput');
    const exportBtn = document.getElementById('export');
    const enableLogging = document.getElementById('enableLogging');
    const domainInput = document.getElementById('domainFilterInput');
    const fabBtn = document.getElementById('fab');
    const themeToggle = document.getElementById('themeToggle');

    // --- Theme toggle (dark/light mode) ---
    if (localStorage.getItem("darkMode") === "enabled") document.body.classList.add("dark-mode");
    themeToggle.onclick = () => {
        document.body.classList.toggle('dark-mode');
        localStorage.setItem("darkMode", document.body.classList.contains("dark-mode") ? "enabled" : "disabled");
    };

    // --- Modal dialog for confirmations ---
    function showModal(message, onConfirm) {
        const modal = document.getElementById('modal');
        document.getElementById('modal-message').innerText = message;
        modal.style.display = 'flex';
        document.getElementById('modal-confirm').onclick = function () {
            modal.style.display = 'none';
            onConfirm();
        };
        document.getElementById('modal-cancel').onclick = function () {
            modal.style.display = 'none';
        };
    }

    // --- Toast notifications ---
    window.showToast = function (message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = 'toast-message toast-' + type;
        toast.innerHTML = (type === 'success' ? '✅ ' : type === 'error' ? '❌ ' : 'ℹ️ ') + message;
        document.body.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 2200);
    };

    // --- Load extension settings from storage ---
    chrome.storage.sync.get(['extensionEnabled', 'actionName', 'menuName'], (result) => {
        toggleSwitch.checked = result.extensionEnabled ?? false;
        actionNameInput.value = result.actionName ?? '';
        menuNameInput.value = result.menuName ?? '';
    });

    chrome.storage.local.get(['filterDomain', 'loggingEnabled'], (result) => {
        if (domainInput) domainInput.value = result.filterDomain || '';
        if (enableLogging) enableLogging.checked = !!result.loggingEnabled;
    });

    // --- Enable/disable extension ---
    toggleSwitch?.addEventListener('change', () => {
        chrome.storage.sync.set({ extensionEnabled: toggleSwitch.checked });
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'toggle',
                    value: toggleSwitch.checked
                }).catch(() => { });
            }
        });
    });

    // --- Set action/page class names from input ---
    actionNameInput?.addEventListener('input', () => {
        const actionName = actionNameInput.value.trim();
        const elementClassName = `${actionName}Element`;
        const pageClassName = `${actionName}Page`;
        chrome.storage.sync.set({ actionName, elementClassName, pageClassName });
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'setClassName', value: elementClassName }).catch(() => { });
                chrome.tabs.sendMessage(tabs[0].id, { action: 'setPageClassName', value: pageClassName }).catch(() => { });
            }
        });
    });

    // --- Set menu name (for Gherkin steps) ---
    menuNameInput?.addEventListener('input', () => {
        const menuName = menuNameInput.value.trim();
        chrome.storage.sync.set({ menuName });
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
                chrome.tabs.sendMessage(tabs[0].id, { action: 'setMenuName', value: menuName }).catch(() => { });
            }
        });
    });

    // --- Reset/clear all data & logs ---
    resetBtn?.addEventListener('click', () => {
        showModal("Are you sure you want to clear all data and logs?", () => {
            chrome.storage.sync.set({
                collectedLocators: [],
                collectedGherkinSteps: [],
                collectedMethods: [],
                collectedParamValues: {}
            }, () => {
                if (chrome.runtime.lastError) {
                    showToast('Error resetting: ' + chrome.runtime.lastError.message, 'error');
                    return;
                }
                chrome.storage.local.set({ urls: [], actions: [] }, () => {
                    if (chrome.runtime.lastError) {
                        showToast('Error clearing logs: ' + chrome.runtime.lastError.message, 'error');
                    } else {
                        showToast('All data and logs cleared!', 'success');
                    }
                });
            });
        });
    });

    // --- Open view.html page in new tab ---
    viewBtn?.addEventListener('click', () => {
        chrome.tabs.create({ url: chrome.runtime.getURL('view.html') });
    });

    // --- Export Excel file with parameters/steps ---
    downloadExcelBtn?.addEventListener('click', () => {
        chrome.storage.sync.get(['collectedGherkinSteps', 'menuName', 'collectedParamValues'], (result) => {
            const steps = result.collectedGherkinSteps || [];
            const paramMap = result.collectedParamValues || {};
            const rawMenuName = result.menuName || 'ExportedSheet';
            const cleanedMenuName = rawMenuName.replace(/\s+/g, '');

            // Gather all unique parameter names used in steps
            const paramSet = new Set();
            const paramRegex = /<([^>]+)>/g;
            steps.forEach(step => {
                let match;
                while ((match = paramRegex.exec(step)) !== null) {
                    paramSet.add(match[1]);
                }
            });

            const headers = Array.from(paramSet);
            if (headers.length === 0) {
                showToast("No parameters found", "error");
                return;
            }

            // Prepare worksheet for Excel
            const wsData = [headers, headers.map(h => paramMap[h] || '')];
            const worksheet = XLSX.utils.aoa_to_sheet(wsData);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, cleanedMenuName);
            XLSX.writeFile(workbook, `${cleanedMenuName}.xlsx`);
            showToast("Excel exported!", "success");
        });
    });

// JMX Export button event handler -- use endpoint as name
exportBtn?.addEventListener('click', () => {
    chrome.storage.local.get(['urls'], function(result) {
        const xhrs = (result.urls || []).filter(isLikelyApiRequest);
        if (xhrs.length === 0) {
            showToast("No XHR requests found!", "error");
            return;
        }
        let allSamplers = xhrs.map((xhr) => {
            const endpoint = extractEndpointName(xhr.url);
            return generateJMeterHttpSampler(xhr, endpoint);
        });
        let jmx = wrapInJmx(allSamplers);
        downloadFile('exported-requests.jmx', jmx);
        showToast("JMX exported!", "success");
    });
});


function isLikelyApiRequest(x) {
    if (!(x.url && x.method)) return false;
    if (x.method !== 'POST' && x.method !== 'GET') return false;
    // Remove query parameters for extension check
    let urlPath;
    try {
        urlPath = new URL(x.url).pathname;
    } catch (e) {
        urlPath = x.url.split('?')[0];
    }
    // Filter out static resources (js, css, images, fonts, etc)
    if (/\.(js|css|svg|png|jpg|jpeg|gif|woff2?|ttf|ico|map|eot|bmp|webp|mp4|mp3|pdf|txt)$/i.test(urlPath)) return false;
    if (urlPath === "/") return false; // Exclude root/homepage requests
    return true;
}


// Add this helper to popup.js (top or bottom)
function extractEndpointName(url) {
    try {
        const path = new URL(url).pathname;
        const cleaned = path.replace(/\/$/, '');
        return cleaned.split('/').pop() || 'Root';
    } catch (e) {
        return url;
    }
}

    // --- Enable/disable network logging ---
    enableLogging?.addEventListener('change', () => {
        const loggingEnabled = enableLogging.checked;
        chrome.storage.local.set({ loggingEnabled });
    });

    // --- Filter XHR capture by domain ---
    domainInput?.addEventListener('input', () => {
        const filterDomain = domainInput.value.trim();
        chrome.storage.local.set({ filterDomain });
    });

    // --- Floating Action Button: open view.html ---
    fabBtn.onclick = () => {
        showToast("Quick action: Open view!", "info");
        window.open('view.html', '_blank', 'width=900,height=800,left=200,top=100');
    };
});
