const sharp = require('sharp');

const MAX_WIDTH = 640;
const MAX_HEIGHT = 480;
const JPEG_QUALITY = 45;
const THUMB_WIDTH = 160;
const THUMB_HEIGHT = 120;
const THUMB_QUALITY = 40;

async function compressImage(base64Str, options = {}) {
  const buf = Buffer.from(base64Str, 'base64');
  const width = options.width || MAX_WIDTH;
  const height = options.height || MAX_HEIGHT;
  const quality = options.quality || JPEG_QUALITY;

  try {
    const compressed = await sharp(buf)
      .resize(width, height, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, chromaSubsampling: '4:2:0' })
      .toBuffer();
    return compressed.toString('base64');
  } catch (err) {
    console.error('Image compression error:', err.message);
    return base64Str;
  }
}

async function createThumbnail(base64Str) {
  const buf = Buffer.from(base64Str, 'base64');
  try {
    const thumb = await sharp(buf)
      .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'cover' })
      .jpeg({ quality: THUMB_QUALITY, chromaSubsampling: '4:2:0' })
      .toBuffer();
    return thumb.toString('base64');
  } catch (err) {
    console.error('Thumbnail error:', err.message);
    return '';
  }
}

async function compressStrangerImage(base64Str) {
  return compressImage(base64Str, { quality: 45, width: 640, height: 480 });
}

module.exports = { compressImage, createThumbnail, compressStrangerImage };
