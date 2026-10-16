"use strict";

/**
 * ============================================================
 * JARVIS EXTERNAL DATA SOURCES SERVICE
 * ============================================================
 *
 * A single module bundling every free, key-less public API JARVIS
 * can pull live data from. Runs in the MAIN process (Node's
 * built-in https), reached from the renderer via IPC — exactly
 * the same pattern as src/services/wikipedia.js. This keeps
 * requests off the renderer entirely, so nothing here is subject
 * to the app's Content-Security-Policy.
 *
 * Sources covered (all free, no API key required):
 *   Wikidata            — entity/fact lookup
 *   REST Countries       — country info
 *   OpenStreetMap        — geocoding / place lookup (Nominatim)
 *   Open-Meteo            — weather
 *   Open Library          — books / authors
 *   TVmaze                — TV shows / episodes
 *   TheMealDB             — recipes / meals
 *   PokéAPI               — Pokémon info
 *   Google News RSS       — news search (no key needed)
 *   Frankfurter            — currency exchange (ECB data)
 *   WorldTimeAPI          — time / timezone
 *   Wikimedia Commons     — images
 *   GitHub API            — repositories / users
 * ============================================================
 */

const https = require("https");
const http = require("http");

const REQUEST_TIMEOUT_MS = 10000;
const USER_AGENT = "JARVIS-PRO-MAX/1.0 (local desktop assistant)";
let electronNetworkFetch = null;

function setNetworkFetch(fetcher) {
    electronNetworkFetch = typeof fetcher === "function" ? fetcher : null;
}

/* ============================================================
   SHARED HTTP HELPERS
============================================================ */

function requestNative(url, { json = true, headers = {}, signal } = {}) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) { reject(Object.assign(new Error("Request cancelled."), { name: "AbortError" })); return; }
        let parsed;
        try {
            parsed = new URL(url);
        } catch (error) {
            reject(new Error(`Invalid URL: ${url}`));
            return;
        }

        const client = parsed.protocol === "http:" ? http : https;

        const req = client.get(
            parsed,
            {
                headers: {
                    "User-Agent": USER_AGENT,
                    Accept: json ? "application/json" : "*/*",
                    ...headers
                }
            },
            (res) => {
                // Follow simple redirects (some free APIs 301/302 http->https).
                if (
                    res.statusCode &&
                    [301, 302, 303, 307, 308].includes(res.statusCode) &&
                    res.headers.location
                ) {
                    res.resume();
                    const nextUrl = new URL(res.headers.location, parsed).toString();
                    const next = new URL(nextUrl);
                    const redirectHeaders = next.origin === parsed.origin
                        ? headers
                        : Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== "authorization"));
                    requestNative(nextUrl, { json, headers: redirectHeaders, signal }).then(resolve, reject);
                    return;
                }

                res.setEncoding("utf8");

                if (res.statusCode && res.statusCode >= 400) {
                    res.resume();
                    reject(new Error(`Request failed (${res.statusCode}) for ${parsed.hostname}`));
                    return;
                }

                let raw = "";
                res.on("data", (chunk) => { raw += chunk; });
                res.on("end", () => {
                    if (!json) {
                        resolve(raw);
                        return;
                    }
                    try {
                        resolve(JSON.parse(raw));
                    } catch (error) {
                        reject(new Error(`${parsed.hostname} returned invalid JSON.`));
                    }
                });
            }
        );

        req.setTimeout(REQUEST_TIMEOUT_MS, () => {
            req.destroy(new Error(`Request to ${parsed.hostname} timed out.`));
        });
        const onAbort = () => req.destroy(Object.assign(new Error("Request cancelled."), { name: "AbortError" }));
        signal?.addEventListener?.("abort", onAbort, { once: true });
        req.once("close", () => signal?.removeEventListener?.("abort", onAbort));
        req.on("error", reject);
    });
}

function request(url, options = {}) {
    if (!electronNetworkFetch) return requestNative(url, options);
    const { json = true, headers = {} } = options;
    return (async () => {
        try {
            const response = await electronNetworkFetch(url, { headers: { "User-Agent": USER_AGENT, Accept: json ? "application/json" : "*/*", ...headers }, timeoutMs: REQUEST_TIMEOUT_MS, signal: options.signal });
            if (!response.ok) {
                const httpError = new Error(`Request failed (${response.status}) for ${new URL(url).hostname}`);
                httpError.status = Number(response.status) || 0;
                throw httpError;
            }
            const raw = await response.text();
            if (!json) return raw;
            try { return JSON.parse(raw); }
            catch (_) { throw new Error(`${new URL(url).hostname} returned invalid JSON.`); }
        } catch (desktopError) {
            // A deterministic HTTP response (especially 4xx) is not a
            // transport failure. Do not retry the same endpoint through a
            // second stack or obscure its status with another error.
            if (options.signal?.aborted || Number(desktopError?.status) >= 400) throw desktopError;
            try { return await requestNative(url, options); }
            catch (nativeError) {
                throw new Error(`Desktop network: ${desktopError?.message || desktopError}; direct network: ${nativeError?.message || nativeError}`);
            }
        }
    })();
}

function httpGetJSON(url, options) {
    return request(url, { ...options, json: true });
}

function httpGetText(url, options) {
    return request(url, { ...options, json: false });
}

