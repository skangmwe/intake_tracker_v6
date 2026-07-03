import { openStore } from './idb';

describe('idb', () => {
  it('openStore — scaffold stub — rejects with a clear message', async () => {
    // Act + Assert
    await expect(openStore('drafts-db', 'drafts')).rejects.toThrow(/scaffold stub/);
  });
});
