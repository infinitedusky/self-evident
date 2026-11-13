/** Where the proxy of a shared prototype serves its own things from, and the script of the tester's guide tab (share-guide.ts). Nothing here needs Node: a story loads it too. */
export const OWN = '/__self-evident/'

/**
 * The tab, as the script the pages load. Plain JavaScript with no build step and nothing from outside. Everything it
 * shows comes from guide.json as text (never as HTML), and "Go there" only ever goes to a path of this same site.
 */
export const WIDGET = `(() => {
  if (window.__selfEvidentGuide || (window.top !== window.self && !window.__selfEvidentGuideFramed)) return; window.__selfEvidentGuide = true; // once, and not inside a frame of the page (a story sets the flag to show it in one)
  const KEY = 'self-evident-guide';
  const state = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch (e) { return {} } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)) } catch (e) {} };
  const host = document.createElement('div'); host.setAttribute('data-self-evident-guide', '');
  host.style.cssText = 'position:fixed!important;right:16px!important;bottom:16px!important;left:auto!important;top:auto!important;z-index:2147483000!important;margin:0!important;transform:none!important;display:block!important;'; // pinned to the corner, whatever the page's own styles say
  const root = host.attachShadow({ mode: 'open' });
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n };
  const style = el('style'); style.textContent = [
    ':host{all:initial} *{box-sizing:border-box;font-family:system-ui,-apple-system,Segoe UI,sans-serif}',
    '.tab{display:flex;align-items:center;gap:8px;border:0;border-radius:999px;padding:10px 16px;background:#1f2430;color:#fff;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25)} .tab .n{font-weight:400;opacity:.75} .tab .c{font-size:11px}',
    '.tab:hover{background:#2c3342}',
    '.panel{width:min(340px,calc(100vw - 32px));max-height:min(560px,calc(100vh - 32px));overflow:auto;background:#fff;color:#1f2430;border:1px solid #d9dce3;border-radius:14px;box-shadow:0 12px 36px rgba(0,0,0,.28);padding:14px 16px;font-size:14px;line-height:1.45}',
    '.head{display:flex;align-items:center;gap:8px;width:calc(100% + 16px);margin:-6px -8px 6px;padding:6px 8px;border:0;border-radius:8px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer} .head:hover{background:#f0f1f4} .head strong{flex:1;font-size:15px} .head .hide{color:#6b7280;font-size:12px;white-space:nowrap}',
    '.note{color:#6b7280;font-size:12px;margin:0 0 8px} p{margin:0 0 10px}',
    'ol{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:8px}',
    'li{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:start;padding:8px;border:1px solid #e6e8ee;border-radius:10px} li.done{opacity:.6}',
    'li input{margin:3px 0 0;width:16px;height:16px} .t{font-weight:600} .try{color:#4b5563;font-size:13px;margin-top:2px}',
    '.go{display:inline-block;margin-top:6px;font-size:13px;font-weight:600;color:#b45309;text-decoration:none} .go:hover{text-decoration:underline} .here{color:#6b7280;font-weight:400}',
    'label.f{display:block;font-weight:600;margin:4px 0} textarea,input[type=text]{width:100%;border:1px solid #cfd3dc;border-radius:8px;padding:8px;font-size:14px;font-family:inherit;color:inherit;background:#fff} textarea{min-height:76px;resize:vertical}',
    '.row{display:flex;gap:8px;align-items:center;margin-top:8px} .row input{flex:1} .send{border:0;border-radius:8px;padding:8px 14px;background:#b45309;color:#fff;font-weight:600;cursor:pointer} .send:disabled{opacity:.5;cursor:default}',
    '.ok{color:#15803d;font-size:13px;margin-top:8px} .bad{color:#b91c1c;font-size:13px;margin-top:8px}'
  ].join('\\n');
  root.appendChild(style);
  const box = el('div'); root.appendChild(box);
  let data = { title: '', guide: null };
  const here = () => location.pathname + location.search;
  const draw = () => {
    box.textContent = '';
    const steps = (data.guide && data.guide.steps) || []; const done = steps.filter((s, i) => state.done && state.done[i + ':' + s.title]).length;
    const fold = (open) => { state.open = open; save(); draw(); const f = root.querySelector(open ? '.head' : '.tab'); if (f) f.focus() };
    if (!state.open) {
      const b = el('button', 'tab'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', 'What to try: show the guide');
      b.appendChild(el('span', '', 'What to try')); if (steps.length) b.appendChild(el('span', 'n', done + '/' + steps.length)); b.appendChild(el('span', 'c', '\u25B2'));
      b.onclick = () => fold(true); box.appendChild(b); return
    }
    const p = el('div', 'panel'); p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'What to try');
    const head = el('button', 'head'); head.setAttribute('aria-expanded', 'true'); head.setAttribute('aria-label', 'Hide the guide'); head.title = 'Hide (it stays in this corner)';
    head.appendChild(el('strong', '', data.title || 'A prototype')); head.appendChild(el('span', 'hide', 'Hide \\u25BC')); head.onclick = () => fold(false); p.appendChild(head);
    p.onkeydown = (e) => { if (e.key === 'Escape') fold(false) };
    p.appendChild(el('p', 'note', 'This is a prototype with sample data. Nothing here is real, and it may change while you look.'));
    const g = data.guide;
    if (g && g.intro) p.appendChild(el('p', '', g.intro));
    if (g && g.steps && g.steps.length) {
      const ol = el('ol'); state.done = state.done || {};
      g.steps.forEach((s, i) => {
        const id = i + ':' + s.title; const li = el('li', state.done[id] ? 'done' : '');
        const c = el('input'); c.type = 'checkbox'; c.checked = !!state.done[id]; c.setAttribute('aria-label', 'Tried: ' + s.title); c.onchange = () => { state.done[id] = c.checked; save(); draw() };
        const d = el('div'); d.appendChild(el('div', 't', s.title)); if (s.try) d.appendChild(el('div', 'try', s.try));
        if (s.path && s.path.charAt(0) === '/' && s.path.charAt(1) !== '/') {
          if (here() === s.path || location.pathname === s.path) d.appendChild(el('span', 'go here', 'You are here'));
          else { const a = el('a', 'go', 'Go there \\u2192'); a.href = s.path; d.appendChild(a) }
        }
        li.appendChild(c); li.appendChild(d); ol.appendChild(li);
      });
      p.appendChild(ol);
    } else if (!(g && g.intro)) p.appendChild(el('p', '', 'Have a look around, and say what you think below.'));
    const lab = el('label', 'f', 'What do you think?'); p.appendChild(lab);
    const ta = el('textarea'); ta.value = state.draft || ''; ta.setAttribute('aria-label', 'What do you think?'); ta.placeholder = 'What worked, what confused you, what is missing'; ta.oninput = () => { state.draft = ta.value; save(); send.disabled = !ta.value.trim() }; p.appendChild(ta);
    const row = el('div', 'row'); const name = el('input'); name.type = 'text'; name.placeholder = 'Your name (optional)'; name.setAttribute('aria-label', 'Your name'); name.value = state.name || ''; name.oninput = () => { state.name = name.value; save() };
    const send = el('button', 'send', 'Send'); send.disabled = !ta.value.trim(); const said = el('div');
    send.onclick = () => {
      send.disabled = true;
      fetch('${OWN}feedback', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: ta.value, name: name.value, path: here() }) })
        .then((r) => r.ok ? r : r.json().then((j) => { throw new Error(j.error || 'not sent') }, () => { throw new Error('not sent') }))
        .then(() => { state.draft = ''; save(); ta.value = ''; said.className = 'ok'; said.textContent = 'Sent. Thank you. You can send more.' })
        .catch((e) => { said.className = 'bad'; said.textContent = 'Could not send it: ' + (e && e.message || 'try again') + '.'; send.disabled = false });
    };
    row.appendChild(name); row.appendChild(send); p.appendChild(row); p.appendChild(said);
    box.appendChild(p);
  };
  const start = () => { document.documentElement.appendChild(host); // beside the body, not in it: a page that transforms or scrolls its body cannot carry the tab away from the corner
    if (state.open === undefined) state.open = true; draw(); fetch('${OWN}guide.json').then((r) => r.json()).then((j) => { data = j || data; draw() }).catch(() => {}) };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  // A page that changes its address without loading again (a single-page app): keep "You are here" true.
  let last = here(); setInterval(() => { if (here() !== last) { last = here(); if (state.open) { const ta = root.querySelector('textarea'); if (!ta || root.activeElement !== ta) draw() } } }, 800);
})();`
