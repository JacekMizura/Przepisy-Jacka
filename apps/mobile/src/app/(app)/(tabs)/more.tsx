import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrimaryButton } from '@/components/ui';
import { getApiBaseUrl } from '@/lib/api-url';
import { useAuthKitchen } from '@/providers/auth-kitchen';
import { ui } from '@/theme/ui';

export default function MoreTab() {
  const router = useRouter();
  const { user, kitchens, kitchenId, signOut } = useAuthKitchen();
  const active = kitchens.find((k) => k.id === kitchenId);

  return (
    <SafeAreaView style={ui.screen} edges={['bottom']}>
      <View style={ui.padded}>
        <Text style={ui.title} accessibilityRole="header">
          Więcej
        </Text>
        <View style={ui.card}>
          <Text style={ui.label}>Konto</Text>
          <Text style={{ fontWeight: '600' }}>{user?.name ?? '—'}</Text>
          <Text style={ui.muted}>{user?.email ?? '—'}</Text>
        </View>
        <View style={ui.card}>
          <Text style={ui.label}>Aktywna kuchnia</Text>
          <Text style={{ fontWeight: '600' }}>{active?.name ?? 'Brak'}</Text>
          <PrimaryButton
            label="Zmień kuchnię"
            secondary
            onPress={() => router.push('/(app)/kitchens')}
          />
        </View>
        <View style={ui.card}>
          <Text style={ui.label}>API</Text>
          <Text style={ui.muted} selectable>
            {(() => {
              try {
                return getApiBaseUrl();
              } catch {
                return 'Brak EXPO_PUBLIC_API_URL';
              }
            })()}
          </Text>
        </View>
        <PrimaryButton
          label="Wyloguj"
          onPress={() => {
            void (async () => {
              await signOut();
              router.replace('/(auth)/login');
            })();
          }}
        />
      </View>
    </SafeAreaView>
  );
}
