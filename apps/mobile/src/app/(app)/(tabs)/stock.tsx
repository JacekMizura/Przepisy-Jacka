import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
} from '@/components/ui';
import {
  ApiRequestError,
  apiStatus,
  createMobileApiClient,
  isUnauthorized,
  readApiError,
  requireApiData,
} from '@/lib/api';
import { formatDate, formatQuantity, type StockSummary } from '@/lib/format';
import { useAuthKitchen } from '@/providers/auth-kitchen';
import { ui } from '@/theme/ui';

export default function StockTab() {
  const router = useRouter();
  const { kitchenId, signOut } = useAuthKitchen();
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['stock-summary', kitchenId],
    enabled: Boolean(kitchenId),
    queryFn: async () => {
      const client = createMobileApiClient();
      const result = await client.GET(
        '/api/kitchens/{kitchenId}/stock-summary',
        { params: { path: { kitchenId: kitchenId! } } },
      );
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      return requireApiData(result, 'Nie udało się pobrać zapasów.');
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) {
      return query.data ?? [];
    }
    return (query.data ?? []).filter((item) =>
      item.productName.toLowerCase().includes(q),
    );
  }, [query.data, search]);

  if (!kitchenId) {
    return (
      <EmptyState
        title="Wybierz kuchnię"
        actionLabel="Kuchnie"
        onAction={() => router.push('/(app)/kitchens')}
      />
    );
  }

  if (query.isPending) {
    return <LoadingState label="Ładowanie zapasów…" />;
  }

  if (query.isError) {
    return (
      <ErrorState
        message={
          isUnauthorized(query.error)
            ? 'Sesja wygasła.'
            : readApiError(query.error, 'Błąd zapasów.')
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <SafeAreaView style={ui.screen} edges={['bottom']}>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.productId}
        contentContainerStyle={ui.padded}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <TextInput
              style={ui.input}
              placeholder="Szukaj produktu…"
              value={search}
              onChangeText={setSearch}
              accessibilityLabel="Szukaj w zapasach"
            />
            <PrimaryButton
              label="Historia zużyć"
              secondary
              onPress={() => router.push('/(app)/stock/history')}
            />
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="Brak zapasów"
            description="Dodaj partie z poziomu weba albo po rozliczeniu zakupów na telefonie."
          />
        }
        renderItem={({ item }) => <StockRow item={item} />}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />
    </SafeAreaView>
  );
}

function StockRow({ item }: { item: StockSummary }) {
  const router = useRouter();
  const warning =
    item.expiringBatchCount > 0
      ? `${item.expiringBatchCount} partii kończy ważność${
          item.nearestExpiry ? ` (${formatDate(item.nearestExpiry)})` : ''
        }`
      : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.productName}, ${formatQuantity(item.totalQuantity, item.defaultUnit)}`}
      onPress={() =>
        router.push({
          pathname: '/(app)/stock/[productId]',
          params: { productId: item.productId },
        })
      }
      style={ui.card}
    >
      <Text style={{ fontWeight: '700', fontSize: 16 }}>
        {item.productName}
        {item.isArchived ? (
          <Text style={{ fontWeight: '600', color: '#b45309' }}>
            {' '}
            · Zarchiwizowany
          </Text>
        ) : null}
      </Text>
      <Text style={ui.muted}>
        {formatQuantity(item.totalQuantity, item.defaultUnit)} ·{' '}
        {item.batchCount} {item.batchCount === 1 ? 'partia' : 'partie'}
      </Text>
      {warning ? (
        <Text style={ui.dangerText} accessibilityRole="text">
          {warning}
        </Text>
      ) : null}
    </Pressable>
  );
}
