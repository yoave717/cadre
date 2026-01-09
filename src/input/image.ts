import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

export interface ImageInput {
  type: 'file' | 'clipboard' | 'url' | 'base64';
  data: string; // Base64 encoded data
  mimeType: string; // image/png, image/jpeg, etc.
  source: string; // Original path/url for reference
}

// Supported image extensions
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];

// Image URL patterns
const IMAGE_URL_PATTERN = /https?:\/\/[^\s]+\.(png|jpg|jpeg|gif|webp)/i;

// File path patterns (Unix and Windows)
const FILE_PATH_PATTERN = /(['"]?)([\/~][\w\-\.\/\\]+\.(png|jpg|jpeg|gif|webp|bmp))\1/i;

// Data URI pattern
const DATA_URI_PATTERN = /data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/=]+)/;

// File URI pattern (drag and drop)
const FILE_URI_PATTERN = /file:\/\/([^\s]+\.(png|jpg|jpeg|gif|webp))/i;

export interface ImageDetection {
  type: 'file' | 'url' | 'base64';
  value: string;
  original: string;
}

/**
 * Detect image references in input text.
 */
export function detectImages(input: string): ImageDetection[] {
  const detections: ImageDetection[] = [];

  // Check for file paths
  const fileMatch = input.match(FILE_PATH_PATTERN);
  if (fileMatch) {
    detections.push({
      type: 'file',
      value: expandPath(fileMatch[2]),
      original: fileMatch[0],
    });
  }

  // Check for URLs
  const urlMatch = input.match(IMAGE_URL_PATTERN);
  if (urlMatch) {
    detections.push({
      type: 'url',
      value: urlMatch[0],
      original: urlMatch[0],
    });
  }

  // Check for base64 data URIs
  const base64Match = input.match(DATA_URI_PATTERN);
  if (base64Match) {
    detections.push({
      type: 'base64',
      value: base64Match[2],
      original: base64Match[0],
    });
  }

  // Check for file URIs (drag and drop)
  const fileUriMatch = input.match(FILE_URI_PATTERN);
  if (fileUriMatch) {
    detections.push({
      type: 'file',
      value: decodeURIComponent(fileUriMatch[1]),
      original: fileUriMatch[0],
    });
  }

  return detections;
}

/**
 * Expand ~ to home directory.
 */
function expandPath(filePath: string): string {
  if (filePath.startsWith('~')) {
    return path.join(process.env.HOME || '', filePath.slice(1));
  }
  return path.resolve(filePath);
}

/**
 * Detect MIME type from buffer.
 */
function detectMimeType(buffer: Buffer): string {
  // PNG signature
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return 'image/png';
  }
  // JPEG signature
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF signature
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
    return 'image/gif';
  }
  // WebP signature
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return 'image/webp';
  }
  // Default to PNG
  return 'image/png';
}

/**
 * Load image from a file path.
 */
export async function loadImageFromFile(filePath: string): Promise<ImageInput> {
  const absolutePath = expandPath(filePath);
  const buffer = await fs.readFile(absolutePath);
  const mimeType = detectMimeType(buffer);

  return {
    type: 'file',
    data: buffer.toString('base64'),
    mimeType,
    source: filePath,
  };
}

/**
 * Load image from a URL.
 */
export async function loadImageFromUrl(url: string): Promise<ImageInput> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const mimeType = response.headers.get('content-type') || detectMimeType(buffer);

  return {
    type: 'url',
    data: buffer.toString('base64'),
    mimeType,
    source: url,
  };
}

/**
 * Load image from detected reference.
 */
export async function loadImage(detection: ImageDetection): Promise<ImageInput> {
  switch (detection.type) {
    case 'file':
      return loadImageFromFile(detection.value);
    case 'url':
      return loadImageFromUrl(detection.value);
    case 'base64':
      return {
        type: 'base64',
        data: detection.value,
        mimeType: 'image/png', // Assume PNG for base64
        source: 'inline',
      };
    default:
      throw new Error(`Unknown image type: ${detection.type}`);
  }
}

/**
 * Check if clipboard has an image (cross-platform).
 */
export async function hasClipboardImage(): Promise<boolean> {
  try {
    if (process.platform === 'darwin') {
      const result = execSync('osascript -e "clipboard info"', { encoding: 'utf-8' });
      return result.includes('«class PNGf»') || result.includes('TIFF');
    }
    if (process.platform === 'linux') {
      const result = execSync('xclip -selection clipboard -t TARGETS -o 2>/dev/null', {
        encoding: 'utf-8',
      });
      return result.includes('image/png') || result.includes('image/jpeg');
    }
    if (process.platform === 'win32') {
      // Windows check is more complex, simplified here
      return false;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Get image from clipboard (cross-platform).
 */
export async function getClipboardImage(): Promise<ImageInput | null> {
  try {
    if (process.platform === 'darwin') {
      // Mac: Get PNG from clipboard using pngpaste or osascript
      try {
        const tmpFile = `/tmp/clipboard-${Date.now()}.png`;
        execSync(
          `osascript -e 'set png_data to the clipboard as «class PNGf»' -e 'set fp to open for access POSIX file "${tmpFile}" with write permission' -e 'write png_data to fp' -e 'close access fp'`,
        );
        const buffer = await fs.readFile(tmpFile);
        await fs.unlink(tmpFile);
        return {
          type: 'clipboard',
          data: buffer.toString('base64'),
          mimeType: 'image/png',
          source: 'clipboard',
        };
      } catch {
        return null;
      }
    } else if (process.platform === 'linux') {
      // Linux: Use xclip
      try {
        const buffer = execSync('xclip -selection clipboard -t image/png -o 2>/dev/null');
        return {
          type: 'clipboard',
          data: buffer.toString('base64'),
          mimeType: 'image/png',
          source: 'clipboard',
        };
      } catch {
        return null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Format image for OpenAI API.
 */
export function formatImageForApi(image: ImageInput): {
  type: 'image_url';
  image_url: { url: string; detail: string };
} {
  return {
    type: 'image_url',
    image_url: {
      url: `data:${image.mimeType};base64,${image.data}`,
      detail: 'auto',
    },
  };
}
