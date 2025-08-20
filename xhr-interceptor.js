// XHR and Fetch Interceptor Content Script
// Runs at document_start to capture all network requests with payloads

(function() {
    'use strict';
    
    // Set to track seen requests to avoid duplicates
    const seenRequests = new Set();
    
    // Helper function to generate a unique request ID
    function generateRequestId(method, url, bodyText) {
        return `${method}:${url}:${bodyText?.substring(0, 100) || ''}`;
    }
    
    // Helper function to extract action from URL
    function extractAction(url) {
        try {
            const pathSegments = new URL(url, document.location).pathname.split('/');
            return pathSegments.pop() || pathSegments.pop() || 'Ungrouped';
        } catch (e) {
            return 'Ungrouped';
        }
    }
    
    // Helper function to determine payload from body text
    function determinePayload(bodyText) {
        if (!bodyText || bodyText.trim() === '') {
            return null;
        }
        
        // Limit payload size to ~100KB
        if (bodyText.length > 100000) {
            bodyText = bodyText.substring(0, 100000) + '...[truncated]';
        }
        
        // Try to parse as JSON first
        try {
            return JSON.parse(bodyText);
        } catch (e) {
            // Check if it looks like form data (a=b&c=d)
            if (bodyText.includes('=') && (bodyText.includes('&') || bodyText.split('=').length === 2)) {
                return bodyText; // Keep as string for form data
            }
            // Otherwise return as string
            return bodyText;
        }
    }
    
    // Helper function to save request to storage
    function saveRequest(url, method, payload) {
        // Check if we're in a Chrome extension context
        if (typeof chrome === 'undefined' || !chrome.storage) {
            return; // Skip if not in extension context
        }
        
        const requestId = generateRequestId(method, url, payload ? JSON.stringify(payload) : '');
        
        // Skip if we've already seen this request
        if (seenRequests.has(requestId)) {
            return;
        }
        seenRequests.add(requestId);
        
        // Check if logging is enabled first
        chrome.storage.local.get(['loggingEnabled', 'filterDomain'], (data) => {
            if (!data.loggingEnabled) return;
            
            const domainFilter = (data.filterDomain || '').trim().toLowerCase();
            if (domainFilter && !url.toLowerCase().includes(domainFilter)) return;
            
            const action = extractAction(url);
            const requestData = {
                action,
                url,
                method: method.toUpperCase(),
                time: new Date().toISOString(),
                payload: payload
            };
            
            // Get current URLs and add new request
            chrome.storage.local.get(['urls', 'actions'], (result) => {
                let urls = result.urls || [];
                const actions = new Set(result.actions || []);
                
                // Check for duplicates more thoroughly
                const exists = urls.some(u => 
                    u.url === url && 
                    u.method === method.toUpperCase() && 
                    Math.abs(new Date(u.time).getTime() - new Date(requestData.time).getTime()) < 1000
                );
                
                if (!exists) {
                    urls.push(requestData);
                    actions.add(action);
                    
                    chrome.storage.local.set({
                        urls,
                        actions: Array.from(actions)
                    });
                }
            });
        });
    }
    
    // Fetch interception
    const originalFetch = window.fetch;
    window.fetch = async function(resource, options = {}) {
        let url = resource;
        let method = 'GET';
        let bodyText = '';
        
        // Handle different resource types
        if (resource instanceof Request) {
            url = resource.url;
            method = resource.method;
            // Clone request to safely read body
            try {
                const clonedRequest = resource.clone();
                bodyText = await clonedRequest.text();
            } catch (e) {
                // If cloning fails, continue without body
                bodyText = '';
            }
        } else if (typeof resource === 'string') {
            url = resource;
            if (options.method) {
                method = options.method;
            }
            if (options.body) {
                if (typeof options.body === 'string') {
                    bodyText = options.body;
                } else if (options.body instanceof FormData) {
                    // Convert FormData to string representation
                    const formEntries = [];
                    for (let [key, value] of options.body.entries()) {
                        formEntries.push(`${key}=${value}`);
                    }
                    bodyText = formEntries.join('&');
                } else if (options.body instanceof URLSearchParams) {
                    bodyText = options.body.toString();
                } else {
                    try {
                        bodyText = JSON.stringify(options.body);
                    } catch (e) {
                        bodyText = String(options.body);
                    }
                }
            }
        }
        
        // Only save for non-GET methods or if there's a body
        if (method !== 'GET' || bodyText) {
            const payload = determinePayload(bodyText);
            saveRequest(url, method, payload);
        }
        
        // Call original fetch
        return originalFetch.call(this, resource, options);
    };
    
    // XMLHttpRequest interception
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
        this._method = method;
        this._url = url;
        return originalOpen.apply(this, [method, url, ...args]);
    };
    
    XMLHttpRequest.prototype.send = function(data) {
        if (this._method && this._url) {
            let bodyText = '';
            
            if (data) {
                if (typeof data === 'string') {
                    bodyText = data;
                } else if (data instanceof FormData) {
                    // Convert FormData to string representation
                    const formEntries = [];
                    for (let [key, value] of data.entries()) {
                        formEntries.push(`${key}=${value}`);
                    }
                    bodyText = formEntries.join('&');
                } else if (data instanceof URLSearchParams) {
                    bodyText = data.toString();
                } else {
                    try {
                        bodyText = JSON.stringify(data);
                    } catch (e) {
                        bodyText = String(data);
                    }
                }
            }
            
            // Only save for non-GET methods or if there's a body  
            if (this._method.toUpperCase() !== 'GET' || bodyText) {
                const payload = determinePayload(bodyText);
                saveRequest(this._url, this._method, payload);
            }
        }
        
        return originalSend.apply(this, arguments);
    };
    
})();