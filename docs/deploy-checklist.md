# Checklist wdrożenia produkcyjnego

Niczego z tej listy nie ustawiaj automatycznie w CI ani skryptach agenta. Wykonaj ręcznie przed pierwszym deployem auth/kuchni/zapasów.

## PostgreSQL

- Railway: major **18**, sprawdzona wersja `18.6 (Debian 18.6-1.pgdg13+2)`.
- Lokalnie: `docker-compose.yml` → `postgres:18-alpine`.
- CI: `postgres:18-alpine`.

## Railway (API)

Publiczny URL API:

`https://przepisy-jacka-production-ae86.up.railway.app`

### Pre-deploy / release (katalog główny monorepo)

Uruchom **przed** startem procesu API:

```bash
pnpm --filter @moja-kuchnia/api exec prisma migrate deploy
```

Następnie start (po buildzie), np. `node dist/main` z katalogu `apps/api`.

CLI `prisma` jest w `dependencies` pakietu `@moja-kuchnia/api`.

### Zmienne

| Zmienna | Wartość |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | referencja do usługi Postgres na Railway |
| `PORT` lub `API_PORT` | zgodnie z Railway / schematem env (`API_PORT` domyślnie `3001`) |
| `API_HOST` | `0.0.0.0` |
| `CORS_ORIGINS` | `https://przepisy-jacka-web.vercel.app` |
| `PUBLIC_WEB_ORIGIN` | `https://przepisy-jacka-web.vercel.app` |
| `BETTER_AUTH_URL` | `https://przepisy-jacka-web.vercel.app` |
| `AUTH_TRUSTED_ORIGINS` | `https://przepisy-jacka-web.vercel.app` |
| `BETTER_AUTH_SECRET` | nowy trwały sekret (≥ 32 znaki), **nie** kopiuj z CI ani `.env.example` |
| `ALLOW_DEMO_SEED` | `false` albo brak zmiennej |
| `MEDIA_STORAGE_DRIVER` | `s3` (lub puste — wtedy S3 gdy pełna konfiguracja) |
| `MEDIA_S3_ENDPOINT` | Cloudflare R2: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `MEDIA_S3_REGION` | `auto` (wymagane przez SDK przy R2) |
| `MEDIA_S3_BUCKET` | nazwa bucketa, np. `przepisy-jacka-media` |
| `MEDIA_S3_ACCESS_KEY_ID` | R2 Access Key ID (token S3 API) |
| `MEDIA_S3_SECRET_ACCESS_KEY` | R2 Secret Access Key |
| `MEDIA_MAX_UPLOAD_BYTES` | opcjonalnie, domyślnie `10485760` (10 MB) |

### Cloudflare R2 (zdjęcia) — przed merge funkcji mediów

1. W Cloudflare utwórz **prywatny** bucket R2 (bez publicznego dostępu / custom domain do obiektów).
2. Utwórz token S3 API z uprawnieniami Object Read & Write do tego bucketa.
3. Ustaw powyższe zmienne `MEDIA_*` w usłudze API na Railway. **Nie** commituj sekretów.
4. W ustawieniach bucketa R2 dodaj **CORS** (wymagane dla PUT z przeglądarki na presigned URL):

```json
[
  {
    "AllowedOrigins": [
      "https://przepisy-jacka-web.vercel.app",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

5. Bucket musi pozostać **prywatny** — klienci nigdy nie dostają stałych publicznych URL-i; API wydaje tylko krótko ważne presigned GET/PUT.
6. Bez pełnych `MEDIA_*` API nadal startuje, ale upload zwraca „Magazyn zdjęć nie jest skonfigurowany.”
7. Po merge sprawdź w logach Railway migrację `…_media_nutrition_recipe_costs` oraz smoke: begin → PUT do R2 → complete → GET → delete.

Seed demo **nie** może być częścią startu ani pre-deploy.

## Vercel (web)

Publiczny URL weba:

`https://przepisy-jacka-web.vercel.app`

| Zmienna | Wartość |
| --- | --- |
| `API_ORIGIN` | `https://przepisy-jacka-production-ae86.up.railway.app` (tylko serwerowa) |

- `API_ORIGIN` **bez** prefiksu `NEXT_PUBLIC_`.
- Usuń z Vercela stare `NEXT_PUBLIC_API_URL` wskazujące na Railway (w kodzie aplikacji nie jest już używane).

## Preview Vercel

Auth na preview wymaga osobnej decyzji o `AUTH_TRUSTED_ORIGINS` — brak wildcardu.

## Po konfiguracji

1. Push / PR feature brancha → obserwuj GitHub Actions.
2. Merge do `main` dopiero przy zielonym CI.
3. Potwierdź `prisma migrate deploy` w logach release Railway (w tym seed katalogu USDA v1 — bez ręcznego `usda:sync-catalog`).
4. Smoke: rejestracja / logowanie / `/api/me` przez origin weba.
