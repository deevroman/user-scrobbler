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

const API_KEY = "cd6c7e9e52beae3a7b87b8b7976d1456"
const API_SECRET = "b434a1a4f2abce6c4aac4f986470524f"
const useragent = `user-scrobbler/${GM_info.version}`
const API_BASE = "https://ws.audioscrobbler.com/2.0/"

const windowObject = typeof window.wrappedJSObject !== "undefined" ? window.wrappedJSObject : unsafeWindow
const extGlobalThis = typeof windowObject.globalThis !== "undefined" ? windowObject.globalThis : windowObject

/**
 * @param {string} text
 */
function injectJSIntoPage(text) {
    GM_addElement("script", {
        textContent: text
    })
}

let username
let session

function getSign(req) {
    const params = Object.entries(req)
    params.sort((a, b) => {
        if (a[0] < b[0]) return -1
        if (a[0] > b[0]) return 1
        return 0
    })
    const str = params.map(([k, v]) => `${k}${v}`).join("") + API_SECRET
    return CryptoJS.MD5(str).toString()
}

function signReq(req) {
    return Object.assign(req, { api_sig: getSign(req) })
}

async function scrobble(event) {
    console.debug("scrobble")
    const request = {
        method: "track.scrobble",
        artist: event.data.artist,
        track: event.data.title,
        timestamp: event.data.timestamp ?? Math.round(new Date().getTime() / 1000),
        sk: session,
        api_key: API_KEY
    }
    if (event.data.album) {
        request["album"] = event.data.album
    }
    if (event.data.duration) {
        request["duration"] = event.data.duration
    }
    const res = await GM.xmlHttpRequest({
        url: API_BASE,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        data: new URLSearchParams(signReq(request)).toString(),
        method: "POST",
        responseType: "xml"
    })
    console.debug(res.response)
}

function _setupMenuButtons() {
    GM_registerMenuCommand("Hello, " + username, function() {
        window.open("https://www.last.fm/user/" + username)
    })

    GM_registerMenuCommand("Connect last.fm", function() {
        window.open("https://www.last.fm/api/auth/?api_key=" + API_KEY)
    })

    GM_registerMenuCommand("Scrobble!", function() {
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

    GM_registerMenuCommand("Bulk scrobble", function() {
        window.open("https://deevroman.github.io/user-scrobbler/bulk-scrobbler.html", "_blank")
    })

    GM_registerMenuCommand("Manual nowplaying", async function() {
        const artist = prompt(`Hello, ${await GM.getValue("lastfm-user")}\nType a artist name`)
        if (artist === null) {
            return
        }
        const track = prompt("Type a track name")
        if (track === null) return
        const request = {
            method: "track.updateNowPlaying",
            artist: artist,
            track: track,
            sk: session,
            api_key: API_KEY
        }
        const res = await GM.xmlHttpRequest({
            url: API_BASE,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            data: new URLSearchParams(signReq(request)).toString(),
            method: "POST",
            responseType: "xml"
        })
        console.log(res.response)
    })
}

function setupMenuButtons() {
    try {
        _setupMenuButtons()
    } catch (e) {
        console.error(e)
    }
}

function setupBulkScrobbler() {
    if (document.getElementById("bulk-scrobbler")) return
    const container = document.createElement("div")
    container.id = "bulk-scrobbler"
    const title = document.createElement("div")
    title.textContent = `Hello ${username}\nFormat: artist;title;album;timestamp;duration`
    title.style.whiteSpace = "pre"
    title.style.marginBottom = "6px"
    container.appendChild(title)

    const ta = document.createElement("textarea")
    ta.style.width = "100%"
    ta.style.height = "160px"
    container.appendChild(ta)

    const controls = document.createElement("div")
    controls.style.marginTop = "8px"
    controls.style.display = "flex"

    const btn = document.createElement("button")
    btn.textContent = "Scrobble lines"
    btn.style.borderRadius = "5px"
    btn.style.border = "solid 1px gray"

    controls.appendChild(btn)
    container.appendChild(controls)

    document.body.appendChild(container)

    btn.addEventListener("click", async function() {
        btn.setAttribute("disabled", true)
        btn.style.cursor = "progress"
        try {
            const scrobbles = ta.value
                .split("\n")
                .map(
                    i =>
                        i.match(/^(?<artist>.+?);(?<title>.+?);(?<album>.+?)(;(?<timestamp>.+?))?(;(?<duration>.+?))?$/)
                            .groups
                )
            for (let i = 0; i < scrobbles.length; i++){
                const s = scrobbles[i];
                console.log(i, s)
                await scrobble({
                    data: s
                })
            }
        } finally {
            btn.style.cursor = ""
            btn.setAttribute("disabled", true)
        }
    })
}

function setupTools() {
    if (
        location
            .toString()
            .toString()
            .startsWith("https://deevroman.github.io/user-scrobbler/bulk-scrobbler.html")
    ) {
        setupBulkScrobbler()
    }
}

;(() => {
    if (location.toString() === "https://deevroman.github.io/user-scrobbler") {
        document.querySelector("#status").style.cursor = "pointer"
        document.querySelector("#status").onclick = () => {
            window.open("https://www.last.fm/api/auth/?api_key=" + API_KEY)
        }
        return
    }

    if (
        location.toString().startsWith("https://deevroman.github.io/user-scrobbler") &&
        new URLSearchParams(location.search).get("token")
    ) {
        queueMicrotask(async () => {
            console.log("Token obtaining")
            const token = new URLSearchParams(location.search).get("token")
            const request = {
                method: "auth.getSession",
                token: token,
                api_key: API_KEY
            }
            const res = await GM.xmlHttpRequest({
                url: API_BASE + "?" + new URLSearchParams(signReq(request)),
                responseType: "xml"
            })
            const xml = new DOMParser().parseFromString(res.response, "text/xml")
            const username = xml.querySelector("session name").textContent
            alert(`Hello, ${username}`)
            const session = xml.querySelector("session key").textContent
            await GM.setValue("lastfm-user", username)
            await GM.setValue("lastfm-session", session)
            window.history.pushState({}, document.title, location.pathname)
            console.log(res.response)
        })
    }

    GM.getValue("lastfm-user").then(r => {
        windowObject.username = username = r
        setupMenuButtons()
        setupTools()
    })

    GM.getValue("lastfm-session").then(r => {
        windowObject.session = session = r
    })

    window.addEventListener("message", async function(event) {
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
            api_key: API_KEY
        }
        if (event.data.album) {
            request["album"] = event.data.album
        }
        const res = await GM.xmlHttpRequest({
            url: API_BASE,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            data: new URLSearchParams(signReq(request)).toString(),
            method: "POST",
            responseType: "xml"
        })
        console.log(res.response)
    })

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

    console.log("script finished")
})()
