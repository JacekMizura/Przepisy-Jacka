import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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
import {
  LOCATION_LABELS,
  inputUnitsFor,
  minorFromZloty,
  newIdempotencyKey,
  type InputUnit,
  type ShoppingListItem,
  type StockLocation,
} from '@/lib/format';
import { pickImage, uploadKitchenMedia } from '@/lib/media';
import { useAuthKitchen } from '@/providers/auth-kitchen';
import { ui } from '@/theme/ui';

type LineDraft = {
  shoppingListItemId: string;
  label: string;
  quantity: string;
  inputUnit: InputUnit;
  location: StockLocation;
  priceZloty: string;
  productId?: string;
  createName?: string;
};

function buildDraft(item: ShoppingListItem): LineDraft {
  const label =
    item.product?.name ?? item.customName ?? 'Pozycja';
  const baseUnit = item.product?.defaultUnit ?? 'piece';
  const units = inputUnitsFor(baseUnit);
  return {
    shoppingListItemId: item.id,
    label,
    quantity: item.plannedQuantity ?? '1',
    inputUnit: (item.plannedUnit as InputUnit | null) ?? units[0]?.value ?? 'piece',
    location: 'pantry',
    priceZloty: '',
    productId: item.productId ?? undefined,
    createName: item.productId ? undefined : item.customName ?? label,
  };
}

