// Modern view.js: cards, dark mode, copy, edit, search, toasts

function parseLocator(locator) {
    const labelMatch = locator.match(/IWebElement\s+(\w+)/);
    const xpathMatch = locator.match(/By\.XPath\("([^"]+)"\)/);
    return {
        label: labelMatch ? labelMatch[1] : '',
        xpath: xpathMatch ? xpathMatch[1] : '',
        original: locator
    };
}

function filterDuplicateStrings(arr) {
    return Array.from(new Set(arr));
}
function filterDuplicateLocators(locators) {
    const seen = new Set();
    return locators.filter(loc => {
        if (seen.has(loc)) return false;
        seen.add(loc);
        return true;
    });
}

// Helper function to get data from chrome storage or localStorage (for testing)
function getStoredData(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get([
            'collectedLocators', 'collectedGherkinSteps', 'collectedMethods',
            'elementClassName', 'pageClassName', 'actionName'
        ], callback);
    } else {
        // Fallback to localStorage for testing
        const result = {
            collectedLocators: JSON.parse(localStorage.getItem('collectedLocators') || '[]'),
            collectedGherkinSteps: JSON.parse(localStorage.getItem('collectedGherkinSteps') || '[]'),
            collectedMethods: JSON.parse(localStorage.getItem('collectedMethods') || '[]'),
            elementClassName: JSON.parse(localStorage.getItem('elementClassName') || '"DefaultElementClass"'),
            pageClassName: JSON.parse(localStorage.getItem('pageClassName') || '"DefaultPageClass"'),
            actionName: JSON.parse(localStorage.getItem('actionName') || '""')
        };
        callback(result);
    }
}

getStoredData((result) => {
    console.log('Loaded data:', result); // Debug log
    
    const locators = filterDuplicateLocators(result.collectedLocators || []);
    const gherkinSteps = filterDuplicateStrings(result.collectedGherkinSteps || []);
    const methods = filterDuplicateStrings(result.collectedMethods || []);
    const actionName = result.actionName || '';
    
    // Generate class names based on action name
    let className, pageClassName;
    if (actionName && actionName.trim()) {
        const cleanActionName = actionName.replace(/\s+/g, ''); // Remove spaces
        className = `${cleanActionName}Element`;
        pageClassName = `${cleanActionName}Page`;
    } else {
        className = result.elementClassName || 'DefaultElementClass';
        pageClassName = result.pageClassName || 'DefaultPageClass';
    }

    const locatorElement = document.getElementById('locatorCode');
    const gherkinElement = document.getElementById('gherkinCode');
    const methodElement = document.getElementById('methodCode');
    
    if (locatorElement) {
        locatorElement.innerText = locators.length
            ? `public static class ${className} {\n${locators.map(l => '    ' + l).join('\n')}\n}`
            : 'No locators collected.';
    }

    if (gherkinElement) {
        gherkinElement.innerText = gherkinSteps.length
            ? gherkinSteps.join('\n')
            : 'No Gherkin steps collected.';
    }

    if (methodElement) {
        methodElement.innerText = methods.length
            ? `public static class ${pageClassName}(IWebDriver driver) {\n    public IWebDriver Driver => driver;\n\n    public IJavaScriptExecutor Js => (IJavaScriptExecutor)driver;\n\n${methods.map(m => '    ' + m).join('\n')}\n}`
            : 'No methods collected.';
    }

    console.log('Gherkin steps found:', gherkinSteps.length); // Debug log
    console.log('Action name:', actionName); // Debug log
    console.log('Generated class names:', { className, pageClassName }); // Debug log
    
    // Initialize step file generator - ensure DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => initializeStepFileGenerator(gherkinSteps, pageClassName), 100);
        });
    } else {
        setTimeout(() => initializeStepFileGenerator(gherkinSteps, pageClassName), 100);
    }
});

function renderActionList(actions) {
    const container = document.getElementById('xhrActions');
    if (!container) return;
    const list = actions.map(a => `• ${a}`).join('\n');
    container.innerText = list || 'No actions found.';
}

// 🔥 Load and group XHR logs
function loadXHRLogs() {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['urls', 'actions'], processXHRData);
    } else {
        // Fallback for testing
        const urls = JSON.parse(localStorage.getItem('urls') || '[]');
        const actions = JSON.parse(localStorage.getItem('actions') || '[]');
        processXHRData({ urls, actions });
    }
}

