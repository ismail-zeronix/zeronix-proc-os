/*!
 * Zeronix website chat widget.
 *
 * Add to the <head> of every page on the website (see widget/README.md):
 *   <script src="https://PORTAL-DOMAIN/widget/zeronix-chat.js" defer></script>
 *
 * The portal address is taken from this script's own src, so the same file works for testing and production.
 * Optional attributes on the <script> tag:
 *   data-color="#1f5fbf"          brand colour of the button and header
 *   data-title="Zeronix Sales"    header title
 *   data-greeting="..."           the small invitation shown next to the button
 *   data-teaser-delay="6"         seconds before the invitation shows (0 = never)
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

  var BASE = new URL(script.src, location.href).origin;
  var cfg = {
    color: script.getAttribute("data-color") || "#1f5fbf",
    title: script.getAttribute("data-title") || "Zeronix Sales",
    greeting: script.getAttribute("data-greeting") || "Hi there 👋 Looking for laptops, servers or IT solutions? Chat with our sales team.",
    teaserDelay: Number(script.getAttribute("data-teaser-delay") || 6),
    left: script.getAttribute("data-position") === "left",
  };
  var TOKEN_KEY = "zx-chat-token";
  var OPEN_KEY = "zx-chat-open";
  var TEASER_KEY = "zx-chat-teaser";

  // ---------- storage (blocked in some private windows) ----------
  function get(store, key) {
    try {
      return window[store].getItem(key);
    } catch (e) {
      return null;
    }
  }
  function set(store, key, value) {
    try {
      if (value == null) window[store].removeItem(key);
      else window[store].setItem(key, value);
    } catch (e) {
      /* ignore */
    }
  }

  // ---------- state ----------
  var token = get("localStorage", TOKEN_KEY);
  var state = null; // { status, leadDone, agent, messages, team }
  var open = get("sessionStorage", OPEN_KEY) === "1";
  var unread = 0;
  var source = null;
  var typingTimer = null;
  var lastTypingSent = 0;
  var sending = false;
  var formError = "";

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
          if (!res.ok) {
            var err = new Error((data && data.error) || "Something went wrong. Please try again.");
            err.status = res.status;
            throw err;
          }
          return data;
        },
        function () {
          throw new Error("Something went wrong. Please try again.");
        },
      );
    });
  }

  function start() {
    return post("session", { token: token, pageUrl: location.href, pageTitle: document.title, referrer: document.referrer })
      .then(function (data) {
        token = data.token;
        set("localStorage", TOKEN_KEY, token);
        state = data.state;
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
      } catch (err) {
        return;
      }
      onEvent(evt);
    };
    source.onerror = function () {
      // EventSource reconnects by itself; if the chat is gone (closed for good), start over after a pause
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
    } catch (e) {
      /* the browser has not allowed sound yet */
    }
  }

  // ---------- DOM ----------
  var host = document.createElement("div");
  host.id = "zeronix-chat";
  host.style.cssText = "position:fixed;z-index:2147483000;bottom:0;" + (cfg.left ? "left:0;" : "right:0;");
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var css =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif}" +
    ".launcher{position:fixed;bottom:20px;" + (cfg.left ? "left" : "right") + ":20px;width:58px;height:58px;border-radius:50%;border:0;cursor:pointer;background:var(--c);color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.22);display:flex;align-items:center;justify-content:center;transition:transform .15s}" +
    ".launcher:hover{transform:scale(1.06)}" +
    ".launcher:focus-visible{outline:3px solid rgba(0,0,0,.35);outline-offset:2px}" +
    ".launcher svg{width:26px;height:26px}" +
    ".badge{position:absolute;top:-3px;right:-3px;min-width:20px;height:20px;border-radius:10px;background:#e11d48;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;padding:0 5px;border:2px solid #fff}" +
    ".live{position:absolute;bottom:2px;right:2px;width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid #fff}" +
    ".teaser{position:fixed;bottom:90px;" + (cfg.left ? "left" : "right") + ":20px;width:280px;background:#fff;color:#111827;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:14px 32px 14px 14px;font-size:14px;line-height:1.45;cursor:pointer;animation:up .25s ease-out}" +
    ".teaser .x{position:absolute;top:6px;right:6px;border:0;background:none;font-size:18px;line-height:1;color:#6b7280;cursor:pointer;padding:4px}" +
    ".teaser .who{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:12px;color:#4b5563}" +
    ".panel{position:fixed;bottom:90px;" + (cfg.left ? "left" : "right") + ":20px;width:370px;height:560px;max-height:calc(100vh - 110px);background:#fff;color:#111827;border-radius:16px;box-shadow:0 16px 48px rgba(0,0,0,.25);display:flex;flex-direction:column;overflow:hidden;animation:up .2s ease-out}" +
    "@keyframes up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}" +
    "@media (max-width:480px){.panel{inset:0;width:auto;height:auto;max-height:none;border-radius:0}.panel-open .launcher{display:none}.teaser{width:calc(100vw - 40px)}}" +
    ".head{background:var(--c);color:#fff;padding:14px 12px 14px 16px;display:flex;align-items:center;gap:10px}" +
    ".head .t{flex:1;min-width:0}" +
    ".head .t b{display:block;font-size:15px}" +
    ".head .t span{display:block;font-size:12px;opacity:.9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".icon{border:0;background:rgba(255,255,255,.15);color:#fff;width:30px;height:30px;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px}" +
    ".icon:hover{background:rgba(255,255,255,.28)}" +
    ".icon svg{width:16px;height:16px}" +
    ".stack{display:flex}" +
    ".av{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;border:2px solid #fff;flex-shrink:0;position:relative}" +
    ".stack .av+.av{margin-left:-9px}" +
    ".av.sm{width:24px;height:24px;font-size:10px;border-width:1.5px}" +
    ".av .dot{position:absolute;bottom:-1px;right:-1px;width:9px;height:9px;border-radius:50%;background:#22c55e;border:1.5px solid #fff}" +
    ".body{flex:1;overflow-y:auto;padding:14px;background:#f8fafc}" +
    ".intro{font-size:14px;line-height:1.5;margin:0 0 12px;color:#374151}" +
    "form.lead{display:grid;gap:9px}" +
    "label{display:grid;gap:3px;font-size:12px;font-weight:600;color:#374151}" +
    "input,textarea{width:100%;border:1px solid #d1d5db;border-radius:9px;padding:9px 10px;font-size:14px;font-weight:400;color:#111827;background:#fff;outline:none}" +
    "input:focus,textarea:focus{border-color:var(--c);box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 20%,transparent)}" +
    "textarea{resize:none}" +
    ".row2{display:grid;grid-template-columns:1fr 1fr;gap:9px}" +
    ".hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}" +
    ".btn{border:0;border-radius:9px;background:var(--c);color:#fff;font-size:14px;font-weight:600;padding:11px 14px;cursor:pointer}" +
    ".btn:disabled{opacity:.6;cursor:default}" +
    ".err{color:#dc2626;font-size:12px;margin:0}" +
    ".note{font-size:11px;color:#6b7280;margin:0;text-align:center}" +
    ".msg{display:flex;margin:4px 0}" +
    ".msg.me{justify-content:flex-end}" +
    ".bubble{max-width:80%;padding:8px 12px;border-radius:16px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere}" +
    ".me .bubble{background:var(--c);color:#fff;border-bottom-right-radius:5px}" +
    ".them .bubble{background:#fff;border:1px solid #e5e7eb;border-bottom-left-radius:5px}" +
    ".them{gap:7px;align-items:flex-end}" +
    ".name{font-size:11px;color:#6b7280;margin:8px 0 2px 31px}" +
    ".sys{text-align:center;font-size:12px;color:#6b7280;margin:10px 0}" +
    ".wait{display:flex;gap:10px;align-items:center;background:#fff;border:1px dashed #cbd5e1;border-radius:12px;padding:10px 12px;font-size:13px;color:#475569;margin:10px 0}" +
    ".dots span{display:inline-block;width:6px;height:6px;margin:0 1px;border-radius:50%;background:#94a3b8;animation:b 1.2s infinite}" +
    ".dots span:nth-child(2){animation-delay:.2s}.dots span:nth-child(3){animation-delay:.4s}" +
    "@keyframes b{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}" +
    ".typing{font-size:12px;color:#6b7280;padding:0 16px;height:18px}" +
    ".compose{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff;align-items:flex-end}" +
    ".compose textarea{max-height:110px;min-height:40px}" +
    ".send{width:40px;height:40px;flex-shrink:0;border:0;border-radius:10px;background:var(--c);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center}" +
    ".send:disabled{opacity:.5}" +
    ".send svg{width:18px;height:18px}" +
    ".ended{padding:14px;border-top:1px solid #e5e7eb;background:#fff;text-align:center;display:grid;gap:8px;font-size:13px;color:#4b5563}" +
    ".brand{font-size:10px;color:#9ca3af;text-align:center;padding:4px 0 6px;background:#fff}";

  var ICON_CHAT =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_X =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  var ICON_MIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>';
  var ICON_SEND =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>';

  var PALETTE = ["#2563eb", "#0f766e", "#b45309", "#7c3aed", "#be185d", "#0369a1", "#4d7c0f", "#b91c1c"];

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

  function teamLine() {
    var team = (state && state.team) || [];
    if (!team.length) return "We're away right now. Leave a message and we'll email you.";
    var names = team.map(function (p) { return p.name; });
    if (names.length > 3) return names.slice(0, 2).join(", ") + " and " + (names.length - 2) + " more are online";
    return names.join(names.length === 2 ? " and " : ", ") + (names.length === 1 ? " is" : " are") + " online now";
  }

  function setOpen(value) {
    open = value;
    set("sessionStorage", OPEN_KEY, open ? "1" : null);
    if (open) {
      unread = 0;
      set("sessionStorage", TEASER_KEY, "1"); // they found the chat; no need to invite again
    }
    render();
    if (open) focusInput();
  }

  function focusInput() {
    setTimeout(function () {
      var input = root.querySelector("[data-focus]");
      if (input) input.focus();
    }, 30);
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
  function sendLead(form) {
    var data = {};
    ["name", "email", "phone", "company", "message", "website"].forEach(function (k) {
      data[k] = form.elements[k] ? form.elements[k].value : "";
    });
    data.token = token;
    sending = true;
    formError = "";
    render();
    post("lead", data)
      .then(function (res) {
        if (res.state) state = res.state;
        sending = false;
        render();
        focusInput();
      })
      .catch(function (e) {
        sending = false;
        formError = e.message;
        render();
      });
  }

  function sendMessage(input) {
    var text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    input.value = "";
    post("send", { token: token, body: text })
      .then(function (res) {
        sending = false;
        if (!state.messages.some(function (m) { return m.id === res.message.id; })) state.messages.push(res.message);
        render();
        focusInput();
      })
      .catch(function (e) {
        sending = false;
        input.value = text;
        alert(e.message);
      });
  }

  function endChat() {
    if (!confirm("End this chat?")) return;
    post("close", { token: token }).catch(function () {});
  }

  function newChat() {
    state = null;
    if (source) source.close();
    source = null;
    start();
  }

  // ---------- render ----------
  var draft = "";
  var leadDraft = {};

  function render() {
    // keep what the visitor is typing across re-renders
    var box = root.querySelector(".compose textarea");
    if (box) draft = box.value;
    var form = root.querySelector("form.lead");
    if (form)
      ["name", "email", "phone", "company", "message"].forEach(function (k) {
        leadDraft[k] = form.elements[k].value;
      });
    var focused = root.activeElement && root.activeElement.getAttribute && root.activeElement.getAttribute("name");
    var scroller = root.querySelector(".body");
    var atBottom = !scroller || scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 60;

    root.innerHTML = "";
    root.appendChild(el("style", { text: css }));
    var wrap = el("div", { class: open ? "panel-open" : "" });
    wrap.style.setProperty("--c", cfg.color);
    root.appendChild(wrap);
    if (!state) return;

    if (open) wrap.appendChild(panel());
    else if (get("sessionStorage", TEASER_KEY) === "show") wrap.appendChild(teaser());

    var launcher = el("button", {
      class: "launcher",
      type: "button",
      "aria-label": open ? "Close chat" : "Chat with sales",
      html: open ? ICON_X : ICON_CHAT,
      onclick: function () {
        setOpen(!open);
      },
    });
    if (!open && unread) launcher.appendChild(el("span", { class: "badge", text: String(unread) }));
    else if (!open && state.team && state.team.length) launcher.appendChild(el("span", { class: "live" }));
    wrap.appendChild(launcher);

    var body = root.querySelector(".body");
    if (body && atBottom) body.scrollTop = body.scrollHeight;
    if (focused) {
      var again = root.querySelector('[name="' + focused + '"]');
      if (again) {
        again.focus();
        try {
          again.setSelectionRange(again.value.length, again.value.length);
        } catch (e) {
          /* email inputs have no caret position */
        }
      }
    }
  }

  function teaser() {
    var team = state.team || [];
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
            set("sessionStorage", TEASER_KEY, "1");
            render();
          },
        }),
        team.length ? el("div", { class: "who" }, [teamStack(team, true), el("span", { text: teamLine() })]) : null,
        el("div", { text: cfg.greeting }),
      ],
    );
  }

  function panel() {
    var p = el("div", { class: "panel", role: "dialog", "aria-label": cfg.title });
    p.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });

    // header: who is helping, or who is online
    var sub =
      state.status === "active" && state.agent
        ? state.agent.name + " · " + state.agent.title
        : state.status === "closed"
          ? "Chat ended"
          : teamLine();
    var people = state.status === "active" && state.agent ? [state.agent] : state.team || [];
    var head = el("div", { class: "head" }, [
      people.length ? teamStack(people) : null,
      el("div", { class: "t" }, [el("b", { text: cfg.title }), el("span", { text: sub })]),
      state.leadDone && state.status !== "closed" ? el("button", { class: "icon", type: "button", title: "End chat", "aria-label": "End chat", text: "End", onclick: endChat }) : null,
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
    ]);
    p.appendChild(head);

    var body = el("div", { class: "body" });
    p.appendChild(body);

    if (!state.leadDone) {
      body.appendChild(el("p", { class: "intro", text: (state.team && state.team.length ? "Our sales team is online. " : "") + "Tell us a little about you and we'll connect you straight away." }));
      body.appendChild(leadForm());
      p.appendChild(el("div", { class: "brand", text: "Your details are only used to reply to you." }));
      return p;
    }

    state.messages.forEach(function (m, i) {
      if (m.sender === "system") return body.appendChild(el("div", { class: "sys", text: m.body }));
      var mine = m.sender === "visitor";
      var prev = state.messages[i - 1];
      if (!mine && (!prev || prev.sender !== "agent")) body.appendChild(el("div", { class: "name", text: m.name || "Sales" }));
      body.appendChild(el("div", { class: "msg " + (mine ? "me" : "them") }, [mine ? null : avatar(m.name || "Sales", true), el("div", { class: "bubble", text: m.body })]));
    });

    if (state.status === "waiting") {
      var online = state.team && state.team.length;
      body.appendChild(
        el("div", { class: "wait" }, [
          online ? el("span", { class: "dots" }, [el("span"), el("span"), el("span")]) : null,
          el("span", {
            text: online
              ? "Connecting you to our sales team…"
              : "Our team is away right now. We have your details and will get back to you by email soon. You can keep writing here.",
          }),
        ]),
      );
    }

    if (state.status === "closed") {
      p.appendChild(
        el("div", { class: "ended" }, [
          el("span", { text: "This chat has ended. Thank you for contacting Zeronix." }),
          el("button", { class: "btn", type: "button", text: "Start a new chat", onclick: newChat }),
        ]),
      );
      return p;
    }

    p.appendChild(el("div", { class: "typing", "aria-live": "polite" }));
    var input = el("textarea", { name: "body", rows: "1", maxlength: "2000", placeholder: "Write a message…", "aria-label": "Message", "data-focus": "1" });
    input.value = draft;
    input.addEventListener("input", function () {
      draft = input.value;
      pingTyping();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        sendMessage(input);
        draft = "";
      }
    });
    var sendBtn = el("button", {
      class: "send",
      type: "button",
      "aria-label": "Send",
      html: ICON_SEND,
      onclick: function () {
        sendMessage(input);
        draft = "";
      },
    });
    p.appendChild(el("div", { class: "compose" }, [input, sendBtn]));
    return p;
  }

  function field(label, name, type, required, extra) {
    var input = el(type === "textarea" ? "textarea" : "input", Object.assign({ name: name, autocomplete: name === "company" ? "organization" : name === "phone" ? "tel" : name }, extra || {}));
    if (type !== "textarea") input.type = type;
    if (required) input.required = true;
    input.value = leadDraft[name] || "";
    return el("label", null, [label + (required ? " *" : ""), input]);
  }

  function leadForm() {
    var form = el("form", {
      class: "lead",
      novalidate: "",
      onsubmit: function (e) {
        e.preventDefault();
        sendLead(form);
      },
    });
    var name = field("Name", "name", "text", true, { maxlength: "120", "data-focus": "1" });
    form.appendChild(name);
    form.appendChild(field("Email", "email", "email", true, { maxlength: "200" }));
    form.appendChild(el("div", { class: "row2" }, [field("Phone", "phone", "tel", false, { maxlength: "40" }), field("Company", "company", "text", false, { maxlength: "160" })]));
    form.appendChild(field("How can we help?", "message", "textarea", false, { rows: "3", maxlength: "2000", placeholder: "e.g. 20 business laptops, quote needed" }));
    // people never see this; bots fill it in
    form.appendChild(el("div", { class: "hp", "aria-hidden": "true" }, [el("input", { name: "website", tabindex: "-1", autocomplete: "off" })]));
    if (formError) form.appendChild(el("p", { class: "err", role: "alert", text: formError }));
    var btn = el("button", { class: "btn", type: "submit", text: sending ? "Starting…" : "Start chat" });
    if (sending) btn.disabled = true;
    form.appendChild(btn);
    return form;
  }

  // ---------- go ----------
  function boot() {
    document.body.appendChild(host);
    render();
    start().then(function () {
      if (cfg.teaserDelay > 0 && !get("sessionStorage", TEASER_KEY))
        setTimeout(function () {
          if (open || get("sessionStorage", TEASER_KEY)) return;
          set("sessionStorage", TEASER_KEY, "show");
          render();
        }, cfg.teaserDelay * 1000);
    });
  }
  if (document.body) boot();
  else document.addEventListener("DOMContentLoaded", boot);
})();
