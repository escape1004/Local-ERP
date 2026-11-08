import { expect, test } from 'vitest';
import { collectUniquePageImages, filenameFromImageUrl, normalizePageImageUrl } from './browserPageImages';

test('keeps unique http images and drops tiny tracking pixels', () => {
  expect(normalizePageImageUrl('data:image/png;base64,abc')).toBeNull();
  expect(collectUniquePageImages([
    { url: 'https://cdn.example.com/a.jpg?w=800', width: 800, height: 600 },
    { url: 'https://cdn.example.com/a.jpg?w=800', width: 800, height: 600 },
    { url: 'https://cdn.example.com/pixel.gif', width: 1, height: 1 },
    'https://cdn.example.com/b.png',
  ])).toEqual([
    { url: 'https://cdn.example.com/a.jpg?w=800', width: 800, height: 600 },
    { url: 'https://cdn.example.com/b.png' },
  ]);
});

test('derives a filename from the image path', () => {
  expect(filenameFromImageUrl('https://cdn.example.com/photos/cover.webp', 0)).toBe('cover.webp');
  expect(filenameFromImageUrl('https://cdn.example.com/', 3)).toBe('image-04.jpg');
});
