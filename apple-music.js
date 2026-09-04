// ==PREPROCESSOR==
// @name "Apple Music"
// ==/PREPROCESSOR==

// =============================================================================
//  Apple Music style player for foobar2000
// -----------------------------------------------------------------------------
//  Written for JScript Panel 3 (foobar2000 v2), which draws with Direct2D and
//  DirectWrite — not the GDI+ API the older panels used. One file, three panels;
//  the "Apple Music.Mode" property decides which one this instance draws:
//
//      player  - portrait "now playing" panel (big artwork + controls)
//      bar     - compact transport bar with a centred LCD card
//      list    - Apple Music style track list
//      auto    - picks "bar" or "player" from the panel proportions
//
//  Icons are SVG, rendered by the component's own resvg backend, so they stay
//  sharp at any size and need no icon font installed.
//
//  Right click the panel for theme / mode options.
// =============================================================================

// ------------------------------------------------------------- CONSTANTS ----

var DPI = window.DPI;

var TEXT_LEFT = 0, TEXT_RIGHT = 1, TEXT_CENTRE = 2;
var PARA_TOP = 0, PARA_BOTTOM = 1, PARA_CENTRE = 2;
var WRAP_ON = 0, WRAP_OFF = 1;
var TRIM_NONE = 0, TRIM_CHAR = 1, TRIM_WORD = 2;

var WEIGHT_NORMAL = 400, WEIGHT_MEDIUM = 500, WEIGHT_SEMIBOLD = 600, WEIGHT_BOLD = 700;

var IDC_ARROW = 32512, IDC_HAND = 32649;

var MK_SHIFT = 4, MK_CTRL = 8;

var VK_RETURN = 13, VK_PRIOR = 33, VK_NEXT = 34, VK_UP = 38, VK_DOWN = 40;

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

// SVG needs the colour as #rrggbb text.
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
    mode:      window.GetProperty('Apple Music.Mode (auto|player|bar|list)', 'auto'),
    theme:     window.GetProperty('Apple Music.Theme (dark|light)', 'dark'),
    accent:    window.GetProperty('Apple Music.Accent colour', '#FA243C'),
    scale:     window.GetProperty('Apple Music.Scale %', 100),
    rowHeight: window.GetProperty('Apple Music.List row height', 46),
    rowArt:    window.GetProperty('Apple Music.List artwork', true),
    fontFace:  window.GetProperty('Apple Music.Font', 'Pretendard Variable, Pretendard, SUIT, Wanted Sans, Apple SD Gothic Neo, Segoe UI Variable Display, Segoe UI, Malgun Gothic')
};

var S = clamp(props.scale / 100, 0.5, 3) * (DPI / 96);
function px(v) { return Math.round(v * S); }

// --------------------------------------------------------------- THEMES -----

var THEMES = {
    dark: {
        bg:     RGB(0x1c, 0x1c, 0x1e),
        card:   RGB(0x2c, 0x2c, 0x2e),
        hover:  RGB(0x2c, 0x2c, 0x2e),
        sel:    RGB(0x3a, 0x3a, 0x3c),
        line:   RGB(0x38, 0x38, 0x3a),
        text:   RGB(0xf5, 0xf5, 0xf7),
        sub:    RGB(0x98, 0x98, 0x9e),
        icon:   RGB(0xe8, 0xe8, 0xed),
        track:  RGB(0x48, 0x48, 0x4a),
        shadow: RGB(0, 0, 0)
    },
    light: {
        bg:     RGB(0xff, 0xff, 0xff),
        card:   RGB(0xf5, 0xf5, 0xf7),
        hover:  RGB(0xf2, 0xf2, 0xf7),
        sel:    RGB(0xe8, 0xe8, 0xed),
        line:   RGB(0xe5, 0xe5, 0xea),
        text:   RGB(0x1d, 0x1d, 0x1f),
        sub:    RGB(0x6e, 0x6e, 0x73),
        icon:   RGB(0x3a, 0x3a, 0x3c),
        track:  RGB(0xd1, 0xd1, 0xd6),
        shadow: RGB(0x8e, 0x8e, 0x93)
    }
};

var colours = THEMES[props.theme === 'light' ? 'light' : 'dark'];
var ACCENT = hexColour(props.accent, RGB(0xfa, 0x24, 0x3c));

// ----------------------------------------------------------------- FONTS ----
//  JScript Panel 3 wants a JSON string for drawing and the parts separately
//  for measuring, so keep both on one object.

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
        name: FONT_NAME,
        size: size,
        weight: weight,
        str: JSON.stringify({ Name: FONT_NAME, Size: size, Weight: weight })
    };
}

var fonts = {
    huge:  makeFont(14.5, WEIGHT_BOLD),
    title: makeFont(10.5, WEIGHT_SEMIBOLD),
    body:  makeFont(10, WEIGHT_NORMAL),
    small: makeFont(8.5, WEIGHT_NORMAL),
    tiny:  makeFont(7.5, WEIGHT_NORMAL)
};

function textWidth(s, font) {
    if (!s) return 0;
    try { return utils.CalcTextWidth('' + s, font.name, font.size, font.weight); }
    catch (e) { return 0; }
}

// ------------------------------------------------------------- PRIMITIVES ---

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

// One text call, always single line, ellipsis when it does not fit.
function drawText(gr, s, font, colour, x, y, w, h, align, para) {
    if (s == null || s === '' || w <= 0 || h <= 0) return;
    gr.WriteText('' + s, font.str, colour, x, y, w, h,
        align == null ? TEXT_LEFT : align,
        para == null ? PARA_CENTRE : para,
        WRAP_OFF, TRIM_CHAR);
}

// ----------------------------------------------------------------- ICONS ----
//  Drawn from SVG markup handed straight to the component's renderer, so there
//  is no icon font to install and no polygon maths to go wrong. %C% is the
//  colour placeholder.

