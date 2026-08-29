import {
  clearStoredKitchenId,
  getStoredKitchenId,
  setStoredKitchenId,
} from '@/lib/kitchen-storage';

jest.mock('expo-secure-store', () => {
  const map = new Map<string, string>();
  return {
    getItemAsync: jest.fn(async (key: string) => map.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => {
      map.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key: string) => {
      map.delete(key);
    }),
  };
});

describe('kitchen storage', () => {
  it('stores and clears active kitchen id in SecureStore', async () => {
    await setStoredKitchenId('kitchen-1');
    expect(await getStoredKitchenId()).toBe('kitchen-1');
    await clearStoredKitchenId();
    expect(await getStoredKitchenId()).toBeNull();
  });
});
