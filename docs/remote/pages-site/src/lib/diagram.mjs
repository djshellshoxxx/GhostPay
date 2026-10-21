// Tiny vertical-flowchart layout engine. Input: plain data. Output: inline SVG + an automatic text alternative.
// Everything is drawn in a 360-unit-wide portrait viewBox so text stays readable at 375 px phone width and the
// SVG scales (never scrolls). No scripts, no external references, colours come from CSS classes in site.css.

const W = 360;
const M = 16; // outer margin
const FULL = W - 2 * M; // 328
const GAP = 28; // vertical gap between items (arrow lives here)
const HALF_GAP = 12;
const HALF = (FULL - HALF_GAP) / 2; // 158
const LH = 17; // body line height
const BODY = 13;
const TITLE = 14;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Conservative text-width estimate (em fractions); real fonts are usually narrower, never wider than this.
function cw(ch) {
  if ('il.,:;|\'!1 ()[]/'.includes(ch)) return 0.34;
  if ('mwMW@%'.includes(ch)) return 0.9;
  if (ch >= 'A' && ch <= 'Z') return 0.7;
  return 0.58;
}
const width = (s, size) => [...s].reduce((a, c) => a + cw(c), 0) * size;

export function wrap(text, maxW, size = BODY) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line === '' ? word : line + ' ' + word;
      if (line !== '' && width(t, size) > maxW) {
        out.push(line);
        line = word;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

const ACTORS = {
  seller: { label: 'SELLER', cls: 'a-seller' },
  payer: { label: 'PAYER', cls: 'a-payer' },
  chain: { label: 'CHAIN', cls: 'a-chain' },
  relayer: { label: 'RELAYER', cls: 'a-relayer' },
  observer: { label: 'OBSERVER', cls: 'a-observer' },
  receiver: { label: 'RECEIVER', cls: 'a-seller' },
  sender: { label: 'SENDER', cls: 'a-payer' },
  none: { label: '', cls: 'a-none' },
};
const STATUS = {
  built: { label: 'BUILT', cls: 's-built' },
  planned: { label: 'PLANNED', cls: 's-planned' },
  experimental: { label: 'EXPERIMENTAL', cls: 's-exp' },
};

// ---- measuring -------------------------------------------------------------------------------------------------
function measureBox(it, w) {
  const inner = w - 28;
  it._title = wrap(it.title ?? '', inner - (it.n ? 0 : 0), TITLE);
  it._lines = (it.lines ?? []).flatMap((l) => wrap(l, inner, BODY));
  const actor = ACTORS[it.actor ?? 'none'];
  it._tag = actor.label !== '' || it.n !== undefined;
  const h = 12 + (it._tag ? 18 : 0) + it._title.length * 18 + (it._lines.length ? 4 + it._lines.length * LH : 0) + 12;
  it._h = h;
  it._w = w;
}

function measureList(it, w) {
  // entries: {text, status}; text wraps in (w - 28 - badgeW)
  const badgeW = 104;
  it._rows = (it.entries ?? []).map((e) => {
    const lines = wrap(e.text, w - 28 - badgeW - 6, BODY);
    return { ...e, lines, h: Math.max(lines.length * LH, 20) + 8 };
  });
  it._titleLines = wrap(it.title ?? '', w - 28, TITLE);
  it._h = 10 + it._titleLines.length * 18 + 4 + it._rows.reduce((a, r) => a + r.h, 0) + 8;
  it._w = w;
}

function measureNote(it, w) {
  it._lines = (it.lines ?? []).flatMap((l) => wrap(l, w - 28, BODY));
  it._h = 12 + it._lines.length * LH + 8;
  it._w = w;
}

function measure(it, w) {
  if (it.type === 'list') measureList(it, w);
  else if (it.type === 'note') measureNote(it, w);
  else measureBox(it, w);
}

// ---- drawing ---------------------------------------------------------------------------------------------------
function drawBox(it, x, y) {
  const actor = ACTORS[it.actor ?? 'none'];
  const w = it._w;
  const h = it._h;
  let s = `<g class="node ${actor.cls}">`;
  s += `<rect class="box" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>`;
  let ty = y + 12;
  if (it._tag) {
    if (it.n !== undefined) {
      s += `<circle class="badge" cx="${x + 20}" cy="${ty + 8}" r="10"/><text class="badge-n" x="${x + 20}" y="${ty + 12}" text-anchor="middle">${esc(it.n)}</text>`;
      if (actor.label) s += `<text class="tag" x="${x + 38}" y="${ty + 12}">${esc(actor.label)}</text>`;
    } else if (actor.label) s += `<text class="tag" x="${x + 14}" y="${ty + 12}">${esc(actor.label)}</text>`;
    ty += 18;
  }
  for (const l of it._title) {
    s += `<text class="d-title" x="${x + 14}" y="${ty + 13}">${esc(l)}</text>`;
    ty += 18;
  }
  if (it._lines.length) ty += 4;
  for (const l of it._lines) {
    s += `<text class="d-text" x="${x + 14}" y="${ty + 12}">${esc(l)}</text>`;
    ty += LH;
  }
  return s + '</g>';
}

function drawList(it, x, y) {
  const actor = ACTORS[it.actor ?? 'none'];
  let s = `<g class="node ${actor.cls}"><rect class="box" x="${x}" y="${y}" width="${it._w}" height="${it._h}" rx="4"/>`;
  let ty = y + 10;
  for (const l of it._titleLines) {
    s += `<text class="d-title" x="${x + 14}" y="${ty + 13}">${esc(l)}</text>`;
    ty += 18;
  }
  ty += 4;
  for (const r of it._rows) {
    s += `<line class="sep" x1="${x + 10}" y1="${ty}" x2="${x + it._w - 10}" y2="${ty}"/>`;
    r.lines.forEach((l, i) => {
      s += `<text class="d-text" x="${x + 14}" y="${ty + 17 + i * LH - 2}">${esc(l)}</text>`;
    });
    if (r.status) {
      const st = STATUS[r.status];
      const bx = x + it._w - 14 - 100;
      s += `<g class="chip ${st.cls}"><rect x="${bx}" y="${ty + 5}" width="100" height="19" rx="9.5"/><text x="${bx + 50}" y="${ty + 18.5}" text-anchor="middle">${st.label}</text></g>`;
    }
    ty += r.h;
  }
  return s + '</g>';
}

function drawNote(it, x, y) {
  let s = `<g class="node note ${it.tone ? 'tone-' + it.tone : ''}"><rect class="box dashed" x="${x}" y="${y}" width="${it._w}" height="${it._h}" rx="4"/>`;
  let ty = y + 12;
  for (const l of it._lines) {
    s += `<text class="d-text" x="${x + 14}" y="${ty + 12}">${esc(l)}</text>`;
    ty += LH;
  }
  return s + '</g>';
}

function draw(it, x, y) {
  if (it.type === 'list') return drawList(it, x, y);
  if (it.type === 'note') return drawNote(it, x, y);
  return drawBox(it, x, y);
}

function arrow(x1, y1, x2, y2, id) {
  const my = (y1 + y2) / 2;
  const d = x1 === x2 ? `M${x1} ${y1} L${x2} ${y2 - 1}` : `M${x1} ${y1} L${x1} ${my} L${x2} ${my} L${x2} ${y2 - 1}`;
  return `<path class="arrow" d="${d}" marker-end="url(#${id})"/>`;
}

/**
 * spec: { id, title, desc, items: [ item | {row:[item,item]} ], caption }
 * item: {type?: 'step'|'list'|'note', n?, actor?, title, lines?, via?}  (`via` labels the arrow INTO this item)
 */
export function renderDiagram(spec) {
  const id = `dg-${spec.id}`;
  let y = 14;
  const placed = [];
  for (const raw of spec.items) {
    if (raw.row) {
      const its = raw.row;
      its.forEach((it) => measure(it, HALF));
      const h = Math.max(...its.map((i) => i._h));
      its.forEach((i) => (i._h = h));
      placed.push({ kind: 'row', items: its, y, h, via: raw.via });
      y += h + GAP;
    } else {
      measure(raw, FULL);
      placed.push({ kind: 'one', item: raw, y, h: raw._h, via: raw.via });
      y += raw._h + GAP;
    }
  }
  const H = y - GAP + 14;
  let body = '';
  const cx = (p, i) => (p.kind === 'one' ? W / 2 : M + i * (HALF + HALF_GAP) + HALF / 2);
  placed.forEach((p, k) => {
    if (p.kind === 'one') body += draw(p.item, M, p.y);
    else p.items.forEach((it, i) => (body += draw(it, M + i * (HALF + HALF_GAP), p.y)));
    const prev = placed[k - 1];
    if (prev && !(p.item?.type === 'note' && p.item.noArrow) && !p.noArrow) {
      const y1 = prev.y + prev.h;
      const y2 = p.y;
      const pn = prev.kind === 'row' ? prev.items.length : 1;
      const nn = p.kind === 'row' ? p.items.length : 1;
      if (p.item?.noArrow) return;
      if (pn === nn) for (let i = 0; i < pn; i++) body += arrow(cx(prev, i), y1, cx(p, i), y2, id + '-m');
      else if (pn === 1) for (let i = 0; i < nn; i++) body += arrow(cx(prev, 0), y1, cx(p, i), y2, id + '-m');
      else for (let i = 0; i < pn; i++) body += arrow(cx(prev, i), y1, cx(p, 0), y2, id + '-m');
      if (p.via) body += `<text class="via" x="${W / 2 + 8}" y="${(y1 + y2) / 2 + 4}">${esc(p.via)}</text>`;
    }
  });
  const svg =
    `<svg class="dg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="${id}-t ${id}-d" focusable="false">` +
    `<title id="${id}-t">${esc(spec.title)}</title><desc id="${id}-d">${esc(spec.desc)}</desc>` +
    `<defs><marker id="${id}-m" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path class="head" d="M0 0 L10 5 L0 10 z"/></marker></defs>` +
    `<rect class="bg" x="0" y="0" width="${W}" height="${H}"/>` +
    body +
    `</svg>`;

  // text alternative: same content, as an ordered list
  const flat = spec.items.flatMap((i) => (i.row ? i.row : [i]));
  const li = flat
    .map((it) => {
      const actor = ACTORS[it.actor ?? 'none'].label;
      const head = [actor && `${actor[0]}${actor.slice(1).toLowerCase()}`, it.title].filter(Boolean).join(': ');
      let t = `<strong>${esc(head)}</strong>`;
      if (it.lines && it.lines.length) t += ` ${esc(it.lines.join(' '))}`;
      if (it.entries) t += `<ul>${it.entries.map((e) => `<li>${esc(e.text)}${e.status ? ` (${STATUS[e.status].label.toLowerCase()})` : ''}</li>`).join('')}</ul>`;
      if (it.via) t = `<em>${esc(it.via)}.</em> ` + t;
      return `<li>${t}</li>`;
    })
    .join('\n');
  const html =
    `<figure class="diagram" id="fig-${spec.id}">\n${svg}\n<figcaption>${esc(spec.caption ?? spec.title)}</figcaption>\n` +
    `<details class="textalt"><summary>Text version of this diagram</summary><ol>\n${li}\n</ol></details>\n</figure>`;
  return { html, svg, height: H };
}