var SVG = {
    play: '<path d="M8 5.2 L19 12 L8 18.8 Z" fill="%C%" stroke="%C%" stroke-width="1.5" stroke-linejoin="round"/>',

    pause: '<rect x="7" y="5" width="3.6" height="14" rx="1.6" fill="%C%"/>' +
           '<rect x="13.4" y="5" width="3.6" height="14" rx="1.6" fill="%C%"/>',

    next: '<g fill="%C%" stroke="%C%" stroke-width="1.4" stroke-linejoin="round">' +
          '<path d="M5 6 L12 12 L5 18 Z"/><path d="M12 6 L19 12 L12 18 Z"/></g>',

    prev: '<g fill="%C%" stroke="%C%" stroke-width="1.4" stroke-linejoin="round">' +
          '<path d="M19 6 L12 12 L19 18 Z"/><path d="M12 6 L5 12 L12 18 Z"/></g>',

    shuffle: '<g fill="none" stroke="%C%" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' +
             '<path d="M2.5 7h3.3c1 0 2 .5 2.6 1.4l5.4 7.2c.6.9 1.6 1.4 2.6 1.4h2.4"/>' +
             '<path d="M2.5 17h3.3c1 0 2-.5 2.6-1.4l1.3-1.7"/>' +
             '<path d="M14 9.9l1.4-1.5c.6-.9 1.6-1.4 2.6-1.4h2.4"/></g>' +
             '<path d="M18.4 4.3 L22 7 L18.4 9.7 Z" fill="%C%"/>' +
             '<path d="M18.4 14.3 L22 17 L18.4 19.7 Z" fill="%C%"/>',

    repeat: '<g fill="none" stroke="%C%" stroke-width="1.9" stroke-linecap="round">' +
            '<path d="M7.5 7h8a3.6 3.6 0 0 1 3.6 3.6v1.2"/>' +
            '<path d="M16.5 17h-8a3.6 3.6 0 0 1-3.6-3.6v-1.2"/></g>' +
            '<path d="M16.2 4.3 L19.8 7 L16.2 9.7 Z" fill="%C%"/>' +
            '<path d="M7.8 14.3 L4.2 17 L7.8 19.7 Z" fill="%C%"/>',

    repeat1: '<g fill="none" stroke="%C%" stroke-width="1.9" stroke-linecap="round">' +
             '<path d="M7.5 7h8a3.6 3.6 0 0 1 3.6 3.6v1.2"/>' +
             '<path d="M16.5 17h-8a3.6 3.6 0 0 1-3.6-3.6v-1.2"/></g>' +
             '<path d="M16.2 4.3 L19.8 7 L16.2 9.7 Z" fill="%C%"/>' +
             '<path d="M7.8 14.3 L4.2 17 L7.8 19.7 Z" fill="%C%"/>' +
             '<path d="M11.1 10.6l2-1.2h1.1v6.2h-1.6v-4.3l-1 .6z" fill="%C%"/>',

    vol0: '<path d="M4 9.4h3.1L11 5.9v12.2L7.1 14.6H4z" fill="%C%"/>',

    vol1: '<path d="M4 9.4h3.1L11 5.9v12.2L7.1 14.6H4z" fill="%C%"/>' +
          '<path d="M13.8 9.4a3.7 3.7 0 0 1 0 5.2" fill="none" stroke="%C%" stroke-width="1.7" stroke-linecap="round"/>',

    vol2: '<path d="M4 9.4h3.1L11 5.9v12.2L7.1 14.6H4z" fill="%C%"/>' +
          '<g fill="none" stroke="%C%" stroke-width="1.7" stroke-linecap="round">' +
          '<path d="M13.8 9.4a3.7 3.7 0 0 1 0 5.2"/>' +
          '<path d="M16.5 6.6a7.6 7.6 0 0 1 0 10.8"/></g>',

    note: '<path d="M9 17.5a2.5 2.5 0 1 1-2.5-2.5c.5 0 1 .1 1.4.4V5.6l9-2v9.9a2.5 2.5 0 1 1-1.1-2.1V6.8l-6.8 1.5z" fill="%C%"/>'
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
            var xml = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">' +
                      body.replace(/%C%/g, cssColour(colour)) + '</svg>';
            img = utils.LoadSVG(xml, size);
        }
    } catch (e) { img = null; }
    svgCache[key] = img;
    svgOrder.push(key);
    while (svgOrder.length > 220) delete svgCache[svgOrder.shift()];
    return img;
}

// Centres an icon on (cx, cy).
function drawIcon(gr, name, cx, cy, size, colour) {
    var img = icon(name, size, colour);
    if (!img) return;
    gr.DrawImage(img, Math.round(cx - img.Width / 2), Math.round(cy - img.Height / 2),
        img.Width, img.Height, 0, 0, img.Width, img.Height);
}

// The little animated bars over the playing track.
function drawEq(gr, x, y, w, h, colour, phase, animated) {
    var bars = 3, bw = w / (bars * 2 - 1);
    for (var i = 0; i < bars; i++) {
        var f = animated
            ? 0.35 + 0.65 * Math.abs(Math.sin(phase * 0.11 + i * 1.1))
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
        fillRound(g, 0, 0, size, size, radius, RGB(0, 0, 0));   // black = keep
        m.ReleaseGraphics();
        maskCache[key] = m;
        return m;
    } catch (e) { return null; }
}

// DrawImageWithMask takes no source rectangle, so square the image first.
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
    length: fb.TitleFormat('%length%'),
    key:    fb.TitleFormat('[%album artist%] // [%album%] // $directory_path(%path%)')
};

function evalTf(fmt, handle) {
    try { return handle ? fmt.EvalWithMetadb(handle) : ''; } catch (e) { return ''; }
}

function getArt(handle) {
    if (!handle) return null;
    try { return handle.GetAlbumArt(); } catch (e) { return null; }
}

// -------------------------------------------------------- TRANSPORT STATE ---

function isShuffle() { return fb.PlaybackOrder >= 3; }

function repeatMode() {
    var o = fb.PlaybackOrder;
    return o === 1 ? 1 : (o === 2 ? 2 : 0);
}

function toggleShuffle() { fb.PlaybackOrder = isShuffle() ? 0 : 4; }

function cycleRepeat() {
    var r = repeatMode();
    fb.PlaybackOrder = r === 0 ? 1 : (r === 1 ? 2 : 0);
}

// Same curve foobar2000's own volume slider uses (see helpers.txt).
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

// ---------------------------------------------------------------- BUTTONS ---

