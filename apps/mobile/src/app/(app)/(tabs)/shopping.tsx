import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
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
import type { ShoppingListItem } from '@/lib/format';
import { useAuthKitchen } from '@/providers/auth-kitchen';
import { ui } from '@/theme/ui';

type ShoppingStatus = ShoppingListItem['status'];

export default function ShoppingTab() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { kitchenId, signOut } = useAuthKitchen();
  const [customName, setCustomName] = useState('');
  const [plannedQuantity, setPlannedQuantity] = useState('1');
  const [addError, setAddError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['shopping-list', kitchenId],
    enabled: Boolean(kitchenId),
    queryFn: async () => {
      const client = createMobileApiClient();
      const result = await client.GET(
        '/api/kitchens/{kitchenId}/shopping-list/items',
        { params: { path: { kitchenId: kitchenId! } } },
      );
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      return requireApiData(result, 'Nie udało się pobrać listy zakupów.');
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['shopping-list', kitchenId],
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const client = createMobileApiClient();
      const body = {
        customName: customName.trim(),
        plannedQuantity: plannedQuantity.trim() || '1',
        plannedUnit: 'piece' as const,
      };
      const first = await client.POST(
        '/api/kitchens/{kitchenId}/shopping-list/items',
        { params: { path: { kitchenId: kitchenId! } }, body },
      );
      const result =
        apiStatus(first) === 409
          ? await client.POST(
              '/api/kitchens/{kitchenId}/shopping-list/items',
              {
                params: { path: { kitchenId: kitchenId! } },
                body: { ...body, mergeQuantity: true },
              },
            )
          : first;
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      return requireApiData(result, 'Nie udało się dodać pozycji.');
    },
    onSuccess: async () => {
      setCustomName('');
      setPlannedQuantity('1');
      setAddError(null);
      await invalidate();
    },
    onError: (e) => setAddError(readApiError(e, 'Błąd dodawania.')),
  });

  const statusMutation = useMutation({
    mutationFn: async ({
      itemId,
      status,
    }: {
      itemId: string;
      status: ShoppingStatus;
    }) => {
      const client = createMobileApiClient();
      const result = await client.PATCH(
        '/api/kitchens/{kitchenId}/shopping-list/items/{itemId}/status',
        {
          params: { path: { kitchenId: kitchenId!, itemId } },
          body: { status },
        },
      );
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      requireApiData(result, 'Nie udało się zmienić statusu.');
    },
    onSuccess: () => void invalidate(),
  });

  const deleteMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const client = createMobileApiClient();
      const result = await client.DELETE(
        '/api/kitchens/{kitchenId}/shopping-list/items/{itemId}',
        { params: { path: { kitchenId: kitchenId!, itemId } } },
      );
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      requireApiData(result, 'Nie udało się usunąć pozycji.');
    },
    onSuccess: () => void invalidate(),
  });

  const grouped = useMemo(() => {
    const items = query.data ?? [];
    return {
      pending: items.filter((i) => i.status === 'pending'),
      bought: items.filter((i) => i.status === 'bought'),
      skipped: items.filter((i) => i.status === 'skipped'),
    };
  }, [query.data]);

  const listData = useMemo(
    () => [
      ...grouped.pending.map((item) => ({ section: 'Do kupienia' as const, item })),
      ...grouped.bought.map((item) => ({ section: 'Kupione' as const, item })),
      ...grouped.skipped.map((item) => ({ section: 'Pominięte' as const, item })),
    ],
    [grouped],
  );

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
    return <LoadingState label="Ładowanie listy…" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        message={
          isUnauthorized(query.error)
            ? 'Sesja wygasła.'
            : readApiError(query.error, 'Błąd listy zakupów.')
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <SafeAreaView style={ui.screen} edges={['bottom']}>
      <FlatList
        data={listData}
        keyExtractor={(row) => row.item.id}
        contentContainerStyle={ui.padded}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching}
            onRefresh={() => void query.refetch()}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <PrimaryButton
                label="Rozlicz kupione"
                disabled={grouped.bought.length === 0}
                onPress={() => router.push('/(app)/shopping/checkout')}
              />
              <PrimaryButton
                label="Historia"
                secondary
                onPress={() => router.push('/(app)/shopping/purchases')}
              />
            </View>
            <View style={ui.card}>
              <Text style={ui.label}>Dodaj pozycję</Text>
              <TextInput
                style={ui.input}
                placeholder="Nazwa (np. Mleko)"
                value={customName}
                onChangeText={setCustomName}
                accessibilityLabel="Nazwa pozycji"
              />
              <TextInput
                style={ui.input}
                placeholder="Ilość"
                keyboardType="decimal-pad"
                value={plannedQuantity}
                onChangeText={setPlannedQuantity}
                accessibilityLabel="Planowana ilość"
              />
              {addError ? (
                <Text style={ui.dangerText} accessibilityRole="alert">
                  {addError}
                </Text>
              ) : null}
              <PrimaryButton
                label="Dodaj"
                loading={createMutation.isPending}
                disabled={customName.trim().length < 1}
                onPress={() => void createMutation.mutateAsync()}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title="Lista pusta"
            description="Dodaj produkty albo przenieś braki z przepisów na webie."
          />
        }
        renderItem={({ item: row, index }) => {
          const showHeader =
            index === 0 || listData[index - 1]?.section !== row.section;
          return (
            <View style={{ gap: 8 }}>
              {showHeader ? (
                <Text style={[ui.label, { marginTop: 8 }]}>{row.section}</Text>
              ) : null}
              <ShoppingRow
                item={row.item}
                onStatus={(status) =>
                  statusMutation.mutate(
                    { itemId: row.item.id, status },
                    {
                      onError: (e) =>
                        Alert.alert('Błąd', readApiError(e, 'Nie udało się.')),
                    },
                  )
                }
                onDelete={() =>
                  Alert.alert('Usunąć pozycję?', undefined, [
                    { text: 'Anuluj', style: 'cancel' },
                    {
                      text: 'Usuń',
                      style: 'destructive',
                      onPress: () =>
                        deleteMutation.mutate(row.item.id, {
                          onError: (e) =>
                            Alert.alert(
                              'Błąd',
                              readApiError(e, 'Nie udało się usunąć.'),
                            ),
                        }),
                    },
                  ])
                }
              />
            </View>
          );
        }}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
    </SafeAreaView>
  );
}

