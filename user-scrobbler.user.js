// ==UserScript==
// @name         Simple Scrobbler
// @version      0.0.1
// @namespace    https://github.com/deevroman/user-scrobbler
// @updateURL    https://github.com/deevroman/user-scrobbler/raw/master/user-scrobbler.user.js
// @downloadURL  https://github.com/deevroman/user-scrobbler/raw/master/user-scrobbler.user.js
// @supportURL   https://github.com/deevroman/user-scrobbler/issues
// @author       deevroman
// @match        https://deevroman.github.io/user-scrobbler*
// @match        https://www.last.fm/*
// @match        https://music.yandex.ru/*
// @match        https://radio.vas3k.club/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.0.0/core.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/3.1.9-1/md5.js
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        GM.xmlHttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_addElement
// @grant        GM_info
// ==/UserScript==
/* global GM */
/* global GM.getValue */
/* global GM.setValue */
/* global GM.xmlHttpRequest */
/* global GM_registerMenuCommand */
/* global GM_addElement */
/* global GM_info */
/* global CryptoJS */

const API_KEY = 'cd6c7e9e52beae3a7b87b8b7976d1456';
const API_SECRET = 'b434a1a4f2abce6c4aac4f986470524f';
const useragent = `user-scrobbler/${GM_info.version}`;
const API_BASE = 'https://ws.audioscrobbler.com/2.0/'

function getSign(req) {
    const params = Object.entries(req)
    params.sort((a, b) => {
        if (a[0] < b[0]) return -1;
        if (a[0] > b[0]) return 1;
        return 0;
    })
    const str = params.map(([k, v]) => `${k}${v}`).join("") + API_SECRET
    return CryptoJS.MD5(str).toString()
}

function signReq(req) {
    return Object.assign(req, {api_sig: getSign(req)})
}

if (location.toString().startsWith("https://deevroman.github.io/user-scrobbler?token=")) {
    queueMicrotask(async () => {
        const token = new URLSearchParams(location.search).get("token")
        const request = {
            method: "auth.getSession",
            token: token,
            api_key: API_KEY,
        }
        const res = await GM.xmlHttpRequest({
            url: API_BASE + "?" + new URLSearchParams(signReq(request)),
            responseType: "xml",
        })
        const xml = new DOMParser().parseFromString(res.response, "text/xml")
        await GM.setValue("lastfm-user", xml.querySelector("session name").textContent);
        await GM.setValue("lastfm-session", xml.querySelector("session key").textContent);
        window.history.pushState({}, document.title, location.pathname);
        console.log(res.response)
    })
}


GM_registerMenuCommand("Connect last.fm", function () {
    window.open("https://www.last.fm/api/auth/?api_key=" + API_KEY)
})

GM_registerMenuCommand("Scrobble!", function () {
    injectJSIntoPage(`
        debugger
        window.postMessage({
            type: "scrobble",
            username: window.username,
            artist: navigator.mediaSession.metadata.artist,
            title: navigator.mediaSession.metadata.title,
            album: navigator.mediaSession.metadata.album
        }, '*')
    `)
})


const boWindowObject = typeof window.wrappedJSObject !== "undefined" ? window.wrappedJSObject : unsafeWindow;
const boGlobalThis = typeof boWindowObject.globalThis !== "undefined" ? boWindowObject.globalThis : boWindowObject;

let username;
let session;

GM.getValue("lastfm-user").then((r) => {
    boWindowObject.username = username = r;
});

GM.getValue("lastfm-session").then((r) => {
    boWindowObject.session = session = r;
});

window.addEventListener('message', async function (event) {
    if (!event.data.username) return
    console.log(event.data)
    if (event.data.type === "scrobble") {
        await scrobble(event)
        return
    }
    const request = {
        method: "track.updateNowPlaying",
        artist: event.data.artist,
        track: event.data.title,
        sk: session,
        api_key: API_KEY,
    }
    if (event.data.album) {
        request['album'] = event.data.album
    }
    const res = await GM.xmlHttpRequest({
        url: API_BASE,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        data: new URLSearchParams(signReq(request)).toString(),
        method: "POST",
        responseType: "xml",
    })
    console.log(res.response)
})

async function scrobble(event) {
    console.log("scrobble");
    const request = {
        method: "track.scrobble",
        artist: event.data.artist,
        track: event.data.title,
        timestamp: Math.round(new Date().getTime() / 1000),
        sk: session,
        api_key: API_KEY,
    }
    if (event.data.album) {
        request['album'] = event.data.album
    }
    const res = await GM.xmlHttpRequest({
        url: API_BASE,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        data: new URLSearchParams(signReq(request)).toString(),
        method: "POST",
        responseType: "xml",
    })
    console.log(res.response)
}

/**
 * @param {string} text
 */
function injectJSIntoPage(text) {
    GM_addElement("script", {
        textContent: text
    })
}

injectJSIntoPage(`

function wrapMediaMetadata(onChange) {
    let _metadata = null;

    Object.defineProperty(navigator.mediaSession, 'metadata', {
        configurable: true,
        enumerable: true,

        get() {
            return _metadata;
        },

        set(value) {
            _metadata = value;
            onChange?.(value);
        }
    });
}

wrapMediaMetadata((newMetadata) => {
    window.postMessage({
        username: window.username,
        artist: navigator.mediaSession.metadata.artist,
        title: navigator.mediaSession.metadata.title,
        album: navigator.mediaSession.metadata.album
    }, '*')
    console.log(newMetadata)
})

`)