function Button(id, iconFor, action) {
    this.id = id;
    this.iconFor = iconFor;          // returns [svg name, colour]
    this.action = action;
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

function inRect(rc, x, y, grow) {
    grow = grow || 0;
    return x >= rc.x - grow && x < rc.x + rc.w + grow &&
           y >= rc.y - grow && y < rc.y + rc.h + grow;
}

// ----------------------------------------------------------------- PLAYER ---

function Player(bar) {
    this.bar = bar;
    this.hover = '';
    this.dragSeek = false;
    this.dragVol = false;
    this.seekPos = 0;
    this.phase = 0;
    this.rcSeek = { x: 0, y: 0, w: 0, h: 0 };
    this.rcVol = { x: 0, y: 0, w: 0, h: 0 };
    this.rcArt = { x: 0, y: 0, w: 0, h: 0 };
    this.artSize = 0;
    this.showOrder = true;
    this.cache = { raw: null, sized: {} };
    this.build();
    this.setTrack(fb.GetNowPlaying());
}

Player.prototype.build = function () {
    var self = this;
    function iconColour(id) {
        return self.hover === id ? blend(colours.icon, colours.text, 0.9) : colours.icon;
    }
    this.buttons = [
        new Button('shuffle',
            function () { return ['shuffle', isShuffle() ? ACCENT : iconColour('shuffle')]; },
            function () { toggleShuffle(); }),
        new Button('prev',
            function () { return ['prev', iconColour('prev')]; },
            function () { fb.Prev(); }),
        new Button('play',
            function () {
                var playing = fb.IsPlaying && !fb.IsPaused;
                return [playing ? 'pause' : 'play', iconColour('play')];
            },
            function () { fb.PlayOrPause(); }),
        new Button('next',
            function () { return ['next', iconColour('next')]; },
            function () { fb.Next(); }),
        new Button('repeat',
            function () {
                var r = repeatMode();
                return [r === 2 ? 'repeat1' : 'repeat', r ? ACCENT : iconColour('repeat')];
            },
            function () { cycleRepeat(); })
    ];
};

Player.prototype.find = function (id) {
    for (var i = 0; i < this.buttons.length; i++) if (this.buttons[i].id === id) return this.buttons[i];
    return null;
};

Player.prototype.setTrack = function (handle) {
    this.metadb = handle;
    this.cache.raw = getArt(handle);
    this.cache.sized = {};
};

Player.prototype.art = function (size) {
    if (!this.cache.raw || size < 4) return null;
    size = Math.round(size);
    if (this.cache.sized[size] === undefined) {
        this.cache.sized[size] = squareImage(this.cache.raw, size);
    }
    return this.cache.sized[size];
};

Player.prototype.setViewport = function (x, y, w, h) {
    this.ox = x; this.oy = y;
    this.layout(w, h);
};

Player.prototype.layout = function (W, H) {
    this.W = W; this.H = H;
    if (this.ox === undefined) { this.ox = 0; this.oy = 0; }
    this.bar ? this.layoutBar(W, H) : this.layoutFull(W, H);
};

Player.prototype.layoutFull = function (W, H) {
    var ox = this.ox, oy = this.oy;
    var pad = px(22);
    var big = px(52), small = px(34), gap = px(14);
    var blockH = px(20 + 26 + 20 + 12 + 30 + 16 + 12) + big + pad;

    this.showOrder = W > px(230);

    var art = Math.min(W - pad * 2, H - blockH - pad * 2);
    art = art < px(70) ? 0 : Math.min(art, px(420));
    this.artSize = art;

    var top = art ? Math.max(pad, (H - blockH - art) / 2) : pad;
    this.rcArt = { x: Math.round(ox + (W - art) / 2), y: Math.round(oy + top), w: art, h: art };

    var y = top + art + (art ? px(20) : px(4));
    this.titleY = oy + y; y += px(26);
    this.artistY = oy + y; y += px(20) + px(12);
    this.rcSeek = { x: ox + pad, y: Math.round(oy + y), w: W - pad * 2, h: px(4) };
    this.timesY = oy + y + px(8);
    y += px(30);

    var order = this.showOrder ? 1 : 0;
    var rowW = big + (small + gap) * 2 + (order ? (small + gap) * 2 : 0);
    var x = ox + (W - rowW) / 2, by = oy + y;
    if (order) { this.find('shuffle').place(x, by + (big - small) / 2, small, small); x += small + gap; }
    this.find('prev').place(x, by + (big - small) / 2, small, small); x += small + gap;
    this.find('play').place(x, by, big, big); x += big + gap;
    this.find('next').place(x, by + (big - small) / 2, small, small); x += small + gap;
    if (order) this.find('repeat').place(x, by + (big - small) / 2, small, small);
    y += big + px(16);

    var vw = Math.min(px(180), W - pad * 2 - px(56));
    this.showVol = vw > px(50) && y + px(12) < H;
    this.rcVol = this.showVol
        ? { x: Math.round(ox + (W - vw) / 2 + px(14)), y: Math.round(oy + y), w: vw, h: px(4) }
        : { x: 0, y: 0, w: 0, h: 0 };
};

Player.prototype.layoutBar = function (W, H) {
    var ox = this.ox, oy = this.oy;
    var pad = px(8);
    var size = clamp(H - pad * 2, px(24), px(40));
    var big = Math.min(size * 1.15, H - pad * 2);
    var gap = px(6);

    this.showVol = W > px(560);
    this.showOrder = W > px(420);
    this.artSize = 0;

    var cy = oy + H / 2;
    var x = ox + pad;
    this.find('prev').place(x, cy - size / 2, size, size); x += size + gap;
    this.find('play').place(x, cy - big / 2, big, big); x += big + gap;
    this.find('next').place(x, cy - size / 2, size, size); x += size + gap;

    if (this.showVol) {
        x += px(12);
        var vw = px(76);
        this.rcVol = { x: Math.round(x + px(18)), y: Math.round(cy - px(2)), w: vw, h: px(4) };
        x += px(18) + vw;
    } else {
        this.rcVol = { x: 0, y: 0, w: 0, h: 0 };
    }
    var leftEnd = x;

    var rightStart = ox + W - pad;
    if (this.showOrder) {
        this.find('repeat').place(ox + W - pad - size, cy - size / 2, size, size);
        this.find('shuffle').place(ox + W - pad - size * 2 - gap, cy - size / 2, size, size);
        rightStart = ox + W - pad - size * 2 - gap;
    }

    var avail = rightStart - leftEnd - px(28);
    var cw = clamp(avail, px(150), px(520));
    var cx = leftEnd + px(14) + Math.max(0, (avail - cw) / 2);
    var ch = H - pad * 2;
    this.card = { x: Math.round(cx), y: oy + pad, w: Math.round(cw), h: ch, visible: avail > px(140) };

    var ar = Math.max(0, ch - px(10));
    this.rcArt = { x: Math.round(cx + px(5)), y: oy + pad + px(5), w: ar, h: ar };

    var tx = cx + px(5) + ar + px(10);
    var tw = Math.max(px(40), cx + cw - px(10) - tx);
    this.cardText = { x: Math.round(tx), w: Math.round(tw) };
    this.cardTitleY = oy + pad + Math.max(px(3), (ch - px(12) - px(32)) / 2);
    this.cardArtistY = this.cardTitleY + px(17);
    this.rcSeek = { x: Math.round(tx + px(34)), y: Math.round(oy + pad + ch - px(10)),
                    w: Math.max(0, Math.round(tw - px(70))), h: px(3) };
};

Player.prototype.seekRatio = function () {
    if (this.dragSeek) return this.seekPos;
    var len = fb.PlaybackLength;
    return len > 0 ? clamp(fb.PlaybackTime / len, 0, 1) : 0;
};

Player.prototype.slider = function (gr, rc, ratio, hovered, colour) {
    if (rc.w <= 0) return;
    var r = rc.h / 2;
    fillRound(gr, rc.x, rc.y, rc.w, rc.h, r, colours.track);
    var w = Math.round(rc.w * clamp(ratio, 0, 1));
    if (w > 1) fillRound(gr, rc.x, rc.y, w, rc.h, r, colour);
    if (hovered) gr.FillEllipse(rc.x + w, rc.y + rc.h / 2, rc.h * 1.6, rc.h * 1.6, colours.text);
};

Player.prototype.volIcon = function () {
    var v = volumeToPos();
    return v > 0.55 ? 'vol2' : (v > 0.02 ? 'vol1' : 'vol0');
};

Player.prototype.paint = function (gr) {
    gr.FillRectangle(this.ox, this.oy, this.W, this.H, colours.bg);
    this.bar ? this.paintBar(gr) : this.paintFull(gr);
};

Player.prototype.paintFull = function (gr) {
    var W = this.W, x0 = this.ox, pad = px(22), playing = !!this.metadb;
    var title = playing ? evalTf(tf.title, this.metadb) : '재생 중인 항목 없음';
    var artist = playing ? evalTf(tf.artist, this.metadb) : '';
    var album = playing ? evalTf(tf.album, this.metadb) : '';

    if (this.artSize > 0) {
        var rc = this.rcArt, rad = px(10);
        for (var i = 6; i > 0; i--) {
            fillRound(gr, rc.x - i, rc.y - i * 0.4 + px(4), rc.w + i * 2, rc.h + i * 2,
                rad + i, setAlpha(colours.shadow, props.theme === 'light' ? 6 : 10));
        }
        if (!drawArt(gr, this.art(rc.w), rc.x, rc.y, rc.w, rad)) {
            fillRound(gr, rc.x, rc.y, rc.w, rc.h, rad, colours.card);
            drawIcon(gr, 'note', rc.x + rc.w / 2, rc.y + rc.h / 2, rc.w * 0.24, colours.sub);
        }
    }

    drawText(gr, title, fonts.huge, colours.text, x0 + pad, this.titleY, W - pad * 2, px(26), TEXT_CENTRE);
    var sub = artist + (album && artist ? ' — ' + album : album);
    drawText(gr, sub, fonts.body, colours.sub, x0 + pad, this.artistY, W - pad * 2, px(20), TEXT_CENTRE);

    var ratio = this.seekRatio(), len = fb.PlaybackLength;
    this.slider(gr, this.rcSeek, ratio, this.hover === 'seek' || this.dragSeek, ACCENT);
    if (len > 0) {
        drawText(gr, fmtTime(ratio * len), fonts.small, colours.sub,
            this.rcSeek.x, this.timesY, px(70), px(16), TEXT_LEFT);
        drawText(gr, '-' + fmtTime(len - ratio * len), fonts.small, colours.sub,
            this.rcSeek.x + this.rcSeek.w - px(70), this.timesY, px(70), px(16), TEXT_RIGHT);
    }

    for (var b = 0; b < this.buttons.length; b++) {
        var btn = this.buttons[b];
        if (!this.showOrder && (btn.id === 'shuffle' || btn.id === 'repeat')) continue;
        btn.paint(gr, btn.id === 'play' ? 0.82 : 0.7);
    }

    if (this.rcVol.w > 0) {
        drawIcon(gr, this.volIcon(), this.rcVol.x - px(16), this.rcVol.y + px(2), px(17), colours.sub);
        this.slider(gr, this.rcVol, volumeToPos(), this.hover === 'vol' || this.dragVol, colours.icon);
    }
};

Player.prototype.paintBar = function (gr) {
    var playing = !!this.metadb;

    for (var b = 0; b < this.buttons.length; b++) {
        var btn = this.buttons[b];
        if (!this.showOrder && (btn.id === 'shuffle' || btn.id === 'repeat')) continue;
        btn.paint(gr, btn.id === 'play' ? 0.8 : 0.66);
    }

    if (this.rcVol.w > 0) {
        drawIcon(gr, this.volIcon(), this.rcVol.x - px(14), this.rcVol.y + px(2), px(16), colours.sub);
        this.slider(gr, this.rcVol, volumeToPos(), this.hover === 'vol' || this.dragVol, colours.icon);
    }

    if (!this.card || !this.card.visible) return;
    var c = this.card;
    fillRound(gr, c.x, c.y, c.w, c.h, px(6), colours.card);

    var rc = this.rcArt;
    if (rc.w > 4 && !drawArt(gr, this.art(rc.w), rc.x, rc.y, rc.w, px(4))) {
        fillRound(gr, rc.x, rc.y, rc.w, rc.h, px(4), colours.hover);
        drawIcon(gr, 'note', rc.x + rc.w / 2, rc.y + rc.h / 2, rc.w * 0.5, colours.sub);
    }

    var tx = this.cardText.x, tw = this.cardText.w;
    var title = playing ? evalTf(tf.title, this.metadb) : '재생 중인 항목 없음';
    var artist = playing ? evalTf(tf.artist, this.metadb) : '';
    var album = playing ? evalTf(tf.album, this.metadb) : '';
    var sub = artist + (album && artist ? ' — ' + album : album);
    drawText(gr, title, fonts.title, colours.text, tx, this.cardTitleY, tw, px(17), TEXT_CENTRE);
    drawText(gr, sub, fonts.small, colours.sub, tx, this.cardArtistY, tw, px(15), TEXT_CENTRE);

    var ratio = this.seekRatio(), len = fb.PlaybackLength;
    this.slider(gr, this.rcSeek, ratio, this.hover === 'seek' || this.dragSeek, ACCENT);
    if (len > 0) {
        drawText(gr, fmtTime(ratio * len), fonts.tiny, colours.sub,
            this.rcSeek.x - px(33), this.rcSeek.y - px(6), px(30), px(14), TEXT_RIGHT);
        drawText(gr, '-' + fmtTime(len - ratio * len), fonts.tiny, colours.sub,
            this.rcSeek.x + this.rcSeek.w + px(4), this.rcSeek.y - px(6), px(32), px(14), TEXT_LEFT);
    }
};

Player.prototype.hitTest = function (x, y) {
    if (inRect(this.rcSeek, x, y, px(7))) return 'seek';
    if (this.rcVol.w > 0 && inRect(this.rcVol, x, y, px(7))) return 'vol';
    for (var i = 0; i < this.buttons.length; i++) {
        var b = this.buttons[i];
        if (!this.showOrder && (b.id === 'shuffle' || b.id === 'repeat')) continue;
        if (b.hit(x, y)) return b.id;
    }
    if (this.artSize > 0 && inRect(this.rcArt, x, y)) return 'art';
    return '';
};

Player.prototype.move = function (x, y) {
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
        window.SetCursor(h !== '' && h !== 'art' ? IDC_HAND : IDC_ARROW);
        window.Repaint();
    }
};

