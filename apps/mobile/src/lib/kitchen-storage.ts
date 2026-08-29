import * as SecureStore from "expo-secure-store";

const ACTIVE_KITCHEN_KEY = "mojakuchnia.activeKitchenId";

export async function getStoredKitchenId(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACTIVE_KITCHEN_KEY);
  } catch {
    return null;
  }
}

export async function setStoredKitchenId(kitchenId: string): Promise<void> {
  await SecureStore.setItemAsync(ACTIVE_KITCHEN_KEY, kitchenId);
}

export async function clearStoredKitchenId(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(ACTIVE_KITCHEN_KEY);
  } catch {
    // ignore
  }
}
