// =============================================================================
//  Apple Music style player for foobar2000
// -----------------------------------------------------------------------------
//  A single script that renders three different panels depending on the
//  "Apple Music.Mode" property:
//
//      player  - portrait "now playing" panel (big artwork + controls)
//      bar     - compact horizontal transport bar with a centred LCD card
//      list    - Apple Music style playlist / track list
//      auto    - picks "bar" or "player" from the panel proportions
//
//  Tested with JScript Panel 3 (foobar2000 v2). Written in plain ES5 so it also
//  runs on JScript Panel 2 and Spider Monkey Panel (foobar2000 v1.6).
//  Every host specific call is feature detected, see the COMPAT section.
//
//  Right click the panel for theme / mode options.
// =============================================================================

// ----------------------------------------------------------------- COMPAT ---

function startTimer(fn, delay) {
    if (typeof window.SetInterval === 'function') return window.SetInterval(fn, delay);
    return setInterval(fn, delay);
}

function stopTimer(id) {
    if (id == null) return;
    try {
        if (typeof window.ClearInterval === 'function') window.ClearInterval(id);
        else clearInterval(id);
    } catch (e) {}
}

function fontExists(name) {
    try { if (typeof utils.CheckFont === 'function') return utils.CheckFont(name); } catch (e) {}
    return true;
}

// Accepts a comma separated wish list, returns the first font that exists.
function makeFont(list, size, style) {
    var names = list.split(',');
    for (var i = 0; i < names.length; i++) {
        var n = names[i].replace(/^\s+|\s+$/g, '');
        if (!n || !fontExists(n)) continue;
        try { return gdi.Font(n, size, style || 0); } catch (e) {}
    }
    try { return gdi.Font('Segoe UI', size, style || 0); } catch (e) { return null; }
}

function getArt(handle) {
    if (!handle) return null;
    var img = null;
    try { if (typeof utils.GetAlbumArtV2 === 'function') img = utils.GetAlbumArtV2(handle, 0); } catch (e) {}
    if (!img) { try { if (typeof utils.GetAlbumArtV2 === 'function') img = utils.GetAlbumArtV2(handle, 4); } catch (e) {} }
    if (!img) { try { if (typeof utils.GetAlbumArtEmbedded === 'function') img = utils.GetAlbumArtEmbedded(handle.Path, 0); } catch (e) {} }
    return img;
}

function playingLocation() {
    try {
        var loc = plman.GetPlayingItemLocation();
        if (loc && loc.IsValid) return { pl: loc.PlaylistIndex, item: loc.PlaylistItemIndex };
    } catch (e) {}
    return null;
}

// MetadbHandleList indexing differs between hosts.
function listItem(list, i) {
    try { if (typeof list.Item === 'function') return list.Item(i); } catch (e) {}
    try { return list[i]; } catch (e) {}
    return null;
}

function setCursorHand(on) {
    try { window.SetCursor(on ? 32649 : 32512); } catch (e) {}
}

// ------------------------------------------------------------- PRIMITIVES ---

function RGB(r, g, b) { return (0xff000000 | (r << 16) | (g << 8) | b); }
function RGBA(r, g, b, a) { return ((a << 24) | (r << 16) | (g << 8) | b); }

