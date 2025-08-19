// --- Extension state and configuration variables ---
let isEnabled = false;
let elementClassName = 'ElementClass';
let menuName = '';

// --- Load settings from Chrome storage when extension loads ---
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['extensionEnabled', 'elementClassName', 'menuName'], (result) => {
        isEnabled = result.extensionEnabled ?? false;
        elementClassName = result.elementClassName || elementClassName;
        menuName = result.menuName || '';
    });
}

function injectHighlightStyle() {
    if (!document.getElementById('qa-highlight-style')) {
        const style = document.createElement('style');
        style.id = 'qa-highlight-style';
        style.innerHTML = `
            .highlighted-element-qa-ext {
                outline: 3px solid #0ea5e9 !important;
                transition: outline 0.2s;
            }
        `;
        document.head.appendChild(style);
    }
}
injectHighlightStyle(); // Run once on content script load


// --- Listen for runtime messages to update state/configuration dynamically ---
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'toggle') {
            isEnabled = message.value;
        } else if (message.action === 'setClassName') {
            elementClassName = message.value;
            if (chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.set({ elementClassName });
            }
        } else if (message.action === 'setMenuName') {
            menuName = message.value;
            if (chrome.storage && chrome.storage.sync) {
                chrome.storage.sync.set({ menuName });
            }
        }
    });
}

// --- Gherkin step templates ---
const stepTemplates = {
    click: (label) => `When ${insertMenu('Click on', label)}`,
    enter: (label, varName) => `When ${insertMenu('Enter', label)} "<${varName}>"`,
    select: (label, varName) => `When ${insertMenu('Select', label)} "<${varName}>"`,
};

// --- Helper for inserting menu name if available ---
function insertMenu(verb, label) {
    return menuName && menuName.trim().length > 0
        ? `${verb} ${menuName.trim()} ${label}`
        : `${verb} ${label}`;
}

// --- Normalize helper (for matching) ---
function normalize(str) {
    return (str || '').toLowerCase().replace(/[\s_\-]/g, '');
}

// --- Extract current parameter values from a Gherkin step ---
function getCurrentParameterValues(step) {
    const paramRegex = /<([^>]+)>/g;
    let match, paramValues = {};

    // 1. Extract parameters from Gherkin step (if any)
    while ((match = paramRegex.exec(step)) !== null) {
        const param = match[1];
        let value = extractFieldValue(param);
        paramValues[param] = value;
    }

    // 2. Also collect all multi-select values
    document.querySelectorAll('select[multiple]').forEach(field => {
        const param = field.id || field.name;
        if (param && !(param in paramValues)) {
            paramValues[param] = Array.from(field.selectedOptions).map(opt => opt.text).join(', ');
        }
    });

    return paramValues;
}

// --- Field extraction logic (find value by param name) ---
function extractFieldValue(param) {
    let value = '';
    let field = null;
    const normalizedParam = normalize(param);

    // 1. Exact id match
    field = document.getElementById(param);

    // 2. Exact name match
    if (!field) {
        const fieldsByName = document.getElementsByName(param);
        if (fieldsByName && fieldsByName.length > 0) field = fieldsByName[0];
    }

    // 3. Partial & normalized match
    if (!field) {
        const allFields = Array.from(document.querySelectorAll('input,select,textarea'));
        // Exact normalized match (id/name)
        field = allFields.find(el =>
            normalize(el.id) === normalizedParam ||
            normalize(el.name) === normalizedParam
        );
        // Partial normalized match (id/name)
        if (!field) {
            field = allFields.find(el =>
                normalize(el.id).includes(normalizedParam) ||
                normalize(el.name).includes(normalizedParam)
            );
        }
        // Placeholder or aria-label partial match
        if (!field) {
            field = allFields.find(el =>
                normalize(el.placeholder).includes(normalizedParam) ||
                normalize(el.getAttribute('aria-label')).includes(normalizedParam)
            );
        }
    }

    // 4. Matching with label text (last resort)
    if (!field) {
        const labels = Array.from(document.querySelectorAll('label'));
        const labelMatch = labels.find(label =>
            normalize(label.textContent) === normalizedParam ||
            normalize(label.textContent).includes(normalizedParam)
        );
        if (labelMatch && labelMatch.htmlFor) {
            field = document.getElementById(labelMatch.htmlFor);
        }
    }

    // 5. Extract value
    if (field) {
        if (field.tagName === "SELECT") {
            if (field.multiple) {
                value = Array.from(field.selectedOptions).map(opt => opt.text).join(', ');
            } else {
                value = field.options[field.selectedIndex]?.text || '';
            }
        } else if (field.type === "checkbox" || field.type === "radio") {
            value = field.checked ? (field.value || "Checked") : "Unchecked";
        } else {
            value = field.value || '';
        }
    }
    return value;
}

