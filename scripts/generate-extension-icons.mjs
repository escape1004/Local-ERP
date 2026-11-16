import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = path.join('extension', 'shared', 'icons');
fs.mkdirSync(dir, { recursive: true });

const source = path.join('public', 'icon.png');
const sizes = [16, 32, 48, 128];
const STAR_POINTS = '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2';

function starSvg(size, { fill, stroke, strokeWidth }) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="-2 -2 28 28">
  <polygon points="${STAR_POINTS}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>
</svg>`);
}

async function writeStar(name, size, style) {
  await sharp(starSvg(size, style)).png().toFile(path.join(dir, `${name}-${size}.png`));
}

await Promise.all([
  ...sizes.map((size) =>
    sharp(source).resize(size, size).png().toFile(path.join(dir, `idle-${size}.png`)),
  ),
  ...sizes.map((size) => writeStar('star-idle', size, { fill: 'none', stroke: '#72767d', strokeWidth: 2 })),
  ...sizes.map((size) => writeStar('star-record', size, { fill: '#5865F2', stroke: '#5865F2', strokeWidth: 1.5 })),
  ...sizes.map((size) => writeStar('star-manual', size, { fill: '#FACC15', stroke: '#FACC15', strokeWidth: 1.5 })),
]);

for (const leftover of fs.readdirSync(dir)) {
  if (leftover.startsWith('found-')) fs.unlinkSync(path.join(dir, leftover));
}

console.log('extension icons written from public/icon.png and lucide star');
