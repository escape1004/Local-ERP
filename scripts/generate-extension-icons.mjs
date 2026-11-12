import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = path.join('extension', 'shared', 'icons');
fs.mkdirSync(dir, { recursive: true });

const source = path.join('public', 'icon.png');
const sizes = [16, 32, 48, 128];

function dotSvg(size, cx, cy, r, stroke) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${cx}" cy="${cy}" r="${r}" fill="#ED4245" stroke="#ffffff" stroke-width="${stroke}"/>
</svg>`);
}

async function writeFound(size) {
  const stroke = Math.max(1.25, size * 0.07);
  const r = Math.max(4.5, size * 0.26);
  const iconSize = Math.max(10, Math.round(size * 0.82));
  const left = 0;
  const top = 0;
  const maxCenter = size - r - stroke / 2;
  const cx = Math.min(maxCenter, iconSize - r * 0.12);
  const cy = Math.min(maxCenter, iconSize - r * 0.12);

  const icon = await sharp(source).resize(iconSize, iconSize).png().toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: icon, left, top },
      { input: dotSvg(size, cx, cy, r, stroke) },
    ])
    .png()
    .toFile(path.join(dir, `found-${size}.png`));
}

await Promise.all([
  ...sizes.map((size) =>
    sharp(source).resize(size, size).png().toFile(path.join(dir, `idle-${size}.png`)),
  ),
  ...sizes.map((size) => writeFound(size)),
]);

console.log('extension icons written from public/icon.png');