function processXHRData(res) {
    const urls = res.urls || [];
    const actionMap = {};
    urls.forEach(entry => {
        if (!actionMap[entry.action]) actionMap[entry.action] = [];
        actionMap[entry.action].push(entry);
    });

    const actionFilter = document.getElementById('actionFilter');
    const xhrSearch = document.getElementById('xhrSearch');
	
	actionFilter.innerHTML = '<option value="All">All</option>';

    Object.keys(actionMap).sort().forEach(action => {
        const opt = document.createElement('option');
        opt.value = action;
        opt.textContent = action;
        actionFilter.appendChild(opt);
    });

    function renderLogs(actionKey, search = '') {
        let logOutput = '';
        const targetActions = actionKey === 'All' ? Object.keys(actionMap) : [actionKey];
        targetActions.forEach(action => {
            const filteredEntries = actionMap[action].filter(u =>
                u.url.toLowerCase().includes(search) ||
                (u.method && u.method.toLowerCase().includes(search)) ||
                (u.time && u.time.toLowerCase().includes(search)) ||
                (u.payload && JSON.stringify(u.payload).toLowerCase().includes(search))
            );
            if (filteredEntries.length === 0) return;
            logOutput += `# ${action}\n`;
            filteredEntries.forEach(u => {
                logOutput += `[${u.method}] ${u.url} (${u.time})\n`;
                if (u.payload) {
                    if (typeof u.payload === 'object') {
                        const formattedPayload = JSON.stringify(u.payload, null, 2)
                            .split('\n')
                            .map(line => `    ${line}`)
                            .join('\n');
                        logOutput += `  Payload:\n${formattedPayload}\n`;
                    } else {
                        logOutput += `  Payload: ${u.payload}\n`;
                    }
                }
            });
            logOutput += '\n';
        });
        document.getElementById('xhrLogs').innerText = logOutput || 'No URLs found.';
    }

    actionFilter.addEventListener('change', () => {
        renderLogs(actionFilter.value, xhrSearch.value.trim().toLowerCase());
    });
    if (xhrSearch) {
        xhrSearch.addEventListener('input', () => {
            renderLogs(actionFilter.value, xhrSearch.value.trim().toLowerCase());
        });
    }

    renderLogs('All');
    renderActionList(res.actions || []);
}

// Call the function to load XHR logs
loadXHRLogs();

// Sample data functions
function loadSampleData() {
    const sampleData = {
        collectedGherkinSteps: [
            "When Click On Login Button",
            "When Enter TestMenu Username \"<username>\"",
            "When Select ClassAttendance Organization \"<organization>\"",
            "When Enter ExamReport Date From \"<dateFrom>\"",
            "When Enter StudentReport Date To \"<dateTo>\"",
            "When Select AdminPanel Multiple Courses \"<courses>\"",
            "When Select StudentData Version \"<version>\"",
            "When Enter ManageGroup Excel File \"<excelFile>\"",
            "When Upload StudentData Image \"<imageFile>\"",
            "When Click On Search Button",
            "When Select ReportFilter Dropdown Option \"<option>\""
        ],
        collectedLocators: [
            "public static By LoginButton => By.XPath(\"//button[@id='login']\");",
            "public static By Username => By.XPath(\"//input[@id='username']\");",
            "public static By Organization => By.XPath(\"//select[@id='organization']\");",
            "public static By DateFrom => By.XPath(\"//input[@id='dateFrom']\");",
            "public static By DateTo => By.XPath(\"//input[@id='dateTo']\");",
            "public static By Courses => By.XPath(\"//select[@id='courses']/following-sibling::div//button\");",
            "public static By Version => By.XPath(\"//select[@id='Version']/following-sibling::div//button\");",
            "public static By ExcelFile => By.XPath(\"//input[@id='excelFile']\");",
            "public static By ImageUpload => By.XPath(\"//input[@id='imageUpload']\");",
            "public static By SearchButton => By.XPath(\"//button[@id='search']\");",
            "public static By DropdownOption => By.XPath(\"//select[@id='dropdown']\");"
        ],
        collectedMethods: [
            "public IWebElement GetLoginButton() => driver.FindElement(ElementClass.LoginButton);",
            "public IWebElement GetUsername() => driver.FindElement(ElementClass.Username);",
            "public IWebElement GetOrganization() => driver.FindElement(ElementClass.Organization);",
            "public IWebElement GetDateFrom() => driver.FindElement(ElementClass.DateFrom);",
            "public IWebElement GetDateTo() => driver.FindElement(ElementClass.DateTo);",
            "public IWebElement GetCourses() => driver.FindElement(ElementClass.Courses);",
            "public IWebElement GetVersion() => driver.FindElement(ElementClass.Version);",
            "public IWebElement GetExcelFile() => driver.FindElement(ElementClass.ExcelFile);",
            "public IWebElement GetImageUpload() => driver.FindElement(ElementClass.ImageUpload);",
            "public IWebElement GetSearchButton() => driver.FindElement(ElementClass.SearchButton);",
            "public IWebElement GetDropdownOption() => driver.FindElement(ElementClass.DropdownOption);"
        ],
        elementClassName: "TestElementClass",
        pageClassName: "TestPage",
        actionName: "TestAction"
    };

    // Store data
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.set(sampleData, () => {
            showToast('Sample data loaded successfully!', 'success');
            location.reload(); // Reload to show the data
        });
    } else {
        // Fallback to localStorage
        Object.keys(sampleData).forEach(key => {
            localStorage.setItem(key, JSON.stringify(sampleData[key]));
        });
        showToast('Sample data loaded successfully!', 'success');
        location.reload(); // Reload to show the data
    }
}

