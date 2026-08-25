"use client";

import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createWebApiClient, getApiBaseUrl } from "@/lib/api";

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Nieznany błąd połączenia z API.";
}

export function HealthStatus() {
  const query = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const client = createWebApiClient();
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
    apiBaseUrl = getApiBaseUrl() || "(ten sam origin /api)";
  } catch {
    apiBaseUrl = "(ten sam origin /api)";
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Połączenie z API</CardTitle>
        <CardDescription>
          Endpoint <code>/api/health</code> pod adresem {apiBaseUrl}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isPending ? (
          <Badge variant="secondary">Ładowanie…</Badge>
        ) : null}
        {query.isSuccess ? (
          <div className="space-y-2">
            <Badge>Połączono</Badge>
            <p className="text-sm text-muted-foreground">
              Status: {query.data.status}
            </p>
            <p className="text-sm text-muted-foreground">
              Czas serwera: {query.data.timestamp}
            </p>
          </div>
        ) : null}
        {query.isError ? (
          <div className="space-y-2">
            <Badge variant="destructive">Błąd</Badge>
            <p className="text-sm text-muted-foreground">
              {readErrorMessage(query.error)}
            </p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
