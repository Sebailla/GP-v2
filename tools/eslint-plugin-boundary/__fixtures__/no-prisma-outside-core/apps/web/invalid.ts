/**
 * INVALID fixture for `no-prisma-outside-core`.
 *
 * This file is OUTSIDE `libs/core/database/src/**` and instantiates
 * `new PrismaClient()`. The rule MUST fire here.
 *
 * In production code the apps must import the singleton from
 * `@core/database`, not instantiate their own client.
 */

import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