// --- Save Gherkin step and parameter values to Chrome storage ---
function saveGherkinStepWithParams(gherkinStep, locatorCode, methodCode) {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['collectedLocators', 'collectedGherkinSteps', 'collectedMethods', 'collectedParamValues'], (result) => {
            let locators = result.collectedLocators || [];
            let gherkinSteps = result.collectedGherkinSteps || [];
            let methods = result.collectedMethods || [];
            let paramMap = result.collectedParamValues || {};

            locators.push(locatorCode);
            gherkinSteps.push(gherkinStep);
            methods.push(methodCode);

            // Dynamic parameter value extraction here
            const paramValues = getCurrentParameterValues(gherkinStep);
            Object.assign(paramMap, paramValues);

            chrome.storage.sync.set({
                collectedLocators: locators,
                collectedGherkinSteps: gherkinSteps,
                collectedMethods: methods,
                collectedParamValues: paramMap,
            });
        });
    }
}

// --- LOCATOR HIGHLIGHTER: Highlights element(s) by XPath for 3 seconds ---
function clearPreviousHighlights() {
    document.querySelectorAll('.highlighted-element-qa-ext').forEach(el => {
        el.classList.remove('highlighted-element-qa-ext');
    });
}

function highlightElement(element) {
    if (!element) return;
    clearPreviousHighlights(); // Clear old highlights first
    element.classList.add('highlighted-element-qa-ext');
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Optionally, remove after 3 seconds (optional)
    setTimeout(() => {
        element.classList.remove('highlighted-element-qa-ext');
    }, 3000);
}

function highlightElementsByXpath(xpath) {
    try {
        clearPreviousHighlights();
        const evaluator = new XPathEvaluator();
        const result = evaluator.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < result.snapshotLength; i++) {
            highlightElement(result.snapshotItem(i));
        }
    } catch (err) {
        console.warn('Invalid XPath for highlight:', xpath);
    }
}


// Highlight all elements matched by the given XPath
function highlightElementsByXpath(xpath) {
    try {
        const evaluator = new XPathEvaluator();
        const result = evaluator.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (let i = 0; i < result.snapshotLength; i++) {
            highlightElement(result.snapshotItem(i));
        }
    } catch (err) {
        // Optionally handle invalid XPath
        console.warn('Invalid XPath for highlight:', xpath);
    }
}

// --- Main event listener for click collection on page elements ---
document.addEventListener('click', function (e) {
    if (!isEnabled) return;

    let label = null;
    let input = null;
    let text = '';
    let gherkinStep = '';

    // --- If a label was clicked ---
    if (e.target.tagName === 'LABEL') {
        label = e.target;
        text = getDirectText(label);
        const forId = label.getAttribute('for');
        input = forId ? document.getElementById(forId) : label.querySelector('input,select,textarea');

        if (text && text.trim().length > 0) {
            text = text.trim().replace(/[:\.\,\;]+$/, '');
            const bracketText = text.replace(/\s+/g, '').replace(/[:\.\,\;]+$/, '');
            const humanReadable = toHumanReadable(bracketText);
            gherkinStep = stepTemplates.click(humanReadable);
            text = humanReadable;
        }
    }
    // --- If an input/select/textarea/button was clicked ---
    else if (["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)) {
        input = e.target;
        const inputType = e.target.type?.toLowerCase() || '';

        // Handle buttons/checkboxes/radios
        if (
            e.target.tagName === 'BUTTON' ||
            ['button', 'submit', 'reset', 'checkbox', 'radio'].includes(inputType)
        ) {
            label = getLabelForInput(input);
            if (label) text = getDirectText(label);
            if (!text) text = input.getAttribute('name') || input.id || e.target.innerText || e.target.value || 'Button';
            
            text = text.replace(/[:\.\,\;]+$/, '');
            text = toHumanReadable(text);
            gherkinStep = stepTemplates.click(text);
        } else {
            // Handle other inputs/selects
            label = getLabelForInput(input);
            if (label) text = getDirectText(label);
            if (!text) text = input.getAttribute('name') || input.id || input.getAttribute('placeholder') || '';
            text = text.replace(/[:\.\,\;]+$/, '');
            const bracketText = text.replace(/\s+/g, '').replace(/[:\.\,\;]+$/, '');
            const humanReadableText = toHumanReadable(bracketText);

            if (input.tagName === 'INPUT' || input.tagName === 'TEXTAREA') {
                gherkinStep = stepTemplates.enter(humanReadableText, bracketText);
            } else if (input.tagName === 'SELECT') {
                gherkinStep = stepTemplates.select(humanReadableText, bracketText);
            }
            text = humanReadableText;
        }
    } else {
        return;
    }

    if (!text || text.length === 0) return;
    let cleaned = text.replace(/\s+/g, '').replace(/[^a-zA-Z0-9]/g, '');
    if (cleaned.length === 0) return;

    // --- XPath generation logic ---
    let xpath = '';
    if (input) {
        // Check for multiselect dropdown with hidden select element
        const multiselectXPath = checkForMultiselectDropdown(input);
        if (multiselectXPath) {
            xpath = multiselectXPath;
        } else if (input.id) {
            let tag = input.tagName.toLowerCase();
            xpath = `//${tag}[@id='${input.id}']`;
        } else {
            xpath = generateFallbackXPath(input);
        }
    }

    // --- NEW: Highlight the located element(s) on the page! ---
    if (xpath) {
        highlightElementsByXpath(xpath);
    }

    let locatorCode = `public static By ${cleaned} => By.XPath("${xpath}");`;
    let methodCode = `public IWebElement Get${cleaned}() => driver.FindElement(${elementClassName}.${cleaned});`;

    // --- Save everything, including parameter values
    saveGherkinStepWithParams(gherkinStep, locatorCode, methodCode);

    showToast(`Collected: ${gherkinStep}`);
});

// --- Helper: Get direct text content of an element ---
function getDirectText(element) {
    let directText = '';
    element.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
            directText += node.nodeValue.trim() + ' ';
        }
    });
    // Clean up the text by removing trailing punctuation like colons, periods, etc.
    return directText.trim().replace(/[:\.\,\;]+$/, '');
}

