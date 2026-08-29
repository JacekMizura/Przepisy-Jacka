import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScrollView, Text, View } from 'react-native';
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
  LOCATION_LABELS,
  formatDate,
  formatMoneyMinor,
  formatQuantity,
  mediaUrl,
} from '@/lib/format';
import { useAuthKitchen } from '@/providers/auth-kitchen';
import { ui } from '@/theme/ui';

export default function PurchaseDetailScreen() {
  const { kitchenId, signOut } = useAuthKitchen();
  const { purchaseId } = useLocalSearchParams<{ purchaseId: string }>();

  const query = useQuery({
    queryKey: ['purchase', kitchenId, purchaseId],
    enabled: Boolean(kitchenId && purchaseId),
    queryFn: async () => {
      const client = createMobileApiClient();
      const result = await client.GET(
        '/api/kitchens/{kitchenId}/purchases/{purchaseId}',
        {
          params: {
            path: { kitchenId: kitchenId!, purchaseId: purchaseId! },
          },
        },
      );
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      return requireApiData(result, 'Nie udało się pobrać zakupu.');
    },
  });

  if (!kitchenId || !purchaseId) {
    return <EmptyState title="Brak zakupu" />;
  }
  if (query.isPending) {
    return <LoadingState />;
  }
  if (query.isError) {
    return (
      <ErrorState
        message={
          isUnauthorized(query.error)
            ? 'Sesja wygasła.'
            : readApiError(query.error, 'Błąd szczegółów zakupu.')
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  const purchase = query.data!;
  const receipt = mediaUrl(purchase.receiptImage, 'full');

  return (
    <SafeAreaView style={ui.screen} edges={['bottom']}>
      <ScrollView contentContainerStyle={ui.padded}>
        <Text style={ui.title}>{purchase.storeName ?? 'Zakup'}</Text>
        <Text style={ui.subtitle}>
          {formatDate(purchase.purchasedAt)} ·{' '}
          {formatMoneyMinor(purchase.totalPriceMinor)} · {purchase.itemCount}{' '}
          poz.
        </Text>

        {receipt ? (
          <View style={ui.card}>
            <Text style={ui.label}>Paragon</Text>
            <Image
              source={{ uri: receipt }}
              style={{ width: '100%', height: 220, borderRadius: 12 }}
              contentFit="cover"
              accessibilityLabel="Zdjęcie paragonu"
            />
          </View>
        ) : null}

        {purchase.lines.map((line) => (
          <View key={line.id} style={ui.card}>
            <Text style={{ fontWeight: '700' }}>
              {line.displayName ?? line.productName}
            </Text>
            <Text style={ui.muted}>
              {formatQuantity(line.quantity, line.unit)} ·{' '}
              {LOCATION_LABELS[line.location]} ·{' '}
              {formatMoneyMinor(line.priceMinor)}
            </Text>
            {line.expiresAt ? (
              <Text style={ui.muted}>
                Ważność: {formatDate(line.expiresAt)}
              </Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
