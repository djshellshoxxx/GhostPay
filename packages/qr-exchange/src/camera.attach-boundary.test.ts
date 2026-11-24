import { describe, expect, it, vi } from 'vitest';
import { startCamera } from './camera.js';
import type { VideoLike } from './camera.js';

describe('startCamera attachment failure cleanup', () => {
  it('stops the acquired stream, preserves the previous stream, and returns a typed error when attachment throws', async () => {
    const oldStop = vi.fn();
    const acquiredStop = vi.fn();
    const oldStream = { getTracks: () => [{ stop: oldStop }] };
    const acquiredStream = { getTracks: () => [{ stop: acquiredStop }] };
    const play = vi.fn().mockResolvedValue(undefined);
    const video: VideoLike = {
      get srcObject() { return oldStream; },
      set srcObject(_value: unknown) { throw new Error('video stream attachment refused'); },
      readyState: 4,
      videoWidth: 640,
      videoHeight: 480,
      play,
    };

    await expect(startCamera(video, { getUserMedia: async () => acquiredStream }))
      .rejects.toMatchObject({ code: 'CAMERA_UNAVAILABLE' });
    expect(acquiredStop).toHaveBeenCalledTimes(1);
    expect(oldStop).not.toHaveBeenCalled();
    expect(video.srcObject).toBe(oldStream);
    expect(play).not.toHaveBeenCalled();
  });

  it('still attaches and plays a successfully acquired stream without stopping it', async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] };
    const play = vi.fn().mockResolvedValue(undefined);
    const video: VideoLike = {
      srcObject: null,
      readyState: 4,
      videoWidth: 640,
      videoHeight: 480,
      play,
    };

    await startCamera(video, { getUserMedia: async () => stream });
    expect(video.srcObject).toBe(stream);
    expect(play).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
  });
});