Player.prototype.leave = function () {
    if (this.hover) { this.hover = ''; window.Repaint(); }
};

Player.prototype.down = function (x, y) {
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

Player.prototype.up = function (x, y) {
    if (this.dragSeek) {
        this.dragSeek = false;
        var len = fb.PlaybackLength;
        if (len > 0) fb.PlaybackTime = this.seekPos * len;
        window.Repaint();
        return;
    }
    if (this.dragVol) { this.dragVol = false; window.Repaint(); return; }
    var h = this.hitTest(x, y);
    for (var i = 0; i < this.buttons.length; i++) {
        if (this.buttons[i].id === h) { this.buttons[i].action(); window.Repaint(); return; }
    }
};

Player.prototype.wheel = function (step) {
    if (this.hover === 'seek') {
        var len = fb.PlaybackLength;
        if (len > 0) fb.PlaybackTime = clamp(fb.PlaybackTime + step * 5, 0, len);
        return;
    }
    posToVolume(volumeToPos() + step * 0.04);
    window.Repaint();
};

Player.prototype.tick = function () {
    this.phase++;
    if (this.phase % 5 === 0 && fb.IsPlaying && !fb.IsPaused && !this.dragSeek) window.Repaint();
};

// --------------------------------------------------------------- PLAYLIST ---

var MF_STRING = 0;

function Playlist() {
    this.rowH = px(clamp(props.rowHeight, 24, 96));
    this.scroll = 0;
    this.target = 0;
    this.hoverRow = -1;
    this.barHover = false;
    this.dragBar = false;
    this.dragOffset = 0;
    this.phase = 0;
    this.rows = {};
    this.artRaw = {};
    this.artSq = {};
    this.pending = {};
    this.refresh();
}

Playlist.prototype.refresh = function () {
    try {
        this.pl = plman.ActivePlaylist;
        this.items = this.pl >= 0 ? plman.GetPlaylistItems(this.pl) : null;
        this.count = this.items ? this.items.Count : 0;
        this.name = this.pl >= 0 ? plman.GetPlaylistName(this.pl) : '';
    } catch (e) { this.items = null; this.count = 0; this.name = ''; }
    this.rows = {};
    this.clampScroll();
};

Playlist.prototype.row = function (i) {
    if (this.rows[i]) return this.rows[i];
    var h = null;
    try { h = this.items.GetItem(i); } catch (e) {}
    var r = {
        handle: h,
        title: evalTf(tf.title, h) || '(제목 없음)',
        artist: evalTf(tf.artist, h),
        album: evalTf(tf.album, h),
        length: evalTf(tf.length, h),
        key: evalTf(tf.key, h)
    };
    this.rows[i] = r;
    return r;
};

// Thumbnails are fetched asynchronously so a slow drive never stalls painting.
Playlist.prototype.thumb = function (r, size) {
    if (!r.handle) return null;
    var sk = r.key + '@' + size;
    if (this.artSq[sk] !== undefined) return this.artSq[sk];
    if (this.artRaw[r.key] !== undefined) {
        var raw = this.artRaw[r.key];
        this.artSq[sk] = raw ? squareImage(raw, size) : null;
        return this.artSq[sk];
    }
    if (!this.pending[r.key]) {
        this.pending[r.key] = true;
        try { r.handle.GetAlbumArtThumbAsync(window.ID, 0); }
        catch (e) { this.artRaw[r.key] = null; }
    }
    return null;
};

Playlist.prototype.artDone = function (metadb, image) {
    var key = evalTf(tf.key, metadb);
    if (!key) return;
    this.artRaw[key] = image || null;
    delete this.pending[key];
    window.Repaint();
};

Playlist.prototype.setViewport = function (x, y, w, h) {
    this.ox = x; this.oy = y;
    this.layout(w, h);
};

Playlist.prototype.layout = function (W, H) {
    this.W = W; this.H = H;
    if (this.ox === undefined) { this.ox = 0; this.oy = 0; }
    this.pad = px(16);
    this.headerH = H > px(240) ? px(62) : 0;
    this.colsH = H > px(160) ? px(24) : 0;
    this.top = this.oy + this.headerH + this.colsH;
    this.view = Math.max(0, H - this.top);
    this.showAlbum = W > px(560);
    this.showThumb = props.rowArt && this.rowH >= px(36) && W > px(260);
    this.durW = px(46);
    this.albumW = this.showAlbum ? Math.round((W - this.pad * 2) * 0.28) : 0;
    this.clampScroll();
};

Playlist.prototype.maxScroll = function () {
    return Math.max(0, this.count * this.rowH - (this.view || 0));
};

Playlist.prototype.clampScroll = function () {
    var m = this.maxScroll();
    this.target = clamp(this.target, 0, m);
    this.scroll = clamp(this.scroll, 0, m);
};

Playlist.prototype.rowAt = function (y) {
    if (y < this.top) return -1;
    var i = Math.floor((y - this.top + this.scroll) / this.rowH);
    return (i >= 0 && i < this.count) ? i : -1;
};

Playlist.prototype.paint = function (gr) {
    var W = this.W, H = this.H, x0 = this.ox, y0 = this.oy;
    gr.FillRectangle(x0, y0, W, H, colours.bg);

    if (this.headerH) {
        drawText(gr, this.name || '재생목록', fonts.huge, colours.text,
            x0 + this.pad, y0 + px(10), W - this.pad * 2, px(26), TEXT_LEFT);
        drawText(gr, this.count + '곡', fonts.small, colours.sub,
            x0 + this.pad, y0 + px(34), W - this.pad * 2, px(18), TEXT_LEFT);
    }
    if (this.colsH) {
        var cy = y0 + this.headerH;
        drawText(gr, '노래', fonts.tiny, colours.sub,
            x0 + this.pad + (this.showThumb ? this.rowH - px(4) : px(2)), cy, px(120), this.colsH, TEXT_LEFT);
        if (this.showAlbum) {
            drawText(gr, '앨범', fonts.tiny, colours.sub,
                x0 + W - this.pad - this.durW - px(8) - this.albumW, cy, this.albumW, this.colsH, TEXT_LEFT);
        }
        drawText(gr, '시간', fonts.tiny, colours.sub,
            x0 + W - this.pad - this.durW, cy, this.durW, this.colsH, TEXT_RIGHT);
        gr.FillRectangle(x0 + this.pad, cy + this.colsH - 1, W - this.pad * 2, 1, colours.line);
    }

    if (!this.count) {
        drawText(gr, '재생목록이 비어 있습니다', fonts.body, colours.sub,
            x0, this.top, W, px(40), TEXT_CENTRE);
        return;
    }

    var loc = playingLocation();
    var playingIdx = (loc && loc.pl === this.pl) ? loc.item : -1;
    var first = Math.max(0, Math.floor(this.scroll / this.rowH));
    var last = Math.min(this.count - 1, Math.ceil((this.scroll + this.view) / this.rowH));
    for (var i = first; i <= last; i++) this.paintRow(gr, i, playingIdx);

    var rc = this.barRect();
    if (rc) fillRound(gr, rc.x, rc.y, rc.w, rc.h, rc.w / 2,
        setAlpha(colours.sub, this.barHover || this.dragBar ? 190 : 90));
};

Playlist.prototype.paintRow = function (gr, i, playingIdx) {
    var y = this.top + i * this.rowH - this.scroll;
    var W = this.W, x0 = this.ox, rowH = this.rowH, pad = this.pad;
    var r = this.row(i);
    var selected = false;
    try { selected = plman.IsPlaylistItemSelected(this.pl, i); } catch (e) {}
    var playing = i === playingIdx;
    var live = fb.IsPlaying && !fb.IsPaused;

    if (selected || this.hoverRow === i) {
        fillRound(gr, x0 + pad - px(6), y + px(2), W - (pad - px(6)) * 2, rowH - px(4), px(7),
            selected ? colours.sel : colours.hover);
    }

    var x = x0 + pad;
    if (this.showThumb) {
        var ts = rowH - px(12);
        if (!drawArt(gr, this.thumb(r, ts), x, y + px(6), ts, px(3))) {
            fillRound(gr, x, y + px(6), ts, ts, px(3), colours.card);
        }
        if (playing) {
            fillRound(gr, x, y + px(6), ts, ts, px(3), RGBA(0, 0, 0, 140));
            drawEq(gr, x + ts / 2 - px(6), y + rowH / 2 - px(5), px(12), px(10),
                RGB(255, 255, 255), this.phase, live);
        }
        x += ts + px(10);
    } else if (playing) {
        drawEq(gr, x, y + rowH / 2 - px(5), px(10), px(10), ACCENT, this.phase, live);
        x += px(18);
    }

    var right = x0 + W - pad - this.durW - px(8);
    if (this.showAlbum) right -= this.albumW + px(8);
    var tw = Math.max(px(40), right - x);

    if (rowH >= px(36)) {
        drawText(gr, r.title, fonts.title, playing ? ACCENT : colours.text,
            x, y + px(5), tw, Math.floor(rowH / 2) - px(2), TEXT_LEFT);
        drawText(gr, r.artist, fonts.small, colours.sub,
            x, y + Math.floor(rowH / 2), tw, Math.floor(rowH / 2) - px(5), TEXT_LEFT);
    } else {
        var line = r.artist ? r.title + '  ·  ' + r.artist : r.title;
        drawText(gr, line, fonts.body, playing ? ACCENT : colours.text, x, y, tw, rowH, TEXT_LEFT);
    }

    if (this.showAlbum) {
        drawText(gr, r.album, fonts.small, colours.sub,
            x0 + W - pad - this.durW - px(8) - this.albumW, y, this.albumW, rowH, TEXT_LEFT);
    }
    drawText(gr, r.length, fonts.small, colours.sub,
        x0 + W - pad - this.durW, y, this.durW, rowH, TEXT_RIGHT);
};

Playlist.prototype.barRect = function () {
    var m = this.maxScroll();
    if (m <= 0 || this.view <= 0) return null;
    var total = this.count * this.rowH;
    var h = Math.max(px(28), this.view * this.view / total);
    return { x: this.ox + this.W - px(7), y: this.top + (this.view - h) * (this.scroll / m), w: px(4), h: h };
};

Playlist.prototype.wheel = function (step) {
    this.target = clamp(this.target - step * this.rowH * 3, 0, this.maxScroll());
    window.Repaint();
};

Playlist.prototype.tick = function () {
    this.phase++;
    var repaint = false;
    var d = this.target - this.scroll;
    if (Math.abs(d) > 0.5) { this.scroll += d * 0.28; repaint = true; }
    else if (this.scroll !== this.target) { this.scroll = this.target; repaint = true; }
    if (!repaint && this.phase % 3 === 0 && fb.IsPlaying && !fb.IsPaused) {
        var loc = playingLocation();
        if (loc && loc.pl === this.pl) repaint = true;
    }
    if (repaint) window.Repaint();
};

Playlist.prototype.move = function (x, y) {
    if (this.dragBar) {
        var m = this.maxScroll(), total = this.count * this.rowH;
        var h = Math.max(px(28), this.view * this.view / total);
        var t = clamp((y - this.dragOffset - this.top) / Math.max(1, this.view - h), 0, 1);
        this.target = this.scroll = t * m;
        window.Repaint();
        return;
    }
    var rc = this.barRect();
    var overBar = !!rc && x >= rc.x - px(6) && x <= rc.x + rc.w + px(4);
    var row = overBar ? -1 : this.rowAt(y);
    if (overBar !== this.barHover || row !== this.hoverRow) {
        this.barHover = overBar;
        this.hoverRow = row;
        window.SetCursor(IDC_ARROW);
        window.Repaint();
    }
};

Playlist.prototype.leave = function () {
    if (this.hoverRow !== -1 || this.barHover) {
        this.hoverRow = -1; this.barHover = false; window.Repaint();
    }
};

Playlist.prototype.down = function (x, y, mask) {
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

Playlist.prototype.up = function () {
    if (this.dragBar) { this.dragBar = false; window.Repaint(); }
};

Playlist.prototype.dblclick = function (x, y) {
    var i = this.rowAt(y);
    if (i >= 0) { try { plman.ExecutePlaylistDefaultAction(this.pl, i); } catch (e) {} }
};

Playlist.prototype.contextMenu = function (x, y) {
    var i = this.rowAt(y);
    if (i < 0) return false;                 // header or empty space: panel menu
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

Playlist.prototype.ensureVisible = function (i) {
    var y = i * this.rowH;
    if (y < this.target) this.target = y;
    else if (y + this.rowH > this.target + this.view) this.target = y + this.rowH - this.view;
    this.clampScroll();
    window.Repaint();
};

Playlist.prototype.key = function (vkey) {
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

// ---------------------------------------------------------------- SIDEBAR ---
//  What Apple Music actually puts on the left: the playlists. Click one to
//  switch to it. When there is spare height, the now playing artwork fills
//  the bottom of the column.

function Sidebar() {
    this.hoverRow = -1;
    this.scroll = 0;
    this.rowH = px(30);
    this.lists = [];
    this.art = { raw: null, sized: {} };
    this.refresh();
}

Sidebar.prototype.refresh = function () {
    this.lists = [];
    try {
        var n = plman.PlaylistCount;
        for (var i = 0; i < n; i++) {
            this.lists.push({ idx: i, name: plman.GetPlaylistName(i), count: plman.GetPlaylistItemCount(i) });
        }
        this.active = plman.ActivePlaylist;
    } catch (e) { this.active = -1; }
};

Sidebar.prototype.setTrack = function (handle) {
    this.metadb = handle;
    this.art.raw = getArt(handle);
    this.art.sized = {};
};

Sidebar.prototype.artwork = function (size) {
    if (!this.art.raw || size < 4) return null;
    size = Math.round(size);
    if (this.art.sized[size] === undefined) this.art.sized[size] = squareImage(this.art.raw, size);
    return this.art.sized[size];
};

Sidebar.prototype.setViewport = function (x, y, w, h) {
    this.ox = x; this.oy = y;
    this.layout(w, h);
};

Sidebar.prototype.layout = function (W, H) {
    this.W = W; this.H = H;
    if (this.ox === undefined) { this.ox = 0; this.oy = 0; }
    this.pad = px(14);
    this.headerH = px(34);
    this.listTop = this.oy + this.headerH;
    var need = this.lists.length * this.rowH;
    var artSide = Math.min(W - this.pad * 2, px(260));
    var spare = H - this.headerH - need - px(20);
    // only show the artwork if it does not squeeze the playlists
    this.artSize = (spare > artSide * 0.75 && artSide > px(90)) ? artSide : 0;
    this.listH = H - this.headerH - (this.artSize ? this.artSize + px(52) : 0);
};

Sidebar.prototype.rowAt = function (y) {
    if (y < this.listTop || y >= this.listTop + this.listH) return -1;
    var i = Math.floor((y - this.listTop + this.scroll) / this.rowH);
    return (i >= 0 && i < this.lists.length) ? i : -1;
};

Sidebar.prototype.paint = function (gr) {
    var x0 = this.ox, y0 = this.oy, W = this.W, pad = this.pad;
    gr.FillRectangle(x0, y0, W, this.H, colours.bg);

    drawText(gr, '재생목록', fonts.small, colours.sub,
        x0 + pad, y0 + px(6), W - pad * 2, px(22), TEXT_LEFT);

    var visible = Math.ceil(this.listH / this.rowH);
    var first = Math.max(0, Math.floor(this.scroll / this.rowH));
    for (var n = 0; n < visible; n++) {
        var i = first + n;
        if (i >= this.lists.length) break;
        var pl = this.lists[i];
        var y = this.listTop + i * this.rowH - this.scroll;
        if (y + this.rowH > this.listTop + this.listH + 1) break;
        var current = pl.idx === this.active;
        if (current || this.hoverRow === i) {
            fillRound(gr, x0 + px(6), y + px(1), W - px(12), this.rowH - px(3), px(6),
                current ? colours.sel : colours.hover);
        }
        drawText(gr, pl.name, fonts.body, current ? ACCENT : colours.text,
            x0 + pad, y, W - pad * 2 - px(30), this.rowH, TEXT_LEFT);
        drawText(gr, '' + pl.count, fonts.tiny, colours.sub,
            x0 + W - pad - px(28), y, px(28), this.rowH, TEXT_RIGHT);
    }

    if (this.artSize > 0) {
        var ax = x0 + Math.round((W - this.artSize) / 2);
        var ay = y0 + this.H - this.artSize - px(44);
        if (!drawArt(gr, this.artwork(this.artSize), ax, ay, this.artSize, px(8))) {
            fillRound(gr, ax, ay, this.artSize, this.artSize, px(8), colours.card);
            drawIcon(gr, 'note', ax + this.artSize / 2, ay + this.artSize / 2, this.artSize * 0.22, colours.sub);
        }
        var title = this.metadb ? evalTf(tf.title, this.metadb) : '';
        var artist = this.metadb ? evalTf(tf.artist, this.metadb) : '';
        drawText(gr, title, fonts.title, colours.text,
            x0 + pad, ay + this.artSize + px(6), W - pad * 2, px(19), TEXT_CENTRE);
        drawText(gr, artist, fonts.small, colours.sub,
            x0 + pad, ay + this.artSize + px(24), W - pad * 2, px(16), TEXT_CENTRE);
    }
};

Sidebar.prototype.move = function (x, y) {
    var i = this.rowAt(y);
    if (i !== this.hoverRow) {
        this.hoverRow = i;
        window.SetCursor(i >= 0 ? IDC_HAND : IDC_ARROW);
        window.Repaint();
    }
};

Sidebar.prototype.leave = function () {
    if (this.hoverRow !== -1) { this.hoverRow = -1; window.Repaint(); }
};

Sidebar.prototype.up = function (x, y) {
    var i = this.rowAt(y);
    if (i >= 0) {
        try { plman.ActivePlaylist = this.lists[i].idx; } catch (e) {}
        this.active = this.lists[i].idx;
        window.Repaint();
    }
};

Sidebar.prototype.wheel = function (step) {
    var max = Math.max(0, this.lists.length * this.rowH - this.listH);
    this.scroll = clamp(this.scroll - step * this.rowH * 2, 0, max);
    window.Repaint();
};

// -------------------------------------------------------------- COMPOSITE ---
//  Default UI starts life as a single area, and splitting it up is fiddly.
//  This mode puts the whole thing — transport bar, now playing, track list —
//  inside one panel, so pasting the script into that one area is enough.

function Composite() {
    this.bar = new Player(true);
    this.side = new Sidebar();
    this.list = new Playlist();
    this.parts = [];
    this.captured = null;
    this.hover = '';
}

Composite.prototype.layout = function (W, H) {
    this.W = W; this.H = H;
    var barH = clamp(Math.round(H * 0.15), px(58), px(92));
    if (H < px(300)) barH = Math.max(px(46), Math.round(H * 0.26));
    var sideW = W >= px(620) ? clamp(Math.round(W * 0.24), px(190), px(280)) : 0;
    this.barH = barH; this.sideW = sideW;

    this.bar.setViewport(0, 0, W, barH);
    if (sideW > 0) {
        this.side.setViewport(0, barH + 1, sideW, H - barH - 1);
        this.list.setViewport(sideW + 1, barH + 1, W - sideW - 1, H - barH - 1);
        this.parts = [this.bar, this.side, this.list];
    } else {
        this.list.setViewport(0, barH + 1, W, H - barH - 1);
        this.parts = [this.bar, this.list];
    }
};

Composite.prototype.paint = function (gr) {
    for (var i = 0; i < this.parts.length; i++) this.parts[i].paint(gr);
    gr.FillRectangle(0, this.barH, this.W, 1, colours.line);
    if (this.sideW > 0) gr.FillRectangle(this.sideW, this.barH, 1, this.H - this.barH, colours.line);
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
    for (var i = 0; i < this.parts.length; i++) {
        if (this.parts[i].leave) this.parts[i].leave();
    }
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
    this.side.refresh();
    this.layout(this.W, this.H);
};
Composite.prototype.artDone = function (metadb, image) { this.list.artDone(metadb, image); };

Composite.prototype.setTrack = function (handle) {
    this.bar.setTrack(handle);
    this.side.setTrack(handle);
};

Composite.prototype.tick = function () {
    for (var i = 0; i < this.parts.length; i++) {
        if (this.parts[i].tick) this.parts[i].tick();
    }
};

// ------------------------------------------------------------- THE PANEL ----

var panel = null, panelKind = '', timerId = null, reportedError = '';

function resolveMode(W, H) {
    var m = ('' + props.mode).toLowerCase();
    if (m === 'all' || m === 'player' || m === 'bar' || m === 'list') return m;
    if (H <= px(150) && W > px(340)) return 'bar';
    if (W >= px(560) && H >= px(360)) return 'all';   // a whole window: draw everything
    return 'player';
}

function buildPanel(W, H) {
    var kind = resolveMode(W, H);
    if (kind !== panelKind || !panel) {
        panelKind = kind;
        panel = kind === 'all' ? new Composite()
              : kind === 'list' ? new Playlist()
              : new Player(kind === 'bar');
    }
    panel.layout(W, H);
}

function applyTheme(name) {
    props.theme = name;
    window.SetProperty('Apple Music.Theme (dark|light)', name);
    colours = THEMES[name === 'light' ? 'light' : 'dark'];
    svgCache = {}; svgOrder = [];
    window.Repaint();
}

function setMode(mode) {
    props.mode = mode;
    window.SetProperty('Apple Music.Mode (auto|player|bar|list)', mode);
    panelKind = '';
    buildPanel(window.Width, window.Height);
    window.Repaint();
}

var CONTEXT_BASE = 1000;

// One menu for everything: the track commands when the click landed on a
// track, then this panel's own options underneath. That way the panel
// options are reachable from anywhere in the panel.
function showPanelMenu(x, y, cmm) {
    var menu = null, theme = null, mode = null;
    try {
        menu = window.CreatePopupMenu();
        theme = window.CreatePopupMenu();
        mode = window.CreatePopupMenu();

        if (cmm) {
            cmm.BuildMenu(menu, CONTEXT_BASE);
            menu.AppendMenuSeparator();
        }

        theme.AppendMenuItem(MF_STRING, 1, '다크');
        theme.AppendMenuItem(MF_STRING, 2, '라이트');
        theme.CheckMenuRadioItem(1, 2, props.theme === 'light' ? 2 : 1);
        theme.AppendTo(menu, MF_STRING, '테마');

        var modes = ['auto', 'all', 'player', 'bar', 'list'];
        var labels = ['자동', '전체 (한 패널에 전부)', '플레이어 (세로)', '바 (가로)', '재생목록'];
        var cur = 0;
        for (var i = 0; i < modes.length; i++) {
            mode.AppendMenuItem(MF_STRING, 10 + i, labels[i]);
            if (modes[i] === props.mode) cur = i;
        }
        mode.CheckMenuRadioItem(10, 10 + modes.length - 1, 10 + cur);
        mode.AppendTo(menu, MF_STRING, '패널 모드');

        menu.AppendMenuSeparator();
        menu.AppendMenuItem(MF_STRING, 20, 'Apple Music 패널 속성…');
        menu.AppendMenuItem(MF_STRING, 21, 'Apple Music 스크립트 편집…');

        var id = menu.TrackPopupMenu(x, y);
        if (cmm && id >= CONTEXT_BASE) cmm.ExecuteByID(id - CONTEXT_BASE);
        else if (id === 1) applyTheme('dark');
        else if (id === 2) applyTheme('light');
        else if (id >= 10 && id < 10 + modes.length) setMode(modes[id - 10]);
        else if (id === 20) window.ShowProperties();
        else if (id === 21) window.ShowConfigure();
        return true;
    } catch (e) {
        console.log('Apple Music menu: ' + e);
        return false;
    } finally {
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
            console.log('Apple Music panel: ' + e);
        }
        gr.Clear(colours.bg);
        gr.WriteText('Apple Music panel error: ' + e, fonts.small.str, colours.text,
            px(10), px(10), window.Width - px(20), window.Height - px(20),
            TEXT_LEFT, PARA_TOP, WRAP_ON, TRIM_NONE);
    }
}

function on_size() {
    if (window.Width > 0 && window.Height > 0) buildPanel(window.Width, window.Height);
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

function on_key_down(vkey) { if (panel.key) panel.key(vkey); }

function on_playback_new_track(handle) {
    if (panel.setTrack) panel.setTrack(handle);
    window.Repaint();
}

function on_playback_stop(reason) {
    if (reason !== 2 && panel.setTrack) panel.setTrack(null);
    window.Repaint();
}

function on_playback_dynamic_info_track() {
    if (panel.setTrack) panel.setTrack(fb.GetNowPlaying());
    window.Repaint();
}

function on_playback_pause() { window.Repaint(); }
function on_playback_seek() { window.Repaint(); }
function on_playback_time() { window.Repaint(); }
function on_playback_order_changed() { window.Repaint(); }
function on_volume_change() { window.Repaint(); }

function on_get_album_art_done(metadb, art_id, image) {
    if (panel.artDone) panel.artDone(metadb, image);
}

function on_playlist_switch() { if (panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlists_changed() { if (panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlist_items_added() { if (panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlist_items_removed() { if (panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlist_items_reordered() { if (panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlist_items_selection_change() { window.Repaint(); }
function on_item_focus_change() { window.Repaint(); }
function on_metadb_changed() { if (panel.refresh) panel.refresh(); window.Repaint(); }

// ------------------------------------------------------------------ INIT ----

buildPanel(window.Width || 400, window.Height || 400);
timerId = window.SetInterval(function () { if (panel.tick) panel.tick(); }, 40);
