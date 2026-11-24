import { describe, expect, it } from 'vitest';
import { MemoryStorage, TEST_KDF, seededRng } from './memory.testutil.js';
import { createVault, profileKey } from './vault.js';

describe('address-book vault rekey lock revocation (GP-BUG-10)', () => {
  it('keeps the original session locked after an in-flight password change commits', async () => {
    const storage = new MemoryStorage();
    const vault = createVault({
      storage,
      now: () => 1_700_000_000_000,
      rng: seededRng(71),
      kdf: TEST_KDF,
    });
    const oldPassword = 'original-profile-password';
    const newPassword = 'replacement-profile-password';
    const session = await vault.createProfile({ password: oldPassword });
    const id = session.profileId;

    const originalPut = storage.put.bind(storage);
    let enteredWrite!: () => void;
    let releaseWrite!: () => void;
    const writeStarted = new Promise<void>((resolve) => { enteredWrite = resolve; });
    const allowWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
    storage.put = async (key, bytes) => {
      if (key === profileKey(id)) {
        enteredWrite();
        await allowWrite;
      }
      await originalPut(key, bytes);
    };

    const changing = session.changePassword(oldPassword, newPassword);
    await writeStarted;
    session.lock();
    expect(session.isLocked).toBe(true);

    releaseWrite();
    await changing;
    expect(session.isLocked).toBe(true);
    expect(() => session.getBook()).toThrowError(expect.objectContaining({ code: 'LOCKED' }));
    await expect(session.exportBackup('another-backup-password')).rejects.toMatchObject({ code: 'LOCKED' });

    // A durable rekey is allowed to finish, but only a fresh, explicit unlock restores access.
    await expect(vault.unlock(id, oldPassword)).rejects.toMatchObject({ code: 'UNLOCK_FAILED' });
    const reauthenticated = await vault.unlock(id, newPassword);
    expect(reauthenticated.isLocked).toBe(false);
    expect(reauthenticated.getBook().contacts).toEqual([]);
    expect(session.isLocked).toBe(true);
  });
});
