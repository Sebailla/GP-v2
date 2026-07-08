/**
 * VALID fixture for `no-prisma-outside-core`.
 *
 * This file IS under `libs/core/database/src/**` and instantiates
 * `new PrismaClient()`. The rule's path whitelist permits this exact
 * pattern here and only here.
 */

import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();