function alpha(colour, a) {
    return RGBA((colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff, a);
}

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

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function pad2(n) { return n < 10 ? '0' + n : '' + n; }

function fmtTime(t) {
    if (!isFinite(t) || t < 0) t = 0;
    t = Math.floor(t);
    var s = t % 60, m = Math.floor(t / 60), h = Math.floor(m / 60);
    if (h > 0) return h + ':' + pad2(m % 60) + ':' + pad2(s);
    return m + ':' + pad2(s);
}

// Rounded rectangle that never throws on small sizes.
function fillRound(gr, x, y, w, h, r, colour) {
    if (w <= 0 || h <= 0) return;
    r = Math.min(r, Math.floor(w / 2) - 1, Math.floor(h / 2) - 1);
    if (r < 1) { gr.FillSolidRect(x, y, w, h, colour); return; }
    try { gr.FillRoundRect(x, y, w - 1, h - 1, r, r, colour); }
    catch (e) { gr.FillSolidRect(x, y, w, h, colour); }
}

function drawRound(gr, x, y, w, h, r, lw, colour) {
    if (w <= 0 || h <= 0) return;
    r = Math.min(r, Math.floor(w / 2) - 1, Math.floor(h / 2) - 1);
    if (r < 1) return;
    try { gr.DrawRoundRect(x, y, w - 1, h - 1, r, r, lw, colour); } catch (e) {}
}

// GDI text. Flags are the usual DT_* constants.
var DT_LEFT = 0x00000000, DT_CENTER = 0x00000001, DT_RIGHT = 0x00000002,
    DT_VCENTER = 0x00000004, DT_WORDBREAK = 0x00000010, DT_SINGLELINE = 0x00000020,
    DT_CALCRECT = 0x00000400, DT_NOPREFIX = 0x00000800, DT_END_ELLIPSIS = 0x00008000;
var DT_LINE = DT_SINGLELINE | DT_VCENTER | DT_NOPREFIX | DT_END_ELLIPSIS;

function drawText(gr, text, font, colour, x, y, w, h, flags) {
    if (text == null || text === '' || !font || w <= 0 || h <= 0) return;
    try {
        gr.GdiDrawText('' + text, font, colour, Math.round(x), Math.round(y),
            Math.round(w), Math.round(h), flags == null ? DT_LINE : flags);
    } catch (e) {
        try { gr.DrawString('' + text, font, colour, x, y, w, h); } catch (e2) {}
    }
}

function textWidth(gr, text, font) {
    if (!text || !font) return 0;
    try { return gr.CalcTextWidth('' + text, font); } catch (e) { return 0; }
}

// ------------------------------------------------------------ ARTWORK -------

var maskCache = {};

function roundMask(size, radius) {
    var key = size + '_' + radius;
    if (maskCache[key]) return maskCache[key];
    try {
        var m = gdi.CreateImage(size, size);
        var g = m.GetGraphics();
        g.SetSmoothingMode(2);
        g.FillSolidRect(0, 0, size, size, RGB(255, 255, 255));
        fillRound(g, 0, 0, size, size, radius, RGB(0, 0, 0));
        m.ReleaseGraphics(g);
        maskCache[key] = m;
        return m;
    } catch (e) { return null; }
}

// Centre-crops to a square, resizes and rounds the corners.
function squareArt(img, size, radius) {
    if (!img || size < 4) return null;
    try {
        var bmp = gdi.CreateImage(size, size);
        var g = bmp.GetGraphics();
        try { g.SetInterpolationMode(7); } catch (e) {}
        var sw = img.Width, sh = img.Height, s = Math.min(sw, sh);
        g.DrawImage(img, 0, 0, size, size, (sw - s) / 2, (sh - s) / 2, s, s);
        bmp.ReleaseGraphics(g);
        if (radius > 0) {
            var mask = roundMask(size, radius);
            if (mask) { try { bmp.ApplyMask(mask); } catch (e) {} }
        }
        return bmp;
    } catch (e) {
        try { return img.Resize(size, size); } catch (e2) { return img; }
    }
}

// --------------------------------------------------------------- THEMES -----

var THEMES = {
    dark: {
        bg:      RGB(0x1c, 0x1c, 0x1e),
        card:    RGB(0x2c, 0x2c, 0x2e),
        hover:   RGB(0x2c, 0x2c, 0x2e),
        sel:     RGB(0x3a, 0x3a, 0x3c),
        line:    RGB(0x38, 0x38, 0x3a),
        text:    RGB(0xf5, 0xf5, 0xf7),
        sub:     RGB(0x98, 0x98, 0x9e),
        icon:    RGB(0xe8, 0xe8, 0xed),
        track:   RGB(0x48, 0x48, 0x4a),
        shadow:  RGB(0, 0, 0)
    },
    light: {
        bg:      RGB(0xff, 0xff, 0xff),
        card:    RGB(0xf5, 0xf5, 0xf7),
        hover:   RGB(0xf2, 0xf2, 0xf7),
        sel:     RGB(0xe8, 0xe8, 0xed),
        line:    RGB(0xe5, 0xe5, 0xea),
        text:    RGB(0x1d, 0x1d, 0x1f),
        sub:     RGB(0x6e, 0x6e, 0x73),
        icon:    RGB(0x3a, 0x3a, 0x3c),
        track:   RGB(0xd1, 0xd1, 0xd6),
        shadow:  RGB(0x8e, 0x8e, 0x93)
    }
};

// ------------------------------------------------------------ PROPERTIES ----

var props = {
    mode:      window.GetProperty('Apple Music.Mode (auto|player|bar|list)', 'auto'),
    theme:     window.GetProperty('Apple Music.Theme (dark|light)', 'dark'),
    accent:    window.GetProperty('Apple Music.Accent colour', '#FA243C'),
    scale:     window.GetProperty('Apple Music.Scale %', 100),
    rowHeight: window.GetProperty('Apple Music.List row height', 46),
    rowArt:    window.GetProperty('Apple Music.List artwork', true),
    fontFace:  window.GetProperty('Apple Music.Font', 'SF Pro Display, SF Pro Text, Pretendard, Apple SD Gothic Neo, Segoe UI Variable Display, Segoe UI, Malgun Gothic')
};

function setProp(name, value) { window.SetProperty(name, value); }

var S = clamp(props.scale / 100, 0.5, 3);          // user scale
function px(v) { return Math.round(v * S); }

var colours = THEMES[props.theme === 'light' ? 'light' : 'dark'];
var ACCENT = hexColour(props.accent, RGB(0xfa, 0x24, 0x3c));

var fonts = {
    huge:   makeFont(props.fontFace, Math.round(19 * S), 1),
    title:  makeFont(props.fontFace, Math.round(13 * S), 1),
    body:   makeFont(props.fontFace, Math.round(12 * S), 0),
    small:  makeFont(props.fontFace, Math.round(10 * S), 0),
    tiny:   makeFont(props.fontFace, Math.round(9 * S), 0)
};

function applyTheme(name) {
    props.theme = name;
    setProp('Apple Music.Theme (dark|light)', name);
    colours = THEMES[name === 'light' ? 'light' : 'dark'];
    artCache.reset();
    window.Repaint();
}

// ---------------------------------------------------------------- ICONS -----
//  All icons are drawn as vectors so they look identical on every machine and
//  scale cleanly. (cx, cy) is the centre, "size" the nominal box size.

function iconPlay(gr, cx, cy, size, c) {
    var h = size * 0.46, w = size * 0.40;
    gr.SetSmoothingMode(2);
    gr.FillPolygon(c, 0, [cx - w * 0.75, cy - h, cx + w, cy, cx - w * 0.75, cy + h]);
}

function iconPause(gr, cx, cy, size, c) {
    var w = size * 0.16, h = size * 0.90, gap = size * 0.18;
    gr.SetSmoothingMode(2);
    fillRound(gr, cx - gap / 2 - w, cy - h / 2, w, h, Math.max(1, w / 3), c);
    fillRound(gr, cx + gap / 2, cy - h / 2, w, h, Math.max(1, w / 3), c);
}

function iconNext(gr, cx, cy, size, c) {
    var h = size * 0.40, w = size * 0.34;
    gr.SetSmoothingMode(2);
    gr.FillPolygon(c, 0, [cx - w * 1.05, cy - h, cx + w * 0.05, cy, cx - w * 1.05, cy + h]);
    gr.FillPolygon(c, 0, [cx + w * 0.05, cy - h, cx + w * 1.15, cy, cx + w * 0.05, cy + h]);
}

function iconPrev(gr, cx, cy, size, c) {
    var h = size * 0.40, w = size * 0.34;
    gr.SetSmoothingMode(2);
    gr.FillPolygon(c, 0, [cx + w * 1.05, cy - h, cx - w * 0.05, cy, cx + w * 1.05, cy + h]);
    gr.FillPolygon(c, 0, [cx - w * 0.05, cy - h, cx - w * 1.15, cy, cx - w * 0.05, cy + h]);
}

function arrowHead(gr, x, y, dir, s, c) {
    // dir: 1 = pointing right, -1 = pointing left
    gr.FillPolygon(c, 0, [x, y - s, x + s * 1.1 * dir, y, x, y + s]);
}

function iconShuffle(gr, cx, cy, size, c) {
    var w = size * 0.44, h = size * 0.30, lw = Math.max(1, size * 0.085);
    gr.SetSmoothingMode(2);
    gr.DrawLine(cx - w, cy - h, cx + w * 0.45, cy + h, lw, c);
    gr.DrawLine(cx - w, cy + h, cx - w * 0.25, cy + h * 0.35, lw, c);
    gr.DrawLine(cx + w * 0.1, cy - h * 0.5, cx + w * 0.45, cy - h, lw, c);
    arrowHead(gr, cx + w * 0.42, cy - h, 1, size * 0.17, c);
    arrowHead(gr, cx + w * 0.42, cy + h, 1, size * 0.17, c);
}

function iconRepeat(gr, cx, cy, size, c, bg, one) {
    var w = size * 0.86, h = size * 0.62, lw = Math.max(1, size * 0.085);
    gr.SetSmoothingMode(2);
    drawRound(gr, cx - w / 2, cy - h / 2, w, h, Math.max(2, h / 2.2), lw, c);
    // punch a gap in the top edge, then place the arrow head there
    gr.FillSolidRect(cx + w * 0.02, cy - h / 2 - lw, w * 0.28, lw * 2.2, bg);
    arrowHead(gr, cx + w * 0.10, cy - h / 2, 1, size * 0.16, c);
    if (one) drawText(gr, '1', fonts.tiny, c, cx - size * 0.4, cy - size * 0.4, size * 0.8, size * 0.8,
        DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
}

function iconSpeaker(gr, cx, cy, size, c, bg, waves) {
    var b = size * 0.5;
    gr.SetSmoothingMode(2);
    if (waves > 0) {
        var lw = Math.max(1, size * 0.07);
        for (var i = 0; i < waves; i++) {
            var r = b * (0.5 + i * 0.42);
            gr.DrawEllipse(cx - b * 0.05 - r, cy - r, r * 2, r * 2, lw, c);
        }
        // keep only the right half of each ring, then draw the cone over the seam
        gr.FillSolidRect(cx - size, cy - size, size + b * 0.05, size * 2, bg);
    }
    gr.FillSolidRect(cx - b * 0.85, cy - b * 0.28, b * 0.35, b * 0.56, c);
    gr.FillPolygon(c, 0, [cx - b * 0.5, cy - b * 0.28, cx - b * 0.02, cy - b * 0.72,
                          cx - b * 0.02, cy + b * 0.72, cx - b * 0.5, cy + b * 0.28]);
}

function iconEq(gr, x, y, w, h, c, phase, animated) {
    // little animated equalizer used as the "now playing" marker
    var bars = 3, bw = w / (bars * 2 - 1);
    for (var i = 0; i < bars; i++) {
        var f = animated
            ? 0.35 + 0.65 * Math.abs(Math.sin(phase * 0.11 + i * 1.1))
            : (i === 1 ? 0.9 : 0.5);
        var bh = Math.max(2, h * f);
        fillRound(gr, x + i * bw * 2, y + h - bh, bw, bh, Math.max(1, bw / 2), c);
    }
}

// ------------------------------------------------------------ ART CACHE -----

var artCache = {
    raw: null,          // GdiBitmap of the current track, unprocessed
    key: '',
    sized: {},          // "size_radius" -> rounded bitmap
    thumbs: {},         // album key -> rounded thumbnail
    order: [],
    max: 96,

    reset: function () {
        this.sized = {};
        this.thumbs = {};
        this.order = [];
    },

    setNowPlaying: function (handle) {
        this.raw = getArt(handle);
        this.sized = {};
    },

    now: function (size, radius) {
        if (!this.raw || size < 4) return null;
        var k = size + '_' + radius;
        if (!this.sized[k]) this.sized[k] = squareArt(this.raw, size, radius);
        return this.sized[k];
    },

    thumb: function (key, handle, size, radius) {
        var k = key + '@' + size;
        if (this.thumbs.hasOwnProperty(k)) return this.thumbs[k];
        var img = getArt(handle);
        var out = img ? squareArt(img, size, radius) : null;
        this.thumbs[k] = out;
        this.order.push(k);
        while (this.order.length > this.max) delete this.thumbs[this.order.shift()];
        return out;
    }
};

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

// -------------------------------------------------------- TRANSPORT STATE ---

function isShuffle() {
    try { return fb.PlaybackOrder >= 3; } catch (e) { return false; }
}

function repeatMode() {                       // 0 none, 1 all, 2 one
    try {
        var o = fb.PlaybackOrder;
        return o === 1 ? 1 : (o === 2 ? 2 : 0);
    } catch (e) { return 0; }
}

function toggleShuffle() {
    try { fb.PlaybackOrder = isShuffle() ? 0 : 4; } catch (e) {}
}

function cycleRepeat() {
    try {
        var r = repeatMode();
        fb.PlaybackOrder = r === 0 ? 1 : (r === 1 ? 2 : 0);
    } catch (e) {}
}

function volumeToPos() {                      // dB -> 0..1
    try {
        var v = fb.Volume;
        if (v <= -100) return 0;
        return clamp(Math.pow(10, v / 50), 0, 1);
    } catch (e) { return 1; }
}

function posToVolume(p) {
    p = clamp(p, 0, 1);
    try { fb.Volume = p <= 0.0001 ? -100 : clamp(50 * Math.log(p) / Math.LN10, -100, 0); } catch (e) {}
}

// --------------------------------------------------------------- BUTTONS ----

function Button(id, draw, action) {
    this.id = id;
    this.draw = draw;
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

// ---------------------------------------------------------------- PLAYER ----

function Player(bar) {
    this.bar = bar;                 // true = compact transport bar
    this.hover = '';
    this.dragSeek = false;
    this.dragVol = false;
    this.seekPos = 0;
    this.rcSeek = { x: 0, y: 0, w: 0, h: 0 };
    this.rcVol = { x: 0, y: 0, w: 0, h: 0 };
    this.rcArt = { x: 0, y: 0, w: 0, h: 0 };
    this.showVol = true;
    this.showOrder = true;
    this.buttons = [];
    this.phase = 0;
    this.build();
    this.metadb = fb.GetNowPlaying();
    artCache.setNowPlaying(this.metadb);
}

Player.prototype.build = function () {
    var self = this;
    this.buttons = [
        new Button('shuffle',
            function (gr, b) {
                var on = isShuffle();
                iconShuffle(gr, b.x + b.w / 2, b.y + b.h / 2, b.h * 0.62,
                    on ? ACCENT : self.iconColour('shuffle'));
            },
            function () { toggleShuffle(); }),
        new Button('prev',
            function (gr, b) { iconPrev(gr, b.x + b.w / 2, b.y + b.h / 2, b.h * 0.68, self.iconColour('prev')); },
            function () { fb.Prev(); }),
        new Button('play',
            function (gr, b) {
                var c = self.iconColour('play'), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
                if (fb.IsPlaying && !fb.IsPaused) iconPause(gr, cx, cy, b.h * 0.78, c);
                else iconPlay(gr, cx + b.h * 0.03, cy, b.h * 0.82, c);
            },
            function () { fb.PlayOrPause(); }),
        new Button('next',
            function (gr, b) { iconNext(gr, b.x + b.w / 2, b.y + b.h / 2, b.h * 0.68, self.iconColour('next')); },
            function () { fb.Next(); }),
        new Button('repeat',
            function (gr, b) {
                var r = repeatMode();
                iconRepeat(gr, b.x + b.w / 2, b.y + b.h / 2, b.h * 0.60,
                    r ? ACCENT : self.iconColour('repeat'), colours.bg, r === 2);
            },
            function () { cycleRepeat(); })
    ];
};

Player.prototype.iconColour = function (id) {
    return this.hover === id ? blend(colours.icon, colours.text, 0.9) : colours.icon;
};

Player.prototype.find = function (id) {
    for (var i = 0; i < this.buttons.length; i++) if (this.buttons[i].id === id) return this.buttons[i];
    return null;
};

Player.prototype.layout = function (W, H) {
    this.W = W; this.H = H;
    return this.bar ? this.layoutBar(W, H) : this.layoutFull(W, H);
};

Player.prototype.layoutFull = function (W, H) {
    var pad = px(22);
    var big = px(52), small = px(34), gap = px(14);
    var blockH = px(20 + 26 + 20 + 12 + 30 + 16 + 12) + big + pad;

    this.showOrder = W > px(230);

    var art = Math.min(W - pad * 2, H - blockH - pad * 2);
    art = art < px(70) ? 0 : Math.min(art, px(420));
    this.artSize = art;

    var top = art ? Math.max(pad, (H - blockH - art) / 2) : pad;
    this.rcArt = { x: (W - art) / 2, y: top, w: art, h: art };

    var y = top + art + (art ? px(20) : px(4));
    this.titleY = y; y += px(26);
    this.artistY = y; y += px(20) + px(12);
    this.rcSeek = { x: pad, y: y, w: W - pad * 2, h: px(4) };
    this.timesY = y + px(8);
    y += px(30);

    // transport row, centred
    var order = this.showOrder ? 1 : 0;
    var rowW = big + (small + gap) * 2 + (order ? (small + gap) * 2 : 0);
    var x = (W - rowW) / 2;
    if (order) { this.find('shuffle').place(x, y + (big - small) / 2, small, small); x += small + gap; }
    this.find('prev').place(x, y + (big - small) / 2, small, small); x += small + gap;
    this.find('play').place(x, y, big, big); x += big + gap;
    this.find('next').place(x, y + (big - small) / 2, small, small); x += small + gap;
    if (order) this.find('repeat').place(x, y + (big - small) / 2, small, small);
    y += big + px(16);

    var vw = Math.min(px(180), W - pad * 2 - px(56));
    this.showVol = vw > px(50) && y + px(12) < H;
    this.rcVol = this.showVol
        ? { x: (W - vw) / 2 + px(14), y: y, w: vw, h: px(4) }
        : { x: 0, y: 0, w: 0, h: 0 };
};

Player.prototype.layoutBar = function (W, H) {
    var pad = px(8);
    var size = clamp(H - pad * 2, px(24), px(40));
    var big = Math.min(size * 1.15, H - pad * 2);
    var gap = px(6);

    this.showVol = W > px(560);
    this.showOrder = W > px(420);
    this.artSize = 0;

    var cy = H / 2;
    var x = pad;
    this.find('prev').place(x, cy - size / 2, size, size); x += size + gap;
    this.find('play').place(x, cy - big / 2, big, big); x += big + gap;
    this.find('next').place(x, cy - size / 2, size, size); x += size + gap;

    if (this.showVol) {
        x += px(12);
        var vw = px(76);
        this.rcVol = { x: x + px(18), y: cy - px(2), w: vw, h: px(4) };
        x += px(18) + vw;
    } else {
        this.rcVol = { x: 0, y: 0, w: 0, h: 0 };
    }
    var leftEnd = x;

    var rightStart = W - pad;
    if (this.showOrder) {
        this.find('repeat').place(W - pad - size, cy - size / 2, size, size);
        this.find('shuffle').place(W - pad - size * 2 - gap, cy - size / 2, size, size);
        rightStart = W - pad - size * 2 - gap;
    }

    var avail = rightStart - leftEnd - px(28);
    var cw = clamp(avail, px(150), px(520));
    var cx = leftEnd + px(14) + Math.max(0, (avail - cw) / 2);
    var ch = H - pad * 2;
    this.card = { x: cx, y: pad, w: cw, h: ch, visible: avail > px(140) };

    var ar = Math.max(0, ch - px(10));
    this.rcArt = { x: cx + px(5), y: pad + px(5), w: ar, h: ar };

    var tx = cx + px(5) + ar + px(10);
    var tw = Math.max(px(40), cx + cw - px(10) - tx);
    this.cardText = { x: tx, w: tw };
    this.cardTitleY = pad + Math.max(px(3), (ch - px(12) - px(32)) / 2);
    this.cardArtistY = this.cardTitleY + px(17);
    this.rcSeek = { x: tx + px(34), y: pad + ch - px(10), w: Math.max(0, tw - px(70)), h: px(3) };
};

Player.prototype.seekRatio = function () {
    if (this.dragSeek) return this.seekPos;
    var len = 0, t = 0;
    try { len = fb.PlaybackLength; t = fb.PlaybackTime; } catch (e) {}
    return len > 0 ? clamp(t / len, 0, 1) : 0;
};

Player.prototype.drawSlider = function (gr, rc, ratio, hovered, colour) {
    if (rc.w <= 0) return;
    var r = rc.h / 2;
    fillRound(gr, rc.x, rc.y, rc.w, rc.h, r, colours.track);
    var w = Math.round(rc.w * clamp(ratio, 0, 1));
    if (w > 1) fillRound(gr, rc.x, rc.y, w, rc.h, r, colour);
    if (hovered) {
        var d = rc.h * 3.2;
        gr.SetSmoothingMode(2);
        gr.FillEllipse(rc.x + w - d / 2, rc.y + rc.h / 2 - d / 2, d, d, colours.text);
    }
};

Player.prototype.paint = function (gr) {
    gr.FillSolidRect(0, 0, this.W, this.H, colours.bg);
    gr.SetSmoothingMode(2);
    this.bar ? this.paintBar(gr) : this.paintFull(gr);
};

Player.prototype.paintFull = function (gr) {
    var W = this.W, playing = !!this.metadb;
    var title = playing ? evalTf(tf.title, this.metadb) : '재생 중인 항목 없음';
    var artist = playing ? evalTf(tf.artist, this.metadb) : '';
    var album = playing ? evalTf(tf.album, this.metadb) : '';
    var pad = px(22);

    if (this.artSize > 0) {
        var rc = this.rcArt, rad = px(10);
        // soft drop shadow
        for (var i = 6; i > 0; i--) {
            fillRound(gr, rc.x - i, rc.y - i * 0.4 + px(4), rc.w + i * 2, rc.h + i * 2,
                rad + i, alpha(colours.shadow, props.theme === 'light' ? 6 : 10));
        }
        var img = artCache.now(Math.round(rc.w), rad);
        if (img) gr.DrawImage(img, rc.x, rc.y, rc.w, rc.h, 0, 0, img.Width, img.Height);
        else {
            fillRound(gr, rc.x, rc.y, rc.w, rc.h, rad, colours.card);
            iconEq(gr, rc.x + rc.w / 2 - px(11), rc.y + rc.h / 2 - px(9), px(22), px(18), colours.sub, 0, false);
        }
    }

    drawText(gr, title, fonts.huge, colours.text, pad, this.titleY, W - pad * 2, px(26),
        DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_END_ELLIPSIS);
    var sub = artist + (album && artist ? ' — ' + album : album);
    drawText(gr, sub, fonts.body, this.hover === 'art' ? ACCENT : colours.sub,
        pad, this.artistY, W - pad * 2, px(20),
        DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_END_ELLIPSIS);

    var ratio = this.seekRatio(), len = 0;
    try { len = fb.PlaybackLength; } catch (e) {}
    this.drawSlider(gr, this.rcSeek, ratio, this.hover === 'seek' || this.dragSeek, ACCENT);
    if (len > 0) {
        drawText(gr, fmtTime(ratio * len), fonts.small, colours.sub, this.rcSeek.x, this.timesY, px(60), px(16),
            DT_LEFT | DT_SINGLELINE | DT_NOPREFIX);
        drawText(gr, '-' + fmtTime(len - ratio * len), fonts.small, colours.sub,
            this.rcSeek.x + this.rcSeek.w - px(60), this.timesY, px(60), px(16),
            DT_RIGHT | DT_SINGLELINE | DT_NOPREFIX);
    }

    for (var b = 0; b < this.buttons.length; b++) {
        var btn = this.buttons[b];
        if (!this.showOrder && (btn.id === 'shuffle' || btn.id === 'repeat')) continue;
        btn.draw(gr, btn);
    }

    if (this.rcVol.w > 0) {
        var v = volumeToPos();
        iconSpeaker(gr, this.rcVol.x - px(14), this.rcVol.y + px(2), px(15), colours.sub, colours.bg,
            v > 0.66 ? 2 : (v > 0.05 ? 1 : 0));
        this.drawSlider(gr, this.rcVol, v, this.hover === 'vol' || this.dragVol, colours.icon);
    }
};

Player.prototype.paintBar = function (gr) {
    var playing = !!this.metadb;

    for (var b = 0; b < this.buttons.length; b++) {
        var btn = this.buttons[b];
        if (!this.showOrder && (btn.id === 'shuffle' || btn.id === 'repeat')) continue;
        btn.draw(gr, btn);
    }

    if (this.rcVol.w > 0) {
        var v = volumeToPos();
        iconSpeaker(gr, this.rcVol.x - px(12), this.rcVol.y + px(2), px(14), colours.sub, colours.bg,
            v > 0.66 ? 2 : (v > 0.05 ? 1 : 0));
        this.drawSlider(gr, this.rcVol, v, this.hover === 'vol' || this.dragVol, colours.icon);
    }

    if (!this.card || !this.card.visible) return;
    var c = this.card;
    fillRound(gr, c.x, c.y, c.w, c.h, px(6), colours.card);

    var rc = this.rcArt;
    if (rc.w > 4) {
        var img = artCache.now(Math.round(rc.w), px(4));
        if (img) gr.DrawImage(img, rc.x, rc.y, rc.w, rc.h, 0, 0, img.Width, img.Height);
        else {
            fillRound(gr, rc.x, rc.y, rc.w, rc.h, px(4), colours.hover);
            iconEq(gr, rc.x + rc.w / 2 - px(7), rc.y + rc.h / 2 - px(6), px(14), px(12), colours.sub, 0, false);
        }
    }

    var tx = this.cardText.x, tw = this.cardText.w;
    var title = playing ? evalTf(tf.title, this.metadb) : '재생 중인 항목 없음';
    var artist = playing ? evalTf(tf.artist, this.metadb) : '';
    var album = playing ? evalTf(tf.album, this.metadb) : '';
    var sub = artist + (album && artist ? ' — ' + album : album);
    var flags = DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX | DT_END_ELLIPSIS;
    drawText(gr, title, fonts.title, colours.text, tx, this.cardTitleY, tw, px(17), flags);
    drawText(gr, sub, fonts.small, colours.sub, tx, this.cardArtistY, tw, px(15), flags);

    var ratio = this.seekRatio(), len = 0;
    try { len = fb.PlaybackLength; } catch (e) {}
    this.drawSlider(gr, this.rcSeek, ratio, this.hover === 'seek' || this.dragSeek, ACCENT);
    if (len > 0) {
        drawText(gr, fmtTime(ratio * len), fonts.tiny, colours.sub,
            this.rcSeek.x - px(33), this.rcSeek.y - px(6), px(30), px(14),
            DT_RIGHT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
        drawText(gr, '-' + fmtTime(len - ratio * len), fonts.tiny, colours.sub,
            this.rcSeek.x + this.rcSeek.w + px(4), this.rcSeek.y - px(6), px(32), px(14),
            DT_LEFT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
    }
};

function inRect(rc, x, y, grow) {
    grow = grow || 0;
    return x >= rc.x - grow && x < rc.x + rc.w + grow &&
           y >= rc.y - grow && y < rc.y + rc.h + grow;
}

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
        setCursorHand(h !== '' && h !== 'art');
        window.Repaint();
    }
};

Player.prototype.leave = function () {
    if (this.hover) { this.hover = ''; window.Repaint(); }
};

Player.prototype.down = function (x, y) {
    var h = this.hitTest(x, y);
    if (h === 'seek') {
        var len = 0;
        try { len = fb.PlaybackLength; } catch (e) {}
        if (len > 0) { this.dragSeek = true; this.seekPos = clamp((x - this.rcSeek.x) / this.rcSeek.w, 0, 1); window.Repaint(); }
    } else if (h === 'vol') {
        this.dragVol = true;
        posToVolume((x - this.rcVol.x) / this.rcVol.w);
        window.Repaint();
    }
};

Player.prototype.up = function (x, y) {
    if (this.dragSeek) {
        this.dragSeek = false;
        try {
            var len = fb.PlaybackLength;
            if (len > 0) fb.PlaybackTime = this.seekPos * len;
        } catch (e) {}
        window.Repaint();
        return;
    }
    if (this.dragVol) { this.dragVol = false; window.Repaint(); return; }
    var h = this.hitTest(x, y);
    for (var i = 0; i < this.buttons.length; i++) {
        if (this.buttons[i].id === h) { this.buttons[i].action(); window.Repaint(); return; }
    }
};

Player.prototype.dblclick = function (x, y) {
    if (this.artSize > 0 && inRect(this.rcArt, x, y)) {
        try { fb.RunMainMenuCommand('View/Show now playing in playlist'); } catch (e) {}
    }
};

Player.prototype.wheel = function (step) {
    if (this.hover === 'seek') {
        try {
            var len = fb.PlaybackLength;
            if (len > 0) fb.PlaybackTime = clamp(fb.PlaybackTime + step * 5, 0, len);
        } catch (e) {}
        return;
    }
    posToVolume(volumeToPos() + step * 0.04);
    window.Repaint();
};

Player.prototype.newTrack = function (handle) {
    this.metadb = handle;
    artCache.setNowPlaying(handle);
    window.Repaint();
};

Player.prototype.tick = function () {
    this.phase++;
    // the seek bar only needs a few frames per second
    if (this.phase % 5 === 0 && fb.IsPlaying && !fb.IsPaused && !this.dragSeek) window.Repaint();
};

// -------------------------------------------------------------- PLAYLIST ----

function Playlist() {
    this.rowH = px(clamp(props.rowHeight, 24, 96));
    this.scroll = 0;
    this.target = 0;
    this.hoverRow = -1;
    this.dragBar = false;
    this.dragOffset = 0;
    this.barHover = false;
    this.phase = 0;
    this.cache = {};
    this.pending = [];
    this.items = null;
    this.count = 0;
    this.pl = -1;
    this.refresh();
}

Playlist.prototype.refresh = function () {
    try {
        this.pl = plman.ActivePlaylist;
        this.items = this.pl >= 0 ? plman.GetPlaylistItems(this.pl) : null;
        this.count = this.items ? this.items.Count : 0;
        this.name = this.pl >= 0 ? plman.GetPlaylistName(this.pl) : '';
    } catch (e) { this.items = null; this.count = 0; this.name = ''; }
    this.cache = {};
    this.pending = [];
    this.clampScroll();
};

Playlist.prototype.row = function (i) {
    if (this.cache[i]) return this.cache[i];
    var h = listItem(this.items, i);
    var r = {
        handle: h,
        title: evalTf(tf.title, h) || '(제목 없음)',
        artist: evalTf(tf.artist, h),
        album: evalTf(tf.album, h),
        length: evalTf(tf.length, h),
        key: evalTf(tf.key, h)
    };
    this.cache[i] = r;
    return r;
};

Playlist.prototype.layout = function (W, H) {
    this.W = W; this.H = H;
    this.pad = px(16);
    this.headerH = H > px(240) ? px(62) : 0;
    this.colsH = H > px(160) ? px(24) : 0;
    this.top = this.headerH + this.colsH;
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
    var W = this.W, H = this.H;
    gr.FillSolidRect(0, 0, W, H, colours.bg);
    gr.SetSmoothingMode(2);

    if (this.headerH) {
        drawText(gr, this.name || '재생목록', fonts.huge, colours.text,
            this.pad, px(10), W - this.pad * 2, px(26), DT_LINE);
        drawText(gr, this.count + '곡', fonts.small, colours.sub,
            this.pad, px(34), W - this.pad * 2, px(18), DT_LINE);
    }
    if (this.colsH) {
        var cy = this.headerH;
        drawText(gr, '노래', fonts.tiny, colours.sub, this.pad + (this.showThumb ? this.rowH - px(4) : px(2)),
            cy, px(120), this.colsH, DT_LINE);
        if (this.showAlbum) {
            drawText(gr, '앨범', fonts.tiny, colours.sub, W - this.pad - this.durW - this.albumW,
                cy, this.albumW, this.colsH, DT_LINE);
        }
        drawText(gr, '시간', fonts.tiny, colours.sub, W - this.pad - this.durW, cy, this.durW, this.colsH,
            DT_RIGHT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
        gr.FillSolidRect(this.pad, cy + this.colsH - 1, W - this.pad * 2, 1, colours.line);
    }

    if (!this.count) {
        drawText(gr, '재생목록이 비어 있습니다', fonts.body, colours.sub, 0, this.top, W, px(40),
            DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
        return;
    }

    var loc = playingLocation();
    var playingIdx = (loc && loc.pl === this.pl) ? loc.item : -1;
    var first = Math.max(0, Math.floor(this.scroll / this.rowH));
    var last = Math.min(this.count - 1, Math.ceil((this.scroll + this.view) / this.rowH));

    for (var i = first; i <= last; i++) this.paintRow(gr, i, playingIdx);

    this.paintScrollbar(gr);
};

Playlist.prototype.paintRow = function (gr, i, playingIdx) {
    var y = this.top + i * this.rowH - this.scroll;
    var W = this.W, rowH = this.rowH, pad = this.pad;
    var r = this.row(i);
    var selected = false;
    try { selected = plman.IsPlaylistItemSelected(this.pl, i); } catch (e) {}
    var playing = i === playingIdx;

    if (selected || this.hoverRow === i) {
        fillRound(gr, pad - px(6), y + px(2), W - (pad - px(6)) * 2, rowH - px(4), px(7),
            selected ? colours.sel : colours.hover);
    }

    var x = pad;
    if (this.showThumb) {
        var ts = rowH - px(12);
        var img = artCache.thumb(r.key, r.handle, ts, px(3));
        if (img) gr.DrawImage(img, x, y + px(6), ts, ts, 0, 0, img.Width, img.Height);
        else fillRound(gr, x, y + px(6), ts, ts, px(3), colours.card);
        if (playing) {
            fillRound(gr, x, y + px(6), ts, ts, px(3), RGBA(0, 0, 0, 140));
            iconEq(gr, x + ts / 2 - px(6), y + rowH / 2 - px(5), px(12), px(10),
                RGB(255, 255, 255), this.phase, fb.IsPlaying && !fb.IsPaused);
        }
        x += ts + px(10);
    } else if (playing) {
        iconEq(gr, x, y + rowH / 2 - px(5), px(10), px(10), ACCENT, this.phase, fb.IsPlaying && !fb.IsPaused);
        x += px(18);
    }

    var right = W - pad - this.durW - px(8);
    if (this.showAlbum) right -= this.albumW + px(8);
    var tw = Math.max(px(40), right - x);

    if (rowH >= px(36)) {
        drawText(gr, r.title, fonts.title, playing ? ACCENT : colours.text,
            x, y + px(5), tw, Math.floor(rowH / 2) - px(2), DT_LINE);
        drawText(gr, r.artist, fonts.small, colours.sub,
            x, y + Math.floor(rowH / 2), tw, Math.floor(rowH / 2) - px(5), DT_LINE);
    } else {
        var line = r.artist ? r.title + '  ·  ' + r.artist : r.title;
        drawText(gr, line, fonts.body, playing ? ACCENT : colours.text, x, y, tw, rowH, DT_LINE);
    }

    if (this.showAlbum) {
        drawText(gr, r.album, fonts.small, colours.sub,
            W - pad - this.durW - px(8) - this.albumW, y, this.albumW, rowH, DT_LINE);
    }
    drawText(gr, r.length, fonts.small, colours.sub, W - pad - this.durW, y, this.durW, rowH,
        DT_RIGHT | DT_VCENTER | DT_SINGLELINE | DT_NOPREFIX);
};

Playlist.prototype.barRect = function () {
    var m = this.maxScroll();
    if (m <= 0 || this.view <= 0) return null;
    var total = this.count * this.rowH;
    var h = Math.max(px(28), this.view * this.view / total);
    var y = this.top + (this.view - h) * (this.scroll / m);
    return { x: this.W - px(7), y: y, w: px(4), h: h };
};

Playlist.prototype.paintScrollbar = function (gr) {
    var rc = this.barRect();
    if (!rc) return;
    var a = this.barHover || this.dragBar ? 190 : 90;
    fillRound(gr, rc.x, rc.y, rc.w, rc.h, rc.w / 2, alpha(colours.sub, a));
};

Playlist.prototype.wheel = function (step) {
    this.target = clamp(this.target - step * this.rowH * 3, 0, this.maxScroll());
    window.Repaint();
};

Playlist.prototype.tick = function () {
    this.phase++;
    var repaint = false;
    var d = this.target - this.scroll;
    if (Math.abs(d) > 0.5) {
        this.scroll += d * 0.28;
        repaint = true;
    } else if (this.scroll !== this.target) {
        this.scroll = this.target;
        repaint = true;
    }
    if (!repaint && this.phase % 3 === 0 && fb.IsPlaying && !fb.IsPaused) {
        var loc = playingLocation();
        if (loc && loc.pl === this.pl) repaint = true;      // animate the eq marker
    }
    if (repaint) window.Repaint();
};

Playlist.prototype.move = function (x, y, mask) {
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
        window.Repaint();
    }
};

Playlist.prototype.leave = function () {
    if (this.hoverRow !== -1 || this.barHover) {
        this.hoverRow = -1;
        this.barHover = false;
        window.Repaint();
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
    var ctrl = !!(mask & 8), shift = !!(mask & 4);
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
    if (i < 0) return;
    try { plman.ExecutePlaylistDefaultAction(this.pl, i); } catch (e) {}
};

Playlist.prototype.contextMenu = function (x, y) {
    var i = this.rowAt(y);
    if (i < 0) return false;
    try {
        if (!plman.IsPlaylistItemSelected(this.pl, i)) {
            plman.ClearPlaylistSelection(this.pl);
            plman.SetPlaylistSelectionSingle(this.pl, i, true);
            plman.SetPlaylistFocusItem(this.pl, i);
        }
        var handles = plman.GetPlaylistSelectedItems(this.pl);
        var cmm = fb.CreateContextMenuManager();
        var menu = window.CreatePopupMenu();
        cmm.InitContext(handles);
        cmm.BuildMenu(menu, 1, -1);
        var id = menu.TrackPopupMenu(x, y);
        if (id > 0) cmm.ExecuteByID(id - 1);
        menu.Dispose();
        cmm.Dispose();
        return true;
    } catch (e) { return false; }
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
    if (vkey === 38 || vkey === 40) {                       // up / down
        var next = clamp(focus + (vkey === 40 ? 1 : -1), 0, this.count - 1);
        try {
            plman.ClearPlaylistSelection(this.pl);
            plman.SetPlaylistSelectionSingle(this.pl, next, true);
            plman.SetPlaylistFocusItem(this.pl, next);
        } catch (e) {}
        this.ensureVisible(next);
    } else if (vkey === 13 && focus >= 0) {                 // enter
        try { plman.ExecutePlaylistDefaultAction(this.pl, focus); } catch (e) {}
    } else if (vkey === 33 || vkey === 34) {                // page up / down
        this.target = clamp(this.target + (vkey === 34 ? this.view : -this.view), 0, this.maxScroll());
        window.Repaint();
    }
};

// ------------------------------------------------------------- THE PANEL ----

var panel = null, panelKind = '', timerId = null;

function resolveMode(W, H) {
    var m = ('' + props.mode).toLowerCase();
    if (m === 'player' || m === 'bar' || m === 'list') return m;
    return (H <= px(150) && W > px(340)) ? 'bar' : 'player';
}

function buildPanel(W, H) {
    var kind = resolveMode(W, H);
    if (kind !== panelKind || !panel) {
        panelKind = kind;
        panel = kind === 'list' ? new Playlist() : new Player(kind === 'bar');
    }
    panel.layout(W, H);
}

function setMode(mode) {
    props.mode = mode;
    setProp('Apple Music.Mode (auto|player|bar|list)', mode);
    panelKind = '';
    buildPanel(window.Width, window.Height);
    window.Repaint();
}

function showPanelMenu(x, y) {
    try {
        var menu = window.CreatePopupMenu();
        var theme = window.CreatePopupMenu();
        var mode = window.CreatePopupMenu();

        theme.AppendMenuItem(0, 1, '다크');
        theme.AppendMenuItem(0, 2, '라이트');
        theme.CheckMenuRadioItem(1, 2, props.theme === 'light' ? 2 : 1);
        theme.AppendTo(menu, 0, '테마');

        var modes = ['auto', 'player', 'bar', 'list'];
        var labels = ['자동', '플레이어 (세로)', '바 (가로)', '재생목록'];
        for (var i = 0; i < modes.length; i++) mode.AppendMenuItem(0, 10 + i, labels[i]);
        var cur = 0;
        for (var m = 0; m < modes.length; m++) if (modes[m] === props.mode) cur = m;
        mode.CheckMenuRadioItem(10, 13, 10 + cur);
        mode.AppendTo(menu, 0, '패널 모드');

        menu.AppendMenuSeparator();
        menu.AppendMenuItem(0, 20, '패널 속성…');
        menu.AppendMenuItem(0, 21, '스크립트 편집…');

        var id = menu.TrackPopupMenu(x, y);
        switch (id) {
            case 1: applyTheme('dark'); break;
            case 2: applyTheme('light'); break;
            case 10: case 11: case 12: case 13: setMode(modes[id - 10]); break;
            case 20: try { window.ShowProperties(); } catch (e) {} break;
            case 21: try { window.ShowConfigure(); } catch (e) {} break;
        }
        menu.Dispose(); theme.Dispose(); mode.Dispose();
        return true;
    } catch (e) { return false; }
}

// ------------------------------------------------------------- CALLBACKS ----

var reportedError = '';

function on_paint(gr) {
    if (!panel) buildPanel(window.Width, window.Height);
    try { panel.paint(gr); }
    catch (e) {
        if (('' + e) !== reportedError) {          // log once, not on every frame
            reportedError = '' + e;
            try { console.log('Apple Music panel: ' + e); } catch (ignore) {}
        }
        gr.FillSolidRect(0, 0, window.Width, window.Height, colours.bg);
        drawText(gr, 'Apple Music panel error: ' + e, fonts.small, colours.text,
            px(10), px(10), window.Width - px(20), window.Height - px(20),
            DT_WORDBREAK | DT_NOPREFIX);
    }
}

function on_size() {
    if (window.Width <= 0 || window.Height <= 0) return;
    buildPanel(window.Width, window.Height);
}

function on_mouse_move(x, y, mask) { if (panel && panel.move) panel.move(x, y, mask); }
function on_mouse_leave() { if (panel && panel.leave) panel.leave(); }
function on_mouse_lbtn_down(x, y, mask) { if (panel && panel.down) panel.down(x, y, mask); }
function on_mouse_lbtn_up(x, y, mask) { if (panel && panel.up) panel.up(x, y, mask); }
function on_mouse_lbtn_dblclk(x, y, mask) { if (panel && panel.dblclick) panel.dblclick(x, y, mask); }
function on_mouse_wheel(step) { if (panel && panel.wheel) panel.wheel(step); }

function on_mouse_rbtn_up(x, y, mask) {
    if (panel && panel.contextMenu && panel.contextMenu(x, y)) return true;
    return showPanelMenu(x, y);
}

function on_key_down(vkey) { if (panel && panel.key) panel.key(vkey); }

function on_playback_new_track(handle) {
    if (panel && panel.newTrack) panel.newTrack(handle);
    window.Repaint();
}

function on_playback_stop(reason) {
    if (reason !== 2 && panel && panel.newTrack) panel.newTrack(null);
    window.Repaint();
}

function on_playback_pause() { window.Repaint(); }
function on_playback_seek() { window.Repaint(); }
function on_playback_time() { window.Repaint(); }
function on_playback_order_changed() { window.Repaint(); }
function on_playback_dynamic_info_track() {
    if (panel && panel.newTrack) panel.newTrack(fb.GetNowPlaying());
}
function on_volume_change() { window.Repaint(); }

function on_playlist_switch() { if (panel && panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlists_changed() { if (panel && panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlist_items_added() { if (panel && panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlist_items_removed() { if (panel && panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlist_items_reordered() { if (panel && panel.refresh) panel.refresh(); window.Repaint(); }
function on_playlist_items_selection_change() { window.Repaint(); }
function on_item_focus_change() { window.Repaint(); }
function on_metadb_changed() { if (panel && panel.refresh) panel.refresh(); window.Repaint(); }

function on_script_unload() { stopTimer(timerId); }

// ------------------------------------------------------------------ INIT ----

try { window.DlgCode(0x0004); } catch (e) {}          // DLGC_WANTALLKEYS

buildPanel(window.Width || 400, window.Height || 400);
timerId = startTimer(function () {
    if (panel && panel.tick) panel.tick();
}, 40);
