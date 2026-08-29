import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, FlatList, Text, View } from 'react-native';
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
import {
  formatDate,
  formatMoneyMinor,
  newIdempotencyKey,
  type StockConsumption,
} from '@/lib/format';
import { useAuthKitchen } from '@/providers/auth-kitchen';
import { ui } from '@/theme/ui';

export default function StockHistoryScreen() {
  const queryClient = useQueryClient();
  const { kitchenId, signOut } = useAuthKitchen();

  const query = useQuery({
    queryKey: ['stock-consumptions', kitchenId],
    enabled: Boolean(kitchenId),
    queryFn: async () => {
      const client = createMobileApiClient();
      const result = await client.GET(
        '/api/kitchens/{kitchenId}/stock-consumptions',
        { params: { path: { kitchenId: kitchenId! } } },
      );
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      return requireApiData(result, 'Nie udało się pobrać historii.');
    },
  });

  const reverseMutation = useMutation({
    mutationFn: async (consumptionId: string) => {
      const client = createMobileApiClient();
      const result = await client.POST(
        '/api/kitchens/{kitchenId}/stock-consumptions/{consumptionId}/reverse',
        {
          params: { path: { kitchenId: kitchenId!, consumptionId } },
          body: { idempotencyKey: newIdempotencyKey('reverse') },
        },
      );
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      return requireApiData(result, 'Nie udało się cofnąć zużycia.');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['stock-consumptions', kitchenId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['stock-summary', kitchenId],
      });
    },
  });

  if (!kitchenId) {
    return <EmptyState title="Wybierz kuchnię" />;
  }
  if (query.isPending) {
    return <LoadingState label="Ładowanie historii…" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        message={
          isUnauthorized(query.error)
            ? 'Sesja wygasła.'
            : readApiError(query.error, 'Błąd historii.')
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
        ListEmptyComponent={
          <EmptyState title="Brak zużyć" description="Tu pojawią się zatwierdzone zużycia." />
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <ConsumptionRow
            item={item}
            busy={reverseMutation.isPending}
            onReverse={() => {
              Alert.alert(
                'Cofnąć zużycie?',
                'Przywróci ilości do partii (operacja API).',
                [
                  { text: 'Anuluj', style: 'cancel' },
                  {
                    text: 'Cofnij',
                    onPress: () =>
                      reverseMutation.mutate(item.id, {
                        onError: (e) =>
                          Alert.alert(
                            'Błąd',
                            readApiError(e, 'Nie udało się cofnąć.'),
                          ),
                      }),
                  },
                ],
              );
            }}
          />
        )}
      />
    </SafeAreaView>
  );
}

function ConsumptionRow({
  item,
  busy,
  onReverse,
}: {
  item: StockConsumption;
  busy: boolean;
  onReverse: () => void;
}) {
  return (
    <View style={ui.card}>
      <Text style={{ fontWeight: '700' }}>
        {item.productName ?? 'Produkt'} · {item.totalQuantity}
      </Text>
      <Text style={ui.muted}>
        {item.kind === 'write_off' ? 'Odpis' : 'Zużycie'}
        {item.reason ? ` · ${item.reason}` : ''}
      </Text>
      <Text style={ui.muted}>
        {formatDate(item.createdAt)}
        {item.isReversal ? ' · cofnięcie' : ''}
        {item.isReversed ? ' · już cofnięte' : ''}
      </Text>
      <Text style={ui.muted}>
        {item.costComplete
          ? formatMoneyMinor(item.totalCostMinor)
          : 'koszt niepełny'}
      </Text>
      {!item.isReversal && !item.isReversed ? (
        <PrimaryButton
          label="Cofnij"
          secondary
          disabled={busy}
          onPress={onReverse}
        />
      ) : null}
    </View>
  );
}
