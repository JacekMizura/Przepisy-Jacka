import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/ui';
import {
  ApiRequestError,
  apiStatus,
  createMobileApiClient,
  isUnauthorized,
  readApiError,
  requireApiData,
} from '@/lib/api';
import {
  formatDate,
  formatMoneyMinor,
  type PurchaseSummary,
} from '@/lib/format';
import { useAuthKitchen } from '@/providers/auth-kitchen';
import { ui } from '@/theme/ui';

export default function PurchasesScreen() {
  const router = useRouter();
  const { kitchenId, signOut } = useAuthKitchen();

  const query = useQuery({
    queryKey: ['purchases', kitchenId],
    enabled: Boolean(kitchenId),
    queryFn: async () => {
      const client = createMobileApiClient();
      const result = await client.GET(
        '/api/kitchens/{kitchenId}/purchases',
        { params: { path: { kitchenId: kitchenId! } } },
      );
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      return requireApiData(result, 'Nie udało się pobrać historii zakupów.');
    },
  });

  if (!kitchenId) {
    return <EmptyState title="Wybierz kuchnię" />;
  }
  if (query.isPending) {
    return <LoadingState label="Ładowanie zakupów…" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        message={
          isUnauthorized(query.error)
            ? 'Sesja wygasła.'
            : readApiError(query.error, 'Błąd historii zakupów.')
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <SafeAreaView style={ui.screen} edges={['bottom']}>
      <FlatList
        data={query.data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={ui.padded}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
          />
        }
        ListEmptyComponent={
          <EmptyState
            title="Brak zakupów"
            description="Po rozliczeniu listy pojawią się tu potwierdzenia."
          />
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <PurchaseRow
            item={item}
            onPress={() =>
              router.push({
                pathname: '/(app)/shopping/purchase/[purchaseId]',
                params: { purchaseId: item.id },
              })
            }
          />
        )}
      />
    </SafeAreaView>
  );
}

function PurchaseRow({
  item,
  onPress,
}: {
  item: PurchaseSummary;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Zakup ${formatDate(item.purchasedAt)}`}
      onPress={onPress}
      style={ui.card}
    >
      <Text style={{ fontWeight: '700', fontSize: 16 }}>
        {item.storeName ?? 'Zakup'} · {formatDate(item.purchasedAt)}
      </Text>
      <Text style={ui.muted}>
        {item.itemCount} poz. · {formatMoneyMinor(item.totalPriceMinor)}
        {item.receiptImage ? ' · paragon' : ''}
      </Text>
    </Pressable>
  );
}
