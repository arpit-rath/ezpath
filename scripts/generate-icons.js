import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Function to generate an uncompressed or deflate-compressed PNG buffer
function createPng(width, height, r, g, b) {
  // Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth: 8
  ihdrData.writeUInt8(6, 9); // color type: 6 (RGBA)
  ihdrData.writeUInt8(0, 10); // compression method
  ihdrData.writeUInt8(0, 11); // filter method
  ihdrData.writeUInt8(0, 12); // interlace method

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw image data: filter byte (0) + RGBA per pixel per row
  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  // Design: #264c3f background (r: 38, g: 76, b: 63)
  // With a stylized white "E" / route icon in the middle
  const padding = Math.floor(width * 0.2);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type: None

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;

      // Base background: #264c3f
      let pr = r;
      let pg = g;
      let pb = b;
      let pa = 255;

      // Draw rounded rectangle background
      const radius = Math.floor(width * 0.22);
      const inCornerX = x < radius || x > width - radius;
      const inCornerY = y < radius || y > height - radius;
      if (inCornerX && inCornerY) {
        const cx = x < radius ? radius : width - radius;
        const cy = y < radius ? radius : height - radius;
        const dist = Math.hypot(x - cx, y - cy);
        if (dist > radius) {
          pa = 0; // transparent corner
        }
      }

      // Draw stylized white transit path inside padding
      if (pa > 0 && x >= padding && x <= width - padding && y >= padding && y <= height - padding) {
        const nx = (x - padding) / (width - 2 * padding);
        const ny = (y - padding) / (height - 2 * padding);

        // Draw parallel forward-slanted diagonal route tracks
        // Track 1
        const line1 = Math.abs((1 - ny) * 0.8 + 0.1 - nx);
        // Track 2
        const line2 = Math.abs(ny - 0.5);
        // Track 3
        const line3 = Math.abs(ny * 0.8 + 0.1 - nx);

        const isTrack = (line1 < 0.08 && ny > 0.15 && ny < 0.85) ||
                        (line2 < 0.06 && nx > 0.2 && nx < 0.8) ||
                        (line3 < 0.08 && ny > 0.15 && ny < 0.85);

        if (isTrack) {
          pr = 247;
          pg = 248;
          pb = 244; // #f7f8f4
        }
      }

      rawData[pixelOffset] = pr;
      rawData[pixelOffset + 1] = pg;
      rawData[pixelOffset + 2] = pb;
      rawData[pixelOffset + 3] = pa;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

// Standard CRC32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Generate icons
const iconsDir = path.resolve(process.cwd(), 'public', 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 1. 192x192
const p192 = createPng(192, 192, 38, 76, 63);
fs.writeFileSync(path.join(iconsDir, 'icon-192x192.png'), p192);

// 2. 512x512
const p512 = createPng(512, 512, 38, 76, 63);
fs.writeFileSync(path.join(iconsDir, 'icon-512x512.png'), p512);

// 3. Maskable 512x512 (solid background without transparent corners)
function createMaskablePng(width, height) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8);
  ihdrData.writeUInt8(6, 9);
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);
  const ihdrChunk = createChunk('IHDR', ihdrData);

  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);
  const padding = Math.floor(width * 0.28); // Safe zone for maskable

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0;

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      let pr = 38, pg = 76, pb = 63, pa = 255;

      if (x >= padding && x <= width - padding && y >= padding && y <= height - padding) {
        const nx = (x - padding) / (width - 2 * padding);
        const ny = (y - padding) / (height - 2 * padding);
        const line1 = Math.abs((1 - ny) * 0.8 + 0.1 - nx);
        const line2 = Math.abs(ny - 0.5);
        const line3 = Math.abs(ny * 0.8 + 0.1 - nx);

        if ((line1 < 0.08 && ny > 0.15 && ny < 0.85) ||
            (line2 < 0.06 && nx > 0.2 && nx < 0.8) ||
            (line3 < 0.08 && ny > 0.15 && ny < 0.85)) {
          pr = 247; pg = 248; pb = 244;
        }
      }

      rawData[pixelOffset] = pr;
      rawData[pixelOffset + 1] = pg;
      rawData[pixelOffset + 2] = pb;
      rawData[pixelOffset + 3] = pa;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressed);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));
  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const pMaskable = createMaskablePng(512, 512);
fs.writeFileSync(path.join(iconsDir, 'icon-maskable-512x512.png'), pMaskable);

// Apple touch icon (180x180)
const pApple = createPng(180, 180, 38, 76, 63);
fs.writeFileSync(path.join(iconsDir, 'apple-touch-icon.png'), pApple);

console.log('PWA icons successfully generated in public/icons/');
