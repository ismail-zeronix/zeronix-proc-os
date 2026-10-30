/*!
 * Zeronix website chat widget.
 *
 * Add to the <head> of every page on the website (see widget/README.md):
 *   <script src="https://PORTAL-DOMAIN/widget/zeronix-chat.js" defer></script>
 *
 * The portal address is taken from this script's own src, so the same file works for testing and production.
 * Optional attributes on the <script> tag:
 *   data-color="#019297"          main colour (buttons, the visitor's bubbles)
 *   data-dark="#042A2D"           header colour
 *   data-title="Zeronix Sales"    header title
 *   data-greeting="..."           the first message the visitor sees
 *   data-quick="A|B|C"            quick replies under the greeting
 *   data-popup-delay="20"         seconds on the site before the chat pops up (0 = never)
 *   data-popup-scroll="60"        or once they scroll this far down the page, in % (0 = never)
 *   data-precise-location="true"  after the visitor starts a chat, ask the browser for their exact location (false = never;
 *                                 the city from their IP is always shown)
 *   data-position="right"         right or left
 *
 * Plain JavaScript, no dependencies; everything is drawn inside a Shadow DOM so the site's CSS cannot change it.
 */
(function () {
  "use strict";
  if (window.__zeronixChat) return;
  window.__zeronixChat = true;

  var script =
    document.currentScript ||
    (function () {
      var all = document.querySelectorAll("script[src*='zeronix-chat']");
      return all[all.length - 1];
    })();
  if (!script) return;

  function attr(name, fallback) {
    var v = script.getAttribute("data-" + name);
    return v == null || v === "" ? fallback : v;
  }

  var BASE = new URL(script.src, location.href).origin;
  var cfg = {
    color: attr("color", "#019297"),
    dark: attr("dark", "#042A2D"),
    accent: "#4CAF50",
    title: attr("title", "Zeronix Sales"),
    greeting: attr("greeting", "Hi there 👋 Welcome to Zeronix. Looking for laptops, servers, networking or IT solutions? Ask us anything, our sales team replies in minutes."),
    quick: attr("quick", "I need a quote|Is this in stock?|Talk to a sales person").split("|").filter(Boolean),
    popupDelay: Number(attr("popup-delay", 20)),
    popupScroll: Number(attr("popup-scroll", 60)),
    preciseLocation: attr("precise-location", "true") !== "false",
    left: attr("position", "right") === "left",
  };
  // the same lists as FEEDBACK_GOOD / FEEDBACK_BAD in src/lib/webchat/types.ts (the server only keeps these)
  var FEEDBACK_GOOD = ["Quick reply", "Friendly and helpful", "Got the information I needed", "Good prices"];
  var FEEDBACK_BAD = ["Slow to reply", "My question was not answered", "Prices too high", "I would prefer a call"];

  var TOKEN_KEY = "zx-chat-token";
  var OPEN_KEY = "zx-chat-open";
  var POPPED_KEY = "zx-chat-popped";
  var TEASER_KEY = "zx-chat-teaser";

  // ---------- storage (blocked in some private windows) ----------
  function get(store, key) {
    try {
      return window[store].getItem(key);
    } catch {
      return null;
    }
  }
  function set(store, key, value) {
    try {
      if (value == null) window[store].removeItem(key);
      else window[store].setItem(key, value);
    } catch {
      /* ignore */
    }
  }

  // ---------- state ----------
  var token = get("localStorage", TOKEN_KEY);
  var state = null; // { status, leadDone, agent, messages, team, rated }
  var open = get("sessionStorage", OPEN_KEY) === "1";
  var unread = 0;
  var source = null;
  var typingTimer = null;
  var lastTypingSent = 0;
  var sending = false;
  var formOpen = false; // the lead form shows once the visitor starts typing
  var formError = "";
  var sendError = "";
  var confirmEnd = false;
  var note = ""; // a short line under the messages ("We will call you back")
  var rating = 0;
  var hoverStar = 0;
  var tags = [];
  var ratingDone = false; // rated or skipped in this page
  var thanks = false;

  // ---------- who the visitor is, as far as their browser tells (shown to sales beside the chat) ----------
  function randomId() {
    var bytes = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (x) { return ("0" + x.toString(16)).slice(-2); }).join("");
  }

  // one id per browser links a returning visitor's chats; a visit = a browser tab session
  var visitorKey = get("localStorage", "zx-visitor");
  if (!visitorKey) {
    visitorKey = randomId();
    set("localStorage", "zx-visitor", visitorKey);
  }
  if (!get("localStorage", "zx-first-seen")) set("localStorage", "zx-first-seen", new Date().toISOString());
  if (!get("sessionStorage", "zx-visit")) {
    set("sessionStorage", "zx-visit", "1");
    set("localStorage", "zx-visits", String((Number(get("localStorage", "zx-visits")) || 0) + 1));
    set("sessionStorage", "zx-landing", location.href);
    set("sessionStorage", "zx-first-referrer", document.referrer || "");
  }
  // campaign tags usually sit only on the landing page's address: keep them for the whole visit
  (function () {
    var params = new URLSearchParams(location.search);
    var found = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "msclkid"].forEach(function (k) {
      if (params.get(k)) found[k] = params.get(k);
    });
    if (Object.keys(found).length) set("sessionStorage", "zx-campaign", JSON.stringify(found));
  })();

  var clientPromise = null;
  function clientInfo() {
    if (clientPromise) return clientPromise;
    var nav = navigator;
    var conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    var campaign = null;
    try {
      campaign = JSON.parse(get("sessionStorage", "zx-campaign") || "null");
    } catch {
      campaign = null;
    }
    var info = {
      language: nav.language,
      languages: nav.languages ? Array.prototype.slice.call(nav.languages, 0, 8) : undefined,
      timeZone: (function () {
        try {
          return Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
          return undefined;
        }
      })(),
      utcOffset: -new Date().getTimezoneOffset(),
      screen: window.screen ? { w: screen.width, h: screen.height } : undefined,
      viewport: { w: window.innerWidth, h: window.innerHeight },
      pixelRatio: window.devicePixelRatio,
      touchPoints: nav.maxTouchPoints,
      cores: nav.hardwareConcurrency,
      memoryGb: nav.deviceMemory,
      darkMode: !!(window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches),
      connection: conn ? { type: conn.effectiveType, downlinkMbps: conn.downlink, rttMs: conn.rtt, saveData: conn.saveData } : undefined,
      cookies: nav.cookieEnabled,
      doNotTrack: nav.doNotTrack === "1" || window.doNotTrack === "1",
      campaign: campaign || undefined,
      landing: get("sessionStorage", "zx-landing") || undefined,
      firstReferrer: get("sessionStorage", "zx-first-referrer") || undefined,
      visits: Number(get("localStorage", "zx-visits")) || 1,
      firstSeen: get("localStorage", "zx-first-seen") || undefined,
    };
    var uad = nav.userAgentData;
    // Chrome, Edge and Android tell the device model and OS version when asked
    clientPromise =
      uad && uad.getHighEntropyValues
        ? uad.getHighEntropyValues(["model", "platformVersion", "architecture", "bitness"]).then(
            function (h) {
              info.hints = {
                brands: (uad.brands || [])
                  .filter(function (b) { return !/Not.?A.?Brand/i.test(b.brand); })
                  .map(function (b) { return b.brand + " " + b.version; }),
                mobile: uad.mobile,
                platform: uad.platform,
                platformVersion: h.platformVersion,
                model: h.model,
                architecture: h.architecture,
                bitness: h.bitness,
              };
              return info;
            },
            function () {
              return info;
            },
          )
        : Promise.resolve(info);
    return clientPromise;
  }

  // time on this page (while it is in front) and how far down they scrolled, sent when they leave it
  var pageStart = Date.now();
  var maxScroll = 0;
  function trackScroll() {
    var doc = document.documentElement;
    var pct = Math.round(((window.scrollY + window.innerHeight) / Math.max(doc.scrollHeight, 1)) * 100);
    if (pct > maxScroll) maxScroll = Math.min(pct, 100);
  }
  window.addEventListener("scroll", trackScroll, { passive: true });
  function sendPageTime() {
    if (!token || !pageStart) return;
    var seconds = (Date.now() - pageStart) / 1000;
    pageStart = 0;
    if (seconds < 1) return;
    var body = JSON.stringify({ token: token, url: location.href, seconds: seconds, scroll: maxScroll });
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(BASE + "/api/widget/page", new Blob([body], { type: "text/plain" }))) return;
    } catch {
      /* fall through */
    }
    fetch(BASE + "/api/widget/page", { method: "POST", body: body, headers: { "Content-Type": "text/plain;charset=UTF-8" }, keepalive: true, credentials: "omit" }).catch(function () {});
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") sendPageTime();
    else pageStart = Date.now();
  });
  window.addEventListener("pagehide", sendPageTime);

  // the exact place (area, street): asked once per browser, after they have started a chat, never before
  function askLocation() {
    if (!cfg.preciseLocation || !navigator.geolocation || !window.isSecureContext || get("localStorage", "zx-location-asked")) return;
    set("localStorage", "zx-location-asked", "1");
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        post("location", { token: token, lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy }).catch(function () {});
      },
      function () {
        /* they said no: the city from their IP is still shown */
      },
      { enableHighAccuracy: false, timeout: 20000, maximumAge: 600000 },
    );
  }

  // ---------- network ----------
  function post(path, body) {
    // text/plain keeps this a "simple" request: no CORS preflight
    return fetch(BASE + "/api/widget/" + path, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify(body),
      credentials: "omit",
    }).then(function (res) {
      return res.json().then(
        function (data) {
          if (!res.ok) throw new Error((data && data.error) || "Something went wrong. Please try again.");
          return data;
        },
        function () {
          throw new Error("Something went wrong. Please try again.");
        },
      );
    });
  }

  function start() {
    return clientInfo()
      .then(function (client) {
        return post("session", { token: token, pageUrl: location.href, pageTitle: document.title, referrer: document.referrer, visitorKey: visitorKey, client: client });
      })
      .then(function (data) {
        token = data.token;
        set("localStorage", TOKEN_KEY, token);
        state = data.state;
        ratingDone = !!state.rated;
        render();
        listen();
      })
      .catch(function () {
        // the portal is unreachable: stay hidden and try again later
        setTimeout(start, 60000);
      });
  }

  function listen() {
    if (source) source.close();
    source = new EventSource(BASE + "/api/widget/stream?token=" + encodeURIComponent(token));
    source.onmessage = function (e) {
      var evt;
      try {
        evt = JSON.parse(e.data);
      } catch {
        return;
      }
      onEvent(evt);
    };
    source.onerror = function () {
      // EventSource reconnects by itself; if the chat is gone, start over after a pause
      if (source && source.readyState === 2) {
        source = null;
        setTimeout(start, 5000);
      }
    };
  }

  function onEvent(evt) {
    if (!state) return;
    if (evt.t === "message") {
      if (!state.messages.some(function (m) { return m.id === evt.message.id; })) state.messages.push(evt.message);
      if (evt.message.sender === "agent") {
        hideTyping();
        if (!open) {
          unread++;
          ding();
        }
      }
      render();
    } else if (evt.t === "state") {
      var wasWaiting = state.status === "waiting";
      state.status = evt.status;
      if (evt.agent) state.agent = evt.agent;
      if (evt.status === "closed") confirmEnd = false;
      // an agent picked up: open the chat so the visitor sees them
      if (wasWaiting && evt.status === "active" && !open) {
        setOpen(true);
        ding();
      }
      render();
    } else if (evt.t === "typing") {
      showTyping();
    } else if (evt.t === "team") {
      state.team = evt.team;
      render();
    }
  }

  // ---------- a soft two-note sound for new replies ----------
  var audio = null;
  function ding() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var now = audio.currentTime;
      [660, 990].forEach(function (f, i) {
        var o = audio.createOscillator();
        var g = audio.createGain();
        o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, now + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.08, now + i * 0.12 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.25);
        o.connect(g).connect(audio.destination);
        o.start(now + i * 0.12);
        o.stop(now + i * 0.12 + 0.3);
      });
    } catch {
      /* the browser has not allowed sound yet */
    }
  }

  // ---------- DOM ----------
  var host = document.createElement("div");
  host.id = "zeronix-chat";
  host.style.cssText = "position:fixed;z-index:2147483000;bottom:0;" + (cfg.left ? "left:0;" : "right:0;");
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  /*
   * Keys and the mouse wheel stay inside the widget. Events from a Shadow DOM reach the page with the widget box as
   * their target instead of the input, so page scripts (SmoothScroll on zeronix.ae) took a space typed in a field for
   * "scroll down", and the wheel scrolled the page instead of the messages.
   */
  ["keydown", "keyup", "keypress", "wheel", "mousewheel", "DOMMouseScroll"].forEach(function (type) {
    host.addEventListener(type, function (e) {
      e.stopPropagation();
    });
  });

  var side = cfg.left ? "left" : "right";
  var css =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:Raleway,Montserrat,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}" +
    "button{font:inherit}" +
    ".launcher{position:fixed;bottom:20px;" + side + ":20px;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;background:linear-gradient(135deg,var(--c),var(--d));color:#fff;box-shadow:0 10px 28px rgba(4,42,45,.35);display:flex;align-items:center;justify-content:center;transition:transform .15s}" +
    ".launcher:hover{transform:scale(1.06)}" +
    ".launcher:focus-visible{outline:3px solid var(--a);outline-offset:3px}" +
    ".launcher svg{width:26px;height:26px}" +
    ".badge{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;border-radius:10px;background:#e11d48;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;border:2px solid #fff}" +
    ".live{position:absolute;bottom:3px;right:3px;width:14px;height:14px;border-radius:50%;background:var(--a);border:2px solid #fff}" +
    ".teaser{position:fixed;bottom:92px;" + side + ":20px;width:290px;background:#fff;color:var(--d);border-radius:16px;box-shadow:0 12px 32px rgba(4,42,45,.2);padding:14px 34px 14px 14px;font-size:14px;line-height:1.45;cursor:pointer;animation:up .25s ease-out;border-top:3px solid var(--c)}" +
    ".teaser .x{position:absolute;top:6px;right:6px;border:0;background:none;font-size:18px;line-height:1;color:#6b7280;cursor:pointer;padding:4px}" +
    ".teaser .who{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:#4b5563}" +
    ".panel{position:fixed;bottom:92px;" + side + ":20px;width:380px;height:580px;max-height:calc(100vh - 112px);background:#fff;color:#1f2937;border-radius:18px;box-shadow:0 18px 50px rgba(4,42,45,.3);display:flex;flex-direction:column;overflow:hidden;animation:up .22s ease-out}" +
    "@keyframes up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}" +
    "@media (max-width:520px){.panel{inset:0;width:auto;height:auto;max-height:none;border-radius:0}.panel-open .launcher{display:none}.teaser{width:calc(100vw - 40px)}}" +
    ".head{background:linear-gradient(135deg,var(--d) 0%,var(--c) 140%);color:#fff;padding:14px 12px 14px 16px;display:flex;align-items:center;gap:10px}" +
    ".head .t{flex:1;min-width:0}" +
    ".head .t b{display:block;font-size:15px;font-weight:700;letter-spacing:.2px}" +
    ".head .t span{display:flex;align-items:center;gap:6px;font-size:12px;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".pulse{width:8px;height:8px;border-radius:50%;background:var(--a);flex-shrink:0;box-shadow:0 0 0 0 rgba(76,175,80,.7);animation:pl 2s infinite}" +
    "@keyframes pl{0%{box-shadow:0 0 0 0 rgba(76,175,80,.6)}70%{box-shadow:0 0 0 7px rgba(76,175,80,0)}100%{box-shadow:0 0 0 0 rgba(76,175,80,0)}}" +
    ".icon{border:0;background:rgba(255,255,255,.14);color:#fff;height:30px;min-width:30px;padding:0 9px;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:600}" +
    ".icon:hover{background:rgba(255,255,255,.26)}" +
    ".icon svg{width:16px;height:16px}" +
    ".stack{display:flex}" +
    ".av{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;border:2px solid #fff;flex-shrink:0;position:relative}" +
    ".stack .av+.av{margin-left:-10px}" +
    ".av.sm{width:26px;height:26px;font-size:10px;border-width:1.5px}" +
    ".av .dot{position:absolute;bottom:-1px;right:-1px;width:9px;height:9px;border-radius:50%;background:var(--a);border:1.5px solid #fff}" +
    ".body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:14px;background:#F2F1ED}" +
    ".msg{display:flex;margin:4px 0}" +
    ".msg.me{justify-content:flex-end}" +
    ".bubble{max-width:82%;padding:9px 13px;border-radius:16px;font-size:14px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}" +
    ".me .bubble{background:var(--c);color:#fff;border-bottom-right-radius:5px}" +
    ".them .bubble{background:#fff;color:#1f2937;border-bottom-left-radius:5px;box-shadow:0 1px 2px rgba(4,42,45,.08)}" +
    ".them{gap:7px;align-items:flex-end}" +
    ".name{font-size:11px;color:#6b7280;margin:8px 0 2px 33px}" +
    ".sys{text-align:center;font-size:12px;color:#6b7280;margin:10px 0}" +
    ".chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px 33px}" +
    ".chip{border:1px solid var(--c);background:#fff;color:var(--d);border-radius:999px;padding:6px 12px;font-size:13px;cursor:pointer;line-height:1.2}" +
    ".chip:hover,.chip.on{background:var(--c);color:#fff}" +
    ".card{background:#fff;border-radius:14px;padding:14px;margin:10px 0;box-shadow:0 2px 10px rgba(4,42,45,.08)}" +
    ".card h4{margin:0 0 4px;font-size:14px;color:var(--d)}" +
    ".card p{margin:0 0 10px;font-size:13px;color:#4b5563;line-height:1.45}" +
    "form.lead{display:grid;gap:9px}" +
    "label{display:grid;gap:3px;font-size:12px;font-weight:600;color:#374151}" +
    "input,textarea{width:100%;border:1px solid #d6d8d3;border-radius:10px;padding:9px 11px;font-size:14px;font-weight:400;color:#111827;background:#fff;outline:none}" +
    "input:focus,textarea:focus{border-color:var(--c);box-shadow:0 0 0 3px rgba(1,146,151,.18)}" +
    "textarea{resize:none}" +
    ".row2{display:grid;grid-template-columns:1fr 1fr;gap:9px}" +
    ".hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}" +
    ".btn{border:0;border-radius:10px;background:var(--c);color:#fff;font-size:14px;font-weight:700;padding:11px 14px;cursor:pointer}" +
    ".btn:hover{filter:brightness(1.07)}" +
    ".btn:disabled{opacity:.6;cursor:default}" +
    ".btn.ghost{background:#fff;color:var(--d);border:1px solid #d6d8d3}" +
    ".btn.dark{background:var(--d)}" +
    ".row-btns{display:grid;grid-template-columns:1fr 1fr;gap:8px}" +
    ".link{border:0;background:none;color:var(--c);font-size:13px;font-weight:600;cursor:pointer;padding:8px 0 0;text-decoration:underline}" +
    ".err{color:#dc2626;font-size:12px;margin:0}" +
    ".note{font-size:12px;color:#4b5563;text-align:center;margin:8px 0}" +
    ".wait{display:flex;gap:10px;align-items:center;background:#fff;border:1px dashed #b8c7c4;border-radius:12px;padding:10px 12px;font-size:13px;color:#475569;margin:10px 0}" +
    ".dots span{display:inline-block;width:6px;height:6px;margin:0 1px;border-radius:50%;background:var(--c);animation:b 1.2s infinite}" +
    ".dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}" +
    "@keyframes b{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}" +
    ".typing{font-size:12px;color:#6b7280;padding:0 16px;height:18px;background:#F2F1ED}" +
    ".compose{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff;align-items:flex-end}" +
    ".compose textarea{max-height:110px;min-height:42px}" +
    ".send{width:42px;height:42px;flex-shrink:0;border:0;border-radius:11px;background:var(--c);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}" +
    ".send:disabled{opacity:.5}" +
    ".send svg{width:18px;height:18px}" +
    ".stars{display:flex;justify-content:center;gap:6px;margin:6px 0 12px}" +
    ".star{border:0;background:none;cursor:pointer;padding:2px;color:#d1d5db;transition:transform .1s}" +
    ".star:hover{transform:scale(1.15)}" +
    ".star svg{width:34px;height:34px}" +
    ".star.on{color:#f5b301}" +
    ".center{text-align:center}" +
    ".foot{padding:12px 14px;border-top:1px solid #e5e7eb;background:#fff}" +
    ".brand{font-size:10px;color:#9ca3af;text-align:center;padding:5px 0 7px;background:#fff}";

  var ICON_CHAT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_MIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
  var ICON_SEND =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';
  var ICON_STAR = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z"/></svg>';

  var PALETTE = ["#019297", "#042A2D", "#0f766e", "#4CAF50", "#0369a1", "#7c3aed", "#b45309", "#be185d"];

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs)
      Object.keys(attrs).forEach(function (k) {
        if (k === "text") node.textContent = attrs[k];
        else if (k === "html") node.innerHTML = attrs[k]; // only ever our own icons
        else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  function avatar(name, small, dot) {
    var h = 0;
    for (var i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    var initials = name
      .split(/\s+/)
      .map(function (p) { return p.charAt(0); })
      .join("")
      .slice(0, 2)
      .toUpperCase();
    var a = el("span", { class: "av" + (small ? " sm" : ""), title: name, text: initials || "?" });
    a.style.background = PALETTE[h % PALETTE.length];
    if (dot) a.appendChild(el("span", { class: "dot" }));
    return a;
  }

  function teamStack(team, small) {
    var stack = el("span", { class: "stack" });
    team.slice(0, 3).forEach(function (p) {
      stack.appendChild(avatar(p.name, small, true));
    });
    return stack;
  }

  function online() {
    return !!(state && state.team && state.team.length);
  }

  function teamLine() {
    var team = (state && state.team) || [];
    if (!team.length) return "We are away. Leave a message, we reply by email";
    var names = team.map(function (p) { return p.name; });
    if (names.length > 3) return names.slice(0, 2).join(", ") + " and " + (names.length - 2) + " more online";
    return names.join(names.length === 2 ? " and " : ", ") + (names.length === 1 ? " is" : " are") + " online now";
  }

  function setOpen(value, focus) {
    open = value;
    set("sessionStorage", OPEN_KEY, open ? "1" : null);
    if (open) {
      unread = 0;
      set("sessionStorage", POPPED_KEY, "1"); // they have seen the chat; no need to pop it up again
      set("sessionStorage", TEASER_KEY, null);
    }
    render();
    if (open && focus !== false) focusInput();
  }

  function focusInput(selector) {
    setTimeout(function () {
      var input = root.querySelector(selector || "[data-focus]");
      if (input) input.focus({ preventScroll: true });
    }, 30);
  }

  // ---------- pop up after a while on the site, or when they scroll far down ----------
  function popup() {
    if (open || !state || state.status === "closed" || get("sessionStorage", POPPED_KEY)) return;
    set("sessionStorage", POPPED_KEY, "1");
    // on a phone a full-screen chat would cover the page: a small invitation instead
    if (window.innerWidth <= 520) {
      set("sessionStorage", TEASER_KEY, "show");
      render();
    } else setOpen(true, false);
  }

  function watchForPopup() {
    if (get("sessionStorage", POPPED_KEY)) return;
    if (cfg.popupDelay > 0) setTimeout(popup, cfg.popupDelay * 1000);
    if (cfg.popupScroll > 0) {
      var onScroll = function () {
        var doc = document.documentElement;
        var seen = (window.scrollY + window.innerHeight) / Math.max(doc.scrollHeight, 1);
        if (seen * 100 >= cfg.popupScroll && doc.scrollHeight > window.innerHeight * 1.3) {
          window.removeEventListener("scroll", onScroll);
          popup();
        }
      };
      window.addEventListener("scroll", onScroll, { passive: true });
    }
  }

  // ---------- typing ----------
  function showTyping() {
    var line = root.querySelector(".typing");
    if (line) line.textContent = ((state.agent && state.agent.name) || "Sales") + " is typing…";
    clearTimeout(typingTimer);
    typingTimer = setTimeout(hideTyping, 5000);
  }
  function hideTyping() {
    clearTimeout(typingTimer);
    var line = root.querySelector(".typing");
    if (line) line.textContent = "";
  }
  function pingTyping() {
    if (!state || state.status !== "active" || Date.now() - lastTypingSent < 3000) return;
    lastTypingSent = Date.now();
    post("typing", { token: token }).catch(function () {});
  }

  // ---------- actions ----------
  var draft = ""; // the message box
  var leadDraft = {}; // the lead form's fields
  var commentText = ""; // the rating comment

  function clearComposer() {
    draft = "";
    if (ui && ui.input) ui.input.value = "";
  }

  function sendLead() {
    var form = root.querySelector("form.lead");
    if (!form || sending) return;
    var data = {};
    ["name", "email", "phone", "company", "website"].forEach(function (k) {
      data[k] = form.elements[k] ? form.elements[k].value : "";
    });
    data.message = draft.trim();
    data.token = token;
    if (data.name.trim().length < 2) {
      formError = "Please enter your name.";
      render();
      return focusInput('[name="name"]');
    }
    sending = true;
    formError = "";
    render();
    post("lead", data)
      .then(function (res) {
        if (res.state) {
          state = res.state;
          ratingDone = !!state.rated;
        }
        sending = false;
        formOpen = false;
        clearComposer();
        render();
        focusInput();
        askLocation();
      })
      .catch(function (e) {
        sending = false;
        formError = e.message;
        render();
      });
  }

  function sendMessage() {
    var text = draft.trim();
    if (!text || sending) return;
    if (!state.leadDone) {
      // keep the question; it goes out with the form
      openForm();
      return;
    }
    sending = true;
    sendError = "";
    clearComposer();
    render();
    post("send", { token: token, body: text })
      .then(function (res) {
        sending = false;
        if (!state.messages.some(function (m) { return m.id === res.message.id; })) state.messages.push(res.message);
        render();
      })
      .catch(function (e) {
        sending = false;
        // give the text back so nothing is lost
        draft = text;
        if (ui && ui.input) ui.input.value = text;
        sendError = e.message;
        render();
      });
  }

  function openForm() {
    if (!formOpen) {
      formOpen = true;
      render();
    }
    focusInput('[name="name"]');
  }

  function callBack() {
    confirmEnd = false;
    note = "Thanks, we will call you back shortly.";
    render();
    post("send", { token: token, body: "📞 Please call me back." })
      .then(function (res) {
        if (!state.messages.some(function (m) { return m.id === res.message.id; })) state.messages.push(res.message);
        render();
      })
      .catch(function (e) {
        note = e.message;
        render();
      });
  }

  function endChat() {
    if (sending) return;
    sending = true;
    render();
    post("close", { token: token })
      .then(function () {
        sending = false;
        confirmEnd = false;
        state.status = "closed";
        render();
      })
      .catch(function (e) {
        sending = false;
        confirmEnd = false;
        sendError = e.message;
        render();
      });
  }

  function sendRating(skip) {
    if (skip || !rating) {
      ratingDone = true;
      return render();
    }
    sending = true;
    render();
    post("feedback", { token: token, rating: rating, tags: tags, comment: commentText })
      .then(function () {
        sending = false;
        ratingDone = true;
        thanks = true;
        render();
      })
      .catch(function () {
        sending = false;
        ratingDone = true;
        render();
      });
  }

  function newChat() {
    state = null;
    rating = 0;
    tags = [];
    commentText = "";
    ratingDone = false;
    thanks = false;
    note = "";
    sendError = "";
    keys = {};
    if (source) source.close();
    source = null;
    start();
  }

  // ---------- render ----------
  /*
   * The widget is built once and then updated in parts: the header, the messages and the bottom bar each redraw only
   * when what they show has changed (`keys`). The message box and the form fields are never replaced while someone
   * types in them, and the panel's slide-in plays only when it opens (redrawing everything made it blink and put the
   * sent text back in the box).
   */
  var ui = null;
  var keys = {};

  function build() {
    root.innerHTML = "";
    root.appendChild(el("style", { text: css }));
    var wrap = el("div");
    wrap.style.setProperty("--c", cfg.color);
    wrap.style.setProperty("--d", cfg.dark);
    wrap.style.setProperty("--a", cfg.accent);
    root.appendChild(wrap);
    var launcher = el("button", {
      class: "launcher",
      type: "button",
      onclick: function () {
        setOpen(!open);
      },
    });
    wrap.appendChild(launcher);
    ui = { wrap: wrap, launcher: launcher, teaser: null, panel: null, head: null, body: null, foot: null, input: null, sendBtn: null, err: null, brand: null };
  }

  function render() {
    if (!ui) build();
    ui.wrap.className = open ? "panel-open" : "";
    ui.launcher.style.display = state ? "" : "none";
    if (!state) return;

    // the round button
    var lk = [open, unread, online()].join("|");
    if (keys.launcher !== lk) {
      keys.launcher = lk;
      ui.launcher.innerHTML = open ? ICON_X : ICON_CHAT;
      ui.launcher.setAttribute("aria-label", open ? "Close chat" : "Chat with sales");
      if (!open && unread) ui.launcher.appendChild(el("span", { class: "badge", text: String(unread) }));
      else if (!open && online()) ui.launcher.appendChild(el("span", { class: "live" }));
    }

    // the small invitation (phones)
    var showTeaser = !open && get("sessionStorage", TEASER_KEY) === "show";
    var tk = showTeaser ? JSON.stringify(state.team) : "";
    if (keys.teaser !== tk) {
      keys.teaser = tk;
      if (ui.teaser) ui.teaser.remove();
      ui.teaser = showTeaser ? teaser() : null;
      if (ui.teaser) ui.wrap.insertBefore(ui.teaser, ui.launcher);
    }

    // the chat panel
    if (open && !ui.panel) {
      ui.panel = el("div", { class: "panel", role: "dialog", "aria-label": cfg.title });
      ui.panel.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        if (confirmEnd) {
          confirmEnd = false;
          render();
        } else setOpen(false);
      });
      ui.head = el("div", { class: "head" });
      ui.body = el("div", { class: "body" });
      ui.foot = el("div");
      ui.panel.appendChild(ui.head);
      ui.panel.appendChild(ui.body);
      ui.panel.appendChild(ui.foot);
      ui.wrap.insertBefore(ui.panel, ui.launcher);
      keys.head = keys.body = keys.foot = null;
    } else if (!open && ui.panel) {
      ui.panel.remove();
      ui.panel = ui.head = ui.body = ui.foot = ui.input = ui.sendBtn = ui.err = ui.brand = null;
    }
    if (ui.panel) {
      renderHead();
      renderBody();
      renderFoot();
    }
  }

  function renderHead() {
    var active = state.status === "active" && state.agent;
    var k = JSON.stringify([state.status, state.agent, state.team, state.leadDone]);
    if (keys.head === k) return;
    keys.head = k;
    var people = active ? [state.agent] : state.team || [];
    var sub = active ? state.agent.name + " · " + state.agent.title : state.status === "closed" ? "Chat ended" : teamLine();
    ui.head.innerHTML = "";
    [
      people.length ? teamStack(people) : null,
      el("div", { class: "t" }, [el("b", { text: cfg.title }), el("span", null, [state.status !== "closed" && (active || online()) ? el("i", { class: "pulse" }) : null, sub])]),
      state.leadDone && state.status !== "closed"
        ? el("button", {
            class: "icon",
            type: "button",
            title: "End chat",
            text: "End",
            onclick: function () {
              confirmEnd = true;
              render();
            },
          })
        : null,
      el("button", {
        class: "icon",
        type: "button",
        title: "Minimise",
        "aria-label": "Minimise chat",
        html: ICON_MIN,
        onclick: function () {
          setOpen(false);
        },
      }),
    ].forEach(function (c) {
      if (c) ui.head.appendChild(c);
    });
  }

  function renderBody() {
    var k = JSON.stringify([
      state.status,
      state.leadDone,
      state.messages.map(function (m) { return m.id; }),
      (state.team || []).map(function (p) { return p.name; }),
      formOpen,
      formError,
      // "Connecting…" / "Ending…" / "Sending…" on the form, the end card and the rating; a plain message send redraws nothing
      sending && ((formOpen && !state.leadDone) || confirmEnd || state.status === "closed"),
      note,
      confirmEnd,
      rating,
      tags,
      ratingDone,
      thanks,
    ]);
    if (keys.body === k) return;
    keys.body = k;
    var body = ui.body;
    var atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 80;
    var top = body.scrollTop;
    // a form field being typed in gets its focus and caret back after the redraw
    var focused = root.activeElement && body.contains(root.activeElement) ? root.activeElement.getAttribute("name") : null;
    body.innerHTML = "";

    if (state.status === "closed" && !ratingDone) body.appendChild(ratingCard());
    else {
      greeting(body);
      state.messages.forEach(function (m, i) {
        if (m.sender === "system") return body.appendChild(el("div", { class: "sys", text: m.body }));
        var mine = m.sender === "visitor";
        var prev = state.messages[i - 1];
        if (!mine && (!prev || prev.sender !== "agent")) body.appendChild(el("div", { class: "name", text: m.name || "Sales" }));
        body.appendChild(el("div", { class: "msg " + (mine ? "me" : "them") }, [mine ? null : avatar(m.name || "Sales", true), el("div", { class: "bubble", text: m.body })]));
      });
      if (!state.leadDone && formOpen && state.status !== "closed") body.appendChild(leadCard());
      if (state.leadDone && state.status === "waiting") {
        body.appendChild(
          el("div", { class: "wait" }, [
            online() ? el("span", { class: "dots" }, [el("span"), el("span"), el("span")]) : null,
            el("span", {
              text: online()
                ? "Connecting you to our sales team…"
                : "Our team is away right now. We have your details and will get back to you by email soon. You can keep writing here.",
            }),
          ]),
        );
      }
      if (note) body.appendChild(el("p", { class: "note", text: note }));
      if (thanks) body.appendChild(el("p", { class: "note", text: "Thank you for your feedback!" }));
      if (confirmEnd && state.status !== "closed") body.appendChild(endCard());
    }

    body.scrollTop = atBottom || confirmEnd ? body.scrollHeight : top;
    if (focused) {
      var f = body.querySelector('[name="' + focused + '"]');
      if (f) {
        f.focus({ preventScroll: true });
        try {
          f.setSelectionRange(f.value.length, f.value.length);
        } catch {
          /* email inputs have no caret position */
        }
      }
    }
  }

  function renderFoot() {
    var mode = state.status === "closed" ? (ratingDone ? "ended" : "none") : confirmEnd ? "none" : "compose";
    if (keys.foot !== mode) {
      keys.foot = mode;
      ui.foot.innerHTML = "";
      ui.input = ui.sendBtn = ui.err = ui.brand = null;
      if (mode === "ended") {
        ui.foot.appendChild(
          el("div", { class: "foot center" }, [
            el("p", { class: "note", text: "This chat has ended. Thank you for contacting Zeronix." }),
            el("button", { class: "btn", type: "button", text: "Start a new chat", onclick: newChat }),
          ]),
        );
      } else if (mode === "compose") {
        ui.foot.appendChild(el("div", { class: "typing", "aria-live": "polite" }));
        ui.err = el("p", { class: "err", role: "alert", style: "padding:0 14px 4px;background:#F2F1ED" });
        ui.foot.appendChild(ui.err);
        ui.input = el("textarea", { name: "body", rows: "1", maxlength: "2000", "aria-label": "Message", "data-focus": "1" });
        ui.input.value = draft;
        ui.input.addEventListener("input", function () {
          draft = ui.input.value;
          // they started typing: ask who they are, right in the chat
          if (!state.leadDone && draft.trim() && !formOpen) {
            formOpen = true;
            render();
            return;
          }
          pingTyping();
        });
        ui.input.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            sendMessage();
          }
        });
        ui.sendBtn = el("button", { class: "send", type: "button", "aria-label": "Send", html: ICON_SEND, onclick: sendMessage });
        ui.foot.appendChild(el("div", { class: "compose" }, [ui.input, ui.sendBtn]));
        ui.brand = el("div", { class: "brand", text: "Your details are only used to reply to you." });
        ui.foot.appendChild(ui.brand);
      }
    }
    // small changes in place, so the message box is never replaced while typing
    if (mode === "compose") {
      ui.input.placeholder = state.leadDone ? "Write a message…" : "Type your question…";
      ui.sendBtn.disabled = sending;
      ui.err.textContent = sendError;
      ui.err.style.display = sendError ? "" : "none";
      ui.brand.style.display = state.leadDone ? "none" : "";
    }
  }

  function teaser() {
    return el(
      "div",
      {
        class: "teaser",
        role: "button",
        tabindex: "0",
        onclick: function () {
          setOpen(true);
        },
      },
      [
        el("button", {
          class: "x",
          type: "button",
          "aria-label": "Dismiss",
          text: "×",
          onclick: function (e) {
            e.stopPropagation();
            set("sessionStorage", TEASER_KEY, null);
            render();
          },
        }),
        online() ? el("div", { class: "who" }, [teamStack(state.team, true), el("span", { text: teamLine() })]) : null,
        el("div", { text: cfg.greeting }),
      ],
    );
  }

  function greeting(body) {
    var who = online() ? state.team[0].name : cfg.title;
    body.appendChild(el("div", { class: "name", text: online() ? who + " · " + (state.team[0].title || "Sales") : cfg.title }));
    body.appendChild(el("div", { class: "msg them" }, [avatar(who, true), el("div", { class: "bubble", text: cfg.greeting })]));
    if (!state.leadDone && !formOpen && cfg.quick.length) {
      var chips = el("div", { class: "chips" });
      cfg.quick.forEach(function (q) {
        chips.appendChild(
          el("button", {
            class: "chip",
            type: "button",
            text: q,
            onclick: function () {
              draft = q;
              if (ui.input) ui.input.value = q;
              openForm();
            },
          }),
        );
      });
      body.appendChild(chips);
    }
  }

  function field(label, name, type, required, extra) {
    var input = el("input", Object.assign({ name: name, type: type, autocomplete: name === "company" ? "organization" : name === "phone" ? "tel" : name }, extra || {}));
    if (required) input.required = true;
    input.value = leadDraft[name] || "";
    input.addEventListener("input", function () {
      leadDraft[name] = input.value;
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        sendLead();
      }
    });
    return el("label", null, [label + (required ? " *" : ""), input]);
  }

  function leadCard() {
    var form = el("form", {
      class: "lead",
      novalidate: "",
      onsubmit: function (e) {
        e.preventDefault();
        sendLead();
      },
    });
    form.appendChild(field("Name", "name", "text", true, { maxlength: "120" }));
    form.appendChild(field("Email", "email", "email", true, { maxlength: "200" }));
    form.appendChild(el("div", { class: "row2" }, [field("Phone", "phone", "tel", false, { maxlength: "40" }), field("Company", "company", "text", false, { maxlength: "160" })]));
    // people never see this; bots fill it in
    form.appendChild(el("div", { class: "hp", "aria-hidden": "true" }, [el("input", { name: "website", tabindex: "-1", autocomplete: "off" })]));
    if (formError) form.appendChild(el("p", { class: "err", role: "alert", text: formError }));
    var btn = el("button", { class: "btn", type: "submit", text: sending ? "Connecting…" : "Start chat" });
    if (sending) btn.disabled = true;
    form.appendChild(btn);
    return el("div", { class: "card" }, [
      el("h4", { text: "Before we connect you" }),
      el("p", { text: online() ? "Tell us who you are and " + state.team[0].name + " will be right with you." : "Tell us who you are so we can reply, even after you leave." }),
      form,
    ]);
  }

  function endCard() {
    return el("div", { class: "card center" }, [
      el("h4", { text: "End this chat?" }),
      el("p", { text: "You can always start a new one. Prefer to talk? We can call you back." }),
      el("div", { class: "row-btns" }, [
        el("button", {
          class: "btn ghost",
          type: "button",
          text: "Keep chatting",
          onclick: function () {
            confirmEnd = false;
            render();
            focusInput();
          },
        }),
        el("button", { class: "btn dark", type: "button", text: sending ? "Ending…" : "End chat", onclick: endChat }),
      ]),
      el("button", { class: "link", type: "button", text: "Request a call back instead", onclick: callBack }),
    ]);
  }

  function ratingCard() {
    var stars = el("div", { class: "stars", role: "radiogroup", "aria-label": "Rate this chat" });
    [1, 2, 3, 4, 5].forEach(function (n) {
      var b = el("button", {
        class: "star" + (n <= rating ? " on" : ""),
        type: "button",
        role: "radio",
        "aria-checked": String(n === rating),
        "aria-label": n + (n === 1 ? " star" : " stars"),
        html: ICON_STAR,
        onclick: function () {
          if ((rating >= 4) !== (n >= 4)) tags = []; // the chips change between good and bad
          rating = n;
          hoverStar = 0;
          render();
        },
      });
      b.addEventListener("mouseenter", function () {
        hoverStar = n;
        paintStars();
      });
      b.addEventListener("mouseleave", function () {
        hoverStar = 0;
        paintStars();
      });
      stars.appendChild(b);
    });

    var children = [el("h4", { text: "How was your chat?" }), el("p", { text: "Your rating helps us serve you better." }), stars];
    if (rating) {
      var chips = el("div", { class: "chips", style: "margin:0 0 10px;justify-content:center" });
      (rating >= 4 ? FEEDBACK_GOOD : FEEDBACK_BAD).forEach(function (t) {
        chips.appendChild(
          el("button", {
            class: "chip" + (tags.indexOf(t) >= 0 ? " on" : ""),
            type: "button",
            "aria-pressed": String(tags.indexOf(t) >= 0),
            text: t,
            onclick: function () {
              var i = tags.indexOf(t);
              if (i >= 0) tags.splice(i, 1);
              else tags.push(t);
              render();
            },
          }),
        );
      });
      children.push(chips);
      var comment = el("textarea", { name: "comment", rows: "2", maxlength: "1000", placeholder: "Anything else you would like to tell us? (optional)", style: "margin-bottom:10px" });
      comment.value = commentText;
      comment.addEventListener("input", function () {
        commentText = comment.value;
      });
      children.push(comment);
    }
    var send = el("button", {
      class: "btn",
      type: "button",
      text: sending ? "Sending…" : "Send feedback",
      onclick: function () {
        sendRating(false);
      },
    });
    if (!rating || sending) send.disabled = true;
    children.push(
      el("div", { class: "row-btns" }, [
        el("button", {
          class: "btn ghost",
          type: "button",
          text: "Skip",
          onclick: function () {
            sendRating(true);
          },
        }),
        send,
      ]),
    );
    return el("div", { class: "card center" }, children);
  }

  // star hover without a redraw
  function paintStars() {
    var shown = hoverStar || rating;
    var all = root.querySelectorAll(".star");
    for (var i = 0; i < all.length; i++) all[i].className = "star" + (i < shown ? " on" : "");
  }

  // ---------- go ----------
  function boot() {
    document.body.appendChild(host);
    render();
    start().then(watchForPopup);
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
