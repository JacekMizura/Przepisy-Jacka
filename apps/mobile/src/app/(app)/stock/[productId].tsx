import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
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
  LOCATION_LABELS,
  formatDate,
  formatMoneyMinor,
  formatQuantity,
  type StockBatch,
  type StockSummary,
} from '@/lib/format';
import { useAuthKitchen } from '@/providers/auth-kitchen';
import { ui } from '@/theme/ui';

export default function StockProductScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { kitchenId, signOut } = useAuthKitchen();
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const [busyId, setBusyId] = useState<string | null>(null);

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

  const product = useMemo(
    () => (query.data ?? []).find((item) => item.productId === productId),
    [query.data, productId],
  );

  const deleteMutation = useMutation({
    mutationFn: async (stockItemId: string) => {
      const client = createMobileApiClient();
      const result = await client.DELETE(
        '/api/kitchens/{kitchenId}/stock-items/{stockItemId}',
        { params: { path: { kitchenId: kitchenId!, stockItemId } } },
      );
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      requireApiData(result, 'Nie udało się usunąć partii.');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['stock-summary', kitchenId],
      });
    },
  });

  if (!kitchenId || !productId) {
    return <EmptyState title="Brak produktu" />;
  }
  if (query.isPending) {
    return <LoadingState label="Ładowanie partii…" />;
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
  if (!product) {
    return (
      <EmptyState
        title="Produkt nie znaleziony"
        description="Może został już zużyty. Wróć do listy zapasów."
        actionLabel="Zapasy"
        onAction={() => router.replace('/(app)/(tabs)/stock')}
      />
    );
  }

  return (
    <SafeAreaView style={ui.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={ui.padded}>
        <Text style={ui.title}>{product.productName}</Text>
        <Text style={ui.subtitle}>
          Razem {formatQuantity(product.totalQuantity, product.defaultUnit)} ·{' '}
          {product.batchCount}{' '}
          {product.batchCount === 1 ? 'partia' : 'partie'}
        </Text>
        <PrimaryButton
          label="Zużyj (auto / ręcznie)"
          onPress={() =>
            router.push({
              pathname: '/(app)/stock/consume',
              params: { productId: product.productId },
            })
          }
        />
        {product.batches.map((batch) => (
          <BatchCard
            key={batch.id}
            batch={batch}
            unit={product.defaultUnit}
            busy={busyId === batch.id}
            onConsume={() =>
              router.push({
                pathname: '/(app)/stock/consume',
                params: {
                  productId: product.productId,
                  batchId: batch.id,
                  mode: 'manual',
                },
              })
            }
            onDelete={() => {
              if (!batch.canDelete) {
                Alert.alert(
                  'Nie można usunąć',
                  batch.deleteBlockReason ??
                    'Ta partia powstała z zakupów lub była już używana. Użyj zużycia / odpisu.',
                );
                return;
              }
              Alert.alert(
                'Usunąć partię?',
                'Usunięcie jest możliwe tylko dla ręcznej, nieużywanej partii.',
                [
                  { text: 'Anuluj', style: 'cancel' },
                  {
                    text: 'Usuń',
                    style: 'destructive',
                    onPress: () => {
                      setBusyId(batch.id);
                      deleteMutation.mutate(batch.id, {
                        onSettled: () => setBusyId(null),
                        onError: (e) =>
                          Alert.alert(
                            'Błąd',
                            readApiError(e, 'Nie udało się usunąć.'),
                          ),
                      });
                    },
                  },
                ],
              );
            }}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function BatchCard({
  batch,
  unit,
  busy,
  onConsume,
  onDelete,
}: {
  batch: StockBatch;
  unit: StockSummary['defaultUnit'];
  busy: boolean;
  onConsume: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={ui.card}>
      <Text style={{ fontWeight: '700' }}>
        {formatQuantity(batch.quantity, unit)}
        {batch.isExpired ? ' · po terminie' : ''}
      </Text>
      <Text style={ui.muted}>
        {LOCATION_LABELS[batch.location]} · zakup{' '}
        {formatDate(batch.purchasedAt)} · ważność {formatDate(batch.expiresAt)}
      </Text>
      <Text style={ui.muted}>
        {batch.storeName ?? 'Sklep nieznany'} ·{' '}
        {formatMoneyMinor(batch.purchasePriceMinor)}
      </Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <Pressable
          accessibilityRole="button"
          onPress={onConsume}
          style={[ui.button, ui.buttonSecondary, { flexGrow: 1 }]}
        >
          <Text style={ui.buttonTextSecondary}>
            {batch.canDelete ? 'Zużyj' : 'Odpisz / zużyj'}
          </Text>
        </Pressable>
        {batch.canDelete ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onDelete}
            style={[ui.button, ui.buttonSecondary, { flexGrow: 1 }]}
          >
            <Text style={[ui.buttonTextSecondary, ui.dangerText]}>
              {busy ? 'Usuwanie…' : 'Usuń'}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {!batch.canDelete && batch.deleteBlockReason ? (
        <Text style={ui.muted}>{batch.deleteBlockReason}</Text>
      ) : null}
    </View>
  );
}
