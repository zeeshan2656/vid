import React, { useEffect, useRef } from 'react';

// Global conflict resolver for concurrent atOptions configurations (e.g. Adsterra / Adsense on SPA)
if (typeof window !== 'undefined' && !window.atOptionsMap) {
    window.atOptionsMap = {};
    let currentOptions = null;
    Object.defineProperty(window, 'atOptions', {
        get: () => {
            const currScript = document.currentScript;
            if (currScript && currScript.src) {
                // Extract 32-character hexadecimal key from script URL
                const match = currScript.src.match(/\/([a-f0-9]{32})\/invoke\.js/);
                if (match && match[1]) {
                    const key = match[1];
                    if (window.atOptionsMap[key]) {
                        return window.atOptionsMap[key];
                    }
                }
            }
            return currentOptions;
        },
        set: (val) => {
            currentOptions = val;
            if (val && val.key) {
                window.atOptionsMap[val.key] = val;
            }
        },
        configurable: true
    });
}

export default function AdRenderer({ adCode }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (!adCode || !containerRef.current) return;

        // Clear container
        containerRef.current.innerHTML = '';

        // Create a temporary container to parse the HTML string
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = adCode;
        const childNodes = Array.from(tempDiv.childNodes);

        childNodes.forEach((node) => {
            if (node.tagName === 'SCRIPT') {
                const scriptEl = document.createElement('script');
                
                // Copy all attributes
                Array.from(node.attributes).forEach((attr) => {
                    scriptEl.setAttribute(attr.name, attr.value);
                });

                if (node.src) {
                    // It is an external script
                    // Force reload by appending a unique timestamp query parameter to bypass browser script caching
                    const separator = node.src.includes('?') ? '&' : '?';
                    scriptEl.src = `${node.src}${separator}_t=${Date.now()}`;
                    // Disable async to ensure scripts execute in order
                    scriptEl.async = false;
                } else {
                    // It is an inline script
                    scriptEl.textContent = node.textContent;
                }

                // Append the script to our container
                containerRef.current.appendChild(scriptEl);
            } else {
                // For non-script nodes (like divs, iframe fallback, custom html), clone and append them
                const clonedNode = node.cloneNode(true);
                containerRef.current.appendChild(clonedNode);
            }
        });

        return () => {
            // Clean up when unmounting
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
        };
    }, [adCode]);

    return <div ref={containerRef} className="dynamic-ad-container" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }} />;
}
