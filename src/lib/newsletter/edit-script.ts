/**
 * The editor's canvas: the newsletter preview is shown in a sandboxed frame (scripts allowed, but no access to the portal:
 * the frame has no same-origin rights, it can only send messages). This script, which is only ever added to the editor's
 * preview and never to a sent mail, lets a person click a section to select it, type straight into its text, and use the
 * little toolbar above it. Everything the person types is sent to the editor as plain text; the editor owns the design and
 * sends the re-drawn email back, so the preview is always made by the same code that builds the mail.
 */

export const EDIT_CSS = String.raw`
html{overflow:hidden}
body{position:relative;overflow:hidden}
#nl-ui{position:absolute;top:0;left:0;width:0;height:0}
.nl-hover{position:absolute;outline:1px dashed #6B8AFD;outline-offset:-1px;pointer-events:none;z-index:5}
.nl-sel{position:absolute;outline:2px solid #3B6EF5;outline-offset:-2px;pointer-events:none;z-index:6}
.nl-bar{position:absolute;display:flex;align-items:center;gap:1px;background:#111827;color:#fff;border-radius:8px;padding:3px;font:12px/1 Arial,sans-serif;z-index:10;box-shadow:0 4px 14px rgba(0,0,0,.3);white-space:nowrap}
.nl-bar button{all:unset;cursor:pointer;padding:5px 7px;border-radius:5px}
.nl-bar button:hover{background:#374151}
.nl-bar .nl-tag{padding:5px 8px;color:#9CA3AF}
.nl-bar .nl-del:hover{background:#B91C1C}
[data-nl-field]{cursor:text;border-radius:3px;transition:background .1s}
[data-nl-field]:hover{background:rgba(59,110,245,.14)}
.nl-editing{outline:2px solid #3B6EF5;outline-offset:2px;background:rgba(59,110,245,.1)!important;white-space:pre-wrap}
a{cursor:default}
`;

