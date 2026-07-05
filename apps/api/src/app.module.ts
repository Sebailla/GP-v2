import { Module } from "@nestjs/common";

/**
 * Slice 1 ships an empty AppModule. Feature modules (auth in slice 3,
 * transactions in slice 5) are imported here as they land.
 *
 * This module intentionally contains zero business code - it is the
 * NestJS container's composition root for slice 1.
 */
@Module({
  imports: [],
})
export class AppModule {}