// --- Helper: Find the label for a given input element ---
function getLabelForInput(input) {
    if (input.id) {
        const explicit = document.querySelector(`label[for='${input.id}']`);
        if (explicit) return explicit;
    }
    let el = input;
    while (el && el !== document.body) {
        let prev = el.previousElementSibling;
        while (prev) {
            if (prev.tagName === 'LABEL') return prev;
            prev = prev.previousElementSibling;
        }
        if (el.parentElement?.tagName === 'LABEL') return el.parentElement;
        el = el.parentElement;
    }
    return null;
}

// --- Helper: Convert text to human-readable format ---
function toHumanReadable(text) {
    return text.replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/_/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

// --- Helper: Show a toast notification at the bottom of the page ---
function showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.background = 'rgba(0,0,0,0.7)';
    toast.style.color = 'white';
    toast.style.padding = '8px 12px';
    toast.style.borderRadius = '5px';
    toast.style.zIndex = 10000;
    document.body.appendChild(toast);

    setTimeout(() => {
        if (toast.parentNode) {
            toast.parentNode.removeChild(toast);
        }
    }, 1500);
}

// --- Helper: Multiselect dropdown detection and XPath generation ---
function checkForMultiselectDropdown(input) {
    // Check if input is inside a span that contains a select element
    let currentElement = input;
    while (currentElement && currentElement !== document.body) {
        currentElement = currentElement.parentElement;
        if (currentElement && currentElement.tagName === 'SPAN') {
            const selectElement = currentElement.querySelector('select');
            if (selectElement) {
                const buttonElement = currentElement.querySelector('select + div button, select ~ div button');
                if (buttonElement) {
                    if (selectElement.id) {
                        return `//select[@id='${selectElement.id}']/following-sibling::div//button`;
                    } else if (selectElement.name) {
                        return `//select[@name='${selectElement.name}']/following-sibling::div//button`;
                    } else if (selectElement.className) {
                        const firstClass = selectElement.className.split(' ')[0];
                        return `//select[@class='${firstClass}']/following-sibling::div//button`;
                    }
                }
            }
        }
    }
    return null;
}

// --- Helper: Fallback XPath generator for generic input/select/textarea elements ---
function generateFallbackXPath(input) {
    // First check if this might be part of a multiselect dropdown
    const multiselectXPath = checkForMultiselectDropdown(input);
    if (multiselectXPath) {
        return multiselectXPath;
    }
    let tag = input.tagName.toLowerCase();
    if (input.name) {
        return `//${tag}[@name='${input.name}']`;
    } else if (input.getAttribute('placeholder')) {
        let placeholder = input.getAttribute('placeholder').replace(/"/g, '');
        return `//${tag}[@placeholder='${placeholder}']`;
    } else {
        return `//${tag}`;
    }
}
