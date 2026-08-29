import { Stack } from 'expo-router';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="kitchens" options={{ title: 'Kuchnie' }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="stock/[productId]"
        options={{ title: 'Partie produktu' }}
      />
      <Stack.Screen name="stock/consume" options={{ title: 'Zużyj' }} />
      <Stack.Screen
        name="stock/history"
        options={{ title: 'Historia zużyć' }}
      />
      <Stack.Screen
        name="shopping/checkout"
        options={{ title: 'Rozlicz zakupy' }}
      />
      <Stack.Screen
        name="shopping/purchases"
        options={{ title: 'Historia zakupów' }}
      />
      <Stack.Screen
        name="shopping/purchase/[purchaseId]"
        options={{ title: 'Szczegóły zakupu' }}
      />
    </Stack>
  );
}