function ShoppingRow({
  item,
  onStatus,
  onDelete,
}: {
  item: ShoppingListItem;
  onStatus: (status: ShoppingStatus) => void;
  onDelete: () => void;
}) {
  const label =
    item.product?.name ?? item.customName ?? 'Pozycja bez nazwy';
  const qty = item.plannedQuantity
    ? `${item.plannedQuantity}${item.plannedUnit ? ` ${item.plannedUnit}` : ''}`
    : null;

  return (
    <View style={ui.card}>
      <Text style={{ fontWeight: '700', fontSize: 16 }}>{label}</Text>
      {qty ? <Text style={ui.muted}>{qty}</Text> : null}
      {item.note ? <Text style={ui.muted}>{item.note}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {item.status === 'pending' ? (
          <>
            <Chip label="Kupione" onPress={() => onStatus('bought')} />
            <Chip label="Pomiń" onPress={() => onStatus('skipped')} />
          </>
        ) : (
          <Chip label="Przywróć" onPress={() => onStatus('pending')} />
        )}
        <Chip label="Usuń" danger onPress={onDelete} />
      </View>
    </View>
  );
}

function Chip({
  label,
  onPress,
  danger,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[ui.button, ui.buttonSecondary, { minHeight: 40, paddingHorizontal: 12 }]}
    >
      <Text style={[ui.buttonTextSecondary, danger ? ui.dangerText : null]}>
        {label}
      </Text>
    </Pressable>
  );
}
