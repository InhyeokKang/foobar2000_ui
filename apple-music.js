// ==PREPROCESSOR==
// @name "Studio Player"
// ==/PREPROCESSOR==

// =============================================================================
//  Studio Player — a light, card based player UI for foobar2000
// -----------------------------------------------------------------------------
//  Written for JScript Panel 3 (foobar2000 v2), which draws with Direct2D and
//  DirectWrite. One file; the "Studio.Mode" property picks what it draws:
//
//      all     - the whole app: top bar, artwork card, track list, bottom bar
//      art     - just the artwork card and transport
//      list    - just the track list
//      bar     - just the bottom bar (now playing + seek + volume)
//      auto    - picks one from the panel proportions
//
//  Icons are SVG, rendered by the component's own resvg backend.
//  Right click anywhere for theme, mode and the foobar2000 menus.
// =============================================================================

// ------------------------------------------------------------- CONSTANTS ----

var DPI = window.DPI;

var TEXT_LEFT = 0, TEXT_RIGHT = 1, TEXT_CENTRE = 2;
var PARA_TOP = 0, PARA_BOTTOM = 1, PARA_CENTRE = 2;
var WRAP_ON = 0, WRAP_OFF = 1;
var TRIM_NONE = 0, TRIM_CHAR = 1;

var WEIGHT_NORMAL = 400, WEIGHT_MEDIUM = 500, WEIGHT_SEMIBOLD = 600, WEIGHT_BOLD = 700;

var IDC_ARROW = 32512, IDC_HAND = 32649;
var MK_SHIFT = 4, MK_CTRL = 8;
var VK_RETURN = 13, VK_PRIOR = 33, VK_NEXT = 34, VK_UP = 38, VK_DOWN = 40;
var MF_STRING = 0;

// ---------------------------------------------------------------- COLOUR ----

function RGB(r, g, b) { return (0xff000000 | (r << 16) | (g << 8) | b); }
function RGBA(r, g, b, a) { return ((a << 24) | (r << 16) | (g << 8) | b); }
function setAlpha(colour, a) { return ((colour & 0x00ffffff) | (a << 24)); }

function blend(c1, c2, f) {
    f = Math.max(0, Math.min(1, f));
    var r = Math.round(((c1 >> 16) & 0xff) * (1 - f) + ((c2 >> 16) & 0xff) * f);
    var g = Math.round(((c1 >> 8) & 0xff) * (1 - f) + ((c2 >> 8) & 0xff) * f);
    var b = Math.round((c1 & 0xff) * (1 - f) + (c2 & 0xff) * f);
    return RGB(r, g, b);
}

