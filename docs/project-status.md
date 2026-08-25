# Moja Kuchnia — status projektu

## Aktualnie ukończony etap

Etap 1: fundament repozytorium. Monorepo, szkielet web / API / mobile, health check, OpenAPI, klient API, CI, dokumentacja i reguły Cursora.

`docs/faza-0-architektura.md` pochodzi z wcześniejszego, niezwiązanego projektu. Plik pozostaje na dysku jako materiał historyczny i nie jest źródłem prawdy.

## Co rzeczywiście działa

- monorepo pnpm + Turborepo,
- `apps/api` — NestJS + Fastify, prefix `/api`, `GET /api/health`, walidacja env, CORS, Swagger poza produkcją, Prisma bez modeli domenowych,
- `packages/api-client` — `openapi-fetch` + typy z OpenAPI,
- `apps/web` — ekran kontrolny „Moja Kuchnia” ze stanami ładowanie / sukces / błąd health,
- `apps/mobile` — analogiczny ekran kontrolny z `EXPO_PUBLIC_API_URL`,
- lokalny PostgreSQL przez `docker-compose.yml`,
- GitHub Actions: instalacja z lockfile, lint, typecheck, testy, build web i API,
- lokalne kontrole: lint, typecheck, testy jednostkowe i e2e health, build web i API.

## Co jest tylko decyzją docelową

- Better Auth i pełny proces logowania,
- wspólne kuchnie, zaproszenia, produkty, przepisy, zapasy, zakupy, dziennik żywienia,
- import przepisów ze stron,
- wdrożenia na Vercel, Railway i EAS,
- automatyczne pipeline’y deploy.

## Następny sugerowany etap

Uwierzytelnianie: Better Auth w API, sesja cookie na webie, bezpieczna sesja w Expo, wspólne konta, bez jeszcze domeny kuchni.