function clearAllData() {
    const keys = ['collectedGherkinSteps', 'collectedLocators', 'collectedMethods', 'elementClassName', 'pageClassName', 'actionName'];
    
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        const clearData = {};
        keys.forEach(key => {
            if (key === 'elementClassName') {
                clearData[key] = 'DefaultElementClass';
            } else if (key === 'pageClassName') {
                clearData[key] = 'DefaultPageClass';
            } else if (key === 'actionName') {
                clearData[key] = '';
            } else {
                clearData[key] = [];
            }
        });
        
        chrome.storage.sync.set(clearData, () => {
            showToast('All data cleared!', 'info');
            location.reload();
        });
    } else {
        // Fallback to localStorage
        keys.forEach(key => localStorage.removeItem(key));
        showToast('All data cleared!', 'info');
        location.reload();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('themeToggleBtn');
    if (localStorage.getItem("darkMode") === "enabled") {
        document.body.classList.add("dark-mode");
    }
    toggleBtn?.addEventListener('click', () => {
        const isDark = document.body.classList.toggle("dark-mode");
        localStorage.setItem("darkMode", isDark ? "enabled" : "disabled");
    });

    // Add sample data button functionality
    const loadSampleBtn = document.getElementById('loadSampleDataBtn');
    const clearDataBtn = document.getElementById('clearDataBtn');
    const refreshDataBtn = document.getElementById('refreshDataBtn');
    
    if (loadSampleBtn) {
        loadSampleBtn.addEventListener('click', loadSampleData);
    }
    
    if (clearDataBtn) {
        clearDataBtn.addEventListener('click', clearAllData);
    }
    
    if (refreshDataBtn) {
        refreshDataBtn.addEventListener('click', () => {
            showToast('Refreshing data...', 'info');
            location.reload();
        });
    }

    // Add API Test button functionality
    const openApiTestBtn = document.getElementById('openApiTestBtn');
    if (openApiTestBtn) {
        openApiTestBtn.addEventListener('click', () => {
            // Use chrome.runtime.getURL and chrome.tabs.create when available, otherwise fallback
            if (typeof chrome !== 'undefined' && chrome.runtime && chrome.tabs) {
                const apiTestUrl = chrome.runtime.getURL('apitest.html');
                chrome.tabs.create({ url: apiTestUrl });
            } else {
                // Fallback for testing outside extension context
                window.open('apitest.html', '_blank');
            }
        });
    }

    document.querySelectorAll('.copy-btn').forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.getAttribute('data-target');
            const statusId = button.getAttribute('data-status');
            const content = document.getElementById(targetId)?.innerText;
            const statusSpan = document.getElementById(statusId);
            if (content && statusSpan) {
                navigator.clipboard.writeText(content).then(() => {
                    statusSpan.textContent = 'Copied!';
                    statusSpan.classList.add('show');
                    statusSpan.style.color = '#10b981';
                    setTimeout(() => {
                        statusSpan.classList.remove('show');
                        statusSpan.textContent = '';
                        statusSpan.style.color = '';
                    }, 1200);
                });
            }
        });
    });
    document.querySelectorAll('.edit-btn').forEach(button => {
        button.addEventListener('click', () => {
            const targetId = button.getAttribute('data-target');
            const preElement = document.getElementById(targetId);
            if (!preElement) return;
            const textArea = document.createElement('textarea');
            textArea.value = preElement.innerText;
            textArea.style.width = '100%';
            textArea.style.height = '200px';
            textArea.style.fontFamily = 'monospace';
            textArea.style.borderRadius = '8px';
            preElement.replaceWith(textArea);
            button.textContent = '💾';
            button.addEventListener('click', () => {
                const newPre = document.createElement('pre');
                newPre.id = targetId;
                newPre.innerText = textArea.value;
                textArea.replaceWith(newPre);
                button.textContent = '✏️';
                
                // If editing Gherkin steps, update storage and refresh step file generator
                if (targetId === 'gherkinCode') {
                    const newSteps = textArea.value.split('\n').filter(step => step.trim() !== '');
                    const uniqueSteps = filterDuplicateStrings(newSteps);
                    
                    // Update storage
                    const updateData = { collectedGherkinSteps: uniqueSteps };
                    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                        chrome.storage.sync.set(updateData, () => {
                            console.log('Gherkin steps updated from edit:', uniqueSteps.length);
                            
                            // Get current page class name and refresh step file generator
                            getStoredData((result) => {
                                const pageClassName = result.pageClassName || 'DefaultPageClass';
                                initializeStepFileGenerator(uniqueSteps, pageClassName);
                                showToast('Gherkin steps updated! Step File Generator refreshed.', 'success');
                            });
                        });
                    } else {
                        // Fallback to localStorage
                        localStorage.setItem('collectedGherkinSteps', JSON.stringify(uniqueSteps));
                        console.log('Gherkin steps updated in localStorage:', uniqueSteps.length);
                        
                        // Get current page class name and refresh step file generator
                        getStoredData((result) => {
                            const pageClassName = result.pageClassName || 'DefaultPageClass';
                            initializeStepFileGenerator(uniqueSteps, pageClassName);
                            showToast('Gherkin steps updated! Step File Generator refreshed.', 'success');
                        });
                    }
                }
            }, { once: true });
        });
    });
});

// ✅ Clear Action Names, Logs, and Filter on Reset
chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'reset') {
        const xhrActions = document.getElementById('xhrActions');
        if (xhrActions) xhrActions.innerText = 'No actions found.';
        const xhrLogs = document.getElementById('xhrLogs');
        if (xhrLogs) xhrLogs.innerText = 'No URLs found.';
        const actionFilter = document.getElementById('actionFilter');
        if (actionFilter) {
            actionFilter.innerHTML = '<option value="All">All</option>';
        }
        // Reset step file generator
        const stepFileCode = document.getElementById('stepFileCode');
        if (stepFileCode) stepFileCode.innerText = 'Select input types and click Generate Step File...';
        const stepConfigContainer = document.getElementById('stepConfigurationContainer');
        if (stepConfigContainer) stepConfigContainer.innerHTML = '<p style="color: #666; font-style: italic;">No Gherkin steps available. Collect some steps first.</p>';
        const generateBtn = document.getElementById('generateStepFileBtn');
        if (generateBtn) generateBtn.disabled = true;
    }
});

