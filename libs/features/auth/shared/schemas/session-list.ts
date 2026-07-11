import { z } from "zod";

/**
 * Canonical Zod schema for the `GET /auth/sessions` response body.
 *
 * Lives at `libs/features/auth/shared/schemas/session-list.ts` per
 * design §4.2.
 *
 * Why a response-schema in `shared/schemas/`: the response payload is
 * the seam between the server (`SessionService.listActiveSessions`)
 * and the client (slice 4 `SessionList` component). Encoding it as a
 * Zod schema lets the client validate the network payload with the
 * SAME source-of-truth the server produces — single source of truth,
 * no schema duplication.
 *
 * Shape:
 *  - sessions: list of `{ id, deviceLabel, lastActiveAt: Date }`.
 *  - `sessions` may be empty (no active sessions → 200 + empty array,
 *    not 404).
 *
 * The request body for `GET /auth/sessions` is empty (no payload — a
 * GET request has no body), so no request schema is needed at this
 * file. The `SessionRecord` DB row shape (id, sessionToken, userId,
 * expires) lives at `libs/features/auth/server/src/domain/interfaces/
 * session.repository.ts` per slice 3 batch 6 (T3.6b).
 */

export const sessionListSchema = z.object({
  sessions: z.array(
    z.object({
      id: z.string(),
      deviceLabel: z.string(),
      lastActiveAt: z.date(),
    }),
  ),
});

export type SessionListResponse = z.infer<typeof sessionListSchema>;
