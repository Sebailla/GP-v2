import { Module } from "@nestjs/common";

import { createInMemoryDispatcher } from "@core/events";
import { prisma as defaultPrisma } from "@core/database";

import { RbacService, SessionService } from "@features/auth";

import { AdminController } from "./admin.controller.js";
import { AdminGuard } from "../../shared/guards/admin.guard.js";

/**
 * AdminModule — M3 (module-3-superadmin) task 3.8 GREEN.
 *
 * Per `openspec/changes/module-3-superadmin/design.md` §4 the module
 * wires the admin-side service primitives (`RbacService` +
 * `SessionService`) into the DI container so `AdminController` can
 * be constructed with the canonical services. The dispatcher is
 * the SAME in-memory instance the `AuthModule` constructs (the
 * module-scoped closure pattern from `AuthModule`); subscribers
 * must see every dispatch the services emit, so a second copy
 * would lose events.
 *
 * AdminGuard is a singleton across the application — the kill-switch
 * (`env.ADMIN_ENABLED`) is read once at construction time and the
 * module-scoped provider is reused for every request. AuthModule
 * already exports AdminGuard in case future slices need to apply
 * the guard to non-admin controllers (none today — AdminGuard is
 * strictly an `/admin/*` surface guard per D1).
 *
 * `RbacService` is provided as a factory because the dispatcher is
 * taken as the 1st constructor argument (Pattern A — canonical
 * design §4.1). Same wiring as `AuthModule`.
 */
const dispatcher = createInMemoryDispatcher();

@Module({
  controllers: [AdminController],
  providers: [
    {
      provide: RbacService,
      useFactory: () => new RbacService(dispatcher.dispatch),
    },
    {
      provide: SessionService,
      useFactory: () =>
        new SessionService(
          defaultPrisma,
          undefined,
          undefined,
          dispatcher.dispatch,
        ),
    },
    AdminGuard,
  ],
  exports: [AdminGuard, RbacService, SessionService],
})
export class AdminModule {}
