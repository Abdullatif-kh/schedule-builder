#!/usr/bin/env node
/**
 * Generates the Chrome extension icons as PNG files with no dependencies.
 *
 * Draws a calendar mark on the site's gradient, supersampled 4x and box
 * filtered down so the small sizes stay smooth.
 *
 * Usage: node tools/make-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.resolve(__dirname, '..', 'extension', 'icons');
const SIZES = [16, 48, 128];
const SUPERSAMPLE = 4;

// Site palette (styles.css)
const GRADIENT_FROM = [59, 130, 246];   // --primary-light
const GRADIENT_TO = [20, 184, 166];     // --secondary
const ACCENT = [245, 158, 11];          // --accent
const WHITE = [255, 255, 255];

// ---------------------------------------------------------------
// PNG encoding
// ---------------------------------------------------------------
const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
    }
    return table;
})();

function crc32(buffer) {
    let crc = -1;
    for (let i = 0; i < buffer.length; i++) {
        crc = CRC_TABLE[(crc ^ buffer[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);

    const typeBuffer = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

    return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePNG(size, pixels) {
    const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // colour type: RGBA
    ihdr[10] = 0; // deflate
    ihdr[11] = 0; // adaptive filtering
    ihdr[12] = 0; // no interlace

    // Each scanline is prefixed with its filter type (0 = none)
    const stride = size * 4;
    const raw = Buffer.alloc((stride + 1) * size);
    for (let y = 0; y < size; y++) {
        raw[y * (stride + 1)] = 0;
        pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }

    return Buffer.concat([
        signature,
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0))
    ]);
}

// ---------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------
function insideRoundedRect(x, y, left, top, width, height, radius) {
    const right = left + width;
    const bottom = top + height;

    if (x < left || x > right || y < top || y > bottom) return false;

    const cx = Math.min(Math.max(x, left + radius), right - radius);
    const cy = Math.min(Math.max(y, top + radius), bottom - radius);
    const dx = x - cx;
    const dy = y - cy;

    return (dx * dx + dy * dy) <= radius * radius;
}

function mix(from, to, t) {
    return [
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t)
    ];
}

// Returns [r, g, b, a] for a point on the unit-square icon
function samplePixel(x, y, size) {
    if (!insideRoundedRect(x, y, 0, 0, size, size, size * 0.22)) {
        return [0, 0, 0, 0];
    }

    const background = mix(GRADIENT_FROM, GRADIENT_TO, (x + y) / (2 * size));

    // Calendar body
    const calLeft = size * 0.22;
    const calTop = size * 0.24;
    const calWidth = size * 0.56;
    const calHeight = size * 0.54;
    const calRadius = size * 0.07;

    if (!insideRoundedRect(x, y, calLeft, calTop, calWidth, calHeight, calRadius)) {
        return [...background, 255];
    }

    // Header strip
    if (y < calTop + calHeight * 0.28) {
        return [...ACCENT, 255];
    }

    // Two rows of day cells
    const gridTop = calTop + calHeight * 0.4;
    const gridHeight = calHeight * 0.45;
    const gridLeft = calLeft + calWidth * 0.13;
    const gridWidth = calWidth * 0.74;

    const cellW = gridWidth / 3;
    const cellH = gridHeight / 2;
    const col = Math.floor((x - gridLeft) / cellW);
    const row = Math.floor((y - gridTop) / cellH);

    if (col >= 0 && col < 3 && row >= 0 && row < 2) {
        const inCellX = (x - gridLeft) - col * cellW;
        const inCellY = (y - gridTop) - row * cellH;

        // Leave a gutter so the cells read as separate blocks
        if (inCellX < cellW * 0.68 && inCellY < cellH * 0.62) {
            return [...mix(GRADIENT_FROM, GRADIENT_TO, 0.5), 255];
        }
    }

    return [...WHITE, 255];
}

function renderIcon(size) {
    const hi = size * SUPERSAMPLE;
    const pixels = Buffer.alloc(size * size * 4);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let r = 0, g = 0, b = 0, a = 0;

            for (let sy = 0; sy < SUPERSAMPLE; sy++) {
                for (let sx = 0; sx < SUPERSAMPLE; sx++) {
                    const px = (x * SUPERSAMPLE + sx + 0.5) / hi * size;
                    const py = (y * SUPERSAMPLE + sy + 0.5) / hi * size;
                    const [sr, sg, sb, sa] = samplePixel(px, py, size);

                    // Premultiply so transparent edges do not darken
                    const alpha = sa / 255;
                    r += sr * alpha;
                    g += sg * alpha;
                    b += sb * alpha;
                    a += sa;
                }
            }

            const samples = SUPERSAMPLE * SUPERSAMPLE;
            const avgAlpha = a / samples;
            const offset = (y * size + x) * 4;
            const coverage = avgAlpha / 255;

            pixels[offset] = coverage > 0 ? Math.round(r / samples / coverage) : 0;
            pixels[offset + 1] = coverage > 0 ? Math.round(g / samples / coverage) : 0;
            pixels[offset + 2] = coverage > 0 ? Math.round(b / samples / coverage) : 0;
            pixels[offset + 3] = Math.round(avgAlpha);
        }
    }

    return encodePNG(size, pixels);
}

function main() {
    fs.mkdirSync(OUT_DIR, { recursive: true });

    SIZES.forEach(size => {
        const file = path.join(OUT_DIR, `icon${size}.png`);
        const png = renderIcon(size);
        fs.writeFileSync(file, png);
        console.log(`Wrote ${path.relative(path.resolve(__dirname, '..'), file)} (${png.length} bytes)`);
    });
}

main();