// Optional: Toast for feedback (reuse popup.js showToast for consistency)
window.showToast = function (message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast-message toast-' + type;
    toast.innerHTML = (type === 'success' ? '✅ ' : type === 'error' ? '❌ ' : 'ℹ️ ') + message;
    document.body.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 2200);
};

// Step File Generator Functions
function initializeStepFileGenerator(gherkinSteps, pageClassName) {
    console.log('Initializing Step File Generator with steps:', gherkinSteps);
    
    const container = document.getElementById('stepConfigurationContainer');
    const generateBtn = document.getElementById('generateStepFileBtn');
    
    if (!container || !generateBtn) {
        console.error('Step File Generator elements not found:', { container: !!container, generateBtn: !!generateBtn });
        return;
    }
    
    // Clear container
    container.innerHTML = '';
    
    if (gherkinSteps.length === 0) {
        container.innerHTML = '<p style="color: #666; font-style: italic;">No Gherkin steps available. Collect some steps first.</p>';
        generateBtn.disabled = true;
        return;
    }
    
    generateBtn.disabled = false;
    
    // Create configuration for each step
    gherkinSteps.forEach((step, index) => {
        const configItem = createStepConfigItem(step, index);
        container.appendChild(configItem);
    });
    
    // Add event listener to generate button
    generateBtn.onclick = () => generateStepFile(gherkinSteps, pageClassName);
    
    console.log('Step File Generator initialized successfully');
}

function createStepConfigItem(step, index) {
    const div = document.createElement('div');
    div.className = 'step-config-item';
    
    const stepContainer = document.createElement('div');
    stepContainer.className = 'step-container';
    
    const label = document.createElement('div');
    label.className = 'step-config-label';
    label.textContent = step;
    label.dataset.originalStep = step;
    label.dataset.stepIndex = index;
    
    const editBtn = document.createElement('button');
    editBtn.className = 'step-edit-btn';
    editBtn.textContent = '✏️ Edit';
    editBtn.onclick = () => editStep(label, index);
    
    stepContainer.appendChild(label);
    stepContainer.appendChild(editBtn);
    
    const select = document.createElement('select');
    select.className = 'step-config-select';
    select.dataset.stepIndex = index;
    
    // Input type options
    const options = [
        { value: 'click', text: 'Click/Button' },
        { value: 'normal_select', text: 'Normal Select' },
        { value: 'multi_select', text: 'Multi Select' },
        { value: 'normal_input', text: 'Normal Input Field' },
        { value: 'search_dropdown', text: 'Search Dropdown' },
        { value: 'date_from', text: 'Date From' },
        { value: 'date_to', text: 'Date To' },
        { value: 'image_upload', text: 'Image Upload' },
        { value: 'excel_upload', text: 'Excel Upload' },
        { value: 'excel_file_upload', text: 'Excel File Upload' }
    ];
    
    options.forEach(option => {
        const opt = document.createElement('option');
        opt.value = option.value;
        opt.textContent = option.text;
        select.appendChild(opt);
    });
    
    // Auto-select based on step content
    autoSelectInputType(step, select);
    
    // Add event listener to update step text when input type changes
    select.addEventListener('change', function() {
        const labelElement = this.closest('.step-config-item').querySelector('.step-config-label');
        const originalStep = labelElement.dataset.originalStep;
        const newStepText = generateGherkinStepByInputType(originalStep, this.value);
        labelElement.textContent = newStepText;
    });
    
    div.appendChild(stepContainer);
    div.appendChild(select);
    
    return div;
}

function autoSelectInputType(step, select) {
    const stepLower = step.toLowerCase();
    const stepIndex = parseInt(select.dataset.stepIndex);
    
    // Get the corresponding locator to check for multiselect patterns
    getStoredData((result) => {
        const locators = result.collectedLocators || [];
        let isMultiselectDropdown = false;
        
        // Check if the corresponding locator indicates a multiselect dropdown
        if (stepIndex < locators.length) {
            const locator = locators[stepIndex];
            // Check if locator contains the multiselect pattern
            if (locator.includes('/following-sibling::div//button')) {
                isMultiselectDropdown = true;
            }
        }
        
        // Enhanced pattern matching
        if (stepLower.includes('click')) {
            select.value = 'click';
        } else if (stepLower.includes('enter') && (stepLower.includes('date from') || stepLower.includes('datefrom'))) {
            select.value = 'date_from';
        } else if (stepLower.includes('enter') && (stepLower.includes('date to') || stepLower.includes('dateto'))) {
            select.value = 'date_to';
        } else if (stepLower.includes('enter') && (stepLower.includes('image') || stepLower.includes('img'))) {
            select.value = 'image_upload';
        } else if (stepLower.includes('enter') && stepLower.includes('excel') && !stepLower.includes('file')) {
            select.value = 'excel_upload';
        } else if ((stepLower.includes('select') || stepLower.includes('upload')) && stepLower.includes('excel file')) {
            select.value = 'excel_file_upload';
        } else if (stepLower.includes('enter') && (stepLower.includes('upload') || stepLower.includes('file'))) {
            select.value = 'excel_upload';
        } else if (stepLower.includes('enter')) {
            // Check if this is actually a multiselect dropdown based on locator
            if (isMultiselectDropdown) {
                select.value = 'multi_select';
            } else {
                select.value = 'normal_input';
            }
        } else if (stepLower.includes('select') && (stepLower.includes('multiple') || stepLower.includes('multi'))) {
            select.value = 'multi_select';
        } else if (stepLower.includes('select')) {
            // Check if it might be a search dropdown based on common patterns
            if (stepLower.includes('search') || stepLower.includes('dropdown') || stepLower.includes('filter')) {
                select.value = 'search_dropdown';
            } else if (isMultiselectDropdown) {
                // If locator indicates multiselect but step says "select", it's likely a multiselect
                select.value = 'multi_select';
            } else {
                select.value = 'normal_select';
            }
        }
    });
}

