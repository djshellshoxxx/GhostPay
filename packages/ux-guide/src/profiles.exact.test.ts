import { describe, expect, it } from 'vitest';
import { detectProfile, PROFILE_IDS, settingsFor } from './profiles.js';

describe('detectProfile exact settings matching', () => {
  it.each(PROFILE_IDS)('classifies %s with an extra imported setting as custom', (id) => {
    // JSON imports may contain unfamiliar settings from another version.
    const imported = JSON.parse(JSON.stringify({
      ...settingsFor(id),
      unknownImportedSetting: true,
    })) as ReturnType<typeof settingsFor>;
    expect(detectProfile(imported)).toBe('custom');
  });

  it('still detects every unmodified built-in profile', () => {
    for (const id of PROFILE_IDS) expect(detectProfile(settingsFor(id))).toBe(id);
  });

  it('still identifies changed known values as custom', () => {
    expect(detectProfile({ ...settingsFor('private'), autoLockMinutes: 7 })).toBe('custom');
  });
});
