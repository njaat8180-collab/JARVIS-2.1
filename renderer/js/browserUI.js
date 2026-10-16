"use strict";

/* ============================================================
   JARVIS PRO MAX — NEXT-LEVEL BILINGUAL BROWSER UI
   ------------------------------------------------------------
   Enhanced browser with:
   - Bilingual consciousness integration
   - AI-powered search suggestions
   - Voice search with language detection
   - Smart bookmarks and history
   - Advanced privacy features
   - Reading mode and dark theme
   - Tab organization and groups
   - Context-aware search
============================================================ */

const BrowserUI = (() => {

    let tabs = [];
    let activeTabId = null;
    let panelVisible = false;
    let resizeObserver = null;
    let addressBarFocused = false;
    
    // Next-level features
    let searchEngine = null;
    let consciousnessState = null;
    let currentLanguage = "en";
    let voiceSearchActive = false;
    let smartSuggestions = [];
    let readingMode = false;
    let darkTheme = true;
    let tabGroups = {};
    let privacyMode = false;
    let adBlockerEnabled = true;

    function els() {
        return {
            navBtn: document.getElementById("navBrowser"),
            otherNavBtns: Array.from(
                document.querySelectorAll(".menu-item[data-view]:not(#navBrowser)")
            ),
            aiCore: document.querySelector(".center-panel .ai-core"),
            panel: document.getElementById("browserPanel"),
            tabStrip: document.getElementById("browserTabStrip"),
            viewport: document.getElementById("browserViewport"),
            addressBar: document.getElementById("browserAddressBar"),
            secureIcon: document.getElementById("browserSecureIcon"),
            loadingBar: document.getElementById("browserLoadingBar"),
            backBtn: document.getElementById("browserBackBtn"),
            forwardBtn: document.getElementById("browserForwardBtn"),
            reloadBtn: document.getElementById("browserReloadBtn"),
            homeBtn: document.getElementById("browserHomeBtn"),
            newTabBtn: document.getElementById("browserNewTabBtn"),
            bookmarkBtn: document.getElementById("browserBookmarkBtn"),
            bookmarksBtn: document.getElementById("browserBookmarksBtn"),
            historyBtn: document.getElementById("browserHistoryBtn"),
            bookmarksPanel: document.getElementById("browserBookmarksPanel"),
            bookmarksList: document.getElementById("browserBookmarksList"),
            historyPanel: document.getElementById("browserHistoryPanel"),
            historyList: document.getElementById("browserHistoryList"),
            historyClearBtn: document.getElementById("browserHistoryClearBtn"),
            downloadsBtn: document.getElementById("browserDownloadsBtn"),
            downloadsPanel: document.getElementById("browserDownloadsPanel"),
            downloadsList: document.getElementById("browserDownloadsList"),
            downloadsClearBtn: document.getElementById("browserDownloadsClearBtn"),
            toolsBtn: document.getElementById("browserToolsBtn"),
            toolsPanel: document.getElementById("browserToolsPanel"),
            zoomInBtn: document.getElementById("browserZoomInBtn"),
            zoomOutBtn: document.getElementById("browserZoomOutBtn"),
            zoomResetBtn: document.getElementById("browserZoomResetBtn"),
            zoomLevel: document.getElementById("browserZoomLevel"),
            toolFind: document.getElementById("browserToolFind"),
            toolPrint: document.getElementById("browserToolPrint"),
            toolSavePage: document.getElementById("browserToolSavePage"),
            findBar: document.getElementById("browserFindBar"),
            findInput: document.getElementById("browserFindInput"),
            findCount: document.getElementById("browserFindCount"),
            findPrevBtn: document.getElementById("browserFindPrevBtn"),
            findNextBtn: document.getElementById("browserFindNextBtn"),
            findCloseBtn: document.getElementById("browserFindCloseBtn"),
            // Next-level UI elements
            voiceSearchBtn: document.getElementById("voiceSearchBtn"),
            suggestionsPanel: document.getElementById("suggestionsPanel"),
            suggestionsList: document.getElementById("suggestionsList"),
            readingModeBtn: document.getElementById("readingModeBtn"),
            themeToggleBtn: document.getElementById("themeToggleBtn"),
            privacyModeBtn: document.getElementById("privacyModeBtn"),
            tabGroupBtn: document.getElementById("tabGroupBtn"),
            languageIndicator: document.getElementById("languageIndicator")
        };
    }

    function getActiveTab() {
        return tabs.find(t => t.id === activeTabId) || null;
    }

    /* ============================================================
       BILINGUAL CONSCIOUSNESS INTEGRATION
       ============================================================ */
    
    async function updateConsciousnessState() {
        try {
            // FIX: window.jarvis.ipc was never exposed by preload (and the
            // "get-consciousness-state" channel never existed), so this
            // polling loop never ran. The real bridge is the AI API's
            // consciousnessState() → { success, consciousness: { ... } }.
            if (window.jarvis && window.jarvis.ai && window.jarvis.ai.consciousnessState) {
                const result = await window.jarvis.ai.consciousnessState();
                if (result && result.success && result.consciousness) {
                    consciousnessState = result.consciousness;
                    currentLanguage = result.consciousness.lastLanguage || "en";
                    updateLanguageIndicator();
                }
            }
        } catch (error) {
            console.error("Failed to update consciousness state:", error);
        }
    }

    function updateLanguageIndicator() {
        const { languageIndicator } = els();
        if (languageIndicator) {
            const languageNames = {
                en: "English",
                hi: "हिंदी",
                hinglish: "Hinglish"
            };
            languageIndicator.textContent = languageNames[currentLanguage] || "English";
            languageIndicator.dataset.language = currentLanguage;
        }
    }

    /* ============================================================
       AI-POWERED SEARCH SUGGESTIONS
       ============================================================ */
    
    async function getSmartSuggestions(query) {
        if (!query || query.length < 2) {
            smartSuggestions = [];
            return;
        }

        try {
            // Get language-aware suggestions
            if (window.jarvis) {
                const detectedLanguage = detectLanguage(query);
                currentLanguage = detectedLanguage;
                
                // Use bilingual consciousness for context-aware suggestions
                const context = {
                    query,
                    language: currentLanguage,
                    recentSearches: getRecentSearches(),
                    currentTab: getActiveTab()
                };
                
                // Get AI-powered suggestions if available
                if (window.jarvis.brain && window.jarvis.brain.getSearchSuggestions) {
                    smartSuggestions = await window.jarvis.brain.getSearchSuggestions(context);
                } else {
                    smartSuggestions = getFallbackSuggestions(query, currentLanguage);
                }
            } else {
                smartSuggestions = getFallbackSuggestions(query, currentLanguage);
            }
            
            renderSuggestions();
        } catch (error) {
            console.error("Failed to get smart suggestions:", error);
            smartSuggestions = getFallbackSuggestions(query, currentLanguage);
            renderSuggestions();
        }
    }

    function detectLanguage(text) {
        const devanagari = (text.match(/[\u0900-\u097F]/g) || []).length;
        const latin = (text.match(/[A-Za-z]/g) || []).length;
        
        if (devanagari > 0 && latin > 0) return "hinglish";
        if (devanagari > 0) return "hi";
        return "en";
    }

    function getFallbackSuggestions(query, language) {
        const suggestions = [];
        
        const templates = {
            en: [
                `${query} wiki`,
                `best ${query}`,
                `${query} tutorial`,
                `${query} reviews`,
                `${query} images`
            ],
            hi: [
                `${query} विकिपीडिया`,
                `सर्वश्रेष्ठ ${query}`,
                `${query} ट्यूटोरियल`,
                `${query} समीक्षा`,
                `${query} चित्र`
            ],
            hinglish: [
                `${query} wiki`,
                `best ${query}`,
                `${query} tutorial in Hindi`,
                `${query} reviews`,
                `${query} images`
            ]
        };

        const langTemplates = templates[language] || templates.en;
        return langTemplates.map((text, index) => ({
            id: index,
            text: text,
            type: "suggestion",
            language: language
        }));
    }

    function getRecentSearches() {
        if (privacyMode) return [];
        try {
            const history = JSON.parse(localStorage.getItem("jarvisBrowserHistory") || "[]");
            return history.slice(0, 5).map(h => h.query);
        } catch (error) {
            return [];
        }
    }

    function renderSuggestions() {
        const { suggestionsPanel, suggestionsList } = els();
        if (!suggestionsPanel || !suggestionsList) return;

        if (smartSuggestions.length === 0) {
            suggestionsPanel.style.display = "none";
            return;
        }

        suggestionsList.innerHTML = "";
        smartSuggestions.forEach(suggestion => {
            const item = document.createElement("div");
            item.className = "suggestion-item";
            item.dataset.suggestionId = suggestion.id;
            
            const icon = document.createElement("span");
            icon.className = "suggestion-icon";
            icon.textContent = suggestion.type === "history" ? "🕘" : "🔍";
            
            const text = document.createElement("span");
            text.className = "suggestion-text";
            text.textContent = suggestion.text;
            
            const languageTag = document.createElement("span");
            languageTag.className = "suggestion-language";
            languageTag.textContent = suggestion.language === "hi" ? "हिंदी" : 
                                    suggestion.language === "hinglish" ? "Hinglish" : "EN";
            
            item.appendChild(icon);
            item.appendChild(text);
            item.appendChild(languageTag);
            
            item.addEventListener("click", () => {
                navigateToSuggestion(suggestion.text);
            });
            
            suggestionsList.appendChild(item);
        });

        suggestionsPanel.style.display = "block";
    }

    function navigateToSuggestion(suggestion) {
        const { addressBar } = els();
        addressBar.value = suggestion;
        handleAddressBarSubmit();
        hideSuggestions();
    }

    function hideSuggestions() {
        const { suggestionsPanel } = els();
        if (suggestionsPanel) {
            suggestionsPanel.style.display = "none";
        }
        smartSuggestions = [];
    }

    /* ============================================================
       VOICE SEARCH WITH BILINGUAL SUPPORT
       ============================================================ */
    
    // Unsubscribe handle for the browser voice-search transcript listener
    let voiceSearchUnsubscribe = null;

    async function startVoiceSearch() {
        if (voiceSearchActive) {
            stopVoiceSearch();
            return;
        }

        try {
            voiceSearchActive = true;
            updateVoiceSearchUI(true);

            // FIX: the preload VoiceAPI exposes start()/stop()/onTranscript() —
            // the old startListening()/stopListening()/on("transcript") calls
            // never existed, so browser voice search silently did nothing.
            if (window.jarvis && window.jarvis.voice) {
                // Start voice recognition
                const result = await window.jarvis.voice.start();

                if (result && result.success) {
                    // Listen for transcript
                    if (typeof window.jarvis.voice.onTranscript === "function") {
                        if (voiceSearchUnsubscribe) {
                            try { voiceSearchUnsubscribe(); } catch (_) {}
                        }
                        voiceSearchUnsubscribe = window.jarvis.voice.onTranscript((transcript) => {
                            handleVoiceTranscript(transcript);
                        });
                    }
                } else {
                    console.warn("Voice search could not start:", result && result.error);
                    stopVoiceSearch();
                }
            }
        } catch (error) {
            console.error("Voice search error:", error);
            stopVoiceSearch();
        }
    }

    function stopVoiceSearch() {
        voiceSearchActive = false;
        updateVoiceSearchUI(false);

        if (voiceSearchUnsubscribe) {
            try { voiceSearchUnsubscribe(); } catch (_) {}
            voiceSearchUnsubscribe = null;
        }

        if (window.jarvis && window.jarvis.voice) {
            window.jarvis.voice.stop();
        }
    }

    function handleVoiceTranscript(transcript) {
        const { addressBar } = els();
        addressBar.value = transcript;
        
        // Detect language and update search
        const detectedLanguage = detectLanguage(transcript);
        currentLanguage = detectedLanguage;
        updateLanguageIndicator();
        
        // Get smart suggestions for the voice transcript
        getSmartSuggestions(transcript);
        
        // Auto-search if confidence is high
        if (transcript.length > 3) {
            setTimeout(() => {
                handleAddressBarSubmit();
                stopVoiceSearch();
            }, 1000);
        }
    }

    function updateVoiceSearchUI(active) {
        const { voiceSearchBtn } = els();
        if (voiceSearchBtn) {
            voiceSearchBtn.classList.toggle("active", active);
            voiceSearchBtn.title = active ? "Stop voice search" : "Start voice search";
        }
    }

    /* ============================================================
       ENHANCED TAB MANAGEMENT
       ============================================================ */
    
    function renderTabStrip() {
        const { tabStrip } = els();
        if (!tabStrip) return;

        tabStrip.innerHTML = "";

        // Group tabs if tab groups are enabled
        const groupedTabs = Object.keys(tabGroups).length > 0 ? 
            groupTabs(tabs) : [{ group: "default", tabs: tabs }];

        groupedTabs.forEach(group => {
            if (group.group !== "default") {
                const groupHeader = document.createElement("div");
                groupHeader.className = "tab-group-header";
                groupHeader.textContent = group.group;
                tabStrip.appendChild(groupHeader);
            }

            group.tabs.forEach((tab) => {
                const el = document.createElement("div");
                el.className = "browser-tab" + (tab.id === activeTabId ? " active" : "");
                el.dataset.tabId = tab.id;

                const favicon = document.createElement("img");
                favicon.className = "tab-favicon";
                favicon.src = tab.favicon || "";
                favicon.style.visibility = tab.favicon ? "visible" : "hidden";
                favicon.onerror = () => { favicon.style.visibility = "hidden"; };

                const title = document.createElement("span");
                title.className = "tab-title";
                title.textContent = tab.loading ? "Loading…" : (tab.title || "New Tab");

                const closeBtn = document.createElement("button");
                closeBtn.className = "tab-close";
                closeBtn.innerHTML = "✕";
                closeBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    closeTab(tab.id);
                });

                el.appendChild(favicon);
                el.appendChild(title);
                el.appendChild(closeBtn);

                el.addEventListener("click", () => switchTab(tab.id));

                tabStrip.appendChild(el);
            });
        });
    }

    function groupTabs(tabs) {
        const groups = {};
        
        tabs.forEach(tab => {
            const group = tab.group || "default";
            if (!groups[group]) {
                groups[group] = [];
            }
            groups[group].push(tab);
        });

        return Object.entries(groups).map(([group, tabs]) => ({ group, tabs }));
    }

    function createTabGroup() {
        const activeTab = getActiveTab();
        if (!activeTab) return;

        const groupName = prompt("Enter group name:", "New Group");
        if (groupName) {
            activeTab.group = groupName;
            tabGroups[groupName] = [activeTab.id];
            renderTabStrip();
            saveTabGroups();
        }
    }

    function saveTabGroups() {
        localStorage.setItem("jarvisTabGroups", JSON.stringify(tabGroups));
    }

    function loadTabGroups() {
        try {
            const saved = localStorage.getItem("jarvisTabGroups");
            if (saved) {
                tabGroups = JSON.parse(saved);
            }
        } catch (error) {
            console.error("Failed to load tab groups:", error);
        }
    }

    /* ============================================================
       READING MODE
       ============================================================ */
    
    function toggleReadingMode() {
        readingMode = !readingMode;
        updateReadingModeUI();

        // BUG FIX: window.jarvis.browser.setReadingMode() doesn't exist —
        // there's no matching main-process IPC channel for it, and reading
        // mode is purely a renderer-side CSS toggle (see
        // updateReadingModeUI above), so it doesn't need one. This used to
        // throw "setReadingMode is not a function" on every toggle.
    }

    function updateReadingModeUI() {
        const { readingModeBtn } = els();
        if (readingModeBtn) {
            readingModeBtn.classList.toggle("active", readingMode);
            readingModeBtn.title = readingMode ? "Exit reading mode" : "Enter reading mode";
        }

        // Apply reading mode styles to viewport
        const { viewport } = els();
        if (viewport) {
            viewport.classList.toggle("reading-mode", readingMode);
        }
    }

    /* ============================================================
       THEME MANAGEMENT
       ============================================================ */
    
    function toggleTheme() {
        darkTheme = !darkTheme;
        updateThemeUI();
        saveThemePreference();
    }

    function updateThemeUI() {
        const { themeToggleBtn } = els();
        if (themeToggleBtn) {
            themeToggleBtn.textContent = darkTheme ? "☀️" : "🌙";
            themeToggleBtn.title = darkTheme ? "Switch to light theme" : "Switch to dark theme";
        }

        document.body.classList.toggle("light-theme", !darkTheme);
        document.body.classList.toggle("dark-theme", darkTheme);
    }

    function saveThemePreference() {
        localStorage.setItem("jarvisBrowserTheme", darkTheme ? "dark" : "light");
    }

    function loadThemePreference() {
        try {
            const saved = localStorage.getItem("jarvisBrowserTheme");
            if (saved) {
                darkTheme = saved === "dark";
                updateThemeUI();
            }
        } catch (error) {
            console.error("Failed to load theme preference:", error);
        }
    }

    /* ============================================================
       PRIVACY MODE
       ============================================================ */
    
    function togglePrivacyMode() {
        privacyMode = !privacyMode;
        updatePrivacyModeUI();
        showNotification(privacyMode
            ? "Privacy mode on: new pages will not be added to JARVIS history. Cookies and site data still use the regular browser session."
            : "Privacy mode off: JARVIS will save new pages to history.");
    }

    function updatePrivacyModeUI() {
        const { privacyModeBtn } = els();
        if (privacyModeBtn) {
            privacyModeBtn.classList.toggle("active", privacyMode);
            privacyModeBtn.title = privacyMode ? "Exit privacy mode" : "Enter privacy mode";
        }

        // Update address bar to show privacy status
        const { addressBar } = els();
        if (addressBar) {
            addressBar.classList.toggle("privacy-mode", privacyMode);
        }
    }

    /* ============================================================
       ENHANCED BOOKMARKS WITH LANGUAGE TAGS
       ============================================================ */
    
    function addBookmark() {
        const activeTab = getActiveTab();
        if (!activeTab) return;

        const bookmark = {
            id: Date.now(),
            title: activeTab.title || "Untitled",
            url: activeTab.url,
            language: currentLanguage,
            date: new Date().toISOString(),
            favicon: activeTab.favicon
        };

        try {
            const bookmarks = JSON.parse(localStorage.getItem("jarvisBookmarks") || "[]");
            bookmarks.push(bookmark);
            localStorage.setItem("jarvisBookmarks", JSON.stringify(bookmarks));
            
            renderBookmarks();
            showNotification("Bookmark added successfully");
        } catch (error) {
            console.error("Failed to add bookmark:", error);
        }
    }

    function renderBookmarks() {
        const { bookmarksList } = els();
        if (!bookmarksList) return;

        try {
            const bookmarks = JSON.parse(localStorage.getItem("jarvisBookmarks") || "[]");
            bookmarksList.innerHTML = "";

            bookmarks.forEach(bookmark => {
                const item = document.createElement("div");
                item.className = "bookmark-item";
                
                const favicon = document.createElement("img");
                favicon.className = "bookmark-favicon";
                favicon.src = bookmark.favicon || "";
                favicon.onerror = () => { favicon.style.display = "none"; };

                const info = document.createElement("div");
                info.className = "bookmark-info";
                
                const title = document.createElement("div");
                title.className = "bookmark-title";
                title.textContent = bookmark.title;
                
                const url = document.createElement("div");
                url.className = "bookmark-url";
                url.textContent = bookmark.url;

                const languageTag = document.createElement("span");
                languageTag.className = "bookmark-language";
                languageTag.textContent = bookmark.language === "hi" ? "हिंदी" : 
                                        bookmark.language === "hinglish" ? "Hinglish" : "EN";

                const deleteBtn = document.createElement("button");
                deleteBtn.className = "bookmark-delete";
                deleteBtn.innerHTML = "✕";
                deleteBtn.addEventListener("click", () => deleteBookmark(bookmark.id));

                info.appendChild(title);
                info.appendChild(url);
                info.appendChild(languageTag);

                item.appendChild(favicon);
                item.appendChild(info);
                item.appendChild(deleteBtn);

                item.addEventListener("click", (e) => {
                    if (e.target !== deleteBtn) {
                        navigate(bookmark.url);
                    }
                });

                bookmarksList.appendChild(item);
            });
        } catch (error) {
            console.error("Failed to render bookmarks:", error);
        }
    }

    function deleteBookmark(id) {
        try {
            const bookmarks = JSON.parse(localStorage.getItem("jarvisBookmarks") || "[]");
            const filtered = bookmarks.filter(b => b.id !== id);
            localStorage.setItem("jarvisBookmarks", JSON.stringify(filtered));
            renderBookmarks();
        } catch (error) {
            console.error("Failed to delete bookmark:", error);
        }
    }

    /* ============================================================
       CORE BROWSER FUNCTIONS
       ============================================================ */
    
    async function showPanel() {
        const { panel, aiCore, navBtn, otherNavBtns } = els();
        
        if (!panel || !aiCore) return;

        panel.style.display = "flex";
        aiCore.style.display = "none";
        panelVisible = true;

        navBtn.classList.add("active");
        otherNavBtns.forEach(btn => btn.classList.remove("active"));

        // Initialize next-level features
        updateConsciousnessState();
        loadTabGroups();
        loadThemePreference();
        renderBookmarks();

        // Tell the main process the embedded BrowserView should be shown,
        // and make sure there is actually a tab loaded — previously neither
        // of these happened, so opening the panel just showed empty space
        // even though tabs may have loaded fine in the background.

        // FIRST: measure viewport and send bounds to main process.
        // This must happen BEFORE setVisible/createNewTab so the BrowserView
        // gets correct dimensions from the very first layout call.
        syncViewportBounds();

        if (window.jarvis && window.jarvis.browser) {
            await window.jarvis.browser.setVisible(true);

            if (!activeTabId || !tabs.some(t => t.id === activeTabId)) {
                await createNewTab();
            }
        }

        setupViewportSync();
        // Multiple re-syncs to ensure bounds are correct after layout settles.
        syncViewportBounds();
        requestAnimationFrame(syncViewportBounds);
        setTimeout(syncViewportBounds, 100);
        setTimeout(syncViewportBounds, 300);
        setTimeout(syncViewportBounds, 500);
    }

    function hidePanel() {
        const { panel, aiCore, navBtn } = els();
        
        if (!panel || !aiCore) return;

        panel.style.display = "none";
        aiCore.style.display = "block";
        panelVisible = false;

        navBtn.classList.remove("active");

        if (window.jarvis && window.jarvis.browser) {
            window.jarvis.browser.setVisible(false);
        }

        teardownViewportSync();
    }

    function syncViewportBounds() {
        const { viewport } = els();
        if (!viewport || !window.jarvis || !window.jarvis.browser) return;

        const rect = viewport.getBoundingClientRect();

        window.jarvis.browser.setBounds({
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height)
        });
    }

    function setupViewportSync() {
        const { viewport } = els();
        if (!viewport) return;

        if (!resizeObserver) {
            resizeObserver = new ResizeObserver(() => syncViewportBounds());
        }

        resizeObserver.observe(viewport);
        window.addEventListener("resize", syncViewportBounds);
    }

    function teardownViewportSync() {
        if (resizeObserver) {
            resizeObserver.disconnect();
        }
        window.removeEventListener("resize", syncViewportBounds);
    }

    function updateAddressBarFromActiveTab() {
        const { addressBar, loadingBar } = els();
        const active = tabs.find(t => t.id === activeTabId);

        if (addressBar && active && !addressBarFocused) {
            addressBar.value = (active.url && active.url !== "about:blank") ? active.url : "";
        }

        if (loadingBar) {
            loadingBar.classList.toggle("active", Boolean(active && active.loading));
        }
    }

    function switchTab(tabId) {
        activeTabId = tabId;
        renderTabStrip();
        
        // Notify main process about tab switch
        if (window.jarvis && window.jarvis.browser) {
            window.jarvis.browser.switchTab(tabId);
        }
    }

    async function closeTab(tabId) {
        if (!window.jarvis?.browser?.closeTab || !tabId) {
            return { success: false, error: "No browser tab is available to close." };
        }
        const result = await window.jarvis.browser.closeTab(tabId);
        if (!result?.success) {
            showNotification(result?.error || "Failed to close browser tab.");
            return result || { success: false, error: "Failed to close browser tab." };
        }
        tabs = result.tabs || tabs.filter(tab => tab.id !== tabId);
        activeTabId = result.activeTabId || tabs.find(tab => tab.active)?.id || null;
        renderTabStrip();
        updateAddressBarFromActiveTab();
        syncViewportBounds();
        return result;
    }

    async function navigate(url) {
        if (!url) return { success: false, error: "Enter a URL or search term." };
        let historyQuery = String(url).trim();
        
        // Format URL if needed
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            if (url.includes(".") && !url.includes(" ")) {
                url = "https://" + url;
            } else {
                // Use current language for search
                const searchUrls = {
                    en: "https://www.google.com/search?q=",
                    hi: "https://www.google.co.in/search?q=",
                    hinglish: "https://www.google.com/search?q="
                };
                historyQuery = url;
                url = (searchUrls[currentLanguage] || searchUrls.en) + encodeURIComponent(url);
            }
        }

        if (!window.jarvis || !window.jarvis.browser) return { success: false, error: "Browser service is unavailable." };

        // No tab yet (e.g. panel was never opened first) — create one
        // with this URL directly instead of failing.
        if (!activeTabId || !tabs.some(t => t.id === activeTabId)) {
            const result = await createNewTab(url);
            if (!privacyMode && result?.success) addToHistory(url, currentLanguage, historyQuery);
            return result || { success: false, error: "Could not create a browser tab." };
        }

        const result = await window.jarvis.browser.navigate(activeTabId, url);

        if (result && result.success) {
            syncViewportBounds();
            if (!privacyMode) addToHistory(url, currentLanguage, historyQuery);
        } else if (result) {
            showNotification(result.error || "Failed to load page.");
        }

        return result || { success: false, error: "Navigation did not complete." };
    }

    function addToHistory(url, language, query = url) {
        if (privacyMode) return;
        try {
            const history = JSON.parse(localStorage.getItem("jarvisBrowserHistory") || "[]");
            history.unshift({
                url,
                query,
                language,
                timestamp: new Date().toISOString()
            });
            // Keep only last 1000 items
            const trimmed = history.slice(0, 1000);
            localStorage.setItem("jarvisBrowserHistory", JSON.stringify(trimmed));
        } catch (error) {
            console.error("Failed to add to history:", error);
        }
    }

    function handleAddressBarSubmit() {
        const { addressBar } = els();
        if (!addressBar) return;

        const query = addressBar.value.trim();
        if (query) {
            navigate(query);
            addressBar.blur();
        }
    }

    function showNotification(message) {
        // Create and show a notification
        const notification = document.createElement("div");
        notification.className = "browser-notification";
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add("show");
        }, 10);

        setTimeout(() => {
            notification.classList.remove("show");
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 3000);
    }

    /* ============================================================
       EVENT HANDLERS
       ============================================================ */
    
    function setupEventHandlers() {
        const { 
            navBtn, addressBar, backBtn, forwardBtn, reloadBtn, 
            homeBtn, newTabBtn, bookmarkBtn, bookmarksBtn, 
            historyBtn, voiceSearchBtn, readingModeBtn, 
            themeToggleBtn, privacyModeBtn, tabGroupBtn,
            downloadsBtn, downloadsClearBtn,
            zoomInBtn, zoomOutBtn, zoomResetBtn,
            toolFind, toolPrint, toolSavePage,
            findInput, findPrevBtn, findNextBtn, findCloseBtn
        } = els();

        // Navigation
        if (navBtn) {
            navBtn.addEventListener("click", () => {
                // Selecting Browser always brings it forward; toggling it
                // closed while its navigation item remains selected left a
                // blank view and stale embedded contents on screen.
                showPanel();
            });
        }

        // Address bar
        if (addressBar) {
            addressBar.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    handleAddressBarSubmit();
                } else if (e.key === "Escape") {
                    hideSuggestions();
                }
            });

            addressBar.addEventListener("input", (e) => {
                getSmartSuggestions(e.target.value);
            });

            addressBar.addEventListener("focus", () => {
                addressBarFocused = true;
            });

            addressBar.addEventListener("blur", () => {
                setTimeout(() => {
                    addressBarFocused = false;
                    if (!voiceSearchActive) {
                        hideSuggestions();
                    }
                }, 200);
            });
        }

        // Navigation buttons
        // BUG FIX (browser automation): these called window.jarvis.browser.back()/
        // forward()/reload()/home() — none of those methods exist on the
        // preload bridge (it only exposes goBack(tabId)/goForward(tabId)/
        // reload(tabId), and there is no "home" method at all), and none of
        // them were passed the active tab id the main process needs to know
        // which tab to act on. Every back/forward/reload/home click silently
        // threw "is not a function" and did nothing.
        if (backBtn) backBtn.addEventListener("click", () => {
            if (window.jarvis && window.jarvis.browser && activeTabId) {
                window.jarvis.browser.goBack(activeTabId);
            }
        });

        if (forwardBtn) forwardBtn.addEventListener("click", () => {
            if (window.jarvis && window.jarvis.browser && activeTabId) {
                window.jarvis.browser.goForward(activeTabId);
            }
        });

        if (reloadBtn) reloadBtn.addEventListener("click", () => {
            if (window.jarvis && window.jarvis.browser && activeTabId) {
                window.jarvis.browser.reload(activeTabId);
            }
        });

        if (homeBtn) homeBtn.addEventListener("click", () => {
            // navigate(tabId, "") resolves to the homepage on the main-
            // process side (resolveSmartSearchTarget) — there is no
            // separate "home" IPC channel.
            if (window.jarvis && window.jarvis.browser && activeTabId) {
                window.jarvis.browser.navigate(activeTabId, "");
            }
        });

        // New tab
        if (newTabBtn) newTabBtn.addEventListener("click", () => {
            createNewTab();
        });

        // Bookmark
        if (bookmarkBtn) bookmarkBtn.addEventListener("click", () => {
            addBookmark();
        });

        if (bookmarksBtn) bookmarksBtn.addEventListener("click", () => {
            toggleBookmarksPanel();
        });

        // History
        if (historyBtn) historyBtn.addEventListener("click", () => {
            toggleHistoryPanel();
        });

        // Next-level features
        if (voiceSearchBtn) voiceSearchBtn.addEventListener("click", () => {
            startVoiceSearch();
        });

        if (readingModeBtn) readingModeBtn.addEventListener("click", () => {
            toggleReadingMode();
        });

        if (themeToggleBtn) themeToggleBtn.addEventListener("click", () => {
            toggleTheme();
        });

        if (privacyModeBtn) privacyModeBtn.addEventListener("click", () => {
            togglePrivacyMode();
        });

        if (tabGroupBtn) tabGroupBtn.addEventListener("click", () => {
            createTabGroup();
        });

        // BUG FIX: the "..." tools menu button had no click handler at
        // all, so the dropdown containing zoom/find/print/save-page could
        // never be opened.
        const { toolsBtn } = els();
        if (toolsBtn) toolsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleToolsPanel();
        });
        document.addEventListener("click", (e) => {
            const { toolsPanel, toolsBtn: btn } = els();
            if (toolsPanel && toolsPanel.style.display !== "none" &&
                !toolsPanel.contains(e.target) && e.target !== btn) {
                hideToolsPanel();
            }
        });

        // ------------------------------------------------------
        // BUG FIX (browser automation): the HTML for zoom, find-in-page,
        // print, save-page and downloads was already built (index.html),
        // and the main-process IPC for all of it already existed
        // (registerPageToolsIPC / registerDownloadsIPC), but nothing in
        // this file ever wired the buttons to it — clicking any of them,
        // the keyboard shortcuts for zoom, and every corresponding voice
        // command in browserVoiceControl.js did nothing at all.
        // ------------------------------------------------------

        if (zoomInBtn) zoomInBtn.addEventListener("click", () => zoomIn());
        if (zoomOutBtn) zoomOutBtn.addEventListener("click", () => zoomOut());
        if (zoomResetBtn) zoomResetBtn.addEventListener("click", () => zoomReset());

        if (toolFind) toolFind.addEventListener("click", () => {
            toggleFindBar();
            hideToolsPanel();
        });

        if (toolPrint) toolPrint.addEventListener("click", () => {
            printActiveTab();
            hideToolsPanel();
        });

        if (toolSavePage) toolSavePage.addEventListener("click", () => {
            savePageActiveTab();
            hideToolsPanel();
        });

        if (findInput) {
            findInput.addEventListener("input", (e) => {
                doFindInPage(e.target.value, { forward: true, findNext: false });
            });
            findInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    doFindInPage(findInput.value, { forward: !e.shiftKey, findNext: true });
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    closeFindBar();
                }
            });
        }

        if (findNextBtn) findNextBtn.addEventListener("click", () => {
            doFindInPage(findInput?.value, { forward: true, findNext: true });
        });

        if (findPrevBtn) findPrevBtn.addEventListener("click", () => {
            doFindInPage(findInput?.value, { forward: false, findNext: true });
        });

        if (findCloseBtn) findCloseBtn.addEventListener("click", () => {
            closeFindBar();
        });

        if (downloadsBtn) downloadsBtn.addEventListener("click", () => {
            toggleDownloadsPanel();
        });

        if (downloadsClearBtn) downloadsClearBtn.addEventListener("click", () => {
            if (window.jarvis && window.jarvis.downloads) {
                window.jarvis.downloads.clear().then(() => renderDownloads());
            }
        });

        if (window.jarvis && window.jarvis.downloads && typeof window.jarvis.downloads.onEvent === "function") {
            // BUG FIX: the "downloads:event" payload is { downloads: [...] }
            // — the FULL list, re-sent on every progress tick of every
            // download, not a single item's new state. Naively reading
            // payload.state (undefined) or firing a sound whenever any
            // download in the list happens to be "completed" would
            // replay the same sound on every subsequent tick for as
            // long as that finished download stays in the list. Track
            // which download ids we've already reacted to so each one
            // only triggers a sound once, right when it actually
            // finishes.
            const notifiedDownloadIds = new Set();
            window.jarvis.downloads.onEvent((payload) => {
                renderDownloads();

                const downloads = (payload && payload.downloads) || [];
                for (const item of downloads) {
                    if (!item || notifiedDownloadIds.has(item.id)) continue;
                    if (item.state === "completed") {
                        notifiedDownloadIds.add(item.id);
                        window.JARVIS_MemeSounds?.triggerForTask?.("download", "success");
                    } else if (item.state === "interrupted" || item.state === "cancelled") {
                        notifiedDownloadIds.add(item.id);
                        window.JARVIS_MemeSounds?.triggerForTask?.("download", "failure");
                    }
                }
            });
        }

        // Keyboard shortcuts
        document.addEventListener("keydown", (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case "l":
                        e.preventDefault();
                        addressBar?.focus();
                        addressBar?.select();
                        break;
                    case "t":
                        e.preventDefault();
                        createNewTab();
                        break;
                    case "w":
                        e.preventDefault();
                        if (activeTabId) closeTab(activeTabId);
                        break;
                    case "f":
                        e.preventDefault();
                        toggleFindBar();
                        break;
                    case "=":
                    case "+":
                        e.preventDefault();
                        document.getElementById("browserZoomInBtn")?.click();
                        break;
                    case "-":
                        e.preventDefault();
                        document.getElementById("browserZoomOutBtn")?.click();
                        break;
                    case "0":
                        e.preventDefault();
                        document.getElementById("browserZoomResetBtn")?.click();
                        break;
                }
                return;
            }

            // Alt+Left / Alt+Right — standard browser back/forward, not
            // covered by the panel's own buttons-only navigation before.
            const panel = document.getElementById("browserPanel");
            const panelVisible = panel && panel.style.display !== "none";
            if (panelVisible && e.altKey && e.key === "ArrowLeft") {
                e.preventDefault();
                document.getElementById("browserBackBtn")?.click();
            } else if (panelVisible && e.altKey && e.key === "ArrowRight") {
                e.preventDefault();
                document.getElementById("browserForwardBtn")?.click();
            } else if (panelVisible && e.key === "Escape") {
                // Escape closes whichever transient panel is open, cheapest
                // first: find bar, then any dropdown, then suggestions.
                const findBar = document.getElementById("browserFindBar");
                if (findBar && findBar.style.display !== "none") {
                    document.getElementById("browserFindCloseBtn")?.click();
                    return;
                }
                document.querySelectorAll(".browser-dropdown-panel").forEach((p) => {
                    if (p.style.display !== "none") p.style.display = "none";
                });
                const suggestions = document.getElementById("suggestionsPanel");
                if (suggestions) suggestions.style.display = "none";
            }
        });

        // Listen for consciousness updates
        // FIX: window.jarvis.ipc was never exposed by preload — gate on the
        // real bridge so the bilingual indicator actually polls.
        if (window.jarvis && window.jarvis.ai && window.jarvis.ai.consciousnessState) {
            setInterval(updateConsciousnessState, 5000);
        }
    }

    async function createNewTab(url) {
        if (!window.jarvis || !window.jarvis.browser) return null;

        const result = await window.jarvis.browser.newTab(url);

        if (result && result.success) {
            tabs = result.tabs || tabs;
            const active = tabs.find(t => t.active);
            activeTabId = active ? active.id : result.tabId;
            renderTabStrip();
            updateAddressBarFromActiveTab();
            syncViewportBounds();
            // Specific-task meme sound hook: a new tab actually opening
            // is a concrete finished task, not a guess from chat text.
            window.JARVIS_MemeSounds?.triggerForTask?.("browser-new-tab", "success");
        } else if (result) {
            showNotification(result.error || "Failed to open new tab.");
            window.JARVIS_MemeSounds?.triggerForTask?.("browser-new-tab", "failure");
        }

        return result;
    }

    function toggleBookmarksPanel() {
        const { bookmarksPanel } = els();
        if (bookmarksPanel) {
            const isHidden = bookmarksPanel.style.display === "none";
            bookmarksPanel.style.display = isHidden ? "block" : "none";
            if (isHidden) renderBookmarks();
        }
    }

    function toggleHistoryPanel() {
        const { historyPanel } = els();
        if (historyPanel) {
            const isHidden = historyPanel.style.display === "none";
            historyPanel.style.display = isHidden ? "block" : "none";
            if (isHidden) renderHistory();
        }
    }

    function renderHistory() {
        const { historyList } = els();
        if (!historyList) return;

        try {
            const history = JSON.parse(localStorage.getItem("jarvisBrowserHistory") || "[]");
            historyList.innerHTML = "";

            history.forEach(item => {
                const historyItem = document.createElement("div");
                historyItem.className = "history-item";
                
                const languageTag = document.createElement("span");
                languageTag.className = "history-language";
                languageTag.textContent = item.language === "hi" ? "हिंदी" : 
                                        item.language === "hinglish" ? "Hinglish" : "EN";

                const url = document.createElement("div");
                url.className = "history-url";
                url.textContent = item.url;

                const time = document.createElement("div");
                time.className = "history-time";
                time.textContent = new Date(item.timestamp).toLocaleString();

                historyItem.appendChild(languageTag);
                historyItem.appendChild(url);
                historyItem.appendChild(time);

                historyItem.addEventListener("click", () => {
                    navigate(item.url);
                    toggleHistoryPanel();
                });

                historyList.appendChild(historyItem);
            });
        } catch (error) {
            console.error("Failed to render history:", error);
        }
    }

    function toggleFindBar() {
        const { findBar, findInput } = els();
        if (findBar) {
            const isHidden = findBar.style.display === "none";
            findBar.style.display = isHidden ? "flex" : "none";
            if (isHidden) {
                findInput?.focus();
            } else {
                closeFindBar();
            }
        }
    }

    function closeFindBar() {
        const { findBar, findInput, findCount } = els();
        if (findBar) findBar.style.display = "none";
        if (findInput) findInput.value = "";
        if (findCount) findCount.textContent = "0/0";
        if (window.jarvis && window.jarvis.browser && activeTabId) {
            window.jarvis.browser.findStop(activeTabId);
        }
    }

    function doFindInPage(text, options = {}) {
        if (!window.jarvis || !window.jarvis.browser || !activeTabId) return;
        const query = String(text || "").trim();
        if (!query) {
            window.jarvis.browser.findStop(activeTabId);
            const { findCount } = els();
            if (findCount) findCount.textContent = "0/0";
            return;
        }
        window.jarvis.browser.find(activeTabId, query, options);
    }

    // Public entry point used by browserVoiceControl.js for the voice
    // command "find X on this page" — opens the bar, fills it in, and
    // runs the search, instead of throwing "findInPage is not a function".
    async function findInPage(query) {
        const { findBar, findInput } = els();
        if (findBar) findBar.style.display = "flex";
        if (findInput) findInput.value = query || "";
        doFindInPage(query, { forward: true, findNext: false });
    }

    function updateZoomLevelDisplay(factor) {
        const { zoomLevel } = els();
        if (zoomLevel) zoomLevel.textContent = `${Math.round((factor || 1) * 100)}%`;
    }

    async function zoomIn() {
        if (!window.jarvis || !window.jarvis.browser || !activeTabId) return;
        const result = await window.jarvis.browser.zoomIn(activeTabId);
        if (result && result.success) updateZoomLevelDisplay(result.zoomFactor);
    }

    async function zoomOut() {
        if (!window.jarvis || !window.jarvis.browser || !activeTabId) return;
        const result = await window.jarvis.browser.zoomOut(activeTabId);
        if (result && result.success) updateZoomLevelDisplay(result.zoomFactor);
    }

    async function zoomReset() {
        if (!window.jarvis || !window.jarvis.browser || !activeTabId) return;
        const result = await window.jarvis.browser.zoomReset(activeTabId);
        if (result && result.success) updateZoomLevelDisplay(result.zoomFactor);
    }

    async function printActiveTab() {
        if (!window.jarvis || !window.jarvis.browser || !activeTabId) return;
        const result = await window.jarvis.browser.print(activeTabId);
        if (result && !result.success) showNotification(result.error || "Print failed.");
    }

    async function savePageActiveTab() {
        if (!window.jarvis || !window.jarvis.browser || !activeTabId) return;
        const result = await window.jarvis.browser.savePage(activeTabId);
        if (result && !result.success) showNotification(result.error || "Save page failed.");
    }

    function toggleToolsPanel() {
        const { toolsPanel } = els();
        if (toolsPanel) {
            toolsPanel.style.display = toolsPanel.style.display === "none" ? "block" : "none";
        }
    }

    function hideToolsPanel() {
        const { toolsPanel } = els();
        if (toolsPanel) toolsPanel.style.display = "none";
    }

    async function renderDownloads() {
        const { downloadsList } = els();
        if (!downloadsList || !window.jarvis || !window.jarvis.downloads) return;

        try {
            const result = await window.jarvis.downloads.list();
            const downloads = (result && result.downloads) || [];

            downloadsList.innerHTML = "";

            if (!downloads.length) {
                downloadsList.innerHTML = `<div class="browser-empty-state">No downloads yet</div>`;
                return;
            }

            downloads.forEach((item) => {
                const row = document.createElement("div");
                row.className = "download-item";

                const name = document.createElement("div");
                name.className = "download-name";
                name.textContent = item.filename || item.url || "Download";

                const status = document.createElement("div");
                status.className = "download-status";
                status.textContent = item.state || "";

                row.appendChild(name);
                row.appendChild(status);

                row.addEventListener("click", () => {
                    window.jarvis.downloads.openFile(item.id);
                });

                downloadsList.appendChild(row);
            });
        } catch (error) {
            console.error("Failed to render downloads:", error);
        }
    }

    function toggleDownloadsPanel() {
        const { downloadsPanel } = els();
        if (downloadsPanel) {
            const isHidden = downloadsPanel.style.display === "none";
            downloadsPanel.style.display = isHidden ? "block" : "none";
            if (isHidden) renderDownloads();
        }
    }

    // ------------------------------------------------------------
    // "show" variants for voice commands (browserVoiceControl.js) —
    // unlike the button-driven toggle*Panel() functions, a spoken
    // "bookmarks dikhao" should always open the panel, never close it.
    // ------------------------------------------------------------

    function showBookmarksPanel() {
        const { bookmarksPanel } = els();
        if (bookmarksPanel) {
            bookmarksPanel.style.display = "block";
            renderBookmarks();
        }
    }

    function showHistoryPanel() {
        const { historyPanel } = els();
        if (historyPanel) {
            historyPanel.style.display = "block";
            renderHistory();
        }
    }

    function showDownloadsPanel() {
        const { downloadsPanel } = els();
        if (downloadsPanel) {
            downloadsPanel.style.display = "block";
            renderDownloads();
        }
    }

    async function toggleBookmarkForActiveTab() {
        // BUG FIX: this used to call window.jarvis.bookmarks.* (the
        // disk-persisted store from main.js), but the bookmarks panel the
        // user actually sees (renderBookmarks/addBookmark/deleteBookmark
        // above) reads and writes localStorage["jarvisBookmarks"] — a
        // completely separate, never-synced store. A voice "bookmark
        // karo" would have silently written to a store nothing displays.
        // Use the same localStorage store the UI already uses so voice
        // and the star button stay in sync.
        const activeTab = getActiveTab();
        if (!activeTab) return;

        try {
            const bookmarks = JSON.parse(localStorage.getItem("jarvisBookmarks") || "[]");
            const existing = bookmarks.find(b => b.url === activeTab.url);

            if (existing) {
                deleteBookmark(existing.id);
                showNotification("Bookmark removed");
            } else {
                addBookmark();
            }
        } catch (error) {
            console.error("Failed to toggle bookmark:", error);
        }
    }

    /* ============================================================
       INITIALIZATION
       ============================================================ */
    
    function init() {
        setupEventHandlers();
        loadTabGroups();
        loadThemePreference();

        if (window.jarvis && window.jarvis.browser && typeof window.jarvis.browser.onTabEvent === "function") {
            window.jarvis.browser.onTabEvent((payload) => {
                if (!payload) return;

                // BUG FIX: find-in-page results (match count / current
                // match) were already being sent from main.js on every
                // "found-in-page" event, but nothing here ever read them,
                // so the "0/0" counter next to the find bar never updated.
                if (payload.type === "find-result") {
                    const { findCount } = els();
                    if (findCount) {
                        const ordinal = payload.activeMatchOrdinal || 0;
                        const total = payload.matches || 0;
                        findCount.textContent = `${ordinal}/${total}`;
                    }
                    return;
                }

                tabs = payload.tabs || tabs;
                const active = tabs.find(t => t.active);
                activeTabId = active ? active.id : activeTabId;

                renderTabStrip();
                updateAddressBarFromActiveTab();
            });
        }
        
        console.log("🌐 Next-Level Bilingual Browser UI initialized");
    }

    // Public API
    return {
        init,
        showPanel,
        hidePanel,
        navigate,
        // Alias used by browserVoiceControl.js for voice-driven search/open
        // commands. navigate() already ensures a tab exists and targets the
        // active tab, so this just needs to exist under the name that code
        // actually calls.
        navigateActiveTab: navigate,
        createNewTab,
        // BUG FIX: browserVoiceControl.js calls window.BrowserUI.newTab()
        // (no args, for a voice "naya tab kholo") — the real function is
        // createNewTab, and it wasn't exported under either name before.
        newTab: createNewTab,
        closeTab,
        switchTab,
        addBookmark,
        deleteBookmark,
        toggleReadingMode,
        toggleTheme,
        togglePrivacyMode,
        startVoiceSearch,
        stopVoiceSearch,
        updateConsciousnessState,
        getCurrentLanguage: () => currentLanguage,
        getConsciousnessState: () => consciousnessState,
        // BUG FIX: the rest of these were called from
        // browserVoiceControl.js for voice browser commands (zoom, find,
        // print, save page, bookmarks/history/downloads panels) but were
        // never implemented or exported at all, so every one of those
        // voice commands silently failed with "is not a function".
        zoomIn,
        zoomOut,
        zoomReset,
        printActiveTab,
        savePageActiveTab,
        findInPage,
        showBookmarksPanel,
        showHistoryPanel,
        showDownloadsPanel,
        toggleBookmarkForActiveTab
    };

})();

// Expose globally — top-level `const` does NOT attach to `window` in a
// classic <script> tag, so without this, every `window.BrowserUI.*` call
// elsewhere in the app (voice search, browserExecution.js, etc.) silently
// found nothing and the in-app browser panel never opened.
window.BrowserUI = BrowserUI;

// Initialize when DOM is ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", BrowserUI.init);
} else {
    BrowserUI.init();
}