function editStep(labelElement, stepIndex) {
    const currentText = labelElement.textContent;
    
    // Create input field
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentText;
    input.className = 'step-edit-input';
    input.style.width = '100%';
    input.style.padding = '8px';
    input.style.border = '1px solid #ddd';
    input.style.borderRadius = '4px';
    input.style.fontSize = '14px';
    
    // Create save and cancel buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'edit-buttons';
    buttonContainer.style.marginTop = '8px';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '8px';
    
    const saveBtn = document.createElement('button');
    saveBtn.textContent = '💾 Save';
    saveBtn.className = 'edit-save-btn';
    saveBtn.style.padding = '4px 8px';
    saveBtn.style.backgroundColor = '#10b981';
    saveBtn.style.color = 'white';
    saveBtn.style.border = 'none';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.cursor = 'pointer';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '❌ Cancel';
    cancelBtn.className = 'edit-cancel-btn';
    cancelBtn.style.padding = '4px 8px';
    cancelBtn.style.backgroundColor = '#ef4444';
    cancelBtn.style.color = 'white';
    cancelBtn.style.border = 'none';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.cursor = 'pointer';
    
    buttonContainer.appendChild(saveBtn);
    buttonContainer.appendChild(cancelBtn);
    
    // Replace label content with input and buttons
    const originalContent = labelElement.innerHTML;
    labelElement.innerHTML = '';
    labelElement.appendChild(input);
    labelElement.appendChild(buttonContainer);
    
    // Focus on input
    input.focus();
    input.select();
    
    // Save functionality
    function saveEdit() {
        const newStepText = input.value.trim();
        if (newStepText && newStepText !== currentText) {
            // Update the label
            labelElement.textContent = newStepText;
            labelElement.dataset.originalStep = newStepText;
            
            // Update the step in the global array and storage
            updateStepInStorage(stepIndex, newStepText);
            
            // Auto-detect input type based on new text
            const select = labelElement.closest('.step-config-item').querySelector('.step-config-select');
            autoSelectInputType(newStepText, select);
            
            showToast('Step updated successfully!', 'success');
            
            // Refresh the step file generator to handle any duplicates
            setTimeout(() => {
                getStoredData((result) => {
                    const uniqueSteps = filterDuplicateStrings(result.collectedGherkinSteps || []);
                    if (uniqueSteps.length !== result.collectedGherkinSteps.length) {
                        // Duplicates were found and removed, refresh the UI
                        showToast('Duplicate steps removed!', 'info');
                        location.reload();
                    }
                });
            }, 500);
        } else {
            labelElement.innerHTML = originalContent;
        }
    }
    
    // Cancel functionality
    function cancelEdit() {
        labelElement.innerHTML = originalContent;
    }
    
    // Event listeners
    saveBtn.onclick = saveEdit;
    cancelBtn.onclick = cancelEdit;
    
    // Save on Enter, Cancel on Escape
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            saveEdit();
        } else if (e.key === 'Escape') {
            cancelEdit();
        }
    });
}

function updateStepInStorage(stepIndex, newStepText) {
    // Get current data
    getStoredData((result) => {
        const gherkinSteps = result.collectedGherkinSteps || [];
        
        // Update the specific step
        if (stepIndex < gherkinSteps.length) {
            gherkinSteps[stepIndex] = newStepText;
            
            // Filter duplicates before saving to storage
            const uniqueSteps = filterDuplicateStrings(gherkinSteps);
            
            // Save back to storage with unique steps only
            const updateData = { collectedGherkinSteps: uniqueSteps };
            
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.set(updateData, () => {
                    console.log('Step updated in storage:', newStepText);
                    console.log('Unique steps count:', uniqueSteps.length);
                });
            } else {
                // Fallback to localStorage
                localStorage.setItem('collectedGherkinSteps', JSON.stringify(uniqueSteps));
                console.log('Step updated in localStorage:', newStepText);
                console.log('Unique steps count:', uniqueSteps.length);
            }
            
            // Update the main Gherkin display as well
            updateGherkinDisplay(uniqueSteps);
        }
    });
}

function updateGherkinDisplay(gherkinSteps) {
    // Filter duplicates before displaying
    const uniqueSteps = filterDuplicateStrings(gherkinSteps);
    const gherkinElement = document.getElementById('gherkinCode');
    if (gherkinElement) {
        gherkinElement.innerText = uniqueSteps.length
            ? uniqueSteps.join('\n')
            : 'No Gherkin steps collected.';
    }
}