function hexColour(text, fallback) {
    var m = /^#?([0-9a-fA-F]{6})$/.exec(text || '');
    if (!m) return fallback;
    var v = parseInt(m[1], 16);
    return RGB((v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

function cssColour(colour) {
    var s = (colour & 0xffffff).toString(16);
    while (s.length < 6) s = '0' + s;
    return '#' + s;
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function fmtTime(t) {
    if (!isFinite(t) || t < 0) t = 0;
    t = Math.floor(t);
    var s = t % 60, m = Math.floor(t / 60), h = Math.floor(m / 60);
    if (h > 0) return h + ':' + pad2(m % 60) + ':' + pad2(s);
    return m + ':' + pad2(s);
}

// ------------------------------------------------------------ PROPERTIES ----

var props = {
    mode:      window.GetProperty('Studio.Mode (auto|all|art|list|bar)', 'auto'),
    theme:     window.GetProperty('Studio.Theme (light|dark)', 'light'),
    scale:     window.GetProperty('Studio.Scale %', 100),
    rowHeight: window.GetProperty('Studio.List row height', 46),
    fontFace:  window.GetProperty('Studio.Font', 'Pretendard Variable, Pretendard, SUIT, Wanted Sans, Apple SD Gothic Neo, Segoe UI Variable Display, Segoe UI, Malgun Gothic')
};

var S = clamp(props.scale / 100, 0.5, 3) * (DPI / 96);
function px(v) { return Math.round(v * S); }

// --------------------------------------------------------------- THEMES -----
//  Near-white page, white cards, one near-black accent. The artwork is the
//  only colour on screen.

var THEMES = {
    light: {
        bg:       RGB(0xf1, 0xf2, 0xf6),
        card:     RGB(0xff, 0xff, 0xff),
        text:     RGB(0x16, 0x16, 0x1a),
        sub:      RGB(0x9a, 0x9a, 0xa6),
        faint:    RGB(0xc3, 0xc4, 0xcd),
        line:     RGB(0xe7, 0xe8, 0xee),
        hover:    RGB(0xea, 0xeb, 0xf1),
        ink:      RGB(0x16, 0x16, 0x1a),        // the dark pill / play button
        onInk:    RGB(0xff, 0xff, 0xff),
        track:    RGB(0xe3, 0xe5, 0xec),
        shadow:   RGB(0x8a, 0x97, 0xb5),
        blob:     40                            // how much blurred art bleeds in
    },
    dark: {
        bg:       RGB(0x13, 0x13, 0x17),
        card:     RGB(0x1c, 0x1c, 0x22),
        text:     RGB(0xf4, 0xf4, 0xf7),
        sub:      RGB(0x7c, 0x7c, 0x8a),
        faint:    RGB(0x50, 0x50, 0x5c),
        line:     RGB(0x26, 0x26, 0x2e),
        hover:    RGB(0x24, 0x24, 0x2c),
        ink:      RGB(0xf4, 0xf4, 0xf7),
        onInk:    RGB(0x13, 0x13, 0x17),
        track:    RGB(0x2c, 0x2c, 0x36),
        shadow:   RGB(0x00, 0x00, 0x00),
        blob:     55
    }
};

function pickTheme(name) { return THEMES[name] || THEMES.light; }
var colours = pickTheme(props.theme);

// ----------------------------------------------------------------- FONTS ----

function pickFontName(list) {
    var names = list.split(',');
    for (var i = 0; i < names.length; i++) {
        var n = names[i].replace(/^\s+|\s+$/g, '');
        if (n && utils.CheckFont(n)) return n;
    }
    return 'Segoe UI';
}

var FONT_NAME = pickFontName(props.fontFace);

function makeFont(sizePt, weight) {
    var size = Math.round(sizePt * S * 96 / 72);
    return {
        name: FONT_NAME, size: size, weight: weight,
        str: JSON.stringify({ Name: FONT_NAME, Size: size, Weight: weight })
    };
}

var fonts = {
    display: makeFont(20, WEIGHT_BOLD),
    title:   makeFont(11, WEIGHT_SEMIBOLD),
    row:     makeFont(10.5, WEIGHT_MEDIUM),
    body:    makeFont(10, WEIGHT_NORMAL),
    small:   makeFont(8.5, WEIGHT_MEDIUM),
    tiny:    makeFont(7.5, WEIGHT_NORMAL)
};

function textWidth(s, font) {
    if (!s) return 0;
    try { return utils.CalcTextWidth('' + s, font.name, font.size, font.weight); }
    catch (e) { return 0; }
}

// ------------------------------------------------------------- PRIMITIVES ---

function grad(x1, y1, x2, y2, c1, c2) {
    return JSON.stringify({ Start: [x1, y1], End: [x2, y2], Stops: [[0, c1], [1, c2]] });
}

function fillRound(gr, x, y, w, h, r, colour) {
    if (w <= 0 || h <= 0) return;
    r = Math.min(r, w / 2, h / 2);
    if (r < 1) gr.FillRectangle(x, y, w, h, colour);
    else gr.FillRoundedRectangle(x, y, w, h, r, r, colour);
}

function drawRound(gr, x, y, w, h, r, lw, colour) {
    if (w <= 0 || h <= 0) return;
    r = Math.min(r, w / 2, h / 2);
    if (r < 1) return;
    gr.DrawRoundedRectangle(x, y, w, h, r, r, lw, colour);
}

// A card: white sheet, soft shadow, generous radius.
function card(gr, x, y, w, h, r, colour) {
    for (var i = 8; i > 0; i--) {
        fillRound(gr, x - i, y - i * 0.35 + px(3), w + i * 2, h + i * 2, r + i,
            setAlpha(colours.shadow, 6));
    }
    fillRound(gr, x, y, w, h, r, colour || colours.card);
}

function drawText(gr, s, font, colour, x, y, w, h, align, para) {
    if (s == null || s === '' || w <= 0 || h <= 0) return;
    gr.WriteText('' + s, font.str, colour, x, y, w, h,
        align == null ? TEXT_LEFT : align,
        para == null ? PARA_CENTRE : para,
        WRAP_OFF, TRIM_CHAR);
}

function inRect(rc, x, y, grow) {
    grow = grow || 0;
    return x >= rc.x - grow && x < rc.x + rc.w + grow &&
           y >= rc.y - grow && y < rc.y + rc.h + grow;
}

// ----------------------------------------------------------------- ICONS ----

var SVG = {
    play: '<path d="M8.5 5.4 L18.5 12 L8.5 18.6 Z" fill="%C%" stroke="%C%" stroke-width="1.3" stroke-linejoin="round"/>',

    pause: '<rect x="7.4" y="5.2" width="3.3" height="13.6" rx="1.5" fill="%C%"/>' +
           '<rect x="13.3" y="5.2" width="3.3" height="13.6" rx="1.5" fill="%C%"/>',

    next: '<g fill="%C%" stroke="%C%" stroke-width="1.3" stroke-linejoin="round">' +
          '<path d="M6 6 L14 12 L6 18 Z"/></g>' +
          '<rect x="15.6" y="5.6" width="2.4" height="12.8" rx="1.2" fill="%C%"/>',

    prev: '<g fill="%C%" stroke="%C%" stroke-width="1.3" stroke-linejoin="round">' +
          '<path d="M18 6 L10 12 L18 18 Z"/></g>' +
          '<rect x="6" y="5.6" width="2.4" height="12.8" rx="1.2" fill="%C%"/>',

    shuffle: '<g fill="none" stroke="%C%" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
             '<path d="M2.5 7h3.3c1 0 2 .5 2.6 1.4l5.4 7.2c.6.9 1.6 1.4 2.6 1.4h2.4"/>' +
             '<path d="M2.5 17h3.3c1 0 2-.5 2.6-1.4l1.3-1.7"/>' +
             '<path d="M14 9.9l1.4-1.5c.6-.9 1.6-1.4 2.6-1.4h2.4"/></g>' +
             '<path d="M18.4 4.5 L21.6 7 L18.4 9.5 Z" fill="%C%"/>' +
             '<path d="M18.4 14.5 L21.6 17 L18.4 19.5 Z" fill="%C%"/>',

    repeat: '<g fill="none" stroke="%C%" stroke-width="1.8" stroke-linecap="round">' +
            '<path d="M7.5 7h8a3.6 3.6 0 0 1 3.6 3.6v1.2"/>' +
            '<path d="M16.5 17h-8a3.6 3.6 0 0 1-3.6-3.6v-1.2"/></g>' +
            '<path d="M16.4 4.5 L19.6 7 L16.4 9.5 Z" fill="%C%"/>' +
            '<path d="M7.6 14.5 L4.4 17 L7.6 19.5 Z" fill="%C%"/>',

    repeat1: '<g fill="none" stroke="%C%" stroke-width="1.8" stroke-linecap="round">' +
             '<path d="M7.5 7h8a3.6 3.6 0 0 1 3.6 3.6v1.2"/>' +
             '<path d="M16.5 17h-8a3.6 3.6 0 0 1-3.6-3.6v-1.2"/></g>' +
             '<path d="M16.4 4.5 L19.6 7 L16.4 9.5 Z" fill="%C%"/>' +
             '<path d="M7.6 14.5 L4.4 17 L7.6 19.5 Z" fill="%C%"/>' +
             '<path d="M11.1 10.6l2-1.2h1.1v6.2h-1.6v-4.3l-1 .6z" fill="%C%"/>',

    vol0: '<path d="M4 9.4h3.1L11 5.9v12.2L7.1 14.6H4z" fill="%C%"/>',
    vol1: '<path d="M4 9.4h3.1L11 5.9v12.2L7.1 14.6H4z" fill="%C%"/>' +
          '<path d="M13.8 9.4a3.7 3.7 0 0 1 0 5.2" fill="none" stroke="%C%" stroke-width="1.7" stroke-linecap="round"/>',
    vol2: '<path d="M4 9.4h3.1L11 5.9v12.2L7.1 14.6H4z" fill="%C%"/>' +
          '<g fill="none" stroke="%C%" stroke-width="1.7" stroke-linecap="round">' +
          '<path d="M13.8 9.4a3.7 3.7 0 0 1 0 5.2"/><path d="M16.5 6.6a7.6 7.6 0 0 1 0 10.8"/></g>',

    note: '<path d="M9 17.5a2.5 2.5 0 1 1-2.5-2.5c.5 0 1 .1 1.4.4V5.6l9-2v9.9a2.5 2.5 0 1 1-1.1-2.1V6.8l-6.8 1.5z" fill="%C%"/>',

    queue: '<g fill="none" stroke="%C%" stroke-width="1.9" stroke-linecap="round">' +
           '<path d="M4 7h11"/><path d="M4 12h11"/><path d="M4 17h7"/></g>' +
           '<path d="M17.6 13.5 L21 16 L17.6 18.5 Z" fill="%C%"/>',

    caret: '<path d="M8.8 10.6 L12 13.9 L15.2 10.6 Z" fill="%C%"/>',

    gear: '<g fill="none" stroke="%C%" stroke-width="2.1" stroke-linecap="round"><path d="M18.20 12.00L21.00 12.00"/><path d="M16.38 16.38L18.36 18.36"/><path d="M12.00 18.20L12.00 21.00"/><path d="M7.62 16.38L5.64 18.36"/><path d="M5.80 12.00L3.00 12.00"/><path d="M7.62 7.62L5.64 5.64"/><path d="M12.00 5.80L12.00 3.00"/><path d="M16.38 7.62L18.36 5.64"/></g><circle cx="12" cy="12" r="6.2" fill="none" stroke="%C%" stroke-width="1.8"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="%C%" stroke-width="1.8"/>'
};

var svgCache = {}, svgOrder = [];

function icon(name, size, colour) {
    size = Math.max(4, Math.round(size));
    var key = name + '|' + size + '|' + colour;
    if (svgCache[key] !== undefined) return svgCache[key];
    var img = null;
    try {
        var body = SVG[name];
        if (body) {
            img = utils.LoadSVG('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ' +
                'width="24" height="24">' + body.replace(/%C%/g, cssColour(colour)) + '</svg>', size);
        }
    } catch (e) { img = null; }
    svgCache[key] = img;
    svgOrder.push(key);
    while (svgOrder.length > 240) delete svgCache[svgOrder.shift()];
    return img;
}

function drawIcon(gr, name, cx, cy, size, colour) {
    var img = icon(name, size, colour);
    if (!img) return;
    gr.DrawImage(img, Math.round(cx - img.Width / 2), Math.round(cy - img.Height / 2),
        img.Width, img.Height, 0, 0, img.Width, img.Height);
}

function drawEq(gr, x, y, w, h, colour, phase, animated) {
    var bars = 3, bw = w / (bars * 2 - 1);
    for (var i = 0; i < bars; i++) {
        var f = animated ? 0.35 + 0.65 * Math.abs(Math.sin(phase * 0.11 + i * 1.1))
                         : (i === 1 ? 0.9 : 0.5);
        var bh = Math.max(2, h * f);
        fillRound(gr, x + i * bw * 2, y + h - bh, bw, bh, bw / 2, colour);
    }
}

// -------------------------------------------------------------- ARTWORK -----

var maskCache = {};

function roundMask(size, radius) {
    var key = size + '_' + radius;
    if (maskCache[key]) return maskCache[key];
    try {
        var m = utils.CreateImage(size, size);
        var g = m.GetGraphics();
        fillRound(g, 0, 0, size, size, radius, RGB(0, 0, 0));
        m.ReleaseGraphics();
        maskCache[key] = m;
        return m;
    } catch (e) { return null; }
}

function squareImage(img, size) {
    if (!img || size < 4) return null;
    try {
        var sw = img.Width, sh = img.Height, s = Math.min(sw, sh);
        var out = utils.CreateImage(size, size);
        var g = out.GetGraphics();
        g.DrawImage(img, 0, 0, size, size,
            Math.round((sw - s) / 2), Math.round((sh - s) / 2), s, s);
        out.ReleaseGraphics();
        return out;
    } catch (e) { return null; }
}

function drawArt(gr, img, x, y, size, radius) {
    if (!img) return false;
    var mask = radius > 0 ? roundMask(size, radius) : null;
    if (mask) gr.DrawImageWithMask(img, mask, x, y, size, size);
    else gr.DrawImage(img, x, y, size, size, 0, 0, img.Width, img.Height);
    return true;
}

var tf = {
    title:  fb.TitleFormat('[%title%]'),
    artist: fb.TitleFormat('[%artist%]'),
    album:  fb.TitleFormat('[%album%]'),
    date:   fb.TitleFormat('[%date%]'),
    length: fb.TitleFormat('%length%'),
    secs:   fb.TitleFormat('%length_seconds%'),
    key:    fb.TitleFormat('[%album artist%] // [%album%] // $directory_path(%path%)')
};

function evalTf(fmt, handle) {
    try { return handle ? fmt.EvalWithMetadb(handle) : ''; } catch (e) { return ''; }
}

function getArt(handle) {
    if (!handle) return null;
    try { return handle.GetAlbumArt(); } catch (e) { return null; }
}

// The blurred wash of colour behind the top of the page.
var nowArt = { raw: null };
var blob = { key: '', img: null };

function setNowArt(handle) {
    nowArt.raw = getArt(handle);
    blob.key = ''; blob.img = null;
}

function getBlob(w, h) {
    if (!nowArt.raw || w < 8 || h < 8) return null;
    var key = w + 'x' + h;
    if (blob.key === key && blob.img) return blob.img;
    try {
        var out = utils.CreateImage(w, h);
        var g = out.GetGraphics();
        var raw = nowArt.raw;
        var scale = Math.max(w / raw.Width, h / raw.Height);
        var dw = raw.Width * scale, dh = raw.Height * scale;
        g.DrawImage(raw, (w - dw) / 2, (h - dh) / 2, dw, dh, 0, 0, raw.Width, raw.Height);
        out.ReleaseGraphics();
        out.StackBlur(clamp(Math.round(Math.min(w, h) / 5), 20, 200));
        blob.key = key; blob.img = out;
        return out;
    } catch (e) { return null; }
}

function paintPage(gr, x, y, w, h) {
    gr.FillRectangle(x, y, w, h, colours.bg);
    var W = Math.round(window.Width), H = Math.round(window.Height);
    var img = getBlob(W, H);
    if (!img) return;
    // src and dst share the panel's coordinates, and the fade is measured
    // against the whole panel, so any sub-rectangle lines up with its neighbours
    gr.DrawImage(img, x, y, w, h, x, y, w, h, colours.blob);
    gr.FillRectangle(x, y, w, h, grad(0, 0, 0, H, setAlpha(colours.bg, 30), colours.bg));
}

// -------------------------------------------------------- TRANSPORT STATE ---

// Playback order lives on plman, not fb.
//   0 default · 1 repeat playlist · 2 repeat track · 3 random · 4+ shuffle
function playbackOrder() {
    try { return plman.PlaybackOrder; } catch (e) { return 0; }
}

function setPlaybackOrder(v) {
    try { plman.PlaybackOrder = v; } catch (e) { console.log('Studio: 재생 순서 변경 실패 - ' + e); }
}

function isShuffle() { return playbackOrder() >= 3; }

function repeatMode() {
    var o = playbackOrder();
    return o === 1 ? 1 : (o === 2 ? 2 : 0);
}

function toggleShuffle() { setPlaybackOrder(isShuffle() ? 0 : 4); }

function cycleRepeat() {
    var r = repeatMode();
    setPlaybackOrder(r === 0 ? 1 : (r === 1 ? 2 : 0));
}

function volumeToPos() { return clamp(Math.pow(2, fb.Volume / 10), 0, 1); }
function posToVolume(p) {
    p = clamp(p, 0, 1);
    fb.Volume = p <= 0.0001 ? -100 : Math.max(-100, 10 * Math.log(p) / Math.LN2);
}

function playingLocation() {
    try {
        var loc = plman.GetPlayingItemLocation();
        if (loc && loc.IsValid) return { pl: loc.PlaylistIndex, item: loc.PlaylistItemIndex };
    } catch (e) {}
    return null;
}

var FILTER_ADD = 1;
function playlistCanAdd(pl) {
    if (pl < 0) return false;
    try { return !(plman.GetPlaylistLockFilterMask(pl) & FILTER_ADD); } catch (e) { return true; }
}

// --------------------------------------------------------------- BUTTONS ----

function Button(id, iconFor, action) {
    this.id = id; this.iconFor = iconFor; this.action = action;
    this.x = this.y = this.w = this.h = 0;
}
Button.prototype.place = function (x, y, w, h) {
    this.x = Math.round(x); this.y = Math.round(y);
    this.w = Math.round(w); this.h = Math.round(h);
    return this;
};
Button.prototype.hit = function (x, y) {
    return x >= this.x && x < this.x + this.w && y >= this.y && y < this.y + this.h;
};
Button.prototype.paint = function (gr, scale) {
    var spec = this.iconFor();
    drawIcon(gr, spec[0], this.x + this.w / 2, this.y + this.h / 2, this.h * (scale || 1), spec[1]);
};

function hitButtons(list, x, y) {
    for (var i = 0; i < list.length; i++) if (list[i].hit(x, y)) return list[i];
    return null;
}

// An uncaught throw in a click handler shows foobar2000's modal error box.
// Nothing a button does is worth that; log it and carry on.
function runAction(fn, x, y) {
    try { fn(x, y); }
    catch (e) { console.log('Studio: 동작 실패 - ' + e); }
}

// ---------------------------------------------------------------- TOP BAR ---

function TopBar() {
    this.hover = '';
    var self = this;
    this.buttons = [
        new Button('queue',
            function () { return ['queue', self.hover === 'queue' ? colours.text : colours.sub]; },
            function (x, y) { showPlaylistMenu(x, y); }),
        new Button('gear',
            function () { return ['gear', self.hover === 'gear' ? colours.text : colours.sub]; },
            function (x, y) { openPreferences(x, y); })
    ];
}

TopBar.prototype.setViewport = function (x, y, w, h) {
    this.ox = x; this.oy = y; this.W = w; this.H = h;
    var pad = px(16), size = Math.min(px(30), h - px(10));
    var cy = y + h / 2;
    this.logo = { x: x + pad, y: Math.round(cy - size / 2), w: size, h: size };
    this.name = { x: this.logo.x + size + px(12), y: y, w: 0, h: h };
    var bx = x + w - pad - size;
    for (var i = this.buttons.length - 1; i >= 0; i--) {
        this.buttons[i].place(bx, cy - size / 2, size, size);
        bx -= size + px(10);
    }
    this.name.w = Math.max(px(40), bx + size - this.name.x - px(14));
};

TopBar.prototype.paint = function (gr) {
    var l = this.logo;
    fillRound(gr, l.x, l.y, l.w, l.h, l.w / 2, colours.ink);
    drawIcon(gr, 'note', l.x + l.w / 2, l.y + l.h / 2, l.w * 0.52, colours.onInk);

    var name = '', count = 0;
    try {
        var pl = plman.ActivePlaylist;
        name = pl >= 0 ? plman.GetPlaylistName(pl) : '';
        count = pl >= 0 ? plman.GetPlaylistItemCount(pl) : 0;
    } catch (e) {}
    var w1 = Math.min(textWidth(name, fonts.title) + px(2), this.name.w - px(50));
    drawText(gr, name, fonts.title, this.hover === 'name' ? colours.sub : colours.text,
        this.name.x, this.name.y, w1, this.name.h, TEXT_LEFT);
    drawText(gr, count + '곡', fonts.small, colours.faint,
        this.name.x + w1 + px(8), this.name.y, px(70), this.name.h, TEXT_LEFT);

    for (var i = 0; i < this.buttons.length; i++) this.buttons[i].paint(gr, 0.62);
};

TopBar.prototype.hitTest = function (x, y) {
    var b = hitButtons(this.buttons, x, y);
    if (b) return b.id;
    if (inRect({ x: this.logo.x, y: this.oy, w: this.name.x + this.name.w - this.logo.x, h: this.H }, x, y)) return 'name';
    return '';
};

TopBar.prototype.move = function (x, y) {
    var h = this.hitTest(x, y);
    if (h !== this.hover) {
        this.hover = h;
        window.SetCursor(h ? IDC_HAND : IDC_ARROW);
        window.Repaint();
    }
};
TopBar.prototype.leave = function () { if (this.hover) { this.hover = ''; window.Repaint(); } };

TopBar.prototype.up = function (x, y) {
    var b = hitButtons(this.buttons, x, y);
    if (b) { runAction(b.action, x, y); return; }
    if (this.hitTest(x, y) === 'name') showPlaylistMenu(x, y);
};

// -------------------------------------------------------------- ART CARD ----

function ArtCard() {
    this.hover = '';
    this.phase = 0;
    this.cache = { raw: null, sized: {} };
    var self = this;
    function ink(id) { return self.hover === id ? colours.text : colours.sub; }
    this.buttons = [
        new Button('shuffle', function () { return ['shuffle', isShuffle() ? colours.text : ink('shuffle')]; },
            function () { toggleShuffle(); }),
        new Button('prev', function () { return ['prev', ink('prev')]; }, function () { fb.Prev(); }),
        new Button('play', function () {
            return [(fb.IsPlaying && !fb.IsPaused) ? 'pause' : 'play', colours.text];
        }, function () { fb.PlayOrPause(); }),
        new Button('next', function () { return ['next', ink('next')]; }, function () { fb.Next(); }),
        new Button('repeat', function () {
            var r = repeatMode();
            return [r === 2 ? 'repeat1' : 'repeat', r ? colours.text : ink('repeat')];
        }, function () { cycleRepeat(); })
    ];
}

ArtCard.prototype.setTrack = function (handle) {
    this.metadb = handle;
    this.cache.raw = getArt(handle);
    this.cache.sized = {};
};

ArtCard.prototype.art = function (size) {
    if (!this.cache.raw || size < 4) return null;
    size = Math.round(size);
    if (this.cache.sized[size] === undefined) this.cache.sized[size] = squareImage(this.cache.raw, size);
    return this.cache.sized[size];
};

ArtCard.prototype.setViewport = function (x, y, w, h) {
    this.ox = x; this.oy = y; this.W = w; this.H = h;

    var pad = px(14);
    var big = px(46), small = px(24), gap = px(20);
    var rowH = big + px(18);
    var side = Math.min(w - pad * 2, h - pad * 2 - rowH);
    side = Math.max(px(60), side);
    var cx = x + w / 2;
    var top = y + Math.max(pad, (h - side - rowH) / 2);

    this.card = { x: Math.round(cx - side / 2), y: Math.round(top), w: side, h: side };
    var inner = Math.round(side - px(20));
    this.rcArt = { x: this.card.x + px(10), y: this.card.y + px(10), w: inner, h: inner };

    var rowW = big + (small + gap) * 2;
    this.showOrder = w > px(230);
    if (this.showOrder) rowW += (small + gap) * 2;
    var bx = cx - rowW / 2, by = top + side + px(18);
    if (this.showOrder) { this.buttons[0].place(bx, by + (big - small) / 2, small, small); bx += small + gap; }
    this.buttons[1].place(bx, by + (big - small) / 2, small, small); bx += small + gap;
    this.buttons[2].place(bx, by, big, big); bx += big + gap;
    this.buttons[3].place(bx, by + (big - small) / 2, small, small); bx += small + gap;
    if (this.showOrder) this.buttons[4].place(bx, by + (big - small) / 2, small, small);
};

ArtCard.prototype.paint = function (gr) {
    if (!this.embedded) paintPage(gr, this.ox, this.oy, this.W, this.H);
    var c = this.card, rc = this.rcArt;
    card(gr, c.x, c.y, c.w, c.h, px(18));
    if (!drawArt(gr, this.art(rc.w), rc.x, rc.y, rc.w, px(12))) {
        fillRound(gr, rc.x, rc.y, rc.w, rc.h, px(12), colours.bg);
        drawIcon(gr, 'note', rc.x + rc.w / 2, rc.y + rc.h / 2, rc.w * 0.22, colours.faint);
    }

    for (var i = 0; i < this.buttons.length; i++) {
        var b = this.buttons[i];
        if (!this.showOrder && (b.id === 'shuffle' || b.id === 'repeat')) continue;
        if (b.id === 'play') {
            gr.DrawEllipse(b.x + b.w / 2, b.y + b.h / 2, b.w / 2, b.h / 2, px(1.4),
                this.hover === 'play' ? colours.text : colours.line);
            b.paint(gr, 0.44);
        } else {
            b.paint(gr, 0.72);
        }
    }
};

ArtCard.prototype.move = function (x, y) {
    var b = hitButtons(this.buttons, x, y);
    var h = b ? b.id : '';
    if (h !== this.hover) {
        this.hover = h;
        window.SetCursor(h ? IDC_HAND : IDC_ARROW);
        window.Repaint();
    }
};
ArtCard.prototype.leave = function () { if (this.hover) { this.hover = ''; window.Repaint(); } };
ArtCard.prototype.up = function (x, y) {
    var b = hitButtons(this.buttons, x, y);
    if (b) { runAction(b.action, x, y); window.Repaint(); }
};
ArtCard.prototype.tick = function () { this.phase++; };

// ------------------------------------------------------------ TRACK LIST ----

function TrackList() {
    this.rowH = px(clamp(props.rowHeight, 28, 80));
    this.scroll = 0;
    this.target = 0;
    this.hoverRow = -1;
    this.barHover = false;
    this.dragBar = false;
    this.dragOffset = 0;
    this.phase = 0;
    this.rows = {};
    this.refresh();
}

TrackList.prototype.refresh = function () {
    try {
        this.pl = plman.ActivePlaylist;
        this.items = this.pl >= 0 ? plman.GetPlaylistItems(this.pl) : null;
        this.count = this.items ? this.items.Count : 0;
        this.name = this.pl >= 0 ? plman.GetPlaylistName(this.pl) : '';
        this.total = this.items && this.items.CalcTotalDuration ? this.items.CalcTotalDuration() : 0;
    } catch (e) { this.items = null; this.count = 0; this.name = ''; this.total = 0; }
    this.rows = {};
    this.clampScroll();
};

TrackList.prototype.row = function (i) {
    if (this.rows[i]) return this.rows[i];
    var h = null;
    try { h = this.items.GetItem(i); } catch (e) {}
    var r = {
        handle: h,
        title: evalTf(tf.title, h) || '(제목 없음)',
        artist: evalTf(tf.artist, h),
        length: evalTf(tf.length, h)
    };
    this.rows[i] = r;
    return r;
};

TrackList.prototype.setViewport = function (x, y, w, h) {
    this.ox = x; this.oy = y; this.W = w; this.H = h;
    this.pad = px(4);
    this.headerH = h > px(240) ? px(74) : 0;
    this.top = y + this.headerH;
    this.view = Math.max(0, h - this.headerH);
    this.durW = px(46);
    this.numW = px(26);
    this.clampScroll();
};

TrackList.prototype.maxScroll = function () {
    return Math.max(0, this.count * this.rowH - (this.view || 0));
};
TrackList.prototype.clampScroll = function () {
    var m = this.maxScroll();
    this.target = clamp(this.target, 0, m);
    this.scroll = clamp(this.scroll, 0, m);
};
TrackList.prototype.rowAt = function (y) {
    if (y < this.top) return -1;
    var i = Math.floor((y - this.top + this.scroll) / this.rowH);
    return (i >= 0 && i < this.count) ? i : -1;
};

TrackList.prototype.paint = function (gr) {
    var x0 = this.ox, y0 = this.oy, W = this.W, H = this.H;
    if (!this.embedded) paintPage(gr, x0, y0, W, H);

    if (this.headerH) {
        drawText(gr, this.name || '재생목록', fonts.display, colours.text,
            x0 + px(2), y0 + px(8), W - px(80), px(34), TEXT_LEFT);
        var sub = this.count + ' Songs';
        if (this.total > 0) sub += '  ·  ' + fmtTime(this.total);
        drawText(gr, sub, fonts.small, colours.sub,
            x0 + px(2), y0 + px(42), W - px(80), px(20), TEXT_LEFT);
    }

    if (!this.count) {
        drawText(gr, this.dropActive ? '여기에 놓으면 추가됩니다' : '재생목록이 비어 있습니다',
            fonts.body, this.dropActive ? colours.text : colours.sub,
            x0, this.top, W, px(40), TEXT_CENTRE);
    } else {
        var loc = playingLocation();
        var playingIdx = (loc && loc.pl === this.pl) ? loc.item : -1;
        var first = Math.max(0, Math.floor(this.scroll / this.rowH));
        var last = Math.min(this.count - 1, Math.ceil((this.scroll + this.view) / this.rowH));
        for (var i = first; i <= last; i++) this.paintRow(gr, i, playingIdx);

        // let the list fade out at the bottom instead of being cut off
        var fade = Math.min(px(46), this.view / 3);
        if (this.maxScroll() - this.scroll > 1) {
            gr.FillRectangle(x0, y0 + H - fade, W, fade,
                grad(0, y0 + H - fade, 0, y0 + H, setAlpha(colours.bg, 0), setAlpha(colours.bg, 235)));
        }
    }

    var rc = this.barRect();
    if (rc) fillRound(gr, rc.x, rc.y, rc.w, rc.h, rc.w / 2,
        setAlpha(colours.sub, this.barHover || this.dragBar ? 150 : 60));

    if (this.dropActive) {
        drawRound(gr, x0 + px(2), this.top, W - px(4), Math.max(px(20), this.view - px(2)),
            px(12), px(2), colours.ink);
    }
};

TrackList.prototype.paintRow = function (gr, i, playingIdx) {
    var y = this.top + i * this.rowH - this.scroll;
    var x0 = this.ox, W = this.W, rowH = this.rowH;
    var r = this.row(i);
    var playing = i === playingIdx;
    var selected = false;
    try { selected = plman.IsPlaylistItemSelected(this.pl, i); } catch (e) {}

    var inset = px(2), rh = rowH - px(5);
    if (playing) {
        fillRound(gr, x0 + inset, y + px(2), W - inset * 2, rh, px(12), colours.ink);
    } else if (this.hoverRow === i || selected) {
        fillRound(gr, x0 + inset, y + px(2), W - inset * 2, rh, px(12), colours.hover);
    }

    var textCol = playing ? colours.onInk : colours.text;
    var subCol = playing ? setAlpha(colours.onInk, 160) : colours.sub;
    var x = x0 + px(14);

    if (playing) {
        drawIcon(gr, (fb.IsPlaying && !fb.IsPaused) ? 'pause' : 'play',
            x + this.numW / 2 - px(3), y + rowH / 2, px(13), colours.onInk);
    } else {
        drawText(gr, '' + (i + 1), fonts.small, colours.faint,
            x, y, this.numW, rowH, TEXT_LEFT);
    }
    x += this.numW + px(6);

    var right = x0 + W - px(14) - this.durW;
    var tw = Math.max(px(40), right - x - px(10));
    var titleW = Math.min(tw, textWidth(r.title, fonts.row) + px(4));
    drawText(gr, r.title, fonts.row, textCol, x, y, titleW, rowH, TEXT_LEFT);
    if (r.artist && titleW + px(30) < tw) {
        drawText(gr, r.artist, fonts.small, subCol,
            x + titleW + px(10), y, tw - titleW - px(10), rowH, TEXT_LEFT);
    }
    drawText(gr, r.length, fonts.small, playing ? setAlpha(colours.onInk, 200) : colours.sub,
        right, y, this.durW, rowH, TEXT_RIGHT);
};

TrackList.prototype.barRect = function () {
    var m = this.maxScroll();
    if (m <= 0 || this.view <= 0) return null;
    var total = this.count * this.rowH;
    var h = Math.max(px(28), this.view * this.view / total);
    return { x: this.ox + this.W - px(4), y: this.top + (this.view - h) * (this.scroll / m),
             w: px(3), h: h };
};

TrackList.prototype.wheel = function (step) {
    this.target = clamp(this.target - step * this.rowH * 3, 0, this.maxScroll());
    window.Repaint();
};

TrackList.prototype.tick = function () {
    this.phase++;
    var repaint = false;
    var d = this.target - this.scroll;
    if (Math.abs(d) > 0.5) { this.scroll += d * 0.28; repaint = true; }
    else if (this.scroll !== this.target) { this.scroll = this.target; repaint = true; }
    if (repaint) window.Repaint();
};

TrackList.prototype.move = function (x, y) {
    if (this.dragBar) {
        var m = this.maxScroll(), total = this.count * this.rowH;
        var h = Math.max(px(28), this.view * this.view / total);
        var t = clamp((y - this.dragOffset - this.top) / Math.max(1, this.view - h), 0, 1);
        this.target = this.scroll = t * m;
        window.Repaint();
        return;
    }
    var rc = this.barRect();
    var overBar = !!rc && x >= rc.x - px(6);
    var row = overBar ? -1 : this.rowAt(y);
    if (overBar !== this.barHover || row !== this.hoverRow) {
        this.barHover = overBar;
        this.hoverRow = row;
        window.SetCursor(IDC_ARROW);
        window.Repaint();
    }
};

TrackList.prototype.leave = function () {
    if (this.hoverRow !== -1 || this.barHover) {
        this.hoverRow = -1; this.barHover = false; window.Repaint();
    }
};

TrackList.prototype.down = function (x, y, mask) {
    var rc = this.barRect();
    if (rc && x >= rc.x - px(6) && y >= rc.y && y < rc.y + rc.h) {
        this.dragBar = true;
        this.dragOffset = y - rc.y;
        return;
    }
    var i = this.rowAt(y);
    if (i < 0) return;
    var ctrl = !!(mask & MK_CTRL), shift = !!(mask & MK_SHIFT);
    try {
        if (ctrl) {
            plman.SetPlaylistSelectionSingle(this.pl, i, !plman.IsPlaylistItemSelected(this.pl, i));
        } else if (shift) {
            var from = plman.GetPlaylistFocusItemIndex(this.pl);
            if (from < 0) from = i;
            var a = Math.min(from, i), b = Math.max(from, i), idx = [];
            for (var k = a; k <= b; k++) idx.push(k);
            plman.ClearPlaylistSelection(this.pl);
            plman.SetPlaylistSelection(this.pl, idx, true);
        } else {
            plman.ClearPlaylistSelection(this.pl);
            plman.SetPlaylistSelectionSingle(this.pl, i, true);
        }
        if (!shift) plman.SetPlaylistFocusItem(this.pl, i);
    } catch (e) {}
    window.Repaint();
};

TrackList.prototype.up = function () { if (this.dragBar) { this.dragBar = false; window.Repaint(); } };

TrackList.prototype.dblclick = function (x, y) {
    var i = this.rowAt(y);
    if (i >= 0) { try { plman.ExecutePlaylistDefaultAction(this.pl, i); } catch (e) {} }
};

TrackList.prototype.contextMenu = function (x, y) {
    var i = this.rowAt(y);
    if (i < 0) return false;
    var cmm = null;
    try {
        if (!plman.IsPlaylistItemSelected(this.pl, i)) {
            plman.ClearPlaylistSelection(this.pl);
            plman.SetPlaylistSelectionSingle(this.pl, i, true);
            plman.SetPlaylistFocusItem(this.pl, i);
        }
        cmm = fb.CreateContextMenuManager();
        cmm.InitContext(plman.GetPlaylistSelectedItems(this.pl));
    } catch (e) { cmm = null; }
    var shown = showPanelMenu(x, y, cmm);
    try { if (cmm && cmm.Dispose) cmm.Dispose(); } catch (e) {}
    return shown;
};

TrackList.prototype.ensureVisible = function (i) {
    var y = i * this.rowH;
    if (y < this.target) this.target = y;
    else if (y + this.rowH > this.target + this.view) this.target = y + this.rowH - this.view;
    this.clampScroll();
    window.Repaint();
};

TrackList.prototype.key = function (vkey) {
    var focus = -1;
    try { focus = plman.GetPlaylistFocusItemIndex(this.pl); } catch (e) {}
    if (vkey === VK_UP || vkey === VK_DOWN) {
        var next = clamp(focus + (vkey === VK_DOWN ? 1 : -1), 0, this.count - 1);
        try {
            plman.ClearPlaylistSelection(this.pl);
            plman.SetPlaylistSelectionSingle(this.pl, next, true);
            plman.SetPlaylistFocusItem(this.pl, next);
        } catch (e) {}
        this.ensureVisible(next);
    } else if (vkey === VK_RETURN && focus >= 0) {
        try { plman.ExecutePlaylistDefaultAction(this.pl, focus); } catch (e) {}
    } else if (vkey === VK_PRIOR || vkey === VK_NEXT) {
        this.target = clamp(this.target + (vkey === VK_NEXT ? this.view : -this.view), 0, this.maxScroll());
        window.Repaint();
    }
};

TrackList.prototype.dropTarget = function () { return this.pl; };
TrackList.prototype.setDropActive = function (on) {
    if (this.dropActive !== on) { this.dropActive = on; window.Repaint(); }
};

// ------------------------------------------------------------ BOTTOM BAR ----

function BottomBar() {
    this.hover = '';
    this.dragSeek = false;
    this.dragVol = false;
    this.seekPos = 0;
    this.phase = 0;
    this.cache = { raw: null, sized: {} };
    var self = this;
    this.buttons = [
        new Button('queue',
            function () { return ['queue', self.hover === 'queue' ? colours.text : colours.sub]; },
            function (x, y) { showPlaylistMenu(x, y); })
    ];
}

BottomBar.prototype.setTrack = function (handle) {
    this.metadb = handle;
    this.cache.raw = getArt(handle);
    this.cache.sized = {};
};

BottomBar.prototype.art = function (size) {
    if (!this.cache.raw || size < 4) return null;
    size = Math.round(size);
    if (this.cache.sized[size] === undefined) this.cache.sized[size] = squareImage(this.cache.raw, size);
    return this.cache.sized[size];
};

BottomBar.prototype.setViewport = function (x, y, w, h) {
    this.ox = x; this.oy = y; this.W = w; this.H = h;

    var pad = px(14), cy = y + h / 2;
    var chipH = Math.min(px(42), h - px(10));
    var chipW = clamp(Math.round(w * 0.24), px(120), px(230));
    this.chip = { x: x + pad, y: Math.round(cy - chipH / 2), w: chipW, h: chipH };
    this.rcArt = { x: this.chip.x + px(5), y: this.chip.y + px(5),
                   w: chipH - px(10), h: chipH - px(10) };

    var size = Math.min(px(22), h - px(16));
    var rx = x + w - pad - size;
    this.buttons[0].place(rx, cy - size / 2, size, size);
    rx -= px(14);

    var volW = w > px(560) ? px(80) : 0;
    if (volW) {
        this.rcVol = { x: Math.round(rx - volW), y: Math.round(cy - px(2)), w: volW, h: px(4) };
        this.volIconX = this.rcVol.x - px(15);
        rx = this.volIconX - px(16);
    } else {
        this.rcVol = { x: 0, y: 0, w: 0, h: 0 };
    }

    var sx = this.chip.x + chipW + px(22);
    var timeW = px(38);
    this.rcSeek = { x: Math.round(sx + timeW + px(8)), y: Math.round(cy - px(2)),
                    w: Math.max(px(30), Math.round(rx - sx - timeW * 2 - px(16))), h: px(4) };
    this.elapsed = { x: sx, y: y, w: timeW, h: h };
    this.remain = { x: this.rcSeek.x + this.rcSeek.w + px(8), y: y, w: timeW, h: h };
};

BottomBar.prototype.seekRatio = function () {
    if (this.dragSeek) return this.seekPos;
    var len = fb.PlaybackLength;
    return len > 0 ? clamp(fb.PlaybackTime / len, 0, 1) : 0;
};

BottomBar.prototype.slider = function (gr, rc, ratio, hovered, colour) {
    if (rc.w <= 0) return;
    var r = rc.h / 2;
    fillRound(gr, rc.x, rc.y, rc.w, rc.h, r, colours.track);
    var w = Math.round(rc.w * clamp(ratio, 0, 1));
    if (w > 1) fillRound(gr, rc.x, rc.y, w, rc.h, r, colour);
    var d = hovered ? rc.h * 2.2 : rc.h * 1.5;
    gr.FillEllipse(rc.x + w, rc.y + rc.h / 2, d, d, colour);
};

BottomBar.prototype.paint = function (gr) {
    // always opaque: the list's last row can reach past its own box, and this
    // band is where the page's blur has already faded to the flat background
    gr.FillRectangle(this.ox, this.oy, this.W, this.H, colours.bg);
    gr.FillRectangle(this.ox, this.oy, this.W, 1, colours.line);

    var c = this.chip, rc = this.rcArt, playing = !!this.metadb;
    fillRound(gr, c.x, c.y, c.w, c.h, px(12), colours.card);
    if (!drawArt(gr, this.art(rc.w), rc.x, rc.y, rc.w, px(8))) {
        fillRound(gr, rc.x, rc.y, rc.w, rc.h, px(8), colours.bg);
        drawIcon(gr, 'note', rc.x + rc.w / 2, rc.y + rc.h / 2, rc.w * 0.5, colours.faint);
    }
    var tx = rc.x + rc.w + px(9);
    var tw = c.x + c.w - px(24) - tx;
    var name = '', count = 0;
    try {
        var pl = plman.ActivePlaylist;
        name = pl >= 0 ? plman.GetPlaylistName(pl) : '';
        count = pl >= 0 ? plman.GetPlaylistItemCount(pl) : 0;
    } catch (e) {}
    drawText(gr, name || '재생목록', fonts.small,
        this.hover === 'chip' ? colours.sub : colours.text,
        tx, c.y + px(6), tw, px(15), TEXT_LEFT);
    drawText(gr, count + '곡', fonts.tiny, colours.sub,
        tx, c.y + c.h - px(19), tw, px(14), TEXT_LEFT);
    drawIcon(gr, 'caret', c.x + c.w - px(13), c.y + c.h / 2, px(15), colours.faint);

    var ratio = this.seekRatio(), len = fb.PlaybackLength;
    this.slider(gr, this.rcSeek, ratio, this.hover === 'seek' || this.dragSeek, colours.ink);
    if (len > 0) {
        drawText(gr, fmtTime(ratio * len), fonts.tiny, colours.sub,
            this.elapsed.x, this.elapsed.y, this.elapsed.w, this.elapsed.h, TEXT_RIGHT);
        drawText(gr, fmtTime(len), fonts.tiny, colours.sub,
            this.remain.x, this.remain.y, this.remain.w, this.remain.h, TEXT_LEFT);
    }

    if (this.rcVol.w > 0) {
        var v = volumeToPos();
        drawIcon(gr, v > 0.55 ? 'vol2' : (v > 0.02 ? 'vol1' : 'vol0'),
            this.volIconX, this.rcVol.y + px(2), px(16), colours.sub);
        this.slider(gr, this.rcVol, v, this.hover === 'vol' || this.dragVol, colours.sub);
    }
    this.buttons[0].paint(gr, 0.8);
};

BottomBar.prototype.hitTest = function (x, y) {
    if (inRect(this.rcSeek, x, y, px(8))) return 'seek';
    if (this.rcVol.w > 0 && inRect(this.rcVol, x, y, px(8))) return 'vol';
    var b = hitButtons(this.buttons, x, y);
    if (b) return b.id;
    if (inRect(this.chip, x, y)) return 'chip';
    return '';
};

BottomBar.prototype.move = function (x, y) {
    if (this.dragSeek) {
        this.seekPos = clamp((x - this.rcSeek.x) / this.rcSeek.w, 0, 1);
        window.Repaint();
        return;
    }
    if (this.dragVol) {
        posToVolume((x - this.rcVol.x) / this.rcVol.w);
        window.Repaint();
        return;
    }
    var h = this.hitTest(x, y);
    if (h !== this.hover) {
        this.hover = h;
        window.SetCursor(h ? IDC_HAND : IDC_ARROW);
        window.Repaint();
    }
};
BottomBar.prototype.leave = function () { if (this.hover) { this.hover = ''; window.Repaint(); } };

BottomBar.prototype.down = function (x, y) {
    var h = this.hitTest(x, y);
    if (h === 'seek' && fb.PlaybackLength > 0) {
        this.dragSeek = true;
        this.seekPos = clamp((x - this.rcSeek.x) / this.rcSeek.w, 0, 1);
        window.Repaint();
    } else if (h === 'vol') {
        this.dragVol = true;
        posToVolume((x - this.rcVol.x) / this.rcVol.w);
        window.Repaint();
    }
};

BottomBar.prototype.up = function (x, y) {
    if (!this.dragSeek && !this.dragVol && inRect(this.chip, x, y)) {
        showPlaylistMenu(x, y);
        return;
    }
    if (this.dragSeek) {
        this.dragSeek = false;
        var len = fb.PlaybackLength;
        if (len > 0) fb.PlaybackTime = this.seekPos * len;
        window.Repaint();
        return;
    }
    if (this.dragVol) { this.dragVol = false; window.Repaint(); return; }
    var b = hitButtons(this.buttons, x, y);
    if (b) runAction(b.action, x, y);
};

BottomBar.prototype.dblclick = function (x, y) {
    if (inRect(this.chip, x, y)) {
        try { fb.RunMainMenuCommand('View/Show now playing in playlist'); } catch (e) {}
    }
};

BottomBar.prototype.wheel = function (step) {
    if (this.hover === 'seek') {
        var len = fb.PlaybackLength;
        if (len > 0) fb.PlaybackTime = clamp(fb.PlaybackTime + step * 5, 0, len);
        return;
    }
    posToVolume(volumeToPos() + step * 0.04);
    window.Repaint();
};

BottomBar.prototype.tick = function () {
    this.phase++;
    if (this.phase % 5 === 0 && fb.IsPlaying && !fb.IsPaused && !this.dragSeek) window.Repaint();
};

// -------------------------------------------------------------- COMPOSITE ---

function Composite() {
    this.top = new TopBar();
    this.art = new ArtCard();
    this.list = new TrackList();
    this.bottom = new BottomBar();
    this.parts = [];
    this.captured = null;
    this.hoverPart = null;
}

Composite.prototype.layout = function (W, H) {
    this.W = W; this.H = H;
    var pad = px(16);
    var topH = clamp(Math.round(H * 0.09), px(44), px(60));
    var botH = clamp(Math.round(H * 0.11), px(52), px(72));
    var midY = topH, midH = Math.max(px(80), H - topH - botH);

    this.top.embedded = this.art.embedded = this.list.embedded = this.bottom.embedded = true;
    this.top.setViewport(0, 0, W, topH);
    this.bottom.setViewport(0, H - botH, W, botH);

    var artW = W >= px(640) ? clamp(Math.round(W * 0.36), px(220), px(420)) : 0;
    this.artW = artW;
    if (artW > 0) {
        this.art.setViewport(0, midY, artW, midH);
        this.list.setViewport(artW + pad, midY + px(10), W - artW - pad * 2, midH - px(16));
        this.parts = [this.top, this.art, this.list, this.bottom];
    } else {
        this.list.setViewport(pad, midY + px(6), W - pad * 2, midH - px(10));
        this.parts = [this.top, this.list, this.bottom];
    }
};

Composite.prototype.paint = function (gr) {
    paintPage(gr, 0, 0, this.W, this.H);
    for (var i = 0; i < this.parts.length; i++) this.parts[i].paint(gr);
};

Composite.prototype.partAt = function (x, y) {
    for (var i = 0; i < this.parts.length; i++) {
        var p = this.parts[i];
        if (x >= p.ox && x < p.ox + p.W && y >= p.oy && y < p.oy + p.H) return p;
    }
    return null;
};

Composite.prototype.move = function (x, y, mask) {
    var p = this.captured || this.partAt(x, y);
    for (var i = 0; i < this.parts.length; i++) {
        if (this.parts[i] !== p && this.parts[i].leave) this.parts[i].leave();
    }
    if (p && p.move) p.move(x, y, mask);
    this.hoverPart = p;
    this.hover = (p && p.hover) || '';
};

Composite.prototype.leave = function () {
    for (var i = 0; i < this.parts.length; i++) if (this.parts[i].leave) this.parts[i].leave();
    this.hoverPart = null;
    this.hover = '';
};

Composite.prototype.down = function (x, y, mask) {
    this.captured = this.partAt(x, y);
    if (this.captured && this.captured.down) this.captured.down(x, y, mask);
};

Composite.prototype.up = function (x, y, mask) {
    var p = this.captured || this.partAt(x, y);
    if (p && p.up) p.up(x, y, mask);
    this.captured = null;
};

Composite.prototype.dblclick = function (x, y, mask) {
    var p = this.partAt(x, y);
    if (p && p.dblclick) p.dblclick(x, y, mask);
};

Composite.prototype.wheel = function (step) {
    var p = this.hoverPart || this.list;
    if (p && p.wheel) p.wheel(step);
};

Composite.prototype.contextMenu = function (x, y) {
    var p = this.partAt(x, y);
    return !!(p && p.contextMenu && p.contextMenu(x, y));
};

Composite.prototype.key = function (vkey) { this.list.key(vkey); };

Composite.prototype.refresh = function () {
    this.list.refresh();
    this.layout(this.W, this.H);
};

Composite.prototype.setTrack = function (handle) {
    this.art.setTrack(handle);
    this.bottom.setTrack(handle);
};

Composite.prototype.tick = function () {
    for (var i = 0; i < this.parts.length; i++) if (this.parts[i].tick) this.parts[i].tick();
};

Composite.prototype.dropTarget = function (x, y) {
    var p = this.partAt(x, y);
    if (p && p.dropTarget) return p.dropTarget(x, y);
    return this.list.pl;
};

Composite.prototype.setDropFeedback = function (x, y, on) {
    var p = on ? this.partAt(x, y) : null;
    this.list.setDropActive(on && (p === this.list || p === this.art || p === this.top));
};

// ------------------------------------------------------------- THE PANEL ----

var panel = null, panelKind = '', timerId = null, reportedError = '';

var CONTEXT_BASE = 200000;
var MAIN_MENU_SPAN = 10000;
var MAIN_MENUS = [
    { name: 'View', base: 10000 },
    { name: 'Playback', base: 20000 },
    { name: 'Library', base: 30000 },
    { name: 'File', base: 40000 },
    { name: 'Edit', base: 50000 }
];

function resolveMode(W, H) {
    var m = ('' + props.mode).toLowerCase();
    if (m === 'all' || m === 'art' || m === 'list' || m === 'bar') return m;
    if (H <= px(110) && W > px(340)) return 'bar';
    if (W >= px(560) && H >= px(360)) return 'all';
    if (H > W) return 'art';
    return 'list';
}

function buildPanel(W, H) {
    var kind = resolveMode(W, H);
    if (kind !== panelKind || !panel) {
        panelKind = kind;
        panel = kind === 'all' ? new Composite()
              : kind === 'list' ? new TrackList()
              : kind === 'bar' ? new BottomBar()
              : new ArtCard();
        if (panel.setTrack) panel.setTrack(fb.GetNowPlaying());
    }
    if (panel.layout) panel.layout(W, H);
    else panel.setViewport(0, 0, W, H);
}

function applyTheme(name) {
    props.theme = name;
    window.SetProperty('Studio.Theme (light|dark)', name);
    colours = pickTheme(name);
    svgCache = {}; svgOrder = [];
    blob.key = ''; blob.img = null;
    window.Repaint();
}

function setMode(mode) {
    props.mode = mode;
    window.SetProperty('Studio.Mode (auto|all|art|list|bar)', mode);
    panelKind = '';
    buildPanel(window.Width, window.Height);
    window.Repaint();
}

function appendMainMenus(parent, built) {
    var sub = window.CreatePopupMenu();
    for (var i = 0; i < MAIN_MENUS.length; i++) {
        var m = MAIN_MENUS[i];
        try {
            var mm = fb.CreateMainMenuManager(m.name);
            var popup = window.CreatePopupMenu();
            mm.BuildMenu(popup, m.base);
            popup.AppendTo(sub, MF_STRING, m.name);
            built.push({ mm: mm, popup: popup, base: m.base });
        } catch (e) {}
    }
    sub.AppendTo(parent, MF_STRING, 'foobar2000 메뉴');
    built.push({ popup: sub });
}

function runMainMenu(built, id) {
    for (var i = 0; i < built.length; i++) {
        var b = built[i];
        if (b.mm && id >= b.base && id < b.base + MAIN_MENU_SPAN) {
            try { b.mm.ExecuteByID(id - b.base); } catch (e) {}
            return true;
        }
    }
    return false;
}

function disposeMenus(built) {
    for (var i = 0; i < built.length; i++) {
        try { if (built[i].mm) built[i].mm.Dispose(); } catch (e) {}
        try { if (built[i].popup) built[i].popup.Dispose(); } catch (e) {}
    }
}

// The gear opens foobar2000's own Preferences — the Ctrl+P dialog.
// Command paths differ between builds, so try the likely ones and never
// leave the button doing nothing.
function openPreferences(x, y) {
    try { fb.ShowPreferences(); return true; } catch (e) {}
    try { if (fb.RunMainMenuCommand('File/Preferences') !== false) return true; } catch (e) {}
    console.log('Studio: 설정 창을 열지 못했습니다');
    showPanelMenu(x, y);
    return false;
}

// Just the playlists, for the top bar and the queue buttons.
// Asks for a name, creates the playlist and switches to it. The new one is
// empty, so dropping files straight in will start playing them.
function createPlaylist() {
    var name;
    try {
        name = utils.InputBox('새 재생목록 이름', 'Studio Player', '새 재생목록', true);
    } catch (e) { return -1; }                 // cancelled
    name = ('' + name).replace(/^\s+|\s+$/g, '');
    if (!name) return -1;
    try {
        var idx = plman.CreatePlaylist(plman.PlaylistCount, name);
        plman.ActivePlaylist = idx;
        window.Repaint();
        return idx;
    } catch (e) {
        console.log('Studio: 재생목록을 만들지 못했습니다 - ' + e);
        return -1;
    }
}

function showPlaylistMenu(x, y) {
    var menu = null;
    try {
        menu = window.CreatePopupMenu();
        var n = plman.PlaylistCount, active = plman.ActivePlaylist;
        for (var i = 0; i < n; i++) {
            menu.AppendMenuItem(MF_STRING, 100 + i,
                plman.GetPlaylistName(i) + '\t' + plman.GetPlaylistItemCount(i) + '곡');
        }
        if (n > 0) {
            menu.CheckMenuRadioItem(100, 100 + n - 1, 100 + active);
            menu.AppendMenuSeparator();
        }
        menu.AppendMenuItem(MF_STRING, 1, '＋  새 재생목록…');
        var id = menu.TrackPopupMenu(x, y);
        if (id === 1) createPlaylist();
        else if (id >= 100 && id < 100 + n) plman.ActivePlaylist = id - 100;
        return true;
    } catch (e) {
        console.log('Studio menu: ' + e);
        return false;
    } finally {
        try { if (menu) menu.Dispose(); } catch (e2) {}
    }
}

function showPanelMenu(x, y, cmm) {
    var menu = null, theme = null, mode = null, built = [];
    try {
        menu = window.CreatePopupMenu();
        theme = window.CreatePopupMenu();
        mode = window.CreatePopupMenu();

        if (cmm) { cmm.BuildMenu(menu, CONTEXT_BASE); menu.AppendMenuSeparator(); }

        theme.AppendMenuItem(MF_STRING, 1, '라이트');
        theme.AppendMenuItem(MF_STRING, 2, '다크');
        theme.CheckMenuRadioItem(1, 2, props.theme === 'dark' ? 2 : 1);
        theme.AppendTo(menu, MF_STRING, '테마');

        var modes = ['auto', 'all', 'art', 'list', 'bar'];
        var labels = ['자동', '전체', '앨범아트 + 컨트롤', '트랙 리스트', '하단 바'];
        var cur = 0;
        for (var i = 0; i < modes.length; i++) {
            mode.AppendMenuItem(MF_STRING, 10 + i, labels[i]);
            if (modes[i] === props.mode) cur = i;
        }
        mode.CheckMenuRadioItem(10, 10 + modes.length - 1, 10 + cur);
        mode.AppendTo(menu, MF_STRING, '패널 모드');

        menu.AppendMenuSeparator();
        appendMainMenus(menu, built);
        menu.AppendMenuSeparator();
        menu.AppendMenuItem(MF_STRING, 20, '패널 속성…');
        menu.AppendMenuItem(MF_STRING, 21, '스크립트 편집…');

        var id = menu.TrackPopupMenu(x, y);
        if (cmm && id >= CONTEXT_BASE) cmm.ExecuteByID(id - CONTEXT_BASE);
        else if (runMainMenu(built, id)) { /* foobar2000 handled it */ }
        else if (id === 1) applyTheme('light');
        else if (id === 2) applyTheme('dark');
        else if (id >= 10 && id < 10 + modes.length) setMode(modes[id - 10]);
        else if (id === 20) window.ShowProperties();
        else if (id === 21) window.ShowConfigure();
        return true;
    } catch (e) {
        console.log('Studio menu: ' + e);
        return false;
    } finally {
        disposeMenus(built);
        try { if (theme) theme.Dispose(); } catch (e2) {}
        try { if (mode) mode.Dispose(); } catch (e2) {}
        try { if (menu) menu.Dispose(); } catch (e2) {}
    }
}

// ------------------------------------------------------------- CALLBACKS ----

function on_paint(gr) {
    if (!panel) buildPanel(window.Width, window.Height);
    try {
        panel.paint(gr);
    } catch (e) {
        if (('' + e) !== reportedError) {
            reportedError = '' + e;
            console.log('Studio panel: ' + e);
        }
        gr.Clear(colours.bg);
        gr.WriteText('Studio panel error: ' + e, fonts.small.str, colours.text,
            px(10), px(10), window.Width - px(20), window.Height - px(20),
            TEXT_LEFT, PARA_TOP, WRAP_ON, TRIM_NONE);
    }
}

function on_size() {
    if (window.Width <= 0 || window.Height <= 0) return;
    blob.key = ''; blob.img = null;
    buildPanel(window.Width, window.Height);
}

function on_mouse_move(x, y, mask) { if (panel.move) panel.move(x, y, mask); }
function on_mouse_leave() { if (panel.leave) panel.leave(); }
function on_mouse_lbtn_down(x, y, mask) { if (panel.down) panel.down(x, y, mask); }
function on_mouse_lbtn_up(x, y, mask) { if (panel.up) panel.up(x, y, mask); }
function on_mouse_lbtn_dblclk(x, y, mask) { if (panel.dblclick) panel.dblclick(x, y, mask); }
function on_mouse_wheel(step) { if (panel.wheel) panel.wheel(step); }

function on_mouse_rbtn_up(x, y) {
    if (panel.contextMenu && panel.contextMenu(x, y)) return true;
    return showPanelMenu(x, y);
}

var VK_CONTROL = 0x11, VK_P = 0x50;

function on_key_down(vkey) {
    if (vkey === VK_P) {
        var ctrl = false;
        try { ctrl = utils.IsKeyPressed(VK_CONTROL); } catch (e) {}
        if (ctrl) { openPreferences(px(20), px(20)); return; }
    }
    if (panel.key) panel.key(vkey);
}

// ------------------------------------------------------- DRAG AND DROP ----

var pendingDrop = null;

function dropPlaylist(x, y) {
    var pl = -1;
    try { if (panel.dropTarget) pl = panel.dropTarget(x, y); } catch (e) {}
    if (pl < 0) { try { pl = plman.ActivePlaylist; } catch (e) {} }
    return pl;
}

function dropFeedback(x, y, on) {
    try {
        if (panel.setDropFeedback) panel.setDropFeedback(x, y, on);
        else if (panel.setDropActive) panel.setDropActive(on);
    } catch (e) {}
}

function on_drag_over(action, x, y, mask) {
    var pl = dropPlaylist(x, y);
    var ok = pl < 0 || playlistCanAdd(pl);
    action.Effect = ok ? 1 : 0;
    dropFeedback(x, y, ok);
}

function on_drag_enter(action, x, y, mask) {
    if (action && typeof x === 'number') on_drag_over(action, x, y, mask);
}

function on_drag_leave() { dropFeedback(0, 0, false); }

function on_drag_drop(action, x, y, mask) {
    dropFeedback(0, 0, false);
    var pl = dropPlaylist(x, y);
    if (pl < 0) {
        try { pl = plman.CreatePlaylist(plman.PlaylistCount, '재생목록'); }
        catch (e) { action.Effect = 0; return; }
    }
    if (!playlistCanAdd(pl)) { action.Effect = 0; return; }
    var base = 0;
    try { plman.UndoBackup(pl); base = plman.GetPlaylistItemCount(pl); } catch (e) {}
    action.Playlist = pl;
    action.Base = base;
    action.ToSelect = true;
    action.Effect = 1;
    pendingDrop = { pl: pl, base: base };
}

// ------------------------------------------------------ PLAYBACK EVENTS ----

function on_playback_new_track(handle) {
    setNowArt(handle);
    if (panel.setTrack) panel.setTrack(handle);
    window.Repaint();
}

function on_playback_stop(reason) {
    if (reason !== 2) {
        setNowArt(null);
        if (panel.setTrack) panel.setTrack(null);
    }
    window.Repaint();
}

function on_playback_dynamic_info_track() {
    var h = fb.GetNowPlaying();
    setNowArt(h);
    if (panel.setTrack) panel.setTrack(h);
    window.Repaint();
}

function on_playback_pause() { window.Repaint(); }
function on_playback_seek() { window.Repaint(); }
function on_playback_time() { window.Repaint(); }
function on_playback_order_changed() { window.Repaint(); }
function on_volume_change() { window.Repaint(); }

function on_playlist_items_added(pl) {
    if (panel.refresh) panel.refresh();
    if (pendingDrop && (pl === undefined || pl === pendingDrop.pl)) {
        var d = pendingDrop;
        pendingDrop = null;
        var active = -1;
        try { active = plman.ActivePlaylist; } catch (e) {}
        if (!fb.IsPlaying && d.pl === active) {
            try { plman.ExecutePlaylistDefaultAction(d.pl, d.base); } catch (e) {}
        }
    }
    window.Repaint();
}

function on_playlist_switch() { if (panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlists_changed() { if (panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlist_items_removed() { if (panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlist_items_reordered() { if (panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlist_items_selection_change() { window.Repaint(); }
function on_item_focus_change() { window.Repaint(); }
function on_metadb_changed() { if (panel.refresh) panel.refresh(); window.Repaint(); }

// ------------------------------------------------------------------ INIT ----

setNowArt(fb.GetNowPlaying());
buildPanel(window.Width || 800, window.Height || 500);
timerId = window.SetInterval(function () { if (panel.tick) panel.tick(); }, 40);
