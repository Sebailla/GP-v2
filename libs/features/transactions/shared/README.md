# Transactions shared package

This workspace package owns the transactions slice's shared Zod contracts.
Its manifest makes runtime dependency ownership explicit for pnpm.
Both client and server consumers continue using the canonical schemas.
Keep schema literals under `shared/schemas` and export them through `src/index.ts`.