// Function to generate custom Gherkin step based on input type
function generateGherkinStepByInputType(originalStep, inputType) {
    // Extract the menu/element name from the original step
    // Remove common prefixes like "Click on", "When I click on", etc.
    let menuName = originalStep
        .replace(/^(When I |When |And |Then |Given |I )?click on /i, '')
        .replace(/^(When I |When |And |Then |Given |I )?select /i, '')
        .replace(/^(When I |When |And |Then |Given |I )?enter /i, '')
        .replace(/^(When I |When |And |Then |Given |I )?(choose|pick) /i, '')
        .trim();
    
    // Remove any trailing punctuation or words like "button", "field", "dropdown"
    menuName = menuName
        .replace(/\s+(button|field|dropdown|input|element|control)$/i, '')
        .replace(/[:\.\,\;]+$/, '')
        .trim();
    
    // Generate step based on input type
    switch (inputType) {
        case 'date_from':
            return `When Enter ${menuName} `;
        case 'date_to':
            return `When Enter ${menuName} `;
        case 'input':
        case 'textarea':
        case 'normal_input':
            return `When Enter ${menuName}`;
        case 'select':
        case 'multiselect':
        case 'normal_select':
        case 'multi_select':
        case 'search_dropdown':
        case 'excel_upload':
        case 'excel_file_upload':
        case 'image_upload':
            return `When Select ${menuName}`;
        case 'checkbox':
            return `When Check ${menuName}`;
        case 'radio':
            return `When Select ${menuName} Option`;
        case 'button':
        case 'click':
            return `When Click On ${menuName}`;
        case 'link':
            return `When Click ${menuName} Link`;
        default:
            return `When Click On ${menuName}`;
    }
}

function generateStepFile(gherkinSteps, pageClassName) {
    const selects = document.querySelectorAll('.step-config-select');
    const labels = document.querySelectorAll('.step-config-label');
    const stepConfigurations = [];
    
    selects.forEach((select, index) => {
        // Get the current text from the label (which might be edited)
        const currentStepText = labels[index] ? labels[index].textContent : gherkinSteps[index];
        
        // Generate updated Gherkin step based on input type
        const updatedStep = generateGherkinStepByInputType(currentStepText, select.value);
        
        stepConfigurations.push({
            step: updatedStep,
            inputType: select.value
        });
    });
    
    const stepFileCode = generateStepFileCode(stepConfigurations, pageClassName);
    document.getElementById('stepFileCode').innerText = stepFileCode;
    
    showToast('Step file generated successfully!', 'success');
}

function generateStepFileCode(stepConfigurations, pageClassName) {
    // Extract menu name from pageClassName (remove "Page" suffix)
    let stepClassName = pageClassName.replace('Page', 'Step');
    
    // Count multi-select inputs
    const multiSelectCount = stepConfigurations.filter(config => config.inputType === 'multi_select').length;
    
    const imports = `using UMS.UI.Test.BusinessModel.Helper;
using UMS.UI.Test.ERP.Areas.Common;

namespace UMS.UI.Test.ERP.Areas.YourMenugroup.Steps
{
    [Binding]
    public class ${stepClassName}(${pageClassName} page)
    {
        private IWebElement? _webElement;
        private static SelectElement SelectElement(IWebElement webElement) => new(webElement);
`;

    // Add MultiSelectTextarea helper method if there are 2 or more multi-selects
    let helperMethods = '';
    if (multiSelectCount >= 2) {
        helperMethods = `
        private void MultiSelectTextarea(string excelValue, string defaultValue, IWebElement webElement)
        {
            var excelValues = TestHelper.GetStringsBySplit(excelValue);
            if (excelValues.Count == 0)
                excelValues.Add(defaultValue);

            if (excelValues.Any())
            {
                var selectElement = SelectElement(webElement);
                foreach (var selectItem in excelValues)
                {
                    selectElement.Options
                        .FirstOrDefault(x => x.Text.Contains(selectItem, StringComparison.OrdinalIgnoreCase))?
                        .Click();
                }
            }

            else
                throw new ArgumentException($"No valid values found in the input: {excelValue}");
        }
`;
    }

    let methods = '';
    
    stepConfigurations.forEach(config => {
        const method = generateMethodFromStep(config.step, config.inputType, multiSelectCount >= 2);
        if (method) {
            methods += '\n' + method + '\n';
        }
    });
    
    const closing = `    }
}`;
    
    return imports + helperMethods + methods + closing;
}

