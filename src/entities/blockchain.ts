/**
 * Blockchain Data Structures — Pure Types & Schemas
 *
 * This module encapsulates:
 * - Type definitions for BlockchainState and BlockchainStats
 * - Schema definitions for validation
 * - Constructors for creating instances
 * - Pure transformations (appendEventPure, appendBlockPure)
 * - Pure queries (getStats, searchEvents, validateChain hashes)
 *
 * Note: Effect-based operations are in BlockchainService, not here.
 */

import { Schema } from "effect";
import * as Primitives from "./primitives";
import * as Block from "./block";
import * as Event from "./event";

/** Blockchain state with `Chunk` for O(1) append */
const BlockchainStateSchema = Schema.Struct({
  chain: Schema.NonEmptyChunk(Block.BlockSchema),
  pendingEvents: Schema.Option(Schema.NonEmptyChunk(Event.EventSchema)),
  eventsPerBlock: Primitives.PositiveIntSchema,
});

export type BlockchainState = typeof BlockchainStateSchema.Type;

/** Blockchain statistics */
const BlockchainStatsSchema = Schema.Struct({
  totalBlocks: Primitives.PositiveIntSchema,
  totalEvents: Primitives.PositiveIntSchema,
  pendingEvents: Schema.Option(Primitives.PositiveIntSchema),
  eventsPerBlock: Primitives.PositiveIntSchema,
});

export type BlockchainStats = typeof BlockchainStatsSchema.Type;

export const makeState = BlockchainStateSchema.make;
export const makeStats = BlockchainStatsSchema.make;
