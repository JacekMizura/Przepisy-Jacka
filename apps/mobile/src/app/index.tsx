import { colorTokens, fontSizeTokens, spaceTokens } from "@moja-kuchnia/design-tokens";
import { useQuery } from "@tanstack/react-query";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { createMobileApiClient, getApiBaseUrl } from "@/lib/api";

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Nieznany błąd połączenia z API.";
}

export default function HomeScreen() {
  const query = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const client = createMobileApiClient();
      const { data, error } = await client.GET("/api/health");
      if (error) {
        throw new Error("Wywołanie /api/health zakończyło się błędem.");
      }
      if (!data) {
        throw new Error(
          "API nie zwróciło danych health. Sprawdź, czy serwer działa.",
        );
      }
      return data;
    },
  });

  let apiBaseUrl = "";
  try {
    apiBaseUrl = getApiBaseUrl();
  } catch {
    apiBaseUrl = "(brak EXPO_PUBLIC_API_URL)";
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Moja Kuchnia</Text>
        <Text style={styles.subtitle}>
          Aplikacja mobilna działa. To techniczny ekran kontrolny, nie docelowa
          nawigacja produktu.
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Połączenie z API</Text>
          <Text style={styles.muted}>{apiBaseUrl}/api/health</Text>
          {query.isPending ? (
            <View style={styles.row}>
              <ActivityIndicator color={colorTokens.accent} />
              <Text style={styles.muted}>Ładowanie…</Text>
            </View>
          ) : null}
          {query.isSuccess ? (
            <View style={styles.block}>
              <Text style={styles.success}>Połączono</Text>
              <Text style={styles.muted}>Status: {query.data.status}</Text>
              <Text style={styles.muted}>
                Czas serwera: {query.data.timestamp}
              </Text>
            </View>
          ) : null}
          {query.isError ? (
            <View style={styles.block}>
              <Text style={styles.danger}>Błąd</Text>
              <Text style={styles.muted}>{readErrorMessage(query.error)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colorTokens.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spaceTokens.lg,
    paddingTop: spaceTokens.lg,
    gap: spaceTokens.md,
  },
  title: {
    fontSize: fontSizeTokens.xl,
    fontWeight: "700",
    color: colorTokens.foreground,
  },
  subtitle: {
    fontSize: fontSizeTokens.md,
    color: colorTokens.muted,
    lineHeight: 22,
  },
  card: {
    backgroundColor: colorTokens.surface,
    borderColor: colorTokens.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: spaceTokens.lg,
    gap: spaceTokens.sm,
  },
  cardTitle: {
    fontSize: fontSizeTokens.lg,
    fontWeight: "600",
    color: colorTokens.foreground,
  },
  muted: {
    fontSize: fontSizeTokens.sm,
    color: colorTokens.muted,
  },
  success: {
    fontSize: fontSizeTokens.md,
    fontWeight: "600",
    color: colorTokens.success,
  },
  danger: {
    fontSize: fontSizeTokens.md,
    fontWeight: "600",
    color: colorTokens.danger,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spaceTokens.sm,
    marginTop: spaceTokens.sm,
  },
  block: {
    gap: spaceTokens.xs,
    marginTop: spaceTokens.sm,
  },
});