function generateMethodFromStep(step, inputType, useMultiSelectHelper = false) {
    // For custom step patterns, add parameter placeholders if missing
    let processedStep = step;
    
    // Add parameter placeholders for different input types
    if (inputType === 'date_from' && !processedStep.includes('<')) {
        processedStep = processedStep.replace(/FromDate$/, 'FromDate "<fromDate>"');
    } else if (inputType === 'date_to' && !processedStep.includes('<')) {
        processedStep = processedStep.replace(/ToDate$/, 'ToDate "<toDate>"');
    } else if ((inputType === 'select' || inputType === 'multiselect' || inputType === 'normal_select' || inputType === 'multi_select') && !processedStep.includes('<')) {
        // Add parameter for select operations
        const words = processedStep.split(' ');
        const lastWord = words[words.length - 1];
        processedStep = processedStep + ' "<' + lastWord.toLowerCase() + '>"';
    } else if ((inputType === 'input' || inputType === 'textarea' || inputType === 'normal_input') && !processedStep.includes('<')) {
        // Add parameter for input operations
        const words = processedStep.split(' ');
        const lastWord = words[words.length - 1];
        processedStep = processedStep + ' "<' + lastWord.toLowerCase() + '>"';
    }
    
    const methodName = extractMethodNameFromStep(processedStep);
    const paramName = extractParamNameFromStep(processedStep);
    const elementName = extractElementNameFromStep(processedStep);
    
    // Convert step format for SpecFlow attribute: replace "<parameter>" with {string}
    const specFlowStep = processedStep.replace(/"<[^>]+>"/g, '{string}');
    
    const templates = {
        click: `        [When("${specFlowStep}")]
        public void When${methodName}()
        {
            page.Get${elementName}().Click();
        }`,
        
        normal_select: `        [When("${specFlowStep}")]
        public void When${methodName}(string ${paramName})
        {
            _webElement = page.Get${elementName}();
            SelectElement(_webElement).SelectByText(${paramName});
        }`,
        
        multi_select: useMultiSelectHelper 
            ? `        [When("${specFlowStep}")]
        public void When${methodName}(string ${paramName})
        {
            _webElement = page.Get${elementName}();
            MultiSelectTextarea(${paramName}, "", _webElement);
        }`
            : `        [When("${specFlowStep}")]
        public void When${methodName}(string ${paramName})
        {
            _webElement = page.Get${elementName}();
            var ${paramName}s = TestHelper.GetStringsBySplit(${paramName});
            foreach (var item in ${paramName}s)
                SelectElement(_webElement).SelectByText(item);
        }`,
        
        normal_input: `        [When("${specFlowStep}")]
        public void When${methodName}(string ${paramName})
        {
            _webElement = page.Get${elementName}();
            _webElement.Clear();
            _webElement.SendKeys(${paramName});
        }`,
        
        search_dropdown: `        [When("${specFlowStep}")]
        public void When${methodName}(string ${paramName})
        {
            page.Get${elementName}().Click();
            TestHelper.SelectMultiItems(page.Driver, ${paramName});
        }`,
        
        date_from: `        [When("${specFlowStep}")]
        public void When${methodName}(string ${paramName})
        {
            ${paramName} = !string.IsNullOrEmpty(${paramName})
               ? ${paramName}
               : DateTime.Now.ToString("yyyy-MM-dd");
            page.Js.ExecuteScript($"arguments[0].value = '{${paramName}}';", page.Get${elementName}());
        }`,
        
        date_to: `        [When("${specFlowStep}")]
        public void When${methodName}(string ${paramName})
        {
            ${paramName} = !string.IsNullOrEmpty(${paramName})
                ? ${paramName}
                : DateTime.Now.ToString("yyyy-MM-dd");
            page.Js.ExecuteScript($"arguments[0].value = '{${paramName}}';", page.Get${elementName}());
        }`,
        
        image_upload: `        [When("${specFlowStep}")]
        public void When${methodName}(string ${paramName})
        {
            if (string.IsNullOrEmpty(${paramName}))
                throw new Exception("Excel file does not have values for ${elementName}");

            var imgPath = AppHelper.GetFilePath("TestData\\\\Administration\\\\Image", ${paramName});
            page.Get${elementName}().SendKeys(imgPath);
        }`,
        
        excel_upload: `        [When("${specFlowStep}")]
        public void When${methodName}(string ${paramName})
        {
            if (string.IsNullOrEmpty(${paramName}))
                throw new Exception("Excel file does not have values for ${elementName}");

            var excelPath = AppHelper.GetFilePath("TestData\\\\Administration\\\\Excel", ${paramName});
            page.Get${elementName}().SendKeys(excelPath);
        }`,
        
        excel_file_upload: `        [When("${specFlowStep}")]
        public void When${methodName}(string ${paramName})
        {
            page.Get${elementName}().SendKeys(AppHelper.GetFilePath("TestData\\\\Student\\\\Excel", ${paramName}));
        }`
    };
    
    return templates[inputType] || templates.click;
}