export default function ShoppingCheckoutScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { kitchenId, signOut } = useAuthKitchen();
  const [storeName, setStoreName] = useState('');
  const [purchasedAt, setPurchasedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => newIdempotencyKey('checkout'));
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  const [receiptPicked, setReceiptPicked] = useState<
    Awaited<ReturnType<typeof pickImage>> | null
  >(null);

  const listQuery = useQuery({
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
      return requireApiData(result, 'Nie udało się pobrać listy.');
    },
  });

  const bought = useMemo(
    () => (listQuery.data ?? []).filter((i) => i.status === 'bought'),
    [listQuery.data],
  );

  const [lines, setLines] = useState<LineDraft[] | null>(null);
  const drafts = lines ?? bought.map(buildDraft);

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!kitchenId) {
        throw new Error('Brak kuchni.');
      }
      const payloadLines = [];
      for (const line of drafts) {
        const priceMinor = minorFromZloty(line.priceZloty);
        if (priceMinor === null) {
          throw new Error(`Podaj poprawną cenę dla „${line.label}”.`);
        }
        const entry: {
          shoppingListItemId: string;
          quantity: string;
          inputUnit: InputUnit;
          location: StockLocation;
          priceMinor: number;
          productId?: string;
          createProduct?: { name: string; defaultUnit: 'piece' | 'gram' | 'milliliter' };
        } = {
          shoppingListItemId: line.shoppingListItemId,
          quantity: line.quantity.trim(),
          inputUnit: line.inputUnit,
          location: line.location,
          priceMinor,
        };
        if (line.productId) {
          entry.productId = line.productId;
        } else if (line.createName?.trim()) {
          entry.createProduct = {
            name: line.createName.trim(),
            defaultUnit:
              line.inputUnit === 'kilogram'
                ? 'gram'
                : line.inputUnit === 'liter'
                  ? 'milliliter'
                  : line.inputUnit === 'piece' ||
                      line.inputUnit === 'gram' ||
                      line.inputUnit === 'milliliter'
                    ? line.inputUnit
                    : 'piece',
          };
        } else {
          throw new Error(`Brak produktu dla „${line.label}”.`);
        }
        payloadLines.push(entry);
      }

      const client = createMobileApiClient();
      const result = await client.POST(
        '/api/kitchens/{kitchenId}/purchases/checkout',
        {
          params: { path: { kitchenId } },
          body: {
            idempotencyKey,
            storeName: storeName.trim() || undefined,
            purchasedAt: purchasedAt
              ? new Date(`${purchasedAt}T12:00:00`).toISOString()
              : undefined,
            lines: payloadLines,
          },
        },
      );
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      const data = requireApiData(
        result,
        'Nie udało się rozliczyć zakupów.',
      );

      if (receiptPicked?.ok) {
        const asset = await uploadKitchenMedia({
          kitchenId,
          image: receiptPicked.image,
          purpose: 'purchase_receipt',
          target: { purchaseId: data.id },
        });
        const attach = await client.POST(
          '/api/kitchens/{kitchenId}/purchases/{purchaseId}/receipt',
          {
            params: { path: { kitchenId, purchaseId: data.id } },
            body: { mediaAssetId: asset.id },
          },
        );
        requireApiData(
          attach,
          'Zakup OK, ale paragon nie dołączony.',
        );
      }

      return data;
    },
    onSuccess: async (purchase) => {
      await queryClient.invalidateQueries({
        queryKey: ['shopping-list', kitchenId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['purchases', kitchenId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['stock-summary', kitchenId],
      });
      router.replace({
        pathname: '/(app)/shopping/purchase/[purchaseId]',
        params: { purchaseId: purchase.id },
      });
    },
    onError: (e) => setFormError(readApiError(e, 'Błąd checkoutu.')),
  });

  async function onPickReceipt(source: 'camera' | 'library') {
    const result = await pickImage(source);
    if (!result.ok) {
      if (result.reason !== 'cancelled') {
        Alert.alert('Zdjęcie', result.message);
      }
      return;
    }
    setReceiptPicked(result);
    setReceiptUri(result.image.uri);
  }

  if (!kitchenId) {
    return <EmptyState title="Wybierz kuchnię" />;
  }
  if (listQuery.isPending) {
    return <LoadingState />;
  }
  if (listQuery.isError) {
    return (
      <ErrorState
        message={
          isUnauthorized(listQuery.error)
            ? 'Sesja wygasła.'
            : readApiError(listQuery.error, 'Błąd listy.')
        }
        onRetry={() => void listQuery.refetch()}
      />
    );
  }
  if (bought.length === 0) {
    return (
      <EmptyState
        title="Brak pozycji „kupione”"
        description="Oznacz pozycje jako kupione na liście zakupów."
        actionLabel="Lista zakupów"
        onAction={() => router.replace('/(app)/(tabs)/shopping')}
      />
    );
  }

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((current) => {
      const base = current ?? bought.map(buildDraft);
      return base.map((line, i) => (i === index ? { ...line, ...patch } : line));
    });
  }

  return (
    <SafeAreaView style={ui.screen} edges={['bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={ui.padded}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={ui.subtitle}>
            Podaj ilość, jednostkę, cenę i miejsce dla każdej kupionej pozycji.
          </Text>
          <Text style={ui.label}>Sklep</Text>
          <TextInput
            style={ui.input}
            value={storeName}
            onChangeText={setStoreName}
            placeholder="opcjonalnie"
            accessibilityLabel="Nazwa sklepu"
          />
          <Text style={ui.label}>Data zakupu (RRRR-MM-DD)</Text>
          <TextInput
            style={ui.input}
            value={purchasedAt}
            onChangeText={setPurchasedAt}
            accessibilityLabel="Data zakupu"
          />

          {drafts.map((line, index) => (
            <View key={line.shoppingListItemId} style={ui.card}>
              <Text style={{ fontWeight: '700' }}>{line.label}</Text>
              <Text style={ui.label}>Ilość</Text>
              <TextInput
                style={ui.input}
                keyboardType="decimal-pad"
                value={line.quantity}
                onChangeText={(v) => updateLine(index, { quantity: v })}
              />
              <Text style={ui.label}>Jednostka</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(
                  [
                    'piece',
                    'gram',
                    'kilogram',
                    'milliliter',
                    'liter',
                  ] as InputUnit[]
                ).map((unit) => (
                  <Pressable
                    key={unit}
                    onPress={() => updateLine(index, { inputUnit: unit })}
                    style={[
                      ui.button,
                      line.inputUnit === unit ? null : ui.buttonSecondary,
                      { minHeight: 40, paddingHorizontal: 10 },
                    ]}
                  >
                    <Text
                      style={
                        line.inputUnit === unit
                          ? ui.buttonText
                          : ui.buttonTextSecondary
                      }
                    >
                      {unit}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Text style={ui.label}>Cena (zł)</Text>
              <TextInput
                style={ui.input}
                keyboardType="decimal-pad"
                value={line.priceZloty}
                onChangeText={(v) => updateLine(index, { priceZloty: v })}
                accessibilityLabel={`Cena ${line.label}`}
              />
              <Text style={ui.label}>Miejsce</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(Object.keys(LOCATION_LABELS) as StockLocation[]).map((loc) => (
                  <Pressable
                    key={loc}
                    onPress={() => updateLine(index, { location: loc })}
                    style={[
                      ui.button,
                      line.location === loc ? null : ui.buttonSecondary,
                      { minHeight: 40, paddingHorizontal: 10 },
                    ]}
                  >
                    <Text
                      style={
                        line.location === loc
                          ? ui.buttonText
                          : ui.buttonTextSecondary
                      }
                    >
                      {LOCATION_LABELS[loc]}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {!line.productId ? (
                <>
                  <Text style={ui.label}>Nazwa nowego produktu</Text>
                  <TextInput
                    style={ui.input}
                    value={line.createName ?? ''}
                    onChangeText={(v) => updateLine(index, { createName: v })}
                  />
                </>
              ) : null}
            </View>
          ))}

          <View style={ui.card}>
            <Text style={ui.label}>Paragon (opcjonalnie)</Text>
            {receiptUri ? (
              <Text style={ui.muted}>Wybrano zdjęcie paragonu.</Text>
            ) : (
              <Text style={ui.muted}>Aparat lub galeria.</Text>
            )}
            <PrimaryButton
              label="Zrób zdjęcie"
              secondary
              onPress={() => void onPickReceipt('camera')}
            />
            <PrimaryButton
              label="Wybierz z galerii"
              secondary
              onPress={() => void onPickReceipt('library')}
            />
            {receiptUri ? (
              <PrimaryButton
                label="Usuń paragon"
                secondary
                onPress={() => {
                  setReceiptUri(null);
                  setReceiptPicked(null);
                }}
              />
            ) : null}
          </View>

          {formError ? (
            <Text style={ui.dangerText} accessibilityRole="alert">
              {formError}
            </Text>
          ) : null}

          <PrimaryButton
            label="Zapisz zakup"
            loading={checkoutMutation.isPending}
            onPress={() => {
              setFormError(null);
              void checkoutMutation.mutateAsync();
            }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