function fail(error) {
    return { success: false, error: (error && error.message) || String(error) };
}

/* ============================================================
   1) WIKIDATA — facts / people / places / entities
============================================================ */

async function wikidataSearch(query, lang = "en") {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No search term given." };

    try {
        const searchUrl =
            "https://www.wikidata.org/w/api.php" +
            `?action=wbsearchentities&format=json&language=${encodeURIComponent(lang)}` +
            `&limit=1&search=${encodeURIComponent(q)}`;

        const searchResult = await httpGetJSON(searchUrl);
        const hit = searchResult && Array.isArray(searchResult.search) && searchResult.search[0];

        if (!hit) {
            return { success: false, error: `"${q}" ke liye Wikidata par kuch nahi mila.` };
        }

        // Fetch full entity to pull a richer description + claims count.
        const entityUrl =
            "https://www.wikidata.org/wiki/Special:EntityData/" +
            `${hit.id}.json`;

        const entityData = await httpGetJSON(entityUrl);
        const entity = entityData && entityData.entities && entityData.entities[hit.id];
        const claimCount = entity ? Object.keys(entity.claims || {}).length : 0;

        return {
            success: true,
            id: hit.id,
            label: hit.label || q,
            description: hit.description || "",
            url: `https://www.wikidata.org/wiki/${hit.id}`,
            claimCount
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   2) REST COUNTRIES — country information
============================================================ */

async function countryInfo(name) {
    const q = String(name || "").trim();
    if (!q) return { success: false, error: "No country name given." };

    try {
        const url = `https://restcountries.com/v3.1/name/${encodeURIComponent(q)}?fields=name,capital,region,subregion,population,languages,currencies,flags,maps`;
        const results = await httpGetJSON(url);
        const country = Array.isArray(results) ? results[0] : null;

        if (!country) {
            return { success: false, error: `"${q}" naam ka koi country nahi mila.` };
        }

        return {
            success: true,
            name: country.name?.common || q,
            officialName: country.name?.official || "",
            capital: (country.capital && country.capital[0]) || "N/A",
            region: country.region || "",
            subregion: country.subregion || "",
            population: country.population || null,
            languages: country.languages ? Object.values(country.languages) : [],
            currencies: country.currencies ? Object.keys(country.currencies) : [],
            flag: country.flags?.png || country.flags?.svg || null,
            mapUrl: country.maps?.googleMaps || null
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   3) OPENSTREETMAP / NOMINATIM — location / address search
============================================================ */

async function locationSearch(query, limit = 3) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No place given." };

    try {
        const url =
            "https://nominatim.openstreetmap.org/search" +
            `?format=json&addressdetails=1&limit=${Math.max(1, Math.min(10, limit))}` +
            `&q=${encodeURIComponent(q)}`;

        const results = await httpGetJSON(url, {
            headers: { "Accept-Language": "en" }
        });

        if (!Array.isArray(results) || !results.length) {
            return { success: false, error: `"${q}" ke liye koi location nahi mili.` };
        }

        return {
            success: true,
            results: results.map((r) => ({
                name: r.display_name,
                lat: parseFloat(r.lat),
                lon: parseFloat(r.lon),
                type: r.type,
                category: r.class
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   4) OPEN-METEO — weather (geocode + forecast, both free)
============================================================ */

const WEATHER_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
    95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with heavy hail"
};

async function weatherByLocation(query) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No location given." };

    try {
        const geoUrl =
            "https://geocoding-api.open-meteo.com/v1/search" +
            `?count=10&language=en&name=${encodeURIComponent(q)}`;

        const geo = await httpGetJSON(geoUrl);
        const places = geo && Array.isArray(geo.results) ? geo.results : [];
        const normalizedQuery = q.normalize("NFKC").toLocaleLowerCase().trim();
        // Prefer an exact place or country match over the geocoder's first
        // fuzzy result. If the user names a country, use its capital when
        // the API returns one so the spoken answer says which city's
        // current conditions represent that country request.
        const place = places.find(item => String(item.name || "").toLocaleLowerCase() === normalizedQuery) ||
            places.find(item => String(item.country || "").toLocaleLowerCase() === normalizedQuery && item.feature_code === "PPLC") ||
            places.find(item => String(item.country || "").toLocaleLowerCase() === normalizedQuery) ||
            places[0];

        if (!place) {
            return { success: false, error: `"${q}" location nahi mili weather ke liye.` };
        }

        const weatherUrl =
            "https://api.open-meteo.com/v1/forecast" +
            `?latitude=${place.latitude}&longitude=${place.longitude}` +
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m" +
            "&timezone=auto";

        const weather = await httpGetJSON(weatherUrl);
        const current = weather && weather.current;

        if (!current) {
            return { success: false, error: "Weather data nahi mila." };
        }

        return {
            success: true,
            place: [place.name, place.admin1, place.country].filter(Boolean).join(", "),
            temperature: current.temperature_2m,
            feelsLike: current.apparent_temperature,
            humidity: current.relative_humidity_2m,
            windSpeed: current.wind_speed_10m,
            condition: WEATHER_CODES[current.weather_code] || "Unknown",
            unit: weather.current_units?.temperature_2m || "°C"
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   4b) OPEN-METEO — forecast by relative day
============================================================ */

async function weatherForecastByLocation(query, daysAhead = 1) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No location given." };

    try {
        const geoUrl =
            "https://geocoding-api.open-meteo.com/v1/search" +
            `?count=1&name=${encodeURIComponent(q)}`;
        const geo = await httpGetJSON(geoUrl);
        const place = geo && Array.isArray(geo.results) && geo.results[0];
        if (!place) return { success: false, error: `"${q}" location nahi mili forecast ke liye.` };

        const safeDays = Math.max(0, Math.min(6, Number(daysAhead) || 1));
        const url =
            "https://api.open-meteo.com/v1/forecast" +
            `?latitude=${place.latitude}&longitude=${place.longitude}` +
            "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
            `&forecast_days=${Math.max(2, safeDays + 1)}&timezone=auto`;
        const weather = await httpGetJSON(url);
        const daily = weather?.daily;
        if (!daily?.time?.[safeDays]) return { success: false, error: "Forecast data nahi mila." };

        return {
            success: true,
            place: [place.name, place.admin1, place.country].filter(Boolean).join(", "),
            date: daily.time[safeDays],
            temperatureMin: daily.temperature_2m_min?.[safeDays],
            temperatureMax: daily.temperature_2m_max?.[safeDays],
            precipitationProbability: daily.precipitation_probability_max?.[safeDays],
            condition: WEATHER_CODES[daily.weather_code?.[safeDays]] || "Unknown",
            unit: weather.daily_units?.temperature_2m_max || "°C"
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   5) OPEN LIBRARY — books / authors
============================================================ */

async function bookSearch(query) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No book/author name given." };

    try {
        const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=1`;
        const data = await httpGetJSON(url);
        const book = data && Array.isArray(data.docs) && data.docs[0];

        if (!book) {
            return { success: false, error: `"${q}" ke liye koi book nahi mili.` };
        }

        return {
            success: true,
            title: book.title,
            author: (book.author_name && book.author_name.join(", ")) || "Unknown",
            firstPublishYear: book.first_publish_year || null,
            subjects: (book.subject || []).slice(0, 5),
            coverUrl: book.cover_i
                ? `https://covers.openlibrary.org/b/id/${book.cover_i}-M.jpg`
                : null,
            url: `https://openlibrary.org${book.key}`
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   6) TVMAZE — TV shows / episodes
============================================================ */

async function tvShowSearch(query) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No show name given." };

    try {
        const url = `https://api.tvmaze.com/search/shows?q=${encodeURIComponent(q)}`;
        const results = await httpGetJSON(url);
        const hit = Array.isArray(results) && results[0] && results[0].show;

        if (!hit) {
            return { success: false, error: `"${q}" naam ka koi show nahi mila.` };
        }

        return {
            success: true,
            name: hit.name,
            genres: hit.genres || [],
            status: hit.status,
            premiered: hit.premiered,
            rating: hit.rating?.average ?? null,
            network: hit.network?.name || hit.webChannel?.name || "N/A",
            summary: String(hit.summary || "").replace(/<[^>]+>/g, "").trim(),
            url: hit.url
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   7) THEMEALDB — recipes / meals
============================================================ */

async function recipeSearch(query) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No dish name given." };

    try {
        const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`;
        const data = await httpGetJSON(url);
        const meal = data && Array.isArray(data.meals) && data.meals[0];

        if (!meal) {
            return { success: false, error: `"${q}" ke liye koi recipe nahi mili.` };
        }

        const ingredients = [];
        for (let i = 1; i <= 20; i += 1) {
            const ing = meal[`strIngredient${i}`];
            const measure = meal[`strMeasure${i}`];
            if (ing && ing.trim()) {
                ingredients.push(`${measure ? measure.trim() + " " : ""}${ing.trim()}`);
            }
        }

        return {
            success: true,
            name: meal.strMeal,
            category: meal.strCategory,
            area: meal.strArea,
            instructions: meal.strInstructions,
            ingredients,
            thumbnail: meal.strMealThumb,
            youtubeUrl: meal.strYoutube || null
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   8) POKÉAPI — Pokémon info
============================================================ */

async function pokemonInfo(name) {
    const q = String(name || "").trim().toLowerCase();
    if (!q) return { success: false, error: "No Pokémon name given." };

    try {
        const url = `https://pokeapi.co/api/v2/pokemon/${encodeURIComponent(q)}`;
        const data = await httpGetJSON(url);

        return {
            success: true,
            name: data.name,
            id: data.id,
            height: data.height,
            weight: data.weight,
            types: (data.types || []).map((t) => t.type.name),
            abilities: (data.abilities || []).map((a) => a.ability.name),
            stats: (data.stats || []).map((s) => ({ name: s.stat.name, value: s.base_stat })),
            sprite: data.sprites?.front_default || null
        };
    } catch (error) {
        return { success: false, error: `"${q}" naam ka Pokémon nahi mila.` };
    }
}

/* ============================================================
   9) NEWS — Google News RSS search (free, no key)
============================================================ */

function extractTag(xml, tag) {
    const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
    if (!match) return "";
    return match[1]
        .replace(/^<!\[CDATA\[/, "")
        .replace(/\]\]>$/, "")
        .trim();
}

async function newsSearch(query, limit = 5) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No news topic given." };

    try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-IN&gl=IN&ceid=IN:en`;
        const xml = await httpGetText(url);

        const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
        const parsed = items.slice(0, limit).map((itemXml) => ({
            title: extractTag(itemXml, "title"),
            link: extractTag(itemXml, "link"),
            pubDate: extractTag(itemXml, "pubDate"),
            source: extractTag(itemXml, "source")
        }));

        if (!parsed.length) {
            return { success: false, error: `"${q}" par koi news nahi mili.` };
        }

        return { success: true, query: q, items: parsed };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   10) FRANKFURTER — currency exchange (ECB data)
============================================================ */

async function currencyConvert(amount, from, to) {
    const value = Number(amount);
    const base = String(from || "").trim().toUpperCase();
    const target = String(to || "").trim().toUpperCase();

    if (!Number.isFinite(value) || !base || !target) {
        return { success: false, error: "Amount, from-currency aur to-currency zaroori hain." };
    }

    try {
        const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}&symbols=${encodeURIComponent(target)}`;
        const data = await httpGetJSON(url);
        const rate = data && data.rates && data.rates[target];

        if (!rate) {
            return { success: false, error: `${base} -> ${target} ka rate nahi mila.` };
        }

        return {
            success: true,
            amount: value,
            from: base,
            to: target,
            rate,
            converted: Number((value * rate).toFixed(4)),
            date: data.date
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   11) WORLDTIMEAPI — time / timezone
============================================================ */

async function timeForZone(zone) {
    const q = String(zone || "").trim();
    if (!q) return { success: false, error: "No timezone given (e.g. Asia/Kolkata)." };

    try {
        const url = `https://worldtimeapi.org/api/timezone/${encodeURIComponent(q)}`;
        const data = await httpGetJSON(url);

        return {
            success: true,
            timezone: data.timezone,
            datetime: data.datetime,
            utcOffset: data.utc_offset,
            dayOfWeek: data.day_of_week,
            isDST: data.dst
        };
    } catch (error) {
        return { success: false, error: `"${q}" ke liye timezone nahi mila. Format: Area/City, jaise Asia/Kolkata.` };
    }
}

/* ============================================================
   12) WIKIMEDIA COMMONS — images
============================================================ */

async function commonsImageSearch(query, limit = 3, searchConfig = {}) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No search term given." };

    try {
        const searchUrl =
            "https://commons.wikimedia.org/w/api.php" +
            "?action=query&list=search&srnamespace=6&format=json" +
            `&srlimit=${Math.max(1, Math.min(10, limit))}&srsearch=${encodeURIComponent(q)}`;

        const searchResult = await httpGetJSON(searchUrl, searchConfig);
        const hits = (searchResult && searchResult.query && searchResult.query.search) || [];

        if (!hits.length) {
            return { success: false, error: `"${q}" ke liye Wikimedia Commons par koi image nahi mili.` };
        }

        const titles = hits.map((h) => h.title).join("|");
        const infoUrl =
            "https://commons.wikimedia.org/w/api.php" +
                    "?action=query&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=1280&format=json" +
                    `&titles=${encodeURIComponent(titles)}`;

        const infoResult = await httpGetJSON(infoUrl, searchConfig);
        const pages = (infoResult && infoResult.query && infoResult.query.pages) || {};

        const images = Object.values(pages)
            .map((p) => {
                const info = p.imageinfo && p.imageinfo[0];
                if (!info) return null;
                const metadata = info.extmetadata || {};
                const plain = value => String(value || "").replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&#0*39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim().slice(0, 240);
                const fileTitle = String(p.title || "");
                return {
                    title: fileTitle,
                    url: info.url,
                    thumbUrl: info.thumburl,
                    mime: String(info.thumbmime || (/\.png(?:$|\?)/i.test(info.thumburl || "") ? "image/png" : /\.(?:jpe?g)(?:$|\?)/i.test(info.thumburl || "") ? "image/jpeg" : info.mime) || "").toLowerCase(),
                    sourceMime: String(info.mime || "").toLowerCase(),
                    width: Number(info.thumbwidth || info.width) || 0,
                    height: Number(info.thumbheight || info.height) || 0,
                    byteSize: Number(info.size) || 0,
                    artist: plain(metadata.Artist?.value),
                    license: plain(metadata.LicenseShortName?.value),
                    licenseUrl: plain(metadata.LicenseUrl?.value || metadata.LicenseURL?.value),
                    provider: "Wikimedia Commons",
                    sourceUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent(fileTitle.replace(/ /g, "_"))}`
                };
            })
            .filter(Boolean);

        return { success: true, query: q, images };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   13) WIKIMEDIA COMMONS — videos
   ------------------------------------------------------------
   Uses the same public Commons API as image search, but filters
   results to actual video MIME types so the chat can render them
   with native HTML5 controls.
============================================================ */

async function commonsVideoSearch(query, limit = 4) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No video search term given." };

    try {
        const maxResults = Math.max(4, Math.min(20, Number(limit) || 4));
        const makeSearchUrl = (term) =>
            "https://commons.wikimedia.org/w/api.php" +
            "?action=query&list=search&srnamespace=6&format=json" +
            `&srlimit=${maxResults}` +
            `&srsearch=${encodeURIComponent(term)}`;

        // Ask Commons for video files first. If the search backend does not
        // support the filetype filter for a particular query, fall back to a
        // normal search and filter the returned MIME types below.
        let searchResult = await httpGetJSON(makeSearchUrl(`${q} filetype:video`));
        let hits = (searchResult?.query?.search || []);
        if (!hits.length) {
            searchResult = await httpGetJSON(makeSearchUrl(q));
            hits = (searchResult?.query?.search || []);
        }
        if (!hits.length) {
            return { success: false, error: `"${q}" ke liye koi video nahi mila.` };
        }

        const titles = hits.map(h => h.title).join("|");
        const infoUrl =
            "https://commons.wikimedia.org/w/api.php" +
            "?action=query&prop=imageinfo&iiprop=url|mime|extmetadata&format=json" +
            `&titles=${encodeURIComponent(titles)}`;

        const infoResult = await httpGetJSON(infoUrl);
        const pages = Object.values(infoResult?.query?.pages || {});
        const videos = pages.map(page => {
            const info = page.imageinfo?.[0];
            if (!info || !/^video\//i.test(info.mime || "")) return null;
            const meta = info.extmetadata || {};
            return {
                title: page.title,
                url: info.url,
                mime: info.mime,
                description: meta.ImageDescription?.value || ""
            };
        }).filter(Boolean).slice(0, Math.max(1, Math.min(10, Number(limit) || 4)));

        if (!videos.length) {
            return { success: false, error: `"${q}" ke liye playable video nahi mila.` };
        }

        return { success: true, query: q, videos };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   13) GITHUB API — repositories / users
============================================================ */

async function githubApiJSON(url) {
    const token = String(process.env.GITHUB_TOKEN || "").trim();
    const headers = { Accept: "application/vnd.github+json" };
    if (token && token.length <= 300) headers.Authorization = `Bearer ${token}`;
    try {
        return await httpGetJSON(url, { headers });
    } catch (error) {
        // Public GitHub search still works when an old/revoked token is
        // configured, though it is subject to the anonymous API rate limit.
        if (headers.Authorization && /\b401\b|unauthorized/i.test(error?.message || "")) {
            return httpGetJSON(url, { headers: { Accept: "application/vnd.github+json" } });
        }
        throw error;
    }
}

async function githubRepoSearch(query, limit = 3) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No search term given." };

    try {
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=${Math.max(1, Math.min(10, limit))}`;
        const data = await githubApiJSON(url);

        const items = (data && data.items) || [];
        if (!items.length) {
            return { success: false, error: `"${q}" ke liye koi GitHub repo nahi mila.` };
        }

        return {
            success: true,
            repos: items.map((r) => ({
                fullName: r.full_name,
                description: r.description,
                stars: r.stargazers_count,
                forks: r.forks_count,
                language: r.language,
                url: r.html_url
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

async function githubUserInfo(username) {
    const q = String(username || "").trim();
    if (!q) return { success: false, error: "No GitHub username given." };

    try {
        const url = `https://api.github.com/users/${encodeURIComponent(q)}`;
        const data = await githubApiJSON(url);

        return {
            success: true,
            login: data.login,
            name: data.name,
            bio: data.bio,
            company: data.company,
            location: data.location,
            publicRepos: data.public_repos,
            followers: data.followers,
            following: data.following,
            profileUrl: data.html_url,
            avatarUrl: data.avatar_url
        };
    } catch (error) {
        return { success: false, error: `GitHub par "${q}" naam ka user nahi mila.` };
    }
}

/* ============================================================
   14) DBPEDIA — Wikipedia structured data (abstracts / facts)
============================================================ */

async function dbpediaLookup(term) {
    const q = String(term || "").trim();
    if (!q) return { success: false, error: "No term given." };

    try {
        const page = q.charAt(0).toUpperCase() + q.slice(1).replace(/\s+/g, "_");
        const url = `https://dbpedia.org/data/${encodeURIComponent(page)}.json`;
        const data = await httpGetJSON(url);
        const key = Object.keys(data).find((k) => k.endsWith(`/${page}`));
        const entry = key && data[key];
        const abstract =
            entry &&
            entry["http://dbpedia.org/ontology/abstract"] &&
            (entry["http://dbpedia.org/ontology/abstract"].find((a) => a.lang === "en") ||
                entry["http://dbpedia.org/ontology/abstract"][0]);

        if (!abstract) return { success: false, error: `DBpedia par "${q}" nahi mila.` };

        return { success: true, title: page.replace(/_/g, " "), abstract: abstract.value, source: url };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   15) GEONAMES — geographical information
   Free, but requires a free-registration username:
   https://www.geonames.org/login (set GEONAMES_USERNAME env var)
============================================================ */

async function geoNamesInfo(place) {
    const q = String(place || "").trim();
    const username = process.env.GEONAMES_USERNAME || "demo";
    if (!q) return { success: false, error: "No place given." };

    try {
        const url =
            "http://api.geonames.org/searchJSON" +
            `?q=${encodeURIComponent(q)}&maxRows=1&username=${encodeURIComponent(username)}`;
        const data = await httpGetJSON(url);
        const place0 = data && data.geonames && data.geonames[0];
        if (!place0) return { success: false, error: `GeoNames par "${q}" nahi mila.` };

        return {
            success: true,
            name: place0.name,
            country: place0.countryName,
            adminArea: place0.adminName1,
            lat: place0.lat,
            lon: place0.lng,
            population: place0.population || null,
            timezone: place0.timezone?.timeZoneId || null
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   16) OPENAQ — air quality
============================================================ */

async function airQuality(city) {
    const q = String(city || "").trim();
    if (!q) return { success: false, error: "No city given." };

    try {
        const url = `https://api.openaq.org/v2/latest?city=${encodeURIComponent(q)}&limit=1`;
        const data = await httpGetJSON(url);
        const result = data && data.results && data.results[0];
        if (!result) return { success: false, error: `"${q}" ke liye air quality data nahi mila.` };

        return {
            success: true,
            city: result.city,
            location: result.location,
            measurements: (result.measurements || []).map((m) => ({
                parameter: m.parameter,
                value: m.value,
                unit: m.unit
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   17) USGS — earthquakes / geology
============================================================ */

async function recentEarthquakes(minMagnitude = 4.5, limit = 5) {
    try {
        const url =
            "https://earthquake.usgs.gov/fdsnws/event/1/query" +
            `?format=geojson&minmagnitude=${minMagnitude}&orderby=time&limit=${Math.max(1, Math.min(20, limit))}`;
        const data = await httpGetJSON(url);
        const features = (data && data.features) || [];

        return {
            success: true,
            earthquakes: features.map((f) => ({
                place: f.properties.place,
                magnitude: f.properties.mag,
                time: new Date(f.properties.time).toISOString(),
                url: f.properties.url
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   18) NASA — space / APOD (works key-less with DEMO_KEY)
============================================================ */

async function nasaApod() {
    try {
        const apiKey = process.env.NASA_API_KEY || "DEMO_KEY";
        const url = `https://api.nasa.gov/planetary/apod?api_key=${apiKey}`;
        const data = await httpGetJSON(url);

        return {
            success: true,
            title: data.title,
            date: data.date,
            explanation: data.explanation,
            imageUrl: data.url,
            mediaType: data.media_type
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   19) WORLD BANK — world economy / development indicators
============================================================ */

async function worldBankIndicator(countryCode, indicator = "NY.GDP.MKTP.CD") {
    const cc = String(countryCode || "").trim();
    if (!cc) return { success: false, error: "No country code given." };

    try {
        const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(cc)}/indicator/${encodeURIComponent(indicator)}?format=json&per_page=5`;
        const data = await httpGetJSON(url);
        const rows = (data && data[1]) || [];
        const latest = rows.find((r) => r.value !== null);
        if (!latest) return { success: false, error: `"${cc}" ke liye World Bank data nahi mila.` };

        return {
            success: true,
            country: latest.country?.value,
            indicator: latest.indicator?.value,
            year: latest.date,
            value: latest.value
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   20) OPENALEX — research papers
============================================================ */

async function researchPaperSearch(query, limit = 5, options = {}) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No search query given." };

    try {
        const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&per-page=${Math.max(1, Math.min(10, limit))}`;
        const data = await httpGetJSON(url, options);
        const results = (data && data.results) || [];

        return {
            success: true,
            papers: results.map((p) => ({
                title: p.display_name,
                year: p.publication_year,
                citedBy: p.cited_by_count,
                url: p.doi ? `https://doi.org/${p.doi.replace("https://doi.org/", "")}` : p.id
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   21) CROSSREF — academic publications (DOI metadata)
============================================================ */

async function crossrefSearch(query, limit = 5, options = {}) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No search query given." };

    try {
        const url = `https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=${Math.max(1, Math.min(10, limit))}`;
        const data = await httpGetJSON(url, options);
        const items = (data && data.message && data.message.items) || [];

        return {
            success: true,
            publications: items.map((i) => ({
                title: Array.isArray(i.title) ? i.title[0] : i.title,
                authors: (i.author || []).map((a) => `${a.given || ""} ${a.family || ""}`.trim()),
                journal: Array.isArray(i["container-title"]) ? i["container-title"][0] : null,
                year: i.published?.["date-parts"]?.[0]?.[0] || null,
                doi: i.DOI
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   22) JIKAN — anime / manga (unofficial MyAnimeList API)
============================================================ */

async function animeSearch(query, limit = 5) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No anime name given." };

    try {
        const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=${Math.max(1, Math.min(10, limit))}`;
        const data = await httpGetJSON(url);
        const results = (data && data.data) || [];

        return {
            success: true,
            results: results.map((a) => ({
                title: a.title,
                episodes: a.episodes,
                score: a.score,
                synopsis: a.synopsis,
                url: a.url,
                image: a.images?.jpg?.image_url
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   23) ANILIST — anime / manga database (GraphQL)
============================================================ */

function httpPostJSON(url, body, headers = {}) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(url);
        } catch (error) {
            reject(new Error(`Invalid URL: ${url}`));
            return;
        }
        const payload = JSON.stringify(body);
        const lib = parsed.protocol === "http:" ? http : https;
        const req = lib.request(
            {
                hostname: parsed.hostname,
                path: parsed.pathname + parsed.search,
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payload),
                    "User-Agent": USER_AGENT,
                    ...headers
                },
                timeout: REQUEST_TIMEOUT_MS
            },
            (res) => {
                let raw = "";
                res.on("data", (chunk) => (raw += chunk));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(raw));
                    } catch (error) {
                        reject(new Error("Failed to parse response JSON."));
                    }
                });
            }
        );
        req.on("timeout", () => req.destroy(new Error("Request timed out.")));
        req.on("error", reject);
        req.write(payload);
        req.end();
    });
}

async function anilistSearch(query, limit = 5) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No title given." };

    try {
        const gql = `
            query ($search: String, $perPage: Int) {
                Page(perPage: $perPage) {
                    media(search: $search, type: ANIME) {
                        title { romaji english }
                        episodes
                        averageScore
                        description(asHtml: false)
                        siteUrl
                    }
                }
            }`;
        const data = await httpPostJSON("https://graphql.anilist.co", {
            query: gql,
            variables: { search: q, perPage: Math.max(1, Math.min(10, limit)) }
        });
        const media = (data && data.data && data.data.Page && data.data.Page.media) || [];

        return {
            success: true,
            results: media.map((m) => ({
                title: m.title.english || m.title.romaji,
                episodes: m.episodes,
                score: m.averageScore,
                description: m.description,
                url: m.siteUrl
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   24) OPEN FOOD FACTS — food products / ingredients
============================================================ */

async function foodProductSearch(query, limit = 5) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No product name given." };

    try {
        const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=${Math.max(1, Math.min(10, limit))}`;
        const data = await httpGetJSON(url);
        const products = (data && data.products) || [];

        return {
            success: true,
            products: products.map((p) => ({
                name: p.product_name,
                brand: p.brands,
                nutriScore: p.nutriscore_grade,
                ingredients: p.ingredients_text,
                image: p.image_url
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   25) GITLAB — projects / repositories
============================================================ */

async function gitlabProjectSearch(query, limit = 5) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No search term given." };

    try {
        const url = `https://gitlab.com/api/v4/projects?search=${encodeURIComponent(q)}&per_page=${Math.max(1, Math.min(10, limit))}`;
        const results = await httpGetJSON(url);

        return {
            success: true,
            projects: (Array.isArray(results) ? results : []).map((p) => ({
                name: p.name_with_namespace,
                description: p.description,
                stars: p.star_count,
                url: p.web_url
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   26) NPM REGISTRY — package info
============================================================ */

async function npmPackageInfo(name) {
    const q = String(name || "").trim();
    if (!q) return { success: false, error: "No package name given." };

    try {
        const url = `https://registry.npmjs.org/${encodeURIComponent(q)}/latest`;
        const data = await httpGetJSON(url);

        return {
            success: true,
            name: data.name,
            version: data.version,
            description: data.description,
            license: data.license,
            homepage: data.homepage
        };
    } catch (error) {
        return { success: false, error: `npm par "${q}" package nahi mila.` };
    }
}

/* ============================================================
   27) PYPI — Python package info
============================================================ */

async function pypiPackageInfo(name) {
    const q = String(name || "").trim();
    if (!q) return { success: false, error: "No package name given." };

    try {
        const url = `https://pypi.org/pypi/${encodeURIComponent(q)}/json`;
        const data = await httpGetJSON(url);
        const info = data.info || {};

        return {
            success: true,
            name: info.name,
            version: info.version,
            summary: info.summary,
            license: info.license,
            homepage: info.home_page || info.project_url
        };
    } catch (error) {
        return { success: false, error: `PyPI par "${q}" package nahi mila.` };
    }
}

/* ============================================================
   28) STACK EXCHANGE — Stack Overflow Q&A search
============================================================ */

async function stackOverflowSearch(query, limit = 5) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No search query given." };

    try {
        const url =
            "https://api.stackexchange.com/2.3/search/advanced" +
            `?order=desc&sort=relevance&q=${encodeURIComponent(q)}&site=stackoverflow&pagesize=${Math.max(1, Math.min(10, limit))}`;
        const data = await httpGetJSON(url);
        const items = (data && data.items) || [];

        return {
            success: true,
            questions: items.map((i) => ({
                title: i.title,
                isAnswered: i.is_answered,
                score: i.score,
                answers: i.answer_count,
                url: i.link
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   29) HACKER NEWS (via Algolia) — tech news / discussions
============================================================ */

async function hackerNewsSearch(query, limit = 5) {
    const q = String(query || "").trim();

    try {
        const url = q
            ? `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=${Math.max(1, Math.min(10, limit))}`
            : `https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=${Math.max(1, Math.min(10, limit))}`;
        const data = await httpGetJSON(url);
        const hits = (data && data.hits) || [];

        return {
            success: true,
            stories: hits.map((h) => ({
                title: h.title,
                points: h.points,
                comments: h.num_comments,
                url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   30) OPENSKY NETWORK — live flight / aircraft tracking
============================================================ */

async function flightsNear(lat, lon, radiusDeg = 1) {
    const latN = parseFloat(lat);
    const lonN = parseFloat(lon);
    if (Number.isNaN(latN) || Number.isNaN(lonN)) {
        return { success: false, error: "Valid lat/lon do." };
    }

    try {
        const url =
            "https://opensky-network.org/api/states/all" +
            `?lamin=${latN - radiusDeg}&lomin=${lonN - radiusDeg}&lamax=${latN + radiusDeg}&lomax=${lonN + radiusDeg}`;
        const data = await httpGetJSON(url);
        const states = (data && data.states) || [];

        return {
            success: true,
            aircraft: states.slice(0, 10).map((s) => ({
                callsign: (s[1] || "").trim(),
                originCountry: s[2],
                lat: s[6],
                lon: s[5],
                altitudeM: s[7],
                velocityMs: s[9]
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   31) OPEN5E — D&D 5e SRD content
============================================================ */

async function dndSearch(kind, name) {
    const type = String(kind || "monsters").trim().toLowerCase();
    const q = String(name || "").trim();

    try {
        const url = `https://api.open5e.com/${encodeURIComponent(type)}/?search=${encodeURIComponent(q)}&limit=5`;
        const data = await httpGetJSON(url);
        const results = (data && data.results) || [];

        return { success: true, results };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   32) INTERNET ARCHIVE — archived media / text search
============================================================ */

async function archiveSearch(query, limit = 5) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No search query given." };

    try {
        const url =
            "https://archive.org/advancedsearch.php" +
            `?q=${encodeURIComponent(q)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=year&rows=${Math.max(1, Math.min(10, limit))}&output=json`;
        const data = await httpGetJSON(url);
        const docs = (data && data.response && data.response.docs) || [];

        return {
            success: true,
            items: docs.map((d) => ({
                title: d.title,
                creator: d.creator,
                year: d.year,
                url: `https://archive.org/details/${d.identifier}`
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   33) GDELT — global news / world events
============================================================ */

async function globalEventsSearch(query, limit = 5) {
    const q = String(query || "").trim();
    if (!q) return { success: false, error: "No search query given." };

    try {
        const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&mode=artlist&maxrecords=${Math.max(1, Math.min(10, limit))}&format=json`;
        const data = await httpGetJSON(url);
        const articles = (data && data.articles) || [];

        return {
            success: true,
            articles: articles.map((a) => ({
                title: a.title,
                source: a.domain,
                date: a.seendate,
                url: a.url
            }))
        };
    } catch (error) {
        return fail(error);
    }
}

/* ============================================================
   PRODUCT RESEARCH — Wikipedia + Reddit, with retailer search links.
   Live prices are not guessed or scraped: they require marketplace
   affiliate API access.
============================================================ */

async function productResearch(query) {
    const q = String(query || "").trim().slice(0, 180);
    if (!q) return { success: false, error: "Product name is required." };

    const wikipediaPromise = require("./wikipedia").summary(q, "en")
        .catch(error => ({ success: false, error: error.message || String(error) }));
    const redditUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=relevance&t=year&limit=5`;
    const redditPromise = httpGetJSON(redditUrl, {
        headers: { "User-Agent": "JARVIS-ProductResearch/1.0 (personal desktop assistant)" }
    }).catch(error => ({ success: false, error: error.message || String(error) }));
    const [wiki, redditData] = await Promise.all([wikipediaPromise, redditPromise]);

    const posts = Array.isArray(redditData?.data?.children)
        ? redditData.data.children.map(({ data: post }) => ({
            title: String(post?.title || "").slice(0, 240),
            subreddit: String(post?.subreddit || "").slice(0, 80),
            score: Number(post?.score) || 0,
            excerpt: String(post?.selftext || "").replace(/\s+/g, " ").slice(0, 700),
            url: post?.permalink ? `https://www.reddit.com${post.permalink}` : null,
            retrievedAt: post?.created_utc ? new Date(post.created_utc * 1000).toISOString() : null,
        })).filter(post => post.title && post.url)
        : [];

    return {
        success: true,
        query: q,
        researchedAt: new Date().toISOString(),
        wikipedia: wiki?.success ? { title: wiki.title, summary: String(wiki.extract || "").slice(0, 4000), url: wiki.url } : null,
        wikipediaError: wiki?.success ? null : (wiki?.error || "No Wikipedia result."),
        reddit: posts,
        redditError: redditData?.success === false ? redditData.error : null,
        retailers: {
            livePricesAvailable: false,
            reason: "Official live offer data requires configured affiliate API access.",
            amazonSearchUrl: `https://www.amazon.in/s?k=${encodeURIComponent(q)}`,
            flipkartSearchUrl: `https://www.flipkart.com/search?q=${encodeURIComponent(q)}`,
            googleShoppingUrl: `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`,
        }
    };
}

module.exports = {
    setNetworkFetch,
    httpGetJSON,
    wikidataSearch,
    countryInfo,
    locationSearch,
    weatherByLocation,
    weatherForecastByLocation,
    bookSearch,
    tvShowSearch,
    recipeSearch,
    pokemonInfo,
    newsSearch,
    currencyConvert,
    timeForZone,
    commonsImageSearch,
    commonsVideoSearch,
    githubRepoSearch,
    githubUserInfo,
    dbpediaLookup,
    geoNamesInfo,
    airQuality,
    recentEarthquakes,
    nasaApod,
    worldBankIndicator,
    researchPaperSearch,
    crossrefSearch,
    animeSearch,
    anilistSearch,
    foodProductSearch,
    gitlabProjectSearch,
    npmPackageInfo,
    pypiPackageInfo,
    stackOverflowSearch,
    hackerNewsSearch,
    flightsNear,
    dndSearch,
    archiveSearch,
    globalEventsSearch,
    productResearch
};
