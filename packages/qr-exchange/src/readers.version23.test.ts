import { describe, expect, it, vi } from 'vitest';
import {
  decodeQrImage, exportDeviceSettingsExchange, loadJsQrDecoder,
  parseDeviceSettingsExchange, qrMatrix,
  type Canvas2dLike, type DeviceSettingsOptions, type Frame, type QrMatrix,
} from './index.js';

/** A pristine four-pixel module grid with the required four-module white quiet zone. */
function pixels(matrix: QrMatrix): Frame {
  const scale = 4;
  const width = (matrix.size + 8) * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.dark[y * matrix.size + x]) continue;
      for (let py = 0; py < scale; py++) {
        for (let px = 0; px < scale; px++) {
          const offset = (((y + 4) * scale + py) * width + (x + 4) * scale + px) * 4;
          data[offset] = data[offset + 1] = data[offset + 2] = 0;
        }
      }
    }
  }
  return { data, width, height: width };
}

/** Public, reproducible test text; no random keys or stored QR fixtures are needed. */
function ascii(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let state = 23;
  let text = '';
  for (let index = 0; index < length; index++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    text += alphabet.charAt((state >>> 24) & 63);
  }
  return text;
}

const settingsOptions: DeviceSettingsOptions = {
  allowedChainIds: [84532],
  validateRpcUrl: (url) => new URL(url).href,
  validateRelayerUrl: (url) => new URL(url).href,
};

function settingsText(bytes: number): string {
  const prefix = 'https://rpc.example/';
  const empty = exportDeviceSettingsExchange({ rpcUrls: { '84532': prefix } }, settingsOptions);
  const rpc = prefix + ascii(bytes - new TextEncoder().encode(empty).byteLength);
  const text = exportDeviceSettingsExchange({ rpcUrls: { '84532': rpc } }, settingsOptions);
  expect(new TextEncoder().encode(text)).toHaveLength(bytes);
  expect(parseDeviceSettingsExchange(text, settingsOptions)).toEqual({ rpcUrls: { '84532': rpc } });
  return text;
}

describe('software decoder version-23 interoperability', () => {
  it.each([1004, 1030])('reads a valid version-23-L ASCII QR of %i bytes', async (length) => {
    const text = ascii(length);
    const matrix = qrMatrix(text, 'L');
    expect(matrix.version).toBe(23);
    expect((await loadJsQrDecoder()).decode(pixels(matrix))).toBe(text);
  });

  it('preserves the exact UTF-8 text of a version-23-L QR', async () => {
    const text = `${ascii(996)}日本語`;
    expect(new TextEncoder().encode(text)).toHaveLength(1005);
    const matrix = qrMatrix(text, 'L');
    expect(matrix.version).toBe(23);
    expect((await loadJsQrDecoder()).decode(pixels(matrix))).toBe(text);
  });

  it.each([1008, 1048])('imports an accepted %i-byte v2 settings QR and releases its image resources', async (bytes) => {
    const text = settingsText(bytes);
    const matrix = qrMatrix(text, 'L');
    expect(matrix.version).toBe(23);
    const frame = pixels(matrix);
    const close = vi.fn();
    const drawImage = vi.fn();
    const canvas: Canvas2dLike = {
      width: 0, height: 0,
      getContext: () => ({ drawImage, getImageData: () => frame }),
    };
    const decoded = await decodeQrImage({ type: 'image/png', size: 1000 }, {
      env: {
        createImageBitmap: () => Promise.resolve({ width: frame.width, height: frame.height, close }),
        document: { createElement: () => canvas },
      },
    });
    expect(decoded).toBe(text);
    expect(parseDeviceSettingsExchange(decoded ?? '', settingsOptions)).toEqual(parseDeviceSettingsExchange(text, settingsOptions));
    expect(drawImage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect([canvas.width, canvas.height]).toEqual([0, 0]);
  });

  it.each([[980, 22], [1100, 24], [1200, 25]] as const)('preserves the adjacent %i-byte version-%i-L decode', async (length, version) => {
    const text = ascii(length);
    const matrix = qrMatrix(text, 'L');
    expect(matrix.version).toBe(version);
    expect((await loadJsQrDecoder()).decode(pixels(matrix))).toBe(text);
  });

  it('preserves version-23-M decoding and empty-image behavior', async () => {
    const text = ascii(800);
    const matrix = qrMatrix(text, 'M');
    expect(matrix.version).toBe(23);
    const decoder = await loadJsQrDecoder();
    expect(decoder.decode(pixels(matrix))).toBe(text);
    expect(decoder.decode({ width: 100, height: 100, data: new Uint8ClampedArray(40_000).fill(255) })).toBeNull();
  });
});