function extractMethodNameFromStep(step) {
    // Remove "When " and quotes, then convert to PascalCase
    let methodName = step.replace(/^When\s+/, '').replace(/"/g, '').replace(/<[^>]+>/g, '');
    
    // Clean up the method name
    methodName = methodName.split(' ').map(word => {
        // Skip common words and clean the word
        if (['on', 'the', 'a', 'an'].includes(word.toLowerCase())) {
            return '';
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).filter(word => word.length > 0).join('');
    
    return methodName || 'DefaultMethod';
}

function extractParamNameFromStep(step) {
    // Extract parameter from <parameter> format
    const match = step.match(/<([^>]+)>/);
    if (match) {
        let paramName = match[1];
        // Convert to proper camelCase
        paramName = paramName.replace(/\s+/g, ''); // Remove spaces
        // Convert PascalCase to camelCase
        paramName = paramName.charAt(0).toLowerCase() + paramName.slice(1);
        return paramName;
    }
    
    // Try to derive parameter name from step content
    const stepWords = step.replace(/^When\s+/, '').replace(/"/g, '').split(' ');
    const lastMeaningfulWords = stepWords.filter(word => 
        !['click', 'on', 'enter', 'select', 'the', 'a', 'an'].includes(word.toLowerCase())
    );
    
    if (lastMeaningfulWords.length >= 2) {
        // Take last 2-3 words and convert to camelCase
        const words = lastMeaningfulWords.slice(-3);
        let paramName = words.map((word, index) => {
            if (index === 0) {
                return word.toLowerCase();
            }
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join('');
        return paramName;
    }
    
    if (lastMeaningfulWords.length === 1) {
        return lastMeaningfulWords[0].toLowerCase();
    }
    
    // Default parameter name
    return 'value';
}

function extractElementNameFromStep(step) {
    // Extract element name from step text
    let elementName = step.replace(/^When\s+/, '').replace(/"/g, '').replace(/<[^>]+>/g, '');
    
    // Remove action words and common words
    const actionWords = ['click', 'on', 'enter', 'select', 'the', 'a', 'an', 'when', 'and', 'then'];
    let words = elementName.split(' ').filter(word => 
        !actionWords.includes(word.toLowerCase()) && word.trim().length > 0
    );
    
    // Remove menu/page names from the beginning (common patterns)
    // This helps match actual page method names like GetDateFrom() instead of GetTestMenuDateFrom()
    if (words.length > 1) {
        // Common menu/page name patterns to remove (first 1-2 words usually)
        const menuPatterns = [
            'test', 'page', 'menu', 'report', 'admin', 'student', 'class', 'exam',
            'manage', 'clear', 'attendance', 'entry', 'filter', 'search', 'view',
            'add', 'edit', 'delete', 'update', 'create', 'new', 'list'
        ];
        
        let filteredWords = [...words];
        
        // Remove menu-like words from the beginning
        while (filteredWords.length > 1) {
            const firstWord = filteredWords[0].toLowerCase();
            const hasMenuPattern = menuPatterns.some(pattern => 
                firstWord.includes(pattern) || firstWord.length < 4
            );
            
            if (hasMenuPattern) {
                filteredWords = filteredWords.slice(1);
            } else {
                break;
            }
        }
        
        // Use filtered words if we still have meaningful content
        if (filteredWords.length > 0) {
            words = filteredWords;
        }
    }
    
    // Handle special cases for common form elements
    if (words.length >= 2) {
        const lastTwoWords = words.slice(-2).map(w => w.toLowerCase());
        
        // Common patterns like "Date From" -> "DateFrom"
        if (lastTwoWords.includes('date') && (lastTwoWords.includes('from') || lastTwoWords.includes('to'))) {
            words = words.slice(-2);
        }
        // Patterns like "Excel File" -> "ExcelFile" 
        else if (lastTwoWords.includes('excel') && lastTwoWords.includes('file')) {
            words = words.slice(-2);
        }
        // Patterns like "User Name" -> "Username"
        else if (lastTwoWords.includes('user') && lastTwoWords.includes('name')) {
            words = ['Username'];
        }
    }
    
    // If no meaningful words left, try to extract from the original step differently
    if (words.length === 0) {
        // Try to get the last meaningful part of the step
        const stepParts = step.replace(/^When\s+/, '').replace(/"/g, '').replace(/<[^>]+>/g, '').split(' ');
        words = stepParts.filter(word => 
            !actionWords.includes(word.toLowerCase()) && 
            word.trim().length > 0 && 
            !word.includes('<') && 
            !word.includes('>')
        ).slice(-2); // Get last 2 meaningful words
    }
    
    // Convert to PascalCase
    elementName = words.map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join('');
    
    return elementName || 'DefaultElement';
}

// নিচের listener টা এখানে রাখুন (global scope এ)
if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;
        // Relevant keys to observe
        const keys = [
            'collectedLocators', 'collectedGherkinSteps', 'collectedMethods',
            'elementClassName', 'pageClassName', 'actionName'
        ];
        const changed = keys.some(key => changes[key]);
        if (changed) {
            getStoredData((result) => {
                // Display/refresh logic (same as initial load)
                const locators = filterDuplicateLocators(result.collectedLocators || []);
                const gherkinSteps = filterDuplicateStrings(result.collectedGherkinSteps || []);
                const methods = filterDuplicateStrings(result.collectedMethods || []);
                const actionName = result.actionName || '';
                let className, pageClassName;
                if (actionName && actionName.trim()) {
                    const cleanActionName = actionName.replace(/\s+/g, '');
                    className = `${cleanActionName}Element`;
                    pageClassName = `${cleanActionName}Page`;
                } else {
                    className = result.elementClassName || 'DefaultElementClass';
                    pageClassName = result.pageClassName || 'DefaultPageClass';
                }
                const locatorElement = document.getElementById('locatorCode');
                const gherkinElement = document.getElementById('gherkinCode');
                const methodElement = document.getElementById('methodCode');
                if (locatorElement) {
                    locatorElement.innerText = locators.length
                        ? `public static class ${className} {\n${locators.map(l => '    ' + l).join('\n')}\n}`
                        : 'No locators collected.';
                }
                if (gherkinElement) {
                    gherkinElement.innerText = gherkinSteps.length
                        ? gherkinSteps.join('\n')
                        : 'No Gherkin steps collected.';
                }
                if (methodElement) {
                    methodElement.innerText = methods.length
                        ? `public static class ${pageClassName}(IWebDriver driver) {\n    public IWebDriver Driver => driver;\n\n    public IJavaScriptExecutor Js => (IJavaScriptExecutor)driver;\n\n${methods.map(m => '    ' + m).join('\n')}\n}`
                        : 'No methods collected.';
                }
                // Step File generator update
                initializeStepFileGenerator(gherkinSteps, pageClassName);
            });
            showToast('🔄 Data updated in real-time!', 'info');
        }
    });
}

if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'local') return;
        // XHR logs and actions change check
        if (changes.urls || changes.actions) {
            loadXHRLogs(); // Call your function to reload and render logs/actions
            showToast('🛰️ XHR Logs updated in real-time!', 'info');
        }
    });
}
