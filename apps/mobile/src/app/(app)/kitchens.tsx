import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, LoadingState, PrimaryButton } from '@/components/ui';
import { readApiError } from '@/lib/api';
import { useAuthKitchen } from '@/providers/auth-kitchen';
import { ui } from '@/theme/ui';

export default function KitchensScreen() {
  const router = useRouter();
  const {
    kitchens,
    kitchensLoading,
    selectKitchen,
    createKitchen,
    refreshKitchens,
    kitchenId,
  } = useAuthKitchen();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function onCreate() {
    setError(null);
    setCreating(true);
    try {
      await createKitchen(name.trim());
      setName('');
      router.replace('/(app)/(tabs)/stock');
    } catch (e) {
      setError(readApiError(e, 'Nie udało się utworzyć kuchni.'));
    } finally {
      setCreating(false);
    }
  }

  if (kitchensLoading && kitchens.length === 0) {
    return <LoadingState label="Ładowanie kuchni…" />;
  }

  return (
    <SafeAreaView style={ui.screen} edges={['bottom']}>
      <FlatList
        contentContainerStyle={ui.padded}
        data={kitchens}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <Text style={ui.subtitle}>
              Wybierz aktywną kuchnię. Wybór zapamiętamy na tym urządzeniu.
            </Text>
            {error ? (
              <Text style={ui.dangerText} accessibilityRole="alert">
                {error}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="Brak kuchni"
            description="Utwórz pierwszą kuchnię, żeby zacząć korzystać z zapasów i zakupów."
          />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Wybierz kuchnię ${item.name}`}
            onPress={() => {
              void (async () => {
                await selectKitchen(item.id);
                router.replace('/(app)/(tabs)/stock');
              })();
            }}
            style={[
              ui.card,
              item.id === kitchenId
                ? { borderColor: '#b45309', borderWidth: 2 }
                : null,
            ]}
          >
            <Text style={{ fontWeight: '700', fontSize: 16 }}>{item.name}</Text>
            <Text style={ui.muted}>Rola: {item.role}</Text>
          </Pressable>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListFooterComponent={
          <View style={[ui.card, { marginTop: 16 }]}>
            <Text style={ui.label}>Nowa kuchnia</Text>
            <TextInput
              style={ui.input}
              placeholder="np. Dom Jacka"
              value={name}
              onChangeText={setName}
              accessibilityLabel="Nazwa nowej kuchni"
            />
            <PrimaryButton
              label="Utwórz kuchnię"
              loading={creating}
              disabled={name.trim().length < 2}
              onPress={() => void onCreate()}
            />
            <PrimaryButton
              label="Odśwież listę"
              secondary
              onPress={() => void refreshKitchens()}
            />
          </View>
        }
      />
    </SafeAreaView>
  );
}
