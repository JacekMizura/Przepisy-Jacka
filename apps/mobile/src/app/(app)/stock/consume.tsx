import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
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
  isConflict,
  isUnauthorized,
  readApiError,
  requireApiData,
} from '@/lib/api';
import {
  convertToBaseQuantity,
  formatMoneyMinor,
  formatQuantity,
  inputUnitsFor,
  newIdempotencyKey,
  type ConsumePreview,
  type InputUnit,
  type StockSummary,
} from '@/lib/format';
import {
  asStockSummaryPage,
  findStockProduct,
} from '@/lib/stock-summary-page';
import { useAuthKitchen } from '@/providers/auth-kitchen';
import { ui } from '@/theme/ui';

type Mode = 'auto' | 'manual';

export default function StockConsumeScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { kitchenId, signOut } = useAuthKitchen();
  const params = useLocalSearchParams<{
    productId: string;
    batchId?: string;
    mode?: string;
  }>();
  const productId = params.productId;
  const initialMode: Mode = params.mode === 'manual' ? 'manual' : 'auto';

  const [mode, setMode] = useState<Mode>(initialMode);
  const [operationKind, setOperationKind] = useState<'consume' | 'write_off'>(
    'consume',
  );
  const [reason, setReason] = useState('');
  const [quantity, setQuantity] = useState('');
  const [inputUnit, setInputUnit] = useState<InputUnit>('piece');
  const [manualQtyById, setManualQtyById] = useState<Record<string, string>>(
    () => (params.batchId ? { [params.batchId]: '' } : {}),
  );
  const [preview, setPreview] = useState<ConsumePreview | null>(null);
  const [manualLines, setManualLines] = useState<
    { stockItemId: string; quantity: string }[] | null
  >(null);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['stock-summary', kitchenId, productId],
    enabled: Boolean(kitchenId && productId),
    queryFn: async () => {
      const client = createMobileApiClient();
      const result = await client.GET(
        '/api/kitchens/{kitchenId}/stock-summary',
        {
          params: {
            path: { kitchenId: kitchenId! },
            query: { productId: productId!, limit: 10 } as never,
          },
        },
      );
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      const data = requireApiData(result, 'Nie udało się pobrać zapasów.');
      return findStockProduct(asStockSummaryPage(data), productId!);
    },
  });

  const product = query.data;

  const units = useMemo(
    () => (product ? inputUnitsFor(product.defaultUnit) : []),
    [product],
  );

  useEffect(() => {
    if (units[0] && !units.some((u) => u.value === inputUnit)) {
      setInputUnit(units[0].value);
    }
  }, [units, inputUnit]);

  function buildManualLines(p: StockSummary) {
    const lines: { stockItemId: string; quantity: string }[] = [];
    for (const batch of p.batches) {
      const raw = manualQtyById[batch.id]?.trim() ?? '';
      if (!raw) continue;
      const converted = convertToBaseQuantity(
        raw,
        inputUnit,
        p.defaultUnit,
      );
      if (!converted.ok) {
        throw new Error(converted.message);
      }
      lines.push({ stockItemId: batch.id, quantity: converted.quantity });
    }
    if (lines.length === 0) {
      throw new Error('Wybierz co najmniej jedną partię i podaj ilość.');
    }
    return lines;
  }

  const previewMutation = useMutation({
    mutationFn: async () => {
      if (!product || !kitchenId) {
        throw new Error('Brak produktu.');
      }
      const converted = convertToBaseQuantity(
        quantity,
        inputUnit,
        product.defaultUnit,
      );
      if (!converted.ok) {
        throw new Error(converted.message);
      }
      const lines = mode === 'manual' ? buildManualLines(product) : undefined;
      const client = createMobileApiClient();
      const result = await client.POST(
        '/api/kitchens/{kitchenId}/products/{productId}/consume/preview',
        {
          params: { path: { kitchenId, productId: product.productId } },
          body: {
            quantity: converted.quantity,
            ...(lines ? { manualLines: lines } : {}),
          },
        },
      );
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      const data = requireApiData(
        result,
        'Nie udało się przygotować podglądu.',
      );
      return { data, lines: lines ?? null };
    },
    onSuccess: ({ data, lines }) => {
      setPreview(data);
      setManualLines(lines);
      setFormError(null);
    },
    onError: (e) => {
      setFormError(readApiError(e, 'Błąd podglądu.'));
      setPreview(null);
    },
  });

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!preview || !product || !kitchenId) {
        throw new Error('Brak podglądu.');
      }
      const trimmedReason = reason.trim();
      if (operationKind === 'write_off' && trimmedReason.length === 0) {
        throw new ApiRequestError(400, 'Powód odpisu jest wymagany.');
      }
      const client = createMobileApiClient();
      const result = await client.POST(
        '/api/kitchens/{kitchenId}/products/{productId}/consume',
        {
          params: { path: { kitchenId, productId: product.productId } },
          body: {
            quantity: preview.quantity,
            idempotencyKey: newIdempotencyKey(
              operationKind === 'write_off' ? 'writeoff' : 'consume',
            ),
            previewFingerprint: preview.previewFingerprint,
            kind: operationKind,
            ...(trimmedReason ? { reason: trimmedReason } : {}),
            ...(manualLines ? { manualLines } : {}),
          },
        },
      );
      if (apiStatus(result) === 401) {
        await signOut();
        throw new ApiRequestError(401, 'Sesja wygasła.');
      }
      return requireApiData(result, 'Nie udało się zatwierdzić zużycia.');
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['stock-summary', kitchenId],
      });
      await queryClient.invalidateQueries({
        queryKey: ['stock-consumptions', kitchenId],
      });
      router.back();
    },
    onError: (e) => {
      const message = readApiError(e, 'Błąd zatwierdzenia.');
      setFormError(message);
      if (isConflict(e) || message.includes('odśwież') || message.includes('zmienił')) {
        setPreview(null);
        setManualLines(null);
        void query.refetch();
      }
    },
  });

  if (!kitchenId || !productId) {
    return <EmptyState title="Brak produktu" />;
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
            : readApiError(query.error, 'Błąd.')
        }
        onRetry={() => void query.refetch()}
      />
    );
  }
  if (!product) {
    return <EmptyState title="Produkt nie znaleziony" />;
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
          <Text style={ui.title}>{product.productName}</Text>
          <Text style={ui.subtitle}>
            Stan: {formatQuantity(product.totalQuantity, product.defaultUnit)}
          </Text>

          <Text style={ui.label}>Rodzaj operacji</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => setOperationKind('consume')}
              style={[
                ui.button,
                operationKind === 'consume' ? null : ui.buttonSecondary,
                { flex: 1 },
              ]}
            >
              <Text
                style={
                  operationKind === 'consume'
                    ? ui.buttonText
                    : ui.buttonTextSecondary
                }
              >
                Zużycie
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setOperationKind('write_off')}
              style={[
                ui.button,
                operationKind === 'write_off' ? null : ui.buttonSecondary,
                { flex: 1 },
              ]}
            >
              <Text
                style={
                  operationKind === 'write_off'
                    ? ui.buttonText
                    : ui.buttonTextSecondary
                }
              >
                Odpis
              </Text>
            </Pressable>
          </View>
          {operationKind === 'write_off' ? (
            <>
              <Text style={ui.label}>Powód odpisu (wymagany)</Text>
              <TextInput
                style={ui.input}
                value={reason}
                onChangeText={setReason}
                maxLength={200}
                accessibilityLabel="Powód odpisu"
                placeholder="np. przeterminowane, zepsute"
              />
            </>
          ) : (
            <>
              <Text style={ui.label}>Notatka (opcjonalna)</Text>
              <TextInput
                style={ui.input}
                value={reason}
                onChangeText={setReason}
                maxLength={200}
                accessibilityLabel="Notatka zużycia"
              />
            </>
          )}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable
              onPress={() => {
                setMode('auto');
                setPreview(null);
              }}
              style={[
                ui.button,
                mode === 'auto' ? null : ui.buttonSecondary,
                { flex: 1 },
              ]}
            >
              <Text
                style={
                  mode === 'auto' ? ui.buttonText : ui.buttonTextSecondary
                }
              >
                Auto (FIFO)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setMode('manual');
                setPreview(null);
              }}
              style={[
                ui.button,
                mode === 'manual' ? null : ui.buttonSecondary,
                { flex: 1 },
              ]}
            >
              <Text
                style={
                  mode === 'manual' ? ui.buttonText : ui.buttonTextSecondary
                }
              >
                Ręcznie
              </Text>
            </Pressable>
          </View>

          <Text style={ui.label}>Ilość do zużycia</Text>
          <TextInput
            style={ui.input}
            keyboardType="decimal-pad"
            value={quantity}
            onChangeText={(v) => {
              setQuantity(v);
              setPreview(null);
            }}
            accessibilityLabel="Ilość"
          />

          <Text style={ui.label}>Jednostka</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {units.map((unit) => (
              <Pressable
                key={unit.value}
                onPress={() => {
                  setInputUnit(unit.value);
                  setPreview(null);
                }}
                style={[
                  ui.button,
                  inputUnit === unit.value ? null : ui.buttonSecondary,
                  { paddingHorizontal: 12 },
                ]}
              >
                <Text
                  style={
                    inputUnit === unit.value
                      ? ui.buttonText
                      : ui.buttonTextSecondary
                  }
                >
                  {unit.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {mode === 'manual' ? (
            <Text style={ui.muted}>
              Ręczny wybór partii (w tym po terminie). Przy odpisie powód trafia
              do historii API.
            </Text>
          ) : null}

          {mode === 'manual'
            ? product.batches.map((batch) => (
                <View key={batch.id} style={ui.card}>
                  <Text style={{ fontWeight: '600' }}>
                    Partia {formatQuantity(batch.quantity, product.defaultUnit)}
                    {batch.isExpired ? ' (po terminie)' : ''}
                  </Text>
                  <TextInput
                    style={ui.input}
                    keyboardType="decimal-pad"
                    placeholder="Ilość z tej partii"
                    value={manualQtyById[batch.id] ?? ''}
                    onChangeText={(v) => {
                      setManualQtyById((prev) => ({
                        ...prev,
                        [batch.id]: v,
                      }));
                      setPreview(null);
                    }}
                    accessibilityLabel={`Ilość z partii ${batch.id}`}
                  />
                </View>
              ))
            : null}

          {formError ? (
            <Text style={ui.dangerText} accessibilityRole="alert">
              {formError}
            </Text>
          ) : null}

          {!preview ? (
            <PrimaryButton
              label="Podgląd zużycia"
              loading={previewMutation.isPending}
              onPress={() => void previewMutation.mutateAsync()}
            />
          ) : (
            <View style={ui.card}>
              <Text style={{ fontWeight: '700' }}>Podgląd</Text>
              <Text style={ui.muted}>{preview.disclaimer}</Text>
              {preview.lines.map((line) => (
                <Text key={line.stockItemId} style={ui.muted}>
                  {formatQuantity(line.quantity, product.defaultUnit)}
                  {line.costMinor != null
                    ? ` · ${formatMoneyMinor(line.costMinor)}`
                    : ''}
                  {line.isExpired ? ' · po terminie' : ''}
                </Text>
              ))}
              <Text>
                Razem: {formatQuantity(preview.totalQuantity, product.defaultUnit)}{' '}
                ·{' '}
                {preview.costComplete
                  ? formatMoneyMinor(preview.totalCostMinor)
                  : 'koszt niepełny'}
              </Text>
              {preview.insufficientQuantity ? (
                <Text style={ui.dangerText}>
                  Brakuje: {preview.insufficientQuantity}
                </Text>
              ) : null}
              <PrimaryButton
                label="Zatwierdź zużycie"
                loading={commitMutation.isPending}
                onPress={() => void commitMutation.mutateAsync()}
              />
              <PrimaryButton
                label="Odśwież podgląd"
                secondary
                onPress={() => {
                  setPreview(null);
                  void previewMutation.mutateAsync();
                }}
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
