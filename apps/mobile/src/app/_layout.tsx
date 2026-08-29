import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoadingState } from '@/components/ui';
import {
  AuthKitchenProvider,
  useAuthKitchen,
} from '@/providers/auth-kitchen';

function AuthGate({ children }: { children: React.ReactNode }) {
  const { bootstrapping, user, kitchenId, kitchensLoading } = useAuthKitchen();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (bootstrapping) {
      return;
    }
    const root = segments[0];
    const nested = (segments as string[])[1];
    const inAuthGroup = root === '(auth)';
    const inAppGroup = root === '(app)';
    const appScreen = inAppGroup ? nested : undefined;
    if (!user && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }
    if (user && inAuthGroup) {
      router.replace('/(app)/kitchens');
      return;
    }
    if (
      user &&
      !kitchensLoading &&
      !kitchenId &&
      inAppGroup &&
      appScreen !== 'kitchens'
    ) {
      router.replace('/(app)/kitchens');
    }
  }, [
    bootstrapping,
    user,
    kitchenId,
    kitchensLoading,
    segments,
    router,
  ]);

  if (bootstrapping) {
    return <LoadingState label="Przywracanie sesji…" />;
  }
  return children;
}

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: (failureCount, error) => {
              if (
                typeof error === 'object' &&
                error &&
                'status' in error &&
                (error as { status: number }).status === 401
              ) {
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthKitchenProvider>
            <StatusBar style="dark" />
            <AuthGate>
              <Stack screenOptions={{ headerShown: false }} />
            </AuthGate>
          </AuthKitchenProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
