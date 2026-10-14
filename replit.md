# Sazón del Puerto

Mobile-first restaurant ordering for a Puerto Cabello restaurant, with a public menu feed, order tracking, and an owner dashboard.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the Express API server (port 5000)
- `pnpm --filter @workspace/puerto-cabello-menu run dev` — run the customer and admin web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required secrets: `ADMIN_PIN`, `SESSION_SECRET`, `MACRODROID_WEBHOOK_TOKEN`
- Optional env: `SQLITE_DB_PATH` — SQLite file path; default is `artifacts/api-server/data/database.sqlite`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React, Vite, Tailwind CSS, generated React Query hooks
- API: Express 5, validated with generated Zod schemas
- Database: local SQLite through `better-sqlite3`
- API contract/codegen: OpenAPI and Orval
- Logging/build: Pino and esbuild

## Where things live

- `artifacts/puerto-cabello-menu/` — customer menu, checkout, order tracking, and admin UI.
- `artifacts/api-server/src/routes/` — public store, orders, webhook, and admin API.
- `artifacts/api-server/src/lib/restaurant-db.ts` — SQLite schema, seed menu, and row mapping.
- `lib/api-spec/openapi.yaml` — API source of truth; regenerate client/server schemas after edits.

## Architecture decisions

- Only confirmed/approved orders can leave reviews; tracking tokens are hashed in SQLite.
- Admin access uses `ADMIN_PIN` and an HMAC-signed HTTP-only cookie; webhook credentials are read from environment secrets, never stored in SQLite.
- SQLite is intentionally local per the product request. Replit published apps reset local files on publish/redeploy, so this database is not durable in published Replit deployments yet.

## Product

- Public menu with search, category filters, likes, shareable dish links, reviews, cart, and mobile-payment checkout.
- Private order tracking with status polling, verified reviews, and WhatsApp order summaries.
- PIN-protected admin dashboard for sales, orders, products, restaurant hours, payment details, exchange rate, and open status.

## User preferences

- Keep the local SQLite database; do not replace it with a hosted database without the user's explicit approval.

## Gotchas

- Configure the real payment details, exchange rate, WhatsApp number, and hours in `/admin` before taking orders.
- Set `SQLITE_DB_PATH` to a durable disk when hosting somewhere that supports persistent disks. Do not accept live orders on published Replit until a durable storage strategy is chosen.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
