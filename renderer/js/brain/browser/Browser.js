// ==========================================
// JARVIS PRO MAX
// Browser Commands
// browser.js
// ==========================================

"use strict";

const BrowserCommands = [

    // ==========================================
    // Browser Part 1
    // Search Engines
    // ==========================================

// ==========================================
// BROWSER V2
// PART 1
// Search Engine Commands
// ==========================================

{
    action: "googleSearch",

    patterns: [

        "search",
        "google",
        "google search",
        "search google",
        "find",
        "find on google",
        "look up",
        "search for",
        "search the web",
        "web search",
        "internet search",
        "google it",
        "look this up",
        "search online",
        "find online",
        "search internet",
        "browse web",
        "find information",
        "web lookup",
        "online search"

    ],

    response: "What would you like me to search for?"

},

{
    action: "youtubeSearch",

    patterns: [

        "youtube search",
        "search youtube",
        "find on youtube",
        "youtube",
        "video search",
        "search videos",
        "find video",
        "youtube video",
        "play on youtube",
        "look on youtube",
        "youtube lookup",
        "search youtube videos",
        "video lookup",
        "watch on youtube",
        "open youtube search",
        "youtube kholo",
        "youtube me search",
        "youtube par dhoondo",
        "youtube par search",
        "find youtube"

    ],

    response: "What should I search on YouTube?"

},

{
    action: "wikipediaSearch",

    patterns: [

        "wikipedia",
        "search wikipedia",
        "find on wikipedia",
        "wiki",
        "wiki search",
        "look on wikipedia",
        "wikipedia lookup",
        "search wiki",
        "find wiki",
        "open wikipedia search",
        "wikipedia kholo",
        "wiki me search",
        "wiki par dhoondo",
        "encyclopedia search",
        "knowledge search",
        "facts search",
        "wikipedia article",
        "find article",
        "search encyclopedia",
        "learn about"

    ],

    response: "What would you like to search on Wikipedia?"

},

{
    action: "bingSearch",

    patterns: [

        "bing",
        "search bing",
        "bing search",
        "find on bing",
        "look on bing",
        "search with bing",
        "bing lookup",
        "bing me search",
        "bing kholo",
        "search bing web",
        "internet bing",
        "browse with bing",
        "find bing",
        "bing browser search",
        "web bing",
        "bing engine",
        "bing online",
        "bing information",
        "bing query",
        "bing results"

    ],

    response: "What would you like to search on Bing?"

},

{
    action: "duckDuckGoSearch",

    patterns: [

        "duckduckgo",
        "duck duck go",
        "search duckduckgo",
        "duck search",
        "privacy search",
        "private search",
        "duckduckgo search",
        "search with duckduckgo",
        "duck me search",
        "duck browser search",
        "secure search",
        "anonymous search",
        "duckduckgo kholo",
        "ddg",
        "ddg search",
        "search ddg",
        "private web search",
        "privacy browser",
        "find on duckduckgo",
        "duck lookup"

    ],

    response: "What would you like to search privately?"

},

    // ==========================================
    // Browser Part 2
    // Popular Websites
    // ==========================================

// ==========================================
// PART 2
// Popular Websites
// ==========================================

{
    action: "openYouTube",

    patterns: [

        "youtube",
        "open youtube",
        "launch youtube",
        "start youtube",
        "go to youtube",
        "visit youtube",
        "youtube kholo",
        "youtube open karo",
        "show youtube",
        "take me to youtube",
        "need youtube",
        "youtube website",
        "youtube page",
        "watch youtube",
        "browse youtube",
        "open youtube website",
        "youtube please",
        "go youtube",
        "youtube home",
        "youtube now"

    ],

    response: "Opening YouTube."

},

{
    action: "openGoogle",

    patterns: [

        "google",
        "open google",
        "launch google",
        "start google",
        "google kholo",
        "google open karo",
        "visit google",
        "go to google",
        "show google",
        "google website",
        "google home",
        "browse google",
        "need google",
        "google page",
        "take me to google",
        "google search page",
        "google now",
        "open google homepage",
        "go google",
        "google please"

    ],

    response: "Opening Google."

},

{
    action: "openGmail",

    patterns: [

        "gmail",
        "open gmail",
        "launch gmail",
        "gmail kholo",
        "gmail open karo",
        "check gmail",
        "email",
        "open email",
        "google mail",
        "visit gmail",
        "gmail inbox",
        "my gmail",
        "show gmail",
        "go to gmail",
        "gmail website",
        "need gmail",
        "mail inbox",
        "gmail login",
        "gmail home",
        "gmail now"

    ],

    response: "Opening Gmail."

},

{
    action: "openFacebook",

    patterns: [

        "facebook",
        "open facebook",
        "launch facebook",
        "facebook kholo",
        "facebook open karo",
        "visit facebook",
        "go to facebook",
        "facebook website",
        "facebook page",
        "show facebook",
        "need facebook",
        "browse facebook",
        "facebook login",
        "my facebook",
        "facebook home",
        "facebook now",
        "take me to facebook",
        "facebook social",
        "facebook app",
        "open fb"

    ],

    response: "Opening Facebook."

},

{
    action: "openInstagram",

    patterns: [

        "instagram",
        "open instagram",
        "launch instagram",
        "instagram kholo",
        "instagram open karo",
        "visit instagram",
        "go to instagram",
        "instagram website",
        "show instagram",
        "my instagram",
        "instagram login",
        "need instagram",
        "browse instagram",
        "instagram home",
        "instagram page",
        "instagram now",
        "take me to instagram",
        "insta",
        "open insta",
        "insta kholo"

    ],

    response: "Opening Instagram."

},

{
    action: "openX",

    patterns: [

        "twitter",
        "x",
        "open twitter",
        "open x",
        "launch twitter",
        "launch x",
        "twitter kholo",
        "x kholo",
        "visit twitter",
        "visit x",
        "twitter website",
        "x website",
        "show twitter",
        "show x",
        "twitter login",
        "x login",
        "go to twitter",
        "go to x",
        "twitter home",
        "x home"

    ],

    response: "Opening X."

},

{
    action: "openLinkedIn",

    patterns: [

        "linkedin",
        "open linkedin",
        "launch linkedin",
        "linkedin kholo",
        "linkedin open karo",
        "visit linkedin",
        "go to linkedin",
        "linkedin website",
        "show linkedin",
        "my linkedin",
        "linkedin profile",
        "linkedin login",
        "need linkedin",
        "browse linkedin",
        "linkedin home",
        "linkedin jobs",
        "professional network",
        "linkedin page",
        "linkedin now",
        "open linkedin website"

    ],

    response: "Opening LinkedIn."

},

{
    action: "openReddit",

    patterns: [

        "reddit",
        "open reddit",
        "launch reddit",
        "reddit kholo",
        "reddit open karo",
        "visit reddit",
        "go to reddit",
        "reddit website",
        "show reddit",
        "browse reddit",
        "need reddit",
        "reddit home",
        "reddit page",
        "reddit now",
        "open reddit website",
        "reddit community",
        "reddit posts",
        "reddit social",
        "my reddit",
        "take me to reddit"

    ],

    response: "Opening Reddit."

},

{
    action: "openGitHub",

    patterns: [

        "github",
        "open github",
        "launch github",
        "github kholo",
        "github open karo",
        "visit github",
        "go to github",
        "github website",
        "github repository",
        "show github",
        "browse github",
        "need github",
        "github code",
        "github profile",
        "github login",
        "github home",
        "github page",
        "open github website",
        "github now",
        "take me to github"

    ],

    response: "Opening GitHub."

},

{
    action: "openStackOverflow",

    patterns: [

        "stack overflow",
        "stackoverflow",
        "open stack overflow",
        "launch stack overflow",
        "stack overflow kholo",
        "visit stack overflow",
        "go to stack overflow",
        "coding help",
        "developer questions",
        "programming help",
        "show stack overflow",
        "stack overflow website",
        "stack overflow page",
        "need stack overflow",
        "browse stack overflow",
        "stackoverflow website",
        "stackoverflow home",
        "stackoverflow now",
        "take me to stack overflow",
        "open programming forum"

    ],

    response: "Opening Stack Overflow."

},

    // ==========================================
    // Browser Part 3
    // Navigation
    // ==========================================

// ==========================================
// PART 3
// Browser Navigation
// ==========================================

{
    action: "browserBack",

    patterns: [

        "go back",
        "back",
        "previous page",
        "last page",
        "browser back",
        "go to previous page",
        "navigate back",
        "back page",
        "go one page back",
        "return back",
        "go backwards",
        "move back",
        "back please",
        "jarvis go back",
        "browser previous",
        "previous website",
        "go previous",
        "back browser",
        "take me back",
        "return previous"

    ],

    response: "Going back."

},

{
    action: "browserForward",

    patterns: [

        "forward",
        "go forward",
        "next page",
        "browser forward",
        "move forward",
        "navigate forward",
        "forward page",
        "go next",
        "next website",
        "jarvis go forward",
        "go ahead",
        "continue browsing",
        "browser next",
        "forward browser",
        "move next",
        "take me forward",
        "next tab page",
        "continue",
        "advance page",
        "go ahead browser"

    ],

    response: "Going forward."

},

{
    action: "browserRefresh",

    patterns: [

        "refresh",
        "reload",
        "refresh page",
        "reload page",
        "refresh browser",
        "reload browser",
        "update page",
        "refresh website",
        "reload website",
        "browser reload",
        "browser refresh",
        "jarvis refresh",
        "refresh current page",
        "reload current page",
        "refresh tab",
        "reload tab",
        "page refresh",
        "refresh now",
        "reload now",
        "update browser"

    ],

    response: "Refreshing page."

},

{
    action: "browserHardRefresh",

    patterns: [

        "hard refresh",
        "force refresh",
        "force reload",
        "hard reload",
        "refresh without cache",
        "reload without cache",
        "clear cache and refresh",
        "ctrl shift r",
        "hard page reload",
        "browser hard refresh",
        "hard browser refresh",
        "force page refresh",
        "update page completely",
        "fresh reload",
        "full refresh",
        "deep refresh",
        "refresh everything",
        "hard update",
        "browser force reload",
        "complete refresh"

    ],

    response: "Performing hard refresh."

},

{
    action: "browserHome",

    patterns: [

        "home",
        "go home",
        "browser home",
        "homepage",
        "open homepage",
        "go to homepage",
        "home page",
        "browser start page",
        "main page",
        "default page",
        "go browser home",
        "jarvis go home",
        "return home",
        "browser main page",
        "start page",
        "take me home",
        "open home",
        "go to home page",
        "browser default",
        "homepage please"

    ],

    response: "Opening homepage."

},

{
    action: "browserStopLoading",

    patterns: [

        "stop loading",
        "cancel loading",
        "stop page",
        "cancel page",
        "stop browser",
        "abort loading",
        "abort page",
        "stop website",
        "browser stop",
        "cancel website",
        "stop current page",
        "cancel current page",
        "loading stop",
        "jarvis stop loading",
        "stop this page",
        "cancel this page",
        "halt loading",
        "halt browser",
        "page stop",
        "interrupt loading"

    ],

    response: "Stopping page loading."

},

{
    action: "browserNewTab",

    patterns: [

        "new tab",
        "open new tab",
        "create new tab",
        "add tab",
        "browser new tab",
        "new browser tab",
        "launch new tab",
        "open another tab",
        "make new tab",
        "start new tab",
        "new page",
        "new browsing tab",
        "jarvis new tab",
        "new tab please",
        "another tab",
        "blank tab",
        "open blank tab",
        "tab open",
        "new window tab",
        "browser add tab"

    ],

    response: "Opening a new tab."

},

{
    action: "browserCloseTab",

    patterns: [

        "close tab",
        "close current tab",
        "remove tab",
        "close browser tab",
        "delete tab",
        "close this tab",
        "exit tab",
        "close page",
        "tab close",
        "browser close tab",
        "jarvis close tab",
        "current tab close",
        "shut tab",
        "terminate tab",
        "close active tab",
        "close opened tab",
        "end tab",
        "dismiss tab",
        "browser remove tab",
        "close browser page"

    ],

    response: "Closing current tab."

},

{
    action: "browserReopenTab",

    patterns: [

        "reopen tab",
        "restore tab",
        "open closed tab",
        "undo close tab",
        "recover tab",
        "bring back tab",
        "restore closed tab",
        "last closed tab",
        "recent tab",
        "reopen last tab",
        "browser reopen",
        "jarvis reopen tab",
        "restore browser tab",
        "recover browser tab",
        "undo tab close",
        "tab restore",
        "tab recover",
        "bring tab back",
        "reopen browser tab",
        "restore previous tab"

    ],

    response: "Reopening last closed tab."

},

{
    action: "browserDuplicateTab",

    patterns: [

        "duplicate tab",
        "copy tab",
        "clone tab",
        "duplicate current tab",
        "copy current page",
        "clone current page",
        "browser duplicate",
        "browser clone tab",
        "make another copy",
        "duplicate browser page",
        "duplicate this tab",
        "copy browser tab",
        "clone browser tab",
        "tab duplicate",
        "jarvis duplicate tab",
        "create copy of tab",
        "repeat tab",
        "same page new tab",
        "duplicate webpage",
        "copy webpage"

    ],

    response: "Duplicating current tab."

},

    // ==========================================
    // Browser Part 4
    // Tabs
    // ==========================================

// ==========================================
// PART 4A
// Tab Management
// ==========================================

{
    action: "nextTab",

    patterns: [

        "next tab",
        "switch to next tab",
        "go to next tab",
        "move to next tab",
        "open next tab",
        "next browser tab",
        "browser next tab",
        "tab next",
        "change to next tab",
        "jarvis next tab",
        "advance tab",
        "move right tab",
        "right tab",
        "go right tab",
        "tab forward",
        "switch right",
        "cycle next tab",
        "next page tab",
        "show next tab",
        "next please"

    ],

    response: "Switching to the next tab."

},

{
    action: "previousTab",

    patterns: [

        "previous tab",
        "last tab",
        "go to previous tab",
        "switch previous tab",
        "move to previous tab",
        "browser previous tab",
        "tab previous",
        "change previous tab",
        "left tab",
        "go left tab",
        "move left",
        "tab backward",
        "previous browser tab",
        "switch left",
        "jarvis previous tab",
        "cycle previous tab",
        "show previous tab",
        "back tab",
        "return previous tab",
        "previous please"

    ],

    response: "Switching to the previous tab."

},

{
    action: "firstTab",

    patterns: [

        "first tab",
        "go to first tab",
        "switch first tab",
        "browser first tab",
        "tab one",
        "tab number one",
        "move to first tab",
        "show first tab",
        "open first tab",
        "go first",
        "jarvis first tab",
        "select first tab",
        "primary tab",
        "main tab",
        "first browser tab",
        "go tab one",
        "jump first tab",
        "first page",
        "browser tab one",
        "tab start"

    ],

    response: "Opening the first tab."

},

{
    action: "lastTab",

    patterns: [

        "last browser tab",
        "final tab",
        "go to last tab",
        "switch last tab",
        "browser last tab",
        "move to last tab",
        "show last tab",
        "latest tab",
        "end tab",
        "last opened tab",
        "jarvis last tab",
        "jump last tab",
        "tab end",
        "select last tab",
        "go end tab",
        "browser final tab",
        "last page tab",
        "tab final",
        "last please",
        "last window tab"

    ],

    response: "Switching to the last tab."

},

{
    action: "pinTab",

    patterns: [

        "pin tab",
        "pin current tab",
        "pin this tab",
        "browser pin tab",
        "keep tab pinned",
        "lock tab",
        "tab pin",
        "pin browser tab",
        "make pinned tab",
        "pin page",
        "jarvis pin tab",
        "save tab position",
        "keep this tab",
        "fix tab",
        "tab lock",
        "pin active tab",
        "secure tab",
        "tab fixed",
        "hold tab",
        "pin it"

    ],

    response: "Pinning current tab."

},

{
    action: "unpinTab",

    patterns: [

        "unpin tab",
        "remove pin",
        "unpin current tab",
        "browser unpin tab",
        "unlock tab",
        "tab unpin",
        "release tab",
        "remove tab pin",
        "normal tab",
        "disable pin",
        "jarvis unpin tab",
        "free tab",
        "unfix tab",
        "restore normal tab",
        "detach pin",
        "pin off",
        "tab unlock",
        "remove pinned tab",
        "stop pinning",
        "unpin it"

    ],

    response: "Unpinning current tab."

},

{
    action: "muteTab",

    patterns: [

        "mute tab",
        "mute current tab",
        "silence tab",
        "stop tab sound",
        "mute browser tab",
        "disable tab audio",
        "tab mute",
        "mute webpage",
        "mute this tab",
        "jarvis mute tab",
        "turn off tab sound",
        "browser mute",
        "audio off tab",
        "mute page",
        "quiet tab",
        "disable sound tab",
        "sound off tab",
        "tab audio off",
        "mute website",
        "silence browser"

    ],

    response: "Muting current tab."

},

{
    action: "unmuteTab",

    patterns: [

        "unmute tab",
        "enable tab sound",
        "turn on tab sound",
        "restore tab audio",
        "tab unmute",
        "browser unmute",
        "sound on tab",
        "audio on tab",
        "unmute current tab",
        "jarvis unmute tab",
        "resume tab sound",
        "tab sound on",
        "allow tab audio",
        "page sound on",
        "website sound on",
        "restore sound",
        "remove mute",
        "tab volume on",
        "unmute webpage",
        "hear tab"

    ],

    response: "Unmuting current tab."

},

{
    action: "duplicateTab",

    patterns: [

        "duplicate tab",
        "copy tab",
        "clone tab",
        "copy current tab",
        "duplicate current tab",
        "clone current page",
        "copy browser tab",
        "duplicate browser page",
        "same tab",
        "make tab copy",
        "jarvis duplicate tab",
        "repeat tab",
        "duplicate webpage",
        "clone browser",
        "browser duplicate",
        "tab duplicate",
        "copy webpage",
        "new copy tab",
        "duplicate active tab",
        "tab copy"

    ],

    response: "Duplicating current tab."

},

{
    action: "moveTabToNewWindow",

    patterns: [

        "move tab to new window",
        "new window from tab",
        "detach tab",
        "separate tab",
        "move current tab",
        "extract tab",
        "browser detach tab",
        "tab new window",
        "pop out tab",
        "jarvis detach tab",
        "open tab in new window",
        "split tab",
        "floating tab",
        "move page window",
        "tab separate window",
        "detach current page",
        "browser split",
        "window from tab",
        "new browser window",
        "move browser tab"

    ],

    response: "Moving the current tab to a new window."

},
// ==========================================
// PART 4B-1
// Advanced Tab Management
// ==========================================

{
    action: "closeOtherTabs",

    patterns: [

        "close other tabs",
        "close all other tabs",
        "keep this tab",
        "close remaining tabs",
        "remove other tabs",
        "close every other tab",
        "only keep current tab",
        "keep current tab",
        "close tabs except this",
        "browser close others",
        "jarvis close other tabs",
        "leave this tab",
        "close unwanted tabs",
        "clear other tabs",
        "close background tabs",
        "keep active tab",
        "remove remaining tabs",
        "close rest tabs",
        "only this tab",
        "close everything else"

    ],

    response: "Closing all other tabs."

},

{
    action: "closeTabsToRight",

    patterns: [

        "close tabs to right",
        "close right tabs",
        "remove right tabs",
        "close all right tabs",
        "delete right tabs",
        "browser close right",
        "close tabs on right",
        "right side tabs",
        "clear right tabs",
        "jarvis close right tabs",
        "close everything right",
        "remove tabs right",
        "close right browser tabs",
        "delete tabs right",
        "close pages right",
        "close all pages right",
        "right tabs close",
        "browser remove right",
        "clean right tabs",
        "remove right side"

    ],

    response: "Closing tabs to the right."

},

{
    action: "closeTabsToLeft",

    patterns: [

        "close tabs to left",
        "close left tabs",
        "remove left tabs",
        "close all left tabs",
        "delete left tabs",
        "browser close left",
        "close tabs on left",
        "left side tabs",
        "clear left tabs",
        "jarvis close left tabs",
        "close everything left",
        "remove tabs left",
        "close left browser tabs",
        "delete tabs left",
        "close pages left",
        "close all pages left",
        "left tabs close",
        "browser remove left",
        "clean left tabs",
        "remove left side"

    ],

    response: "Closing tabs to the left."

},

{
    action: "reloadAllTabs",

    patterns: [

        "reload all tabs",
        "refresh all tabs",
        "reload every tab",
        "refresh every tab",
        "reload browser tabs",
        "refresh browser tabs",
        "update all tabs",
        "browser reload all",
        "browser refresh all",
        "jarvis reload all tabs",
        "reload everything",
        "refresh everything",
        "reload all pages",
        "refresh all pages",
        "reload open tabs",
        "refresh open tabs",
        "reload browser",
        "update browser tabs",
        "reload every page",
        "refresh every page"

    ],

    response: "Reloading all open tabs."

},

{
    action: "bookmarkCurrentTab",

    patterns: [

        "bookmark this tab",
        "bookmark current tab",
        "save this tab",
        "save current page",
        "add bookmark",
        "bookmark page",
        "save webpage",
        "bookmark website",
        "browser bookmark",
        "jarvis bookmark tab",
        "bookmark current page",
        "remember this page",
        "save browser page",
        "favorite this page",
        "add to bookmarks",
        "bookmark active tab",
        "store page",
        "save site",
        "bookmark now",
        "keep this page"

    ],

    response: "Bookmarking the current tab."

},

{
    action: "bookmarkAllTabs",

    patterns: [

        "bookmark all tabs",
        "save all tabs",
        "bookmark every tab",
        "bookmark everything",
        "save every tab",
        "save all browser tabs",
        "bookmark open tabs",
        "bookmark all pages",
        "favorite all tabs",
        "jarvis bookmark all",
        "save browser session",
        "bookmark current session",
        "store all tabs",
        "remember all tabs",
        "bookmark browser",
        "keep all tabs",
        "bookmark all websites",
        "save browsing session",
        "bookmark entire session",
        "bookmark complete session"

    ],

    response: "Bookmarking all open tabs."

},

{
    action: "createTabGroup",

    patterns: [

        "create tab group",
        "new tab group",
        "group tabs",
        "make tab group",
        "organize tabs",
        "browser tab group",
        "group browser tabs",
        "tab collection",
        "create browser group",
        "jarvis create tab group",
        "start tab group",
        "group current tabs",
        "organize browser",
        "tab folder",
        "tab category",
        "merge tabs",
        "manage tabs",
        "browser organize",
        "new browser group",
        "tab manager"

    ],

    response: "Creating a new tab group."

},

{
    action: "ungroupTabs",

    patterns: [

        "ungroup tabs",
        "remove tab group",
        "delete tab group",
        "break tab group",
        "separate tabs",
        "browser ungroup",
        "ungroup browser tabs",
        "remove browser group",
        "jarvis ungroup tabs",
        "split grouped tabs",
        "cancel tab group",
        "disable tab group",
        "release tabs",
        "individual tabs",
        "separate browser tabs",
        "remove grouping",
        "tab group off",
        "disconnect tabs",
        "browser separate tabs",
        "ungroup current tabs"

    ],

    response: "Removing the tab group."

},
// ==========================================
// PART 4B-2A
// Advanced Tab Management
// ==========================================

{
    action: "moveTabLeft",

    patterns: [

        "move tab left",
        "move current tab left",
        "shift tab left",
        "left tab",
        "move browser tab left",
        "tab left",
        "slide tab left",
        "send tab left",
        "browser move left",
        "jarvis move tab left",
        "move active tab left",
        "left side tab",
        "tab one position left",
        "reorder tab left",
        "place tab left",
        "move page left",
        "shift browser tab",
        "left browser",
        "arrange left",
        "move it left"

    ],

    response: "Moving the current tab to the left."

},

{
    action: "moveTabRight",

    patterns: [

        "move tab right",
        "move current tab right",
        "shift tab right",
        "right tab",
        "move browser tab right",
        "tab right",
        "slide tab right",
        "send tab right",
        "browser move right",
        "jarvis move tab right",
        "move active tab right",
        "right side tab",
        "tab one position right",
        "reorder tab right",
        "place tab right",
        "move page right",
        "shift browser tab right",
        "right browser",
        "arrange right",
        "move it right"

    ],

    response: "Moving the current tab to the right."

},

{
    action: "pinAllTabs",

    patterns: [

        "pin all tabs",
        "pin every tab",
        "pin browser tabs",
        "pin everything",
        "lock all tabs",
        "keep all tabs",
        "browser pin all",
        "jarvis pin all tabs",
        "pin opened tabs",
        "pin active tabs",
        "make all tabs pinned",
        "save all tabs",
        "secure all tabs",
        "tab pin all",
        "pin every browser tab",
        "pin complete browser",
        "fix all tabs",
        "lock browser tabs",
        "pin session",
        "pin browser session"

    ],

    response: "Pinning all tabs."

},

{
    action: "unpinAllTabs",

    patterns: [

        "unpin all tabs",
        "remove all pins",
        "unlock all tabs",
        "browser unpin all",
        "unpin browser tabs",
        "release all tabs",
        "normal tabs",
        "remove pinned tabs",
        "jarvis unpin all",
        "disable all pins",
        "free all tabs",
        "restore tabs",
        "tab unlock all",
        "unpin everything",
        "stop pinning tabs",
        "remove browser pins",
        "clear pinned tabs",
        "unfix all tabs",
        "browser normal tabs",
        "remove all tab pins"

    ],

    response: "Unpinning all tabs."

},

{
    action: "reopenClosedWindow",

    patterns: [

        "reopen closed window",
        "restore closed window",
        "recover browser window",
        "open last window",
        "restore browser",
        "recover last browser",
        "bring back window",
        "browser restore window",
        "jarvis reopen window",
        "last closed browser",
        "restore previous window",
        "recover window",
        "undo close window",
        "browser undo close",
        "reopen browser",
        "restore browsing window",
        "open previous window",
        "bring browser back",
        "browser recover",
        "restore last session"

    ],

    response: "Reopening the last closed browser window."

},
// ==========================================
// PART 4B-2B(1)
// Advanced Tab Management
// ==========================================

{
    action: "closeDuplicateTabs",

    patterns: [

        "close duplicate tabs",
        "remove duplicate tabs",
        "delete duplicate tabs",
        "close same tabs",
        "remove same tabs",
        "duplicate tabs close",
        "browser duplicate tabs",
        "close repeated tabs",
        "remove repeated tabs",
        "clean duplicate tabs",
        "jarvis close duplicate tabs",
        "delete repeated pages",
        "remove duplicate pages",
        "close identical tabs",
        "browser clean tabs",
        "merge duplicate tabs",
        "remove copied tabs",
        "clear duplicate tabs",
        "duplicate browser tabs",
        "remove extra tabs"

    ],

    response: "Closing duplicate tabs."

},

{
    action: "sortTabs",

    patterns: [

        "sort tabs",
        "organize tabs",
        "arrange tabs",
        "sort browser tabs",
        "organize browser",
        "reorder tabs",
        "tab sorting",
        "sort current tabs",
        "sort opened tabs",
        "browser organize tabs",
        "jarvis sort tabs",
        "tab organizer",
        "clean browser tabs",
        "arrange browser tabs",
        "organize current tabs",
        "sort webpages",
        "browser tab order",
        "sort all tabs",
        "tab management",
        "auto arrange tabs"

    ],

    response: "Sorting browser tabs."

},

{
    action: "renameTabGroup",

    patterns: [

        "rename tab group",
        "change tab group name",
        "edit tab group",
        "rename browser group",
        "change group title",
        "rename current group",
        "tab group rename",
        "group rename",
        "browser rename group",
        "jarvis rename group",
        "edit group name",
        "new group name",
        "change browser group",
        "rename grouped tabs",
        "rename tab collection",
        "update tab group",
        "modify tab group",
        "group title change",
        "rename tabs group",
        "change tab label"

    ],

    response: "Renaming the tab group."

},
// ==========================================
// PART 4B-2B(2)
// Advanced Tab Management
// ==========================================

{
    action: "collapseTabGroup",

    patterns: [

        "collapse tab group",
        "collapse group",
        "minimize tab group",
        "hide tab group",
        "fold tab group",
        "collapse browser group",
        "close tab group",
        "minimize browser group",
        "group collapse",
        "tab group collapse",
        "jarvis collapse group",
        "hide grouped tabs",
        "minimize grouped tabs",
        "collapse current group",
        "browser minimize group",
        "fold browser tabs",
        "compact tab group",
        "collapse active group",
        "hide current group",
        "group minimize"

    ],

    response: "Collapsing the tab group."

},

{
    action: "expandTabGroup",

    patterns: [

        "expand tab group",
        "expand group",
        "open tab group",
        "show tab group",
        "restore tab group",
        "maximize tab group",
        "expand browser group",
        "group expand",
        "tab group expand",
        "jarvis expand group",
        "show grouped tabs",
        "restore grouped tabs",
        "expand current group",
        "browser expand group",
        "open grouped tabs",
        "unfold tab group",
        "display tab group",
        "expand active group",
        "group restore",
        "group open"

    ],

    response: "Expanding the tab group."

},


    // ==========================================
    // Browser Part 5
    // Downloads
    // ==========================================

// ==========================================
// PART 5A
// Downloads
// ==========================================

{
    action: "openDownloads",

    patterns: [

        "downloads",
        "open downloads",
        "show downloads",
        "downloads page",
        "downloads list",
        "download history",
        "browser downloads",
        "my downloads",
        "go to downloads",
        "launch downloads",
        "jarvis open downloads",
        "display downloads",
        "view downloads",
        "downloads tab",
        "open download manager",
        "download manager",
        "see downloads",
        "browse downloads",
        "downloads please",
        "take me to downloads"

    ],

    response: "Opening Downloads."

},

{
    action: "showDownloads",

    patterns: [

        "show my downloads",
        "show download history",
        "list downloads",
        "display my downloads",
        "recent downloads",
        "downloads list",
        "view recent downloads",
        "download records",
        "browser download history",
        "jarvis show downloads",
        "see recent downloads",
        "open recent downloads",
        "download activity",
        "download log",
        "display download history",
        "show downloaded files",
        "recent files",
        "show browser downloads",
        "downloads overview",
        "view download manager"

    ],

    response: "Showing your downloads."

},

{
    action: "searchDownloads",

    patterns: [

        "search downloads",
        "find download",
        "find downloaded file",
        "search downloaded files",
        "locate download",
        "look for download",
        "browser search downloads",
        "search download history",
        "download search",
        "jarvis search downloads",
        "find file in downloads",
        "locate downloaded file",
        "search my downloads",
        "look in downloads",
        "download lookup",
        "find recent download",
        "search browser files",
        "download finder",
        "downloads search",
        "search download manager"

    ],

    response: "Searching downloads."

},

{
    action: "openDownloadsFolder",

    patterns: [

        "open downloads folder",
        "downloads folder",
        "show downloads folder",
        "go to downloads folder",
        "open download folder",
        "download directory",
        "browser downloads folder",
        "my download folder",
        "jarvis open downloads folder",
        "downloads location",
        "where are downloads",
        "show download directory",
        "view downloads folder",
        "open saved downloads",
        "downloads path",
        "download files folder",
        "browse downloads folder",
        "take me to downloads folder",
        "open file downloads",
        "download storage"

    ],

    response: "Opening Downloads folder."

},

{
    action: "downloadStatus",

    patterns: [

        "download status",
        "check download",
        "download progress",
        "show download progress",
        "current download",
        "active downloads",
        "download running",
        "download information",
        "browser download status",
        "jarvis download status",
        "is download finished",
        "download complete",
        "download percentage",
        "download details",
        "check active download",
        "show downloading files",
        "downloads progress",
        "download update",
        "status of downloads",
        "download report"

    ],

    response: "Checking download status."

},
// ==========================================
// PART 5B
// Downloads Control
// ==========================================

{
    action: "pauseDownload",

    patterns: [

        "pause download",
        "pause downloads",
        "stop download temporarily",
        "hold download",
        "pause current download",
        "pause active download",
        "freeze download",
        "download pause",
        "browser pause download",
        "jarvis pause download",
        "temporarily stop download",
        "halt download",
        "suspend download",
        "pause file download",
        "wait download",
        "stop downloading for now",
        "pause browser download",
        "hold current download",
        "pause downloading",
        "download hold"

    ],

    response: "Pausing the download."

},

{
    action: "resumeDownload",

    patterns: [

        "resume download",
        "resume downloads",
        "continue download",
        "continue downloading",
        "restart paused download",
        "resume current download",
        "download continue",
        "browser resume download",
        "jarvis resume download",
        "keep downloading",
        "start download again",
        "resume active download",
        "continue file download",
        "restart download",
        "download restart",
        "continue browser download",
        "resume paused download",
        "download go on",
        "carry on download",
        "resume it"

    ],

    response: "Resuming the download."

},

{
    action: "cancelDownload",

    patterns: [

        "cancel download",
        "stop download",
        "abort download",
        "cancel current download",
        "delete current download",
        "terminate download",
        "end download",
        "browser cancel download",
        "jarvis cancel download",
        "remove active download",
        "cancel downloading",
        "stop downloading",
        "abort current download",
        "discard download",
        "drop download",
        "cancel file download",
        "stop browser download",
        "end current download",
        "remove download task",
        "cancel it"

    ],

    response: "Cancelling the download."

},

{
    action: "retryDownload",

    patterns: [

        "retry download",
        "download again",
        "restart failed download",
        "try download again",
        "download retry",
        "browser retry download",
        "retry current download",
        "repeat download",
        "redownload file",
        "jarvis retry download",
        "restart download task",
        "download once more",
        "retry failed file",
        "try again download",
        "repeat current download",
        "restart browser download",
        "recover download",
        "retry downloading",
        "resume failed download",
        "download again please"

    ],

    response: "Retrying the download."

},

{
    action: "clearDownloadsList",

    patterns: [

        "clear downloads",
        "clear download history",
        "remove downloads list",
        "delete downloads list",
        "erase download history",
        "clean downloads",
        "clear browser downloads",
        "browser clear downloads",
        "remove download history",
        "jarvis clear downloads",
        "delete download records",
        "empty downloads list",
        "clear downloaded files list",
        "wipe download history",
        "reset downloads",
        "remove download log",
        "delete browser downloads",
        "clean download manager",
        "clear all downloads",
        "erase downloads"

    ],

    response: "Clearing the downloads list."

},

    // ==========================================
    // Browser Part 6
    // History
    // ==========================================

// ==========================================
// PART 6A
// Browser History Access
// ==========================================

{
    action: "openHistory",

    patterns: [

        "history",
        "browser history",
        "open history",
        "show history",
        "launch history",
        "history page",
        "history tab",
        "view history",
        "go to history",
        "display history",
        "browser history page",
        "open browsing history",
        "my history",
        "recent history",
        "history please",
        "history kholo",
        "jarvis open history",
        "take me to history",
        "history screen",
        "visit history"

    ],

    response: "Opening browser history."

},

{
    action: "showHistory",

    patterns: [

        "show browsing history",
        "display browsing history",
        "view browsing history",
        "list browsing history",
        "show my history",
        "history list",
        "history records",
        "browser activity",
        "visited websites",
        "visited pages",
        "history overview",
        "show visited pages",
        "browser log",
        "website history",
        "internet history",
        "recent browsing",
        "jarvis show history",
        "show recent history",
        "history details",
        "browser records"

    ],

    response: "Showing browser history."

},

{
    action: "searchHistory",

    patterns: [

        "search history",
        "find history",
        "history search",
        "find visited website",
        "locate website",
        "search browsing history",
        "look in history",
        "history lookup",
        "find page in history",
        "search recent websites",
        "browser history search",
        "jarvis search history",
        "find recent page",
        "history finder",
        "look for website",
        "search browser activity",
        "history filter",
        "find browsing record",
        "search visited pages",
        "history query"

    ],

    response: "Searching browser history."

},

{
    action: "recentHistory",

    patterns: [

        "recent history",
        "recent browsing history",
        "latest history",
        "latest browsing",
        "last websites",
        "last pages",
        "last visited pages",
        "show latest history",
        "recent browser activity",
        "browser recent history",
        "jarvis recent history",
        "today history",
        "history today",
        "current history",
        "recent internet history",
        "recent records",
        "latest records",
        "show recent browsing",
        "history recent",
        "recent websites"

    ],

    response: "Showing recent browsing history."

},

{
    action: "recentlyVisitedSites",

    patterns: [

        "recently visited sites",
        "visited websites",
        "recent websites",
        "last visited websites",
        "last sites",
        "show visited sites",
        "visited pages",
        "browser visited sites",
        "my recent websites",
        "website history",
        "internet sites",
        "recent domains",
        "last domains",
        "recent internet pages",
        "jarvis visited sites",
        "show recent sites",
        "recent browser sites",
        "visited web pages",
        "last opened websites",
        "show website history"

    ],

    response: "Showing recently visited websites."

},
// ==========================================
// PART 6B
// Browser History Management
// ==========================================

{
    action: "clearHistory",

    patterns: [

        "clear history",
        "delete history",
        "erase history",
        "remove history",
        "wipe history",
        "clear browser history",
        "delete browser history",
        "erase browser history",
        "remove browsing history",
        "clear internet history",
        "delete browsing history",
        "clear all history",
        "remove all history",
        "clean history",
        "history clear",
        "history delete",
        "jarvis clear history",
        "reset browser history",
        "empty history",
        "clear my history"

    ],

    response: "Clearing browser history."

},

{
    action: "clearLastHourHistory",

    patterns: [

        "clear last hour history",
        "delete last hour history",
        "erase last hour history",
        "remove last hour history",
        "clear previous hour history",
        "delete previous hour history",
        "last hour browsing history",
        "clear one hour history",
        "remove recent hour history",
        "history last hour",
        "jarvis clear last hour history",
        "erase recent hour",
        "delete recent hour",
        "remove hour history",
        "clear browsing from last hour",
        "wipe last hour history",
        "clear recent browsing",
        "remove recent browsing",
        "last sixty minutes history",
        "clear past hour"

    ],

    response: "Clearing the last hour of browsing history."

},

{
    action: "clearTodayHistory",

    patterns: [

        "clear today history",
        "delete today history",
        "erase today's history",
        "remove today's history",
        "clear browsing today",
        "delete browsing today",
        "today browser history",
        "today internet history",
        "today history",
        "jarvis clear today history",
        "wipe today's history",
        "erase today's browsing",
        "remove today's browsing",
        "clear current day history",
        "today records",
        "clear today's websites",
        "delete today's websites",
        "remove today's websites",
        "today activity",
        "clear all today"

    ],

    response: "Clearing today's browsing history."

},

{
    action: "clearWeekHistory",

    patterns: [

        "clear week history",
        "clear this week history",
        "delete week history",
        "erase week history",
        "remove week history",
        "clear weekly history",
        "delete weekly history",
        "erase weekly history",
        "remove weekly browsing",
        "this week browsing",
        "jarvis clear week history",
        "wipe weekly history",
        "delete this week's history",
        "clear last seven days",
        "remove last seven days",
        "week browser history",
        "weekly internet history",
        "clear seven day history",
        "delete seven day history",
        "clear recent week"

    ],

    response: "Clearing this week's browsing history."

},

{
    action: "historySettings",

    patterns: [

        "history settings",
        "browser history settings",
        "open history settings",
        "history options",
        "history preferences",
        "history configuration",
        "browser settings history",
        "manage history",
        "history controls",
        "history menu",
        "jarvis history settings",
        "configure history",
        "history privacy",
        "history management",
        "browser privacy history",
        "history page settings",
        "history control panel",
        "open browser history settings",
        "change history settings",
        "history setup"

    ],

    response: "Opening history settings."

},

    // ==========================================
    // Browser Part 7
    // Bookmarks
    // ==========================================

// ==========================================
// PART 7A
// Bookmarks
// ==========================================

{
    action: "openBookmarks",

    patterns: [

        "bookmarks",
        "open bookmarks",
        "show bookmarks",
        "bookmark manager",
        "open bookmark manager",
        "view bookmarks",
        "my bookmarks",
        "bookmark page",
        "browser bookmarks",
        "go to bookmarks",
        "display bookmarks",
        "bookmark list",
        "saved bookmarks",
        "bookmarks page",
        "bookmark section",
        "jarvis open bookmarks",
        "bookmark panel",
        "favorite websites",
        "saved websites",
        "bookmarks kholo"

    ],

    response: "Opening bookmarks."

},

{
    action: "showBookmarks",

    patterns: [

        "show bookmark list",
        "display bookmarks",
        "view bookmark list",
        "list bookmarks",
        "my bookmark list",
        "saved bookmark list",
        "browser bookmark list",
        "bookmark overview",
        "show favorite websites",
        "favorite pages",
        "saved pages",
        "bookmark collection",
        "show all bookmarks",
        "browser favorites",
        "jarvis show bookmarks",
        "see bookmarks",
        "browse bookmarks",
        "bookmark records",
        "bookmark items",
        "saved links"

    ],

    response: "Showing your bookmarks."

},

{
    action: "bookmarkCurrentPage",

    patterns: [

        "bookmark page",
        "bookmark current page",
        "save this page",
        "save current website",
        "add bookmark",
        "bookmark website",
        "bookmark this site",
        "favorite this page",
        "favorite this website",
        "save webpage",
        "remember this page",
        "bookmark current site",
        "jarvis bookmark page",
        "bookmark it",
        "save browser page",
        "bookmark active page",
        "bookmark now",
        "store page",
        "store website",
        "keep this page"

    ],

    response: "Bookmarking the current page."

},

{
    action: "bookmarkAllTabs",

    patterns: [

        "bookmark all tabs",
        "save all tabs",
        "bookmark every tab",
        "bookmark open tabs",
        "save browser session",
        "bookmark session",
        "save all pages",
        "bookmark everything",
        "save every tab",
        "favorite all tabs",
        "jarvis bookmark all tabs",
        "bookmark browser session",
        "save browser tabs",
        "bookmark current session",
        "store all tabs",
        "remember all tabs",
        "bookmark complete session",
        "bookmark every page",
        "save open websites",
        "bookmark browser"

    ],

    response: "Bookmarking all open tabs."

},

{
    action: "searchBookmarks",

    patterns: [

        "search bookmarks",
        "find bookmark",
        "search bookmark",
        "locate bookmark",
        "find saved website",
        "search saved pages",
        "browser bookmark search",
        "bookmark lookup",
        "bookmark finder",
        "jarvis search bookmarks",
        "find favorite website",
        "search favorites",
        "search bookmark manager",
        "find bookmarked page",
        "bookmark filter",
        "search stored pages",
        "find saved link",
        "locate saved website",
        "bookmark search",
        "search my bookmarks"

    ],

    response: "Searching bookmarks."

},
// ==========================================
// PART 7B
// Bookmark Management
// ==========================================

{
    action: "deleteBookmark",

    patterns: [

        "delete bookmark",
        "remove bookmark",
        "erase bookmark",
        "delete current bookmark",
        "remove current bookmark",
        "delete saved page",
        "remove saved page",
        "delete favorite",
        "remove favorite",
        "delete bookmarked page",
        "jarvis delete bookmark",
        "clear bookmark",
        "discard bookmark",
        "bookmark remove",
        "bookmark delete",
        "delete this bookmark",
        "remove this bookmark",
        "delete saved website",
        "remove saved website",
        "bookmark off"

    ],

    response: "Deleting the bookmark."

},

{
    action: "editBookmark",

    patterns: [

        "edit bookmark",
        "modify bookmark",
        "change bookmark",
        "update bookmark",
        "edit saved bookmark",
        "modify saved page",
        "change bookmark details",
        "bookmark settings",
        "bookmark properties",
        "edit favorite",
        "jarvis edit bookmark",
        "update favorite",
        "change saved website",
        "edit bookmark info",
        "bookmark edit",
        "modify favorite",
        "change bookmark title",
        "update saved page",
        "edit current bookmark",
        "bookmark options"

    ],

    response: "Opening bookmark editor."

},

{
    action: "renameBookmark",

    patterns: [

        "rename bookmark",
        "change bookmark name",
        "edit bookmark name",
        "rename saved page",
        "rename favorite",
        "change favorite name",
        "bookmark rename",
        "rename current bookmark",
        "update bookmark name",
        "jarvis rename bookmark",
        "change bookmark title",
        "bookmark title",
        "edit bookmark title",
        "rename website bookmark",
        "modify bookmark title",
        "change saved page name",
        "rename saved website",
        "bookmark label",
        "rename bookmark label",
        "update bookmark title"

    ],

    response: "Renaming the bookmark."

},

{
    action: "importBookmarks",

    patterns: [

        "import bookmarks",
        "restore bookmarks",
        "load bookmarks",
        "import bookmark file",
        "restore bookmark file",
        "browser import bookmarks",
        "bookmark import",
        "import favorites",
        "restore favorites",
        "jarvis import bookmarks",
        "load favorite websites",
        "open bookmark file",
        "import saved bookmarks",
        "recover bookmarks",
        "restore bookmark backup",
        "bookmark restore",
        "bring bookmarks",
        "read bookmark file",
        "bookmark file import",
        "import browser bookmarks"

    ],

    response: "Importing bookmarks."

},

{
    action: "exportBookmarks",

    patterns: [

        "export bookmarks",
        "backup bookmarks",
        "save bookmarks",
        "export bookmark file",
        "create bookmark backup",
        "browser export bookmarks",
        "bookmark export",
        "backup favorite websites",
        "export favorites",
        "jarvis export bookmarks",
        "save bookmark file",
        "download bookmarks",
        "export saved bookmarks",
        "bookmark backup",
        "backup browser bookmarks",
        "create bookmark file",
        "save favorite websites",
        "bookmark archive",
        "export browser favorites",
        "backup bookmark manager"

    ],

    response: "Exporting bookmarks."

},


    // ==========================================
    // Browser Part 8
    // Incognito
    // ==========================================

// ==========================================
// PART 8A
// Incognito & Privacy
// ==========================================

{
    action: "openIncognitoWindow",

    patterns: [

        "incognito",
        "open incognito",
        "incognito mode",
        "new incognito window",
        "start incognito",
        "launch incognito",
        "private browsing",
        "private mode",
        "open private window",
        "new private window",
        "go incognito",
        "browser incognito",
        "jarvis open incognito",
        "incognito please",
        "private browser",
        "browse privately",
        "secure browsing",
        "anonymous browsing",
        "incognito browser",
        "open secret mode"

    ],

    response: "Opening an Incognito window."

},

{
    action: "closeIncognitoWindow",

    patterns: [

        "close incognito",
        "close private window",
        "exit incognito",
        "stop incognito",
        "close incognito window",
        "end incognito",
        "disable incognito",
        "leave incognito",
        "quit private mode",
        "browser close incognito",
        "jarvis close incognito",
        "close anonymous browsing",
        "end private browsing",
        "turn off incognito",
        "private browsing off",
        "close secret mode",
        "stop private mode",
        "remove incognito",
        "close secure browsing",
        "exit private browser"

    ],

    response: "Closing the Incognito window."

},

{
    action: "openPrivateWindow",

    patterns: [

        "private window",
        "open private window",
        "launch private window",
        "start private browsing",
        "new private browsing window",
        "private browser",
        "browser private mode",
        "private browsing window",
        "private session",
        "secure browser window",
        "jarvis open private window",
        "anonymous browser",
        "hidden browsing",
        "private browsing",
        "new secure window",
        "browser secure mode",
        "open hidden window",
        "confidential browsing",
        "privacy window",
        "secret browsing"

    ],

    response: "Opening a private browsing window."

},

{
    action: "clearCookies",

    patterns: [

        "clear cookies",
        "delete cookies",
        "remove cookies",
        "erase cookies",
        "browser cookies",
        "delete browser cookies",
        "clear website cookies",
        "remove website cookies",
        "clean cookies",
        "cookie cleanup",
        "jarvis clear cookies",
        "wipe cookies",
        "reset cookies",
        "delete all cookies",
        "remove all cookies",
        "browser cookie cleanup",
        "clear internet cookies",
        "erase browser cookies",
        "cookies off",
        "cookie reset"

    ],

    response: "Clearing browser cookies."

},

{
    action: "clearCache",

    patterns: [

        "clear cache",
        "delete cache",
        "browser cache",
        "remove cache",
        "erase cache",
        "clean cache",
        "clear browser cache",
        "delete browser cache",
        "wipe cache",
        "cache cleanup",
        "jarvis clear cache",
        "refresh cache",
        "remove temporary files",
        "delete temporary internet files",
        "browser temp files",
        "cache reset",
        "internet cache",
        "clear cached files",
        "browser cleanup",
        "clear temp cache"

    ],

    response: "Clearing browser cache."

},
// ==========================================
// PART 8B
// Privacy & Security
// ==========================================

{
    action: "clearSiteData",

    patterns: [

        "clear site data",
        "delete site data",
        "remove site data",
        "erase site data",
        "clear website data",
        "delete website data",
        "remove website storage",
        "clear browsing data",
        "clear website cache",
        "clear website files",
        "jarvis clear site data",
        "wipe site data",
        "reset website data",
        "delete stored website data",
        "remove stored website data",
        "clear local website data",
        "clean site storage",
        "delete site storage",
        "website data cleanup",
        "reset site data"

    ],

    response: "Clearing website data."

},

{
    action: "openPrivacySettings",

    patterns: [

        "privacy settings",
        "open privacy settings",
        "browser privacy",
        "privacy options",
        "privacy controls",
        "privacy preferences",
        "browser privacy settings",
        "manage privacy",
        "privacy page",
        "privacy menu",
        "jarvis open privacy settings",
        "security and privacy",
        "browser privacy options",
        "configure privacy",
        "change privacy settings",
        "privacy configuration",
        "privacy panel",
        "privacy manager",
        "browser security settings",
        "privacy dashboard"

    ],

    response: "Opening Privacy Settings."

},

{
    action: "openCookieSettings",

    patterns: [

        "cookie settings",
        "open cookie settings",
        "browser cookie settings",
        "manage cookies",
        "cookie preferences",
        "cookie options",
        "cookies menu",
        "cookie controls",
        "cookie manager",
        "jarvis cookie settings",
        "website cookie settings",
        "change cookie settings",
        "browser cookies options",
        "configure cookies",
        "cookies dashboard",
        "cookies page",
        "cookie privacy",
        "browser cookie manager",
        "edit cookies",
        "cookie configuration"

    ],

    response: "Opening Cookie Settings."

},

{
    action: "openPasswordManager",

    patterns: [

        "password manager",
        "open password manager",
        "saved passwords",
        "browser passwords",
        "manage passwords",
        "password settings",
        "password vault",
        "stored passwords",
        "browser password manager",
        "jarvis password manager",
        "password list",
        "saved login",
        "saved login details",
        "browser credentials",
        "password page",
        "show passwords",
        "password options",
        "password management",
        "login manager",
        "credentials manager"

    ],

    response: "Opening Password Manager."

},

{
    action: "toggleTrackingProtection",

    patterns: [

        "tracking protection",
        "enable tracking protection",
        "disable tracking protection",
        "turn on tracking protection",
        "turn off tracking protection",
        "anti tracking",
        "tracking prevention",
        "block trackers",
        "privacy protection",
        "tracking settings",
        "jarvis tracking protection",
        "website tracking",
        "tracking control",
        "tracking privacy",
        "protect from tracking",
        "browser tracking settings",
        "tracking blocker",
        "tracking shield",
        "online tracking protection",
        "tracking guard"

    ],

    response: "Opening Tracking Protection settings."

},

    // ==========================================
    // Browser Part 9
    // Settings
    // ==========================================

// ==========================================
// PART 9A
// Browser Settings
// ==========================================

{
    action: "openBrowserSettings",

    patterns: [

        "browser settings",
        "open browser settings",
        "settings",
        "open settings",
        "browser options",
        "browser preferences",
        "browser configuration",
        "chrome settings",
        "edge settings",
        "firefox settings",
        "open browser options",
        "browser setup",
        "browser control panel",
        "browser menu",
        "jarvis open browser settings",
        "configure browser",
        "browser settings page",
        "show browser settings",
        "go to browser settings",
        "settings kholo"

    ],

    response: "Opening browser settings."

},

{
    action: "openAppearanceSettings",

    patterns: [

        "appearance settings",
        "browser appearance",
        "theme settings",
        "customize browser",
        "browser theme",
        "change appearance",
        "display settings",
        "browser display",
        "dark mode settings",
        "light mode settings",
        "appearance options",
        "appearance menu",
        "browser look",
        "browser style",
        "customize appearance",
        "jarvis appearance settings",
        "open appearance",
        "theme options",
        "browser personalization",
        "appearance kholo"

    ],

    response: "Opening appearance settings."

},

{
    action: "openStartupSettings",

    patterns: [

        "startup settings",
        "browser startup",
        "startup page",
        "startup options",
        "startup preferences",
        "open startup settings",
        "browser launch settings",
        "browser start page",
        "home startup",
        "startup configuration",
        "startup menu",
        "browser boot settings",
        "browser launch options",
        "jarvis startup settings",
        "change startup page",
        "startup browser",
        "browser opening page",
        "startup setup",
        "startup kholo",
        "browser startup menu"

    ],

    response: "Opening startup settings."

},

{
    action: "openDefaultBrowserSettings",

    patterns: [

        "default browser",
        "default browser settings",
        "set default browser",
        "make default browser",
        "browser default",
        "default app browser",
        "browser defaults",
        "browser as default",
        "default web browser",
        "change default browser",
        "default browser options",
        "default browser menu",
        "jarvis default browser",
        "browser default settings",
        "default browser page",
        "set browser default",
        "default internet browser",
        "browser priority",
        "make browser primary",
        "default settings browser"

    ],

    response: "Opening default browser settings."

},

{
    action: "openLanguageSettings",

    patterns: [

        "language settings",
        "browser language",
        "change browser language",
        "browser languages",
        "language options",
        "browser translation settings",
        "translate settings",
        "browser translate",
        "language preferences",
        "browser locale",
        "browser language menu",
        "open language settings",
        "jarvis language settings",
        "change language",
        "browser language page",
        "translation options",
        "browser translation",
        "language configuration",
        "language setup",
        "language kholo"

    ],

    response: "Opening language settings."

},
// ==========================================
// PART 9B
// Browser Settings Management
// ==========================================

{
    action: "openDownloadSettings",

    patterns: [

        "download settings",
        "downloads settings",
        "browser download settings",
        "open download settings",
        "download preferences",
        "download options",
        "downloads options",
        "download configuration",
        "download location settings",
        "change download settings",
        "browser downloads setup",
        "downloads menu",
        "manage downloads settings",
        "jarvis open download settings",
        "download page settings",
        "downloads configuration",
        "file download settings",
        "browser save settings",
        "download preferences page",
        "downloads kholo"

    ],

    response: "Opening download settings."

},

{
    action: "openSitePermissions",

    patterns: [

        "site permissions",
        "website permissions",
        "browser permissions",
        "open site permissions",
        "site settings",
        "website settings",
        "permission settings",
        "manage permissions",
        "camera permissions",
        "microphone permissions",
        "location permissions",
        "notification permissions",
        "browser site settings",
        "site access",
        "website access",
        "permission manager",
        "jarvis open site permissions",
        "site permission settings",
        "browser access settings",
        "permissions kholo"

    ],

    response: "Opening site permissions."

},

{
    action: "openNotificationSettings",

    patterns: [

        "notification settings",
        "browser notifications",
        "notifications settings",
        "manage notifications",
        "website notifications",
        "browser alerts",
        "notification preferences",
        "notification options",
        "notification permissions",
        "browser notification settings",
        "turn notifications on",
        "turn notifications off",
        "notification manager",
        "notification page",
        "browser popup notifications",
        "jarvis notification settings",
        "alert settings",
        "push notification settings",
        "browser notification menu",
        "notifications kholo"

    ],

    response: "Opening notification settings."

},

{
    action: "openExtensions",

    patterns: [

        "extensions",
        "browser extensions",
        "open extensions",
        "extension manager",
        "manage extensions",
        "installed extensions",
        "browser add-ons",
        "addons",
        "plugins",
        "browser plugins",
        "extension settings",
        "extension page",
        "extension menu",
        "chrome extensions",
        "edge extensions",
        "firefox add-ons",
        "jarvis open extensions",
        "extension list",
        "browser addon manager",
        "extensions kholo"

    ],

    response: "Opening extensions."

},

{
    action: "resetBrowserSettings",

    patterns: [

        "reset browser",
        "reset browser settings",
        "restore browser settings",
        "browser factory reset",
        "default browser settings",
        "reset settings",
        "browser reset",
        "restore defaults",
        "reset chrome settings",
        "reset edge settings",
        "reset firefox settings",
        "browser clean reset",
        "reset all browser settings",
        "browser defaults",
        "restore browser defaults",
        "jarvis reset browser",
        "browser reset options",
        "reset browser preferences",
        "browser recovery settings",
        "reset browser configuration"

    ],

    response: "Opening browser reset settings."

},


    // ==========================================
    // Browser Part 10
    // Developer Tools
    // ==========================================

// ==========================================
// PART 10A
// Developer Tools
// ==========================================

{
    action: "openDeveloperTools",

    patterns: [

        "developer tools",
        "dev tools",
        "open developer tools",
        "open dev tools",
        "launch developer tools",
        "show developer tools",
        "browser developer tools",
        "chrome developer tools",
        "edge developer tools",
        "firefox developer tools",
        "inspect tools",
        "developer panel",
        "debug tools",
        "browser debugger",
        "devtools",
        "jarvis open developer tools",
        "developer console",
        "developer mode",
        "browser devtools",
        "open debugging tools"

    ],

    response: "Opening Developer Tools."

},

{
    action: "viewPageSource",

    patterns: [

        "view source",
        "page source",
        "view page source",
        "open source code",
        "show source",
        "website source",
        "html source",
        "view html",
        "page html",
        "browser source",
        "show page source",
        "open page source",
        "website html",
        "inspect source",
        "jarvis view source",
        "source code",
        "view website code",
        "page code",
        "html code",
        "source kholo"

    ],

    response: "Opening page source."

},

{
    action: "inspectElement",

    patterns: [

        "inspect",
        "inspect element",
        "inspect page",
        "inspect website",
        "element inspector",
        "developer inspect",
        "inspect html",
        "inspect current page",
        "inspect this page",
        "browser inspect",
        "inspect mode",
        "open inspector",
        "launch inspector",
        "element tools",
        "inspect browser",
        "jarvis inspect element",
        "inspect current website",
        "inspect web page",
        "developer inspect mode",
        "inspect kholo"

    ],

    response: "Opening Element Inspector."

},

{
    action: "openJavaScriptConsole",

    patterns: [

        "javascript console",
        "js console",
        "console",
        "browser console",
        "developer console",
        "open console",
        "launch console",
        "show console",
        "javascript debugger",
        "console tab",
        "browser js console",
        "dev console",
        "console window",
        "debug console",
        "jarvis open console",
        "javascript developer tools",
        "console kholo",
        "browser debug console",
        "web console",
        "script console"

    ],

    response: "Opening JavaScript Console."

},

{
    action: "openNetworkTab",

    patterns: [

        "network tab",
        "network tools",
        "network monitor",
        "developer network",
        "browser network",
        "network inspector",
        "network panel",
        "open network tab",
        "show network activity",
        "network requests",
        "browser requests",
        "http requests",
        "network debugging",
        "developer network panel",
        "jarvis network tab",
        "network logs",
        "network traffic",
        "network analyzer",
        "inspect network",
        "network kholo"

    ],

    response: "Opening Network tab."

},
// ==========================================
// PART 10B
// Developer & View Controls
// ==========================================

{
    action: "openPerformanceTab",

    patterns: [

        "performance tab",
        "performance tools",
        "performance panel",
        "browser performance",
        "performance monitor",
        "performance profiler",
        "open performance tab",
        "show performance panel",
        "developer performance",
        "performance analysis",
        "browser profiler",
        "website performance",
        "inspect performance",
        "performance debugging",
        "jarvis open performance",
        "performance kholo",
        "page performance",
        "performance metrics",
        "performance monitor panel",
        "developer profiler"

    ],

    response: "Opening Performance tab."

},

{
    action: "openApplicationTab",

    patterns: [

        "application tab",
        "application panel",
        "browser application tab",
        "developer application",
        "storage tab",
        "application storage",
        "local storage",
        "session storage",
        "cookies panel",
        "browser storage",
        "application inspector",
        "developer storage",
        "open application tab",
        "show application panel",
        "jarvis application tab",
        "application tools",
        "inspect storage",
        "browser application tools",
        "application kholo",
        "website storage"

    ],

    response: "Opening Application tab."

},

{
    action: "toggleFullScreen",

    patterns: [

        "fullscreen",
        "full screen",
        "go fullscreen",
        "enter fullscreen",
        "exit fullscreen",
        "toggle fullscreen",
        "maximize browser",
        "browser fullscreen",
        "fullscreen mode",
        "full screen mode",
        "leave fullscreen",
        "switch fullscreen",
        "browser maximize",
        "immersive mode",
        "jarvis fullscreen",
        "toggle full screen",
        "maximize window",
        "fullscreen kholo",
        "browser full view",
        "full view"

    ],

    response: "Toggling Full Screen mode."

},

{
    action: "zoomIn",

    patterns: [

        "zoom in",
        "increase zoom",
        "browser zoom in",
        "make page bigger",
        "increase page size",
        "enlarge page",
        "zoom plus",
        "page zoom in",
        "browser enlarge",
        "text bigger",
        "increase browser zoom",
        "zoom up",
        "magnify page",
        "jarvis zoom in",
        "browser bigger",
        "page bigger",
        "zoom more",
        "increase display size",
        "grow page",
        "zoom kholo"

    ],

    response: "Zooming in."

},

{
    action: "zoomOut",

    patterns: [

        "zoom out",
        "decrease zoom",
        "browser zoom out",
        "make page smaller",
        "reduce page size",
        "shrink page",
        "zoom minus",
        "page zoom out",
        "browser shrink",
        "text smaller",
        "decrease browser zoom",
        "zoom down",
        "minimize page view",
        "jarvis zoom out",
        "browser smaller",
        "page smaller",
        "reduce display size",
        "less zoom",
        "shrink browser page",
        "zoom kam karo"

    ],

    response: "Zooming out."

},

{
    action: "resetZoom",

    patterns: [

        "reset zoom",
        "default zoom",
        "normal zoom",
        "restore zoom",
        "reset browser zoom",
        "100 percent zoom",
        "zoom default",
        "restore default zoom",
        "browser default zoom",
        "page default size",
        "normal page size",
        "reset page size",
        "zoom reset",
        "jarvis reset zoom",
        "browser normal view",
        "restore browser zoom",
        "page original size",
        "zoom hundred percent",
        "default page size",
        "normal browser zoom"

    ],

    response: "Resetting zoom to default."

},

    // ==========================================
    // Browser Part 11
    // Profiles
    // ==========================================

// ==========================================
// PART 11A
// AI Platforms & Developer Websites
// ==========================================

{
    action: "openChatGPT",

    patterns: [

        "chatgpt",
        "open chatgpt",
        "launch chatgpt",
        "start chatgpt",
        "chat gpt",
        "open ai chat",
        "ai chat",
        "open gpt",
        "chat with ai",
        "jarvis open chatgpt",
        "need chatgpt",
        "show chatgpt",
        "chatgpt website",
        "chatgpt app",
        "open openai chat",
        "start ai assistant",
        "launch ai assistant",
        "chatbot",
        "open chatbot",
        "chatgpt kholo"

    ],

    response: "Opening ChatGPT."

},

{
    action: "openGemini",

    patterns: [

        "gemini",
        "google gemini",
        "open gemini",
        "launch gemini",
        "start gemini",
        "gemini ai",
        "google ai",
        "google chatbot",
        "jarvis open gemini",
        "show gemini",
        "need gemini",
        "gemini website",
        "gemini app",
        "open google gemini",
        "launch google ai",
        "chat with gemini",
        "gemini kholo",
        "google assistant ai",
        "gemini chat",
        "gemini browser"

    ],

    response: "Opening Gemini."

},

{
    action: "openClaude",

    patterns: [

        "claude",
        "claude ai",
        "open claude",
        "launch claude",
        "start claude",
        "anthropic claude",
        "claude chatbot",
        "jarvis open claude",
        "show claude",
        "need claude",
        "claude website",
        "claude app",
        "open anthropic",
        "launch anthropic ai",
        "chat with claude",
        "claude kholo",
        "claude assistant",
        "claude browser",
        "claude online",
        "anthropic ai"

    ],

    response: "Opening Claude."

},

{
    action: "openPerplexity",

    patterns: [

        "perplexity",
        "perplexity ai",
        "open perplexity",
        "launch perplexity",
        "start perplexity",
        "ai search",
        "perplexity search",
        "jarvis open perplexity",
        "show perplexity",
        "need perplexity",
        "perplexity website",
        "perplexity app",
        "ask perplexity",
        "open ai search",
        "launch ai search",
        "perplexity kholo",
        "perplexity browser",
        "search with ai",
        "online ai search",
        "perplexity assistant"

    ],

    response: "Opening Perplexity."

},

{
    action: "openGitHub",

    patterns: [

        "github",
        "open github",
        "launch github",
        "start github",
        "github website",
        "github repo",
        "github repositories",
        "github home",
        "jarvis open github",
        "show github",
        "need github",
        "github code",
        "github projects",
        "open github.com",
        "launch github website",
        "github browser",
        "github kholo",
        "developer github",
        "coding github",
        "git hub"

    ],

    response: "Opening GitHub."

},
// ==========================================
// PART 11B
// Developer Resources
// ==========================================

{
    action: "openStackOverflow",

    patterns: [

        "stack overflow",
        "stackoverflow",
        "open stack overflow",
        "launch stack overflow",
        "start stack overflow",
        "programming questions",
        "coding questions",
        "developer forum",
        "stack overflow website",
        "stackoverflow website",
        "jarvis open stack overflow",
        "show stack overflow",
        "need stack overflow",
        "coding help",
        "programming help",
        "developer community",
        "stack overflow kholo",
        "stack overflow home",
        "stackoverflow browser",
        "open programming forum"

    ],

    response: "Opening Stack Overflow."

},

{
    action: "openMDN",

    patterns: [

        "mdn",
        "mdn web docs",
        "mozilla docs",
        "open mdn",
        "launch mdn",
        "start mdn",
        "javascript docs",
        "html docs",
        "css docs",
        "web documentation",
        "developer docs",
        "mdn documentation",
        "jarvis open mdn",
        "show mdn",
        "need mdn",
        "mdn website",
        "mozilla developer",
        "web api docs",
        "frontend docs",
        "mdn kholo"

    ],

    response: "Opening MDN Web Docs."

},

{
    action: "openDevDocs",

    patterns: [

        "devdocs",
        "dev docs",
        "open devdocs",
        "launch devdocs",
        "developer documentation",
        "programming docs",
        "coding docs",
        "api docs",
        "documentation website",
        "developer references",
        "jarvis open devdocs",
        "show devdocs",
        "need devdocs",
        "offline docs",
        "web developer docs",
        "reference docs",
        "developer guide",
        "devdocs website",
        "documentation browser",
        "devdocs kholo"

    ],

    response: "Opening DevDocs."

},

{
    action: "openCodePen",

    patterns: [

        "codepen",
        "open codepen",
        "launch codepen",
        "start codepen",
        "code pen",
        "frontend playground",
        "html css js editor",
        "web playground",
        "online code editor",
        "codepen website",
        "jarvis open codepen",
        "show codepen",
        "need codepen",
        "frontend editor",
        "live code editor",
        "web coding",
        "codepen kholo",
        "html playground",
        "css playground",
        "javascript playground"

    ],

    response: "Opening CodePen."

},

{
    action: "openJSFiddle",

    patterns: [

        "jsfiddle",
        "js fiddle",
        "open jsfiddle",
        "launch jsfiddle",
        "start jsfiddle",
        "javascript playground",
        "online javascript editor",
        "frontend sandbox",
        "web code sandbox",
        "jsfiddle website",
        "jarvis open jsfiddle",
        "show jsfiddle",
        "need jsfiddle",
        "html css javascript editor",
        "web testing",
        "frontend testing",
        "jsfiddle kholo",
        "online web editor",
        "javascript sandbox",
        "code sandbox"

    ],

    response: "Opening JSFiddle."

},


    // ==========================================
    // Browser Part 12
    // Zoom
    // ==========================================

// ==========================================
// PART 12A
// Media & Entertainment
// ==========================================

{
    action: "openYouTube",

    patterns: [

        "youtube",
        "open youtube",
        "launch youtube",
        "start youtube",
        "youtube website",
        "youtube app",
        "youtube home",
        "go to youtube",
        "watch youtube",
        "jarvis open youtube",
        "show youtube",
        "need youtube",
        "youtube kholo",
        "youtube browser",
        "youtube videos",
        "youtube homepage",
        "video website",
        "watch videos",
        "open youtube website",
        "youtube please"

    ],

    response: "Opening YouTube."

},

{
    action: "openNetflix",

    patterns: [

        "netflix",
        "open netflix",
        "launch netflix",
        "start netflix",
        "watch netflix",
        "netflix website",
        "netflix app",
        "netflix home",
        "jarvis open netflix",
        "show netflix",
        "need netflix",
        "movies on netflix",
        "netflix kholo",
        "stream netflix",
        "watch movies",
        "watch series",
        "netflix browser",
        "netflix homepage",
        "open netflix website",
        "netflix please"

    ],

    response: "Opening Netflix."

},

{
    action: "openPrimeVideo",

    patterns: [

        "prime video",
        "amazon prime video",
        "open prime video",
        "launch prime video",
        "start prime video",
        "watch prime video",
        "prime video app",
        "prime video website",
        "jarvis open prime video",
        "show prime video",
        "need prime video",
        "amazon video",
        "prime movies",
        "prime shows",
        "prime video kholo",
        "watch amazon prime",
        "stream prime",
        "prime browser",
        "prime homepage",
        "amazon prime"

    ],

    response: "Opening Prime Video."

},

{
    action: "openDisneyPlus",

    patterns: [

        "disney plus",
        "disney+",
        "open disney plus",
        "launch disney plus",
        "start disney plus",
        "watch disney",
        "disney streaming",
        "disney movies",
        "jarvis open disney plus",
        "show disney plus",
        "need disney plus",
        "disney app",
        "disney website",
        "disney plus kholo",
        "watch marvel",
        "watch disney movies",
        "stream disney",
        "disney browser",
        "disney home",
        "open disney"

    ],

    response: "Opening Disney+."

},

{
    action: "openSpotify",

    patterns: [

        "spotify",
        "open spotify",
        "launch spotify",
        "start spotify",
        "spotify app",
        "spotify website",
        "listen spotify",
        "music spotify",
        "jarvis open spotify",
        "show spotify",
        "need spotify",
        "spotify kholo",
        "spotify browser",
        "spotify home",
        "play spotify",
        "listen music",
        "spotify player",
        "music streaming",
        "spotify web",
        "open spotify web"

    ],

    response: "Opening Spotify."

},
// ==========================================
// PART 12B
// Media & Entertainment (Part 2)
// ==========================================

{
    action: "openSoundCloud",

    patterns: [

        "soundcloud",
        "open soundcloud",
        "launch soundcloud",
        "start soundcloud",
        "sound cloud",
        "soundcloud website",
        "soundcloud app",
        "listen soundcloud",
        "music on soundcloud",
        "jarvis open soundcloud",
        "show soundcloud",
        "need soundcloud",
        "soundcloud kholo",
        "soundcloud browser",
        "soundcloud player",
        "stream soundcloud",
        "audio streaming",
        "indie music",
        "soundcloud home",
        "play soundcloud"

    ],

    response: "Opening SoundCloud."

},

{
    action: "openTwitch",

    patterns: [

        "twitch",
        "open twitch",
        "launch twitch",
        "start twitch",
        "twitch website",
        "watch twitch",
        "twitch streams",
        "live streams",
        "gaming streams",
        "jarvis open twitch",
        "show twitch",
        "need twitch",
        "twitch kholo",
        "twitch browser",
        "watch gamers",
        "live gaming",
        "streaming platform",
        "twitch home",
        "watch live",
        "open twitch website"

    ],

    response: "Opening Twitch."

},

{
    action: "openVimeo",

    patterns: [

        "vimeo",
        "open vimeo",
        "launch vimeo",
        "start vimeo",
        "vimeo website",
        "watch vimeo",
        "vimeo videos",
        "video hosting",
        "creative videos",
        "jarvis open vimeo",
        "show vimeo",
        "need vimeo",
        "vimeo kholo",
        "vimeo browser",
        "vimeo home",
        "watch creative videos",
        "professional videos",
        "video platform",
        "vimeo online",
        "open vimeo website"

    ],

    response: "Opening Vimeo."

},

{
    action: "openDailymotion",

    patterns: [

        "dailymotion",
        "daily motion",
        "open dailymotion",
        "launch dailymotion",
        "start dailymotion",
        "dailymotion website",
        "watch dailymotion",
        "dailymotion videos",
        "video website",
        "jarvis open dailymotion",
        "show dailymotion",
        "need dailymotion",
        "dailymotion kholo",
        "dailymotion browser",
        "watch online videos",
        "stream dailymotion",
        "daily motion videos",
        "dailymotion home",
        "video streaming site",
        "open daily motion"

    ],

    response: "Opening Dailymotion."

},

{
    action: "openCrunchyroll",

    patterns: [

        "crunchyroll",
        "open crunchyroll",
        "launch crunchyroll",
        "start crunchyroll",
        "watch anime",
        "anime website",
        "anime streaming",
        "crunchyroll app",
        "crunchyroll website",
        "jarvis open crunchyroll",
        "show crunchyroll",
        "need crunchyroll",
        "crunchyroll kholo",
        "anime shows",
        "anime movies",
        "watch japanese anime",
        "stream anime",
        "crunchyroll browser",
        "anime platform",
        "open anime"

    ],

    response: "Opening Crunchyroll."

},


    // ==========================================
    // Browser Part 13
    // Reading Mode
    // ==========================================

// ==========================================
// PART 13A
// Social Media & Communication
// ==========================================

{
    action: "openFacebook",

    patterns: [

        "facebook",
        "open facebook",
        "launch facebook",
        "start facebook",
        "facebook website",
        "facebook app",
        "facebook home",
        "go to facebook",
        "visit facebook",
        "jarvis open facebook",
        "show facebook",
        "need facebook",
        "facebook kholo",
        "facebook browser",
        "facebook login",
        "my facebook",
        "open facebook website",
        "facebook social",
        "facebook page",
        "facebook please"

    ],

    response: "Opening Facebook."

},

{
    action: "openInstagram",

    patterns: [

        "instagram",
        "insta",
        "open instagram",
        "launch instagram",
        "start instagram",
        "instagram website",
        "instagram app",
        "instagram home",
        "instagram login",
        "jarvis open instagram",
        "show instagram",
        "need instagram",
        "instagram kholo",
        "instagram browser",
        "open insta",
        "go to instagram",
        "instagram reels",
        "instagram page",
        "visit instagram",
        "instagram please"

    ],

    response: "Opening Instagram."

},

{
    action: "openTwitter",

    patterns: [

        "twitter",
        "x",
        "x twitter",
        "open twitter",
        "open x",
        "launch twitter",
        "launch x",
        "start twitter",
        "twitter website",
        "x website",
        "jarvis open twitter",
        "show twitter",
        "need twitter",
        "twitter kholo",
        "social x",
        "visit x",
        "twitter home",
        "open x platform",
        "twitter login",
        "twitter please"

    ],

    response: "Opening X."

},

{
    action: "openLinkedIn",

    patterns: [

        "linkedin",
        "linkedin website",
        "open linkedin",
        "launch linkedin",
        "start linkedin",
        "linkedin jobs",
        "linkedin profile",
        "professional network",
        "career website",
        "jarvis open linkedin",
        "show linkedin",
        "need linkedin",
        "linkedin kholo",
        "linkedin browser",
        "linkedin login",
        "visit linkedin",
        "job portal",
        "linkedin home",
        "open professional network",
        "linkedin please"

    ],

    response: "Opening LinkedIn."

},

{
    action: "openReddit",

    patterns: [

        "reddit",
        "open reddit",
        "launch reddit",
        "start reddit",
        "reddit website",
        "reddit app",
        "reddit home",
        "reddit posts",
        "reddit communities",
        "jarvis open reddit",
        "show reddit",
        "need reddit",
        "reddit kholo",
        "reddit browser",
        "visit reddit",
        "reddit discussion",
        "reddit forums",
        "reddit page",
        "open reddit website",
        "reddit please"

    ],

    response: "Opening Reddit."

},
// ==========================================
// PART 13B
// Social Media & Communication (Part 2)
// ==========================================

{
    action: "openPinterest",

    patterns: [

        "pinterest",
        "open pinterest",
        "launch pinterest",
        "start pinterest",
        "visit pinterest",
        "show pinterest",
        "need pinterest",
        "pinterest website",
        "pinterest app",
        "browse pinterest",
        "pinterest ideas",
        "pinterest photos",
        "creative ideas",
        "jarvis open pinterest",
        "open pinterest website",
        "go to pinterest",
        "pinterest home",
        "pinterest browser",
        "pinterest kholo",
        "open pins"

    ],

    response: "Opening Pinterest."

},

{
    action: "openSnapchatWeb",

    patterns: [

        "snapchat",
        "snapchat web",
        "open snapchat",
        "launch snapchat",
        "start snapchat",
        "snap web",
        "snap website",
        "snapchat browser",
        "snapchat login",
        "jarvis open snapchat",
        "show snapchat",
        "need snapchat",
        "snapchat kholo",
        "open snapchat web",
        "visit snapchat",
        "snapchat home",
        "snapchat messages",
        "snap online",
        "browser snapchat",
        "open snap"

    ],

    response: "Opening Snapchat Web."

},

{
    action: "openDiscordWeb",

    patterns: [

        "discord",
        "discord web",
        "open discord",
        "launch discord",
        "start discord",
        "discord website",
        "discord browser",
        "discord login",
        "discord online",
        "jarvis open discord",
        "show discord",
        "need discord",
        "discord kholo",
        "discord chat",
        "discord server",
        "open discord web",
        "browser discord",
        "discord home",
        "visit discord",
        "discord please"

    ],

    response: "Opening Discord."

},

{
    action: "openTelegramWeb",

    patterns: [

        "telegram",
        "telegram web",
        "open telegram",
        "launch telegram",
        "start telegram",
        "telegram browser",
        "telegram website",
        "telegram login",
        "telegram online",
        "jarvis open telegram",
        "show telegram",
        "need telegram",
        "telegram kholo",
        "telegram messages",
        "telegram web app",
        "browser telegram",
        "visit telegram",
        "telegram home",
        "telegram chat",
        "open telegram web"

    ],

    response: "Opening Telegram Web."

},

{
    action: "openWhatsAppWeb",

    patterns: [

        "whatsapp",
        "whatsapp web",
        "open whatsapp",
        "launch whatsapp",
        "start whatsapp",
        "whatsapp browser",
        "whatsapp website",
        "whatsapp login",
        "whatsapp online",
        "jarvis open whatsapp",
        "show whatsapp",
        "need whatsapp",
        "whatsapp kholo",
        "whatsapp messages",
        "browser whatsapp",
        "visit whatsapp",
        "whatsapp home",
        "open whatsapp web",
        "web whatsapp",
        "whatsapp chat"

    ],

    response: "Opening WhatsApp Web."

},


    // ==========================================
    // Browser Part 14
    // PDF
    // ==========================================

// ==========================================
// PART 14A
// Google Services
// ==========================================

{
    action: "openGoogle",

    patterns: [

        "google",
        "open google",
        "launch google",
        "start google",
        "google search",
        "google website",
        "google home",
        "search on google",
        "go to google",
        "visit google",
        "jarvis open google",
        "show google",
        "need google",
        "google kholo",
        "google browser",
        "google homepage",
        "open search",
        "internet search",
        "google please",
        "search engine"

    ],

    response: "Opening Google."

},

{
    action: "openGmail",

    patterns: [

        "gmail",
        "open gmail",
        "launch gmail",
        "start gmail",
        "google mail",
        "email",
        "check email",
        "my email",
        "gmail inbox",
        "gmail website",
        "jarvis open gmail",
        "show gmail",
        "need gmail",
        "gmail kholo",
        "gmail browser",
        "mail inbox",
        "google inbox",
        "open email",
        "gmail login",
        "gmail please"

    ],

    response: "Opening Gmail."

},

{
    action: "openGoogleDrive",

    patterns: [

        "google drive",
        "drive",
        "open drive",
        "launch drive",
        "start drive",
        "google cloud",
        "my drive",
        "drive website",
        "cloud storage",
        "jarvis open drive",
        "show drive",
        "need drive",
        "drive kholo",
        "google files",
        "google storage",
        "drive login",
        "google drive home",
        "browser drive",
        "open google drive",
        "drive please"

    ],

    response: "Opening Google Drive."

},

{
    action: "openGoogleDocs",

    patterns: [

        "google docs",
        "docs",
        "open docs",
        "launch docs",
        "start docs",
        "google document",
        "documents",
        "google writer",
        "docs website",
        "jarvis open docs",
        "show docs",
        "need docs",
        "docs kholo",
        "google docs home",
        "write document",
        "new document",
        "google word",
        "browser docs",
        "open google docs",
        "docs please"

    ],

    response: "Opening Google Docs."

},

{
    action: "openGoogleSheets",

    patterns: [

        "google sheets",
        "sheets",
        "open sheets",
        "launch sheets",
        "start sheets",
        "spreadsheet",
        "google spreadsheet",
        "excel online",
        "sheet website",
        "jarvis open sheets",
        "show sheets",
        "need sheets",
        "sheets kholo",
        "google excel",
        "browser sheets",
        "spreadsheet online",
        "new sheet",
        "google table",
        "open google sheets",
        "sheets please"

    ],

    response: "Opening Google Sheets."

},
// ==========================================
// PART 14B
// Google Workspace & Services (Part 2)
// ==========================================

{
    action: "openGoogleSlides",

    patterns: [

        "google slides",
        "slides",
        "open slides",
        "launch slides",
        "start slides",
        "presentation",
        "google presentation",
        "slides website",
        "google powerpoint",
        "jarvis open slides",
        "show slides",
        "need slides",
        "slides kholo",
        "browser slides",
        "new presentation",
        "presentation online",
        "google slide",
        "create slides",
        "open google slides",
        "slides please"

    ],

    response: "Opening Google Slides."

},

{
    action: "openGoogleCalendar",

    patterns: [

        "google calendar",
        "calendar",
        "open calendar",
        "launch calendar",
        "start calendar",
        "google schedule",
        "my calendar",
        "calendar website",
        "google events",
        "jarvis open calendar",
        "show calendar",
        "need calendar",
        "calendar kholo",
        "calendar browser",
        "event planner",
        "schedule planner",
        "google planner",
        "calendar online",
        "open google calendar",
        "calendar please"

    ],

    response: "Opening Google Calendar."

},

{
    action: "openGoogleMaps",

    patterns: [

        "google maps",
        "maps",
        "open maps",
        "launch maps",
        "start maps",
        "google navigation",
        "map",
        "directions",
        "find location",
        "jarvis open maps",
        "show maps",
        "need maps",
        "maps kholo",
        "google navigation app",
        "route planner",
        "google location",
        "browser maps",
        "map website",
        "open google maps",
        "maps please"

    ],

    response: "Opening Google Maps."

},

{
    action: "openGoogleTranslate",

    patterns: [

        "google translate",
        "translate",
        "open translate",
        "launch translate",
        "start translate",
        "translation",
        "language translator",
        "google translator",
        "translate website",
        "jarvis open translate",
        "show translate",
        "need translate",
        "translate kholo",
        "browser translate",
        "translate language",
        "convert language",
        "language tool",
        "translator online",
        "open google translate",
        "translate please"

    ],

    response: "Opening Google Translate."

},

{
    action: "openGooglePhotos",

    patterns: [

        "google photos",
        "photos",
        "open photos",
        "launch photos",
        "start photos",
        "photo gallery",
        "google gallery",
        "cloud photos",
        "photo backup",
        "jarvis open photos",
        "show photos",
        "need photos",
        "photos kholo",
        "browser photos",
        "my photos",
        "google images backup",
        "photo storage",
        "photos online",
        "open google photos",
        "photos please"

    ],

    response: "Opening Google Photos."

},


    // ==========================================
    // Browser Part 15
    // Browser Utilities
    // ==========================================

// ==========================================
// PART 15A
// Microsoft Services
// ==========================================

{
    action: "openMicrosoft365",

    patterns: [

        "microsoft 365",
        "office 365",
        "open microsoft 365",
        "launch microsoft 365",
        "start microsoft 365",
        "office online",
        "microsoft office online",
        "microsoft apps",
        "office portal",
        "jarvis open microsoft 365",
        "show microsoft 365",
        "need microsoft 365",
        "office website",
        "microsoft portal",
        "office home",
        "office dashboard",
        "browser office",
        "microsoft workspace",
        "office login",
        "office kholo"

    ],

    response: "Opening Microsoft 365."

},

{
    action: "openOutlook",

    patterns: [

        "outlook",
        "outlook mail",
        "open outlook",
        "launch outlook",
        "start outlook",
        "outlook email",
        "microsoft mail",
        "hotmail",
        "live mail",
        "outlook inbox",
        "jarvis open outlook",
        "show outlook",
        "need outlook",
        "browser outlook",
        "outlook website",
        "email outlook",
        "mail outlook",
        "outlook login",
        "outlook home",
        "outlook kholo"

    ],

    response: "Opening Outlook."

},

{
    action: "openOneDrive",

    patterns: [

        "onedrive",
        "one drive",
        "open onedrive",
        "launch onedrive",
        "start onedrive",
        "microsoft cloud",
        "cloud storage",
        "my onedrive",
        "onedrive website",
        "jarvis open onedrive",
        "show onedrive",
        "need onedrive",
        "browser onedrive",
        "onedrive login",
        "onedrive files",
        "microsoft storage",
        "cloud files",
        "onedrive home",
        "open microsoft onedrive",
        "onedrive kholo"

    ],

    response: "Opening OneDrive."

},

{
    action: "openOneNote",

    patterns: [

        "onenote",
        "one note",
        "open onenote",
        "launch onenote",
        "start onenote",
        "microsoft notes",
        "notes online",
        "digital notebook",
        "notebook",
        "jarvis open onenote",
        "show onenote",
        "need onenote",
        "browser onenote",
        "onenote website",
        "my notebook",
        "notes app",
        "microsoft notebook",
        "onenote login",
        "onenote home",
        "onenote kholo"

    ],

    response: "Opening OneNote."

},

{
    action: "openMicrosoftTeams",

    patterns: [

        "teams",
        "microsoft teams",
        "open teams",
        "launch teams",
        "start teams",
        "teams meeting",
        "teams website",
        "online meeting",
        "video meeting",
        "jarvis open teams",
        "show teams",
        "need teams",
        "browser teams",
        "microsoft meeting",
        "teams login",
        "work meeting",
        "office meeting",
        "teams home",
        "open microsoft teams",
        "teams kholo"

    ],

    response: "Opening Microsoft Teams."

},
// ==========================================
// PART 15B
// Microsoft Cloud & Web Services
// ==========================================

{
    action: "openMicrosoftLearn",

    patterns: [

        "microsoft learn",
        "learn microsoft",
        "open microsoft learn",
        "launch microsoft learn",
        "start microsoft learn",
        "microsoft tutorials",
        "microsoft training",
        "learn azure",
        "microsoft certification",
        "jarvis open microsoft learn",
        "show microsoft learn",
        "need microsoft learn",
        "browser microsoft learn",
        "learn platform",
        "microsoft docs learn",
        "study microsoft",
        "microsoft learning",
        "open learning portal",
        "learn website",
        "microsoft learn kholo"

    ],

    response: "Opening Microsoft Learn."

},

{
    action: "openAzurePortal",

    patterns: [

        "azure",
        "azure portal",
        "open azure",
        "launch azure",
        "start azure",
        "microsoft azure",
        "cloud portal",
        "azure dashboard",
        "azure console",
        "jarvis open azure",
        "show azure",
        "need azure",
        "browser azure",
        "azure management",
        "azure cloud",
        "azure login",
        "cloud management",
        "azure services",
        "open azure portal",
        "azure kholo"

    ],

    response: "Opening Azure Portal."

},

{
    action: "openBing",

    patterns: [

        "bing",
        "open bing",
        "launch bing",
        "start bing",
        "bing search",
        "bing website",
        "microsoft bing",
        "search bing",
        "bing homepage",
        "jarvis open bing",
        "show bing",
        "need bing",
        "browser bing",
        "bing search engine",
        "bing home",
        "visit bing",
        "bing online",
        "search on bing",
        "open bing search",
        "bing kholo"

    ],

    response: "Opening Bing."

},

{
    action: "openMSN",

    patterns: [

        "msn",
        "open msn",
        "launch msn",
        "start msn",
        "msn news",
        "msn website",
        "microsoft news",
        "news portal",
        "msn homepage",
        "jarvis open msn",
        "show msn",
        "need msn",
        "browser msn",
        "latest news",
        "microsoft portal",
        "visit msn",
        "msn home",
        "news website",
        "open msn website",
        "msn kholo"

    ],

    response: "Opening MSN."

},

{
    action: "openMicrosoftStoreWeb",

    patterns: [

        "microsoft store",
        "store",
        "open microsoft store",
        "launch microsoft store",
        "start microsoft store",
        "microsoft apps store",
        "windows store",
        "store website",
        "app store microsoft",
        "jarvis open microsoft store",
        "show microsoft store",
        "need microsoft store",
        "browser microsoft store",
        "download microsoft apps",
        "windows apps",
        "microsoft marketplace",
        "store online",
        "open windows store",
        "microsoft software store",
        "microsoft store kholo"

    ],

    response: "Opening Microsoft Store."

},

    // ==========================================
    // Browser Part 16
    // Search Shortcuts
    // ==========================================

// ==========================================
// PART 16A
// Cloud Storage & File Sharing
// ==========================================

{
    action: "openDropbox",

    patterns: [

        "dropbox",
        "open dropbox",
        "launch dropbox",
        "start dropbox",
        "dropbox website",
        "dropbox app",
        "my dropbox",
        "cloud storage",
        "dropbox files",
        "jarvis open dropbox",
        "show dropbox",
        "need dropbox",
        "dropbox kholo",
        "browser dropbox",
        "dropbox login",
        "dropbox home",
        "online storage",
        "file backup",
        "open dropbox website",
        "dropbox please"

    ],

    response: "Opening Dropbox."

},

{
    action: "openMega",

    patterns: [

        "mega",
        "mega nz",
        "mega cloud",
        "open mega",
        "launch mega",
        "start mega",
        "mega website",
        "mega storage",
        "cloud mega",
        "jarvis open mega",
        "show mega",
        "need mega",
        "mega kholo",
        "browser mega",
        "mega login",
        "mega files",
        "online cloud",
        "secure cloud",
        "open mega nz",
        "mega please"

    ],

    response: "Opening MEGA."

},

{
    action: "openBox",

    patterns: [

        "box",
        "box cloud",
        "box storage",
        "open box",
        "launch box",
        "start box",
        "box website",
        "box drive",
        "box files",
        "jarvis open box",
        "show box",
        "need box",
        "box kholo",
        "browser box",
        "box login",
        "cloud box",
        "box online",
        "enterprise storage",
        "open box storage",
        "box please"

    ],

    response: "Opening Box."

},

{
    action: "openICloud",

    patterns: [

        "icloud",
        "i cloud",
        "apple icloud",
        "open icloud",
        "launch icloud",
        "start icloud",
        "icloud drive",
        "icloud website",
        "icloud photos",
        "jarvis open icloud",
        "show icloud",
        "need icloud",
        "icloud kholo",
        "browser icloud",
        "icloud login",
        "apple cloud",
        "icloud files",
        "icloud storage",
        "open apple icloud",
        "icloud please"

    ],

    response: "Opening iCloud."

},

{
    action: "openMediaFire",

    patterns: [

        "mediafire",
        "media fire",
        "open mediafire",
        "launch mediafire",
        "start mediafire",
        "mediafire website",
        "mediafire download",
        "mediafire upload",
        "file hosting",
        "jarvis open mediafire",
        "show mediafire",
        "need mediafire",
        "mediafire kholo",
        "browser mediafire",
        "mediafire files",
        "share files",
        "online file hosting",
        "mediafire home",
        "open mediafire website",
        "mediafire please"

    ],

    response: "Opening MediaFire."

},
// ==========================================
// PART 16B
// Cloud Storage & Collaboration (Part 2)
// ==========================================

{
    action: "openWeTransfer",

    patterns: [

        "wetransfer",
        "we transfer",
        "open wetransfer",
        "launch wetransfer",
        "start wetransfer",
        "wetransfer website",
        "send files",
        "transfer files",
        "large file transfer",
        "share large files",
        "jarvis open wetransfer",
        "show wetransfer",
        "need wetransfer",
        "browser wetransfer",
        "upload files",
        "file transfer service",
        "send big files",
        "wetransfer home",
        "open file transfer",
        "wetransfer kholo"

    ],

    response: "Opening WeTransfer."

},

{
    action: "openSyncCom",

    patterns: [

        "sync",
        "sync com",
        "sync.com",
        "open sync",
        "launch sync",
        "start sync",
        "sync cloud",
        "sync storage",
        "sync website",
        "secure cloud storage",
        "jarvis open sync",
        "show sync",
        "need sync",
        "browser sync",
        "sync files",
        "sync login",
        "sync drive",
        "encrypted storage",
        "open sync.com",
        "sync kholo"

    ],

    response: "Opening Sync.com."

},

{
    action: "openDropboxPaper",

    patterns: [

        "dropbox paper",
        "paper",
        "open dropbox paper",
        "launch paper",
        "start paper",
        "paper documents",
        "dropbox docs",
        "online notes",
        "team documents",
        "jarvis open dropbox paper",
        "show dropbox paper",
        "need dropbox paper",
        "browser paper",
        "paper workspace",
        "collaboration notes",
        "shared documents",
        "dropbox workspace",
        "paper online",
        "open paper",
        "paper kholo"

    ],

    response: "Opening Dropbox Paper."

},

{
    action: "openProtonDrive",

    patterns: [

        "proton drive",
        "protondrive",
        "open proton drive",
        "launch proton drive",
        "start proton drive",
        "proton cloud",
        "encrypted drive",
        "secure drive",
        "proton storage",
        "jarvis open proton drive",
        "show proton drive",
        "need proton drive",
        "browser proton drive",
        "proton files",
        "proton login",
        "private cloud",
        "secure storage",
        "proton drive home",
        "open secure drive",
        "proton drive kholo"

    ],

    response: "Opening Proton Drive."

},

{
    action: "openPCloud",

    patterns: [

        "pcloud",
        "p cloud",
        "open pcloud",
        "launch pcloud",
        "start pcloud",
        "pcloud website",
        "pcloud storage",
        "cloud backup",
        "online storage",
        "jarvis open pcloud",
        "show pcloud",
        "need pcloud",
        "browser pcloud",
        "pcloud login",
        "backup files",
        "cloud drive",
        "secure backup",
        "pcloud home",
        "open p cloud",
        "pcloud kholo"

    ],

    response: "Opening pCloud."

},

    // ==========================================
    // Browser Part 17
    // Web Apps
    // ==========================================



    // ==========================================
    // Browser Part 18
    // Productivity
    // ==========================================



    // ==========================================
    // Browser Part 19
    // Browser Automation
    // ==========================================



    // ==========================================
    // Browser Part 20
    // Advanced Browser Commands
    // ==========================================



];

window.BrowserCommands = BrowserCommands;