export const EDIT_JS = String.raw`
(function () {
  var root = document.getElementById("nl-root");
  var ui = document.getElementById("nl-ui");
  var sel = root.getAttribute("data-selected") || null;
  var hover = null;
  var editing = null;
  var pending = null;
  var timer = null;

  function post(m) { m.nl = 1; parent.postMessage(m, "*"); }
  function block(id) { return root.querySelector('tbody[data-nl-block="' + id + '"]'); }
  function rect(el) { var r = el.getBoundingClientRect(); return { top: r.top + window.scrollY, left: r.left + window.scrollX, w: r.width, h: r.height }; }
  var lastH = 0;
  function height() { var h = Math.ceil(root.getBoundingClientRect().bottom + window.scrollY); if (h === lastH) return; lastH = h; post({ t: "height", h: h }); }

  function box(el, cls) {
    var r = rect(el);
    var d = document.createElement("div");
    d.className = cls;
    d.style.cssText = "top:" + r.top + "px;left:" + r.left + "px;width:" + r.w + "px;height:" + r.h + "px";
    ui.appendChild(d);
  }

  function bar(el) {
    var r = rect(el);
    var t = document.createElement("div");
    t.className = "nl-bar";
    var items = [["up", "↑", "Move up"], ["down", "↓", "Move down"], ["dup", "Copy", "Duplicate"], ["settings", "Settings", "Section settings"], ["add", "+ Add below", "Add a section below"], ["del", "Delete", "Delete section"]];
    var html = '<span class="nl-tag">' + (el.getAttribute("data-nl-label") || "") + "</span>";
    for (var i = 0; i < items.length; i++) html += '<button type="button" data-act="' + items[i][0] + '" title="' + items[i][2] + '"' + (items[i][0] === "del" ? ' class="nl-del"' : "") + ">" + items[i][1] + "</button>";
    t.innerHTML = html;
    ui.appendChild(t);
    var w = t.offsetWidth;
    var vw = document.documentElement.clientWidth;
    var left = Math.min(Math.max(r.left + r.w / 2 - w / 2, 4), Math.max(vw - w - 4, 4));
    var top = r.top - 38;
    if (top < 4) top = r.top + 6;
    t.style.left = left + "px";
    t.style.top = top + "px";
    t.addEventListener("mousedown", function (e) { e.preventDefault(); });
    t.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (b) post({ t: "act", id: el.getAttribute("data-nl-block"), act: b.getAttribute("data-act") });
    });
  }

  function paint() {
    ui.innerHTML = "";
    if (hover && hover !== sel) { var h = block(hover); if (h) box(h, "nl-hover"); }
    if (sel) {
      var b = block(sel);
      if (b) { box(b, "nl-sel"); bar(b); } else sel = null;
    }
  }

  function select(id) {
    if (id === sel) return;
    sel = id;
    post({ t: "select", id: id });
    paint();
  }

  function value(el) {
    var v = el.contentEditable === "plaintext-only" ? el.textContent : el.innerText;
    v = v.replace(/\r/g, "");
    if (el.hasAttribute("data-single")) v = v.replace(/\n+/g, " ");
    if (el.hasAttribute("data-idx")) v = v.replace(/\|/g, " ");
    return v;
  }

  function send(el, commit) {
    var b = el.closest("tbody[data-nl-block]");
    if (!b) return;
    var v = value(el);
    if (commit) v = v.trim();
    post({ t: "field", id: b.getAttribute("data-nl-block"), key: el.getAttribute("data-nl-field"), idx: el.hasAttribute("data-idx") ? Number(el.getAttribute("data-idx")) : null, part: el.getAttribute("data-part"), value: v, commit: commit });
  }

  function startEdit(el) {
    if (editing === el) return;
    editing = el;
    el.textContent = el.getAttribute("data-raw") || "";
    try { el.contentEditable = "plaintext-only"; } catch (e) {}
    if (el.contentEditable !== "plaintext-only") el.contentEditable = "true";
    el.classList.add("nl-editing");
    el.focus();
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(range);
    paint();
  }

  function stopEdit(el) {
    el.setAttribute("data-raw", value(el).trim());
    send(el, true);
    el.contentEditable = "false";
    el.classList.remove("nl-editing");
    if (editing === el) editing = null;
    schedule(null);
  }

  root.addEventListener("click", function (e) {
    var a = e.target.closest("a");
    if (a) e.preventDefault();
    var b = e.target.closest("tbody[data-nl-block]");
    var f = e.target.closest("[data-nl-field]");
    if (b) select(b.getAttribute("data-nl-block")); else select(null);
    if (f && b) startEdit(f);
  });

  root.addEventListener("focusout", function (e) {
    var f = e.target.closest ? e.target.closest("[data-nl-field]") : null;
    if (f && f === editing) stopEdit(f);
  });

  root.addEventListener("input", function (e) {
    var f = e.target.closest ? e.target.closest("[data-nl-field]") : null;
    if (f && f === editing) { send(f, false); height(); paint(); }
  });

  root.addEventListener("keydown", function (e) {
    var f = e.target.closest ? e.target.closest("[data-nl-field]") : null;
    if (!f || f !== editing) return;
    if (e.key === "Escape" || (e.key === "Enter" && f.hasAttribute("data-single"))) { e.preventDefault(); f.blur(); }
  });

  root.addEventListener("paste", function (e) {
    if (!editing || editing.contentEditable === "plaintext-only") return;
    e.preventDefault();
    var text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  });

  root.addEventListener("mousemove", function (e) {
    var b = e.target.closest("tbody[data-nl-block]");
    var id = b ? b.getAttribute("data-nl-block") : null;
    if (id !== hover) { hover = id; paint(); }
  });
  document.addEventListener("mouseleave", function () { if (hover) { hover = null; paint(); } });

  function apply(m) {
    var d = new DOMParser().parseFromString(m.html, "text/html");
    var nr = d.getElementById("nl-root");
    if (!nr) return;
    document.body.setAttribute("style", d.body.getAttribute("style") || "");
    root.innerHTML = nr.innerHTML;
    sel = m.selected || null;
    hover = null;
    paint();
    height();
  }

  // a new drawing waits until the person has stopped typing, so the caret never jumps
  function schedule(m) {
    if (m) pending = m;
    clearTimeout(timer);
    timer = setTimeout(function () {
      if ((editing && document.hasFocus()) || !pending) return;
      if (editing) editing.blur();
      var p = pending;
      pending = null;
      apply(p);
    }, 180);
  }

  window.addEventListener("message", function (e) {
    var m = e.data;
    if (e.source !== parent || !m || m.nl !== 1) return;
    if (m.t === "render") schedule(m);
    if (m.t === "ping") { lastH = 0; post({ t: "ready" }); height(); }
    if (m.t === "select") { sel = m.id || null; paint(); }
  });
  window.addEventListener("blur", function () { if (editing) editing.blur(); });
  window.addEventListener("resize", function () { paint(); height(); });
  if (window.ResizeObserver) new ResizeObserver(function () { height(); paint(); }).observe(root);

  paint();
  height();
  post({ t: "ready" });
})();
`;
