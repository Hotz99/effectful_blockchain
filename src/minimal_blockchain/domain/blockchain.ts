/**
 * Blockchain implementation using Effect-TS `Chunk` for O(1) append operations.
 *
 * `Chunk` is an immutable, append-optimized data structure perfect for blockchain's
 * append-only ledger pattern. Unlike arrays (O(n) copy on append), `Chunk` provides
 * O(1) amortized append while maintaining immutability and functional purity.
 *
 * This module encapsulates:
 * - Type definitions for BlockchainState and BlockchainStats
 * - All constructors and factories
 * - All transformations (appendEvent, appendEvents, appendBlock)
 * - All operations (init, forceCreateBlock, validateChain, getStats)
 */

import { Array, DateTime, Effect, Schema } from "effect";
import * as Chunk from "effect/Chunk";
import { Block } from "./block";
import { Event } from "./event";

// ============================================================================
// TYPES
// ============================================================================

/** Blockchain state with `Chunk` for O(1) append */
const BlockchainStateSchema = Schema.Struct({
  chain: Schema.NonEmptyChunk(Block.Schema),
  pendingEvents: Schema.Chunk(Event.Schema),
  eventsPerBlock: Schema.Number,
});

export type BlockchainState = typeof BlockchainStateSchema.Type;

/** Blockchain statistics */
const BlockchainStatsSchema = Schema.Struct({
  totalBlocks: Schema.Number,
  totalEvents: Schema.Number,
  pendingEvents: Schema.Number,
  eventsPerBlock: Schema.Number,
});

export type BlockchainStats = typeof BlockchainStatsSchema.Type;

// ============================================================================
// CONSTRUCTORS & FACTORIES
// ============================================================================

/** Pure factory: Create blockchain state */
const make = (
  chain: Chunk.NonEmptyChunk<Block>,
  pendingEvents: Chunk.Chunk<Event>,
  eventsPerBlock: number
): BlockchainState => ({
  chain,
  pendingEvents,
  eventsPerBlock,
});

/** Pure factory: Create blockchain stats */
const makeStats = (
  totalBlocks: number,
  totalEvents: number,
  pendingEvents: number,
  eventsPerBlock: number
): BlockchainStats => ({
  totalBlocks,
  totalEvents,
  pendingEvents,
  eventsPerBlock,
});

/** Effect: Create initial blockchain state with genesis block */
const init = (eventsPerBlock: number) =>
  Block.createGenesis().pipe(
    Effect.map((genBlock) =>
      Blockchain.make(Chunk.make(genBlock), Chunk.empty(), eventsPerBlock)
    )
  );

// ============================================================================
// TRANSFORMATIONS
// ============================================================================

/** Pure transformation: Append a single event to pending events */
const appendEventPure = (
  state: BlockchainState,
  event: Event
): BlockchainState => ({
  ...state,
  pendingEvents: Chunk.append(state.pendingEvents, event),
});

/** Pure transformation: Append block and clear pending events */
const appendBlockPure = (
  state: BlockchainState,
  block: Block
): BlockchainState => ({
  ...state,
  chain: Chunk.append(state.chain, block),
  pendingEvents: Chunk.empty(),
});

/** Effect: Append multiple events to blockchain state */
const appendEvents = (
  state: BlockchainState,
  events: ReadonlyArray<Omit<Event, "timestamp">>
) =>
  DateTime.now.pipe(
    Effect.flatMap((timestamp) =>
      Effect.reduce(events, state, (s, e) =>
        appendEvent(s, { ...e, timestamp } as Event)
      )
    )
  );

// ============================================================================
// OPERATIONS
// ============================================================================

/** Effect: Append event to blockchain - O(1) append with Chunk, auto-creates block at threshold */
const appendEvent = (state: BlockchainState, event: Event) =>
  Effect.gen(function* () {
    const pending = Chunk.append(state.pendingEvents, event); // O(1)
    const shouldCreateBlock = Chunk.size(pending) >= state.eventsPerBlock;

    if (!shouldCreateBlock) return appendEventPure(state, event);

    const block = yield* Block.createDefault(pending, state.chain);
    return appendBlockPure(state, block);
  });

/** Effect: Force create block from pending events */
const forceCreateBlock = (state: BlockchainState) =>
  Effect.gen(function* () {
    if (Chunk.isEmpty(state.pendingEvents)) return state;

    const block = yield* Block.createDefault(
      // TODO more idiomatic way to cast `Chunk.NonEmptyChunk<Event>`
      state.pendingEvents as Chunk.NonEmptyChunk<Event>,
      state.chain
    );
    return appendBlockPure(state, block);
  });

/** Effect: Validate blockchain integrity
 *
 * Why not `Effect.forEach()` or `Chunk.reduce()` ?
 * - `Effect.forEach()` runs all iterations, can't short-circuit on first error
 * - `Chunk.reduce()` works with sync reducers, not effectful ones
 * - Imperative loop is cleanest for this use case with early returns
 */
const validateChain = (state: BlockchainState) =>
  Effect.gen(function* () {
    const blocks = Chunk.toReadonlyArray(state.chain);

    for (const [previous, current] of Array.window(blocks, 2)) {
      const { hash, ...blockWithoutHash } = current;
      const recalculatedHash = Block.computeHash(blockWithoutHash);

      if (hash !== recalculatedHash)
        return yield* Effect.fail(
          `Block #${current.blockNumber} hash mismatch`
        );

      if (current.previousHash !== previous.hash)
        return yield* Effect.fail(
          `Block #${current.blockNumber} chain link broken`
        );

      if (current.timestamp < previous.timestamp)
        return yield* Effect.fail(
          `Block #${current.blockNumber} has invalid timestamp`
        );
    }

    return yield* Effect.succeed(undefined);
  });

/** Pure operation: Compute blockchain statistics */
const getStats = (state: BlockchainState): BlockchainStats => {
  const totalEvents = Chunk.reduce(
    state.chain,
    Chunk.size(state.pendingEvents),
    (count, block) => count + Chunk.size(block.events)
  );

  return makeStats(
    Chunk.size(state.chain),
    totalEvents,
    Chunk.size(state.pendingEvents),
    state.eventsPerBlock
  );
};

// TODO vet this w florien
// original:
// const searchEvents = (state: BlockchainState, tag: Event["_tag"]) =>
//   state.chain.pipe(
//     Chunk.flatMap((block) =>
//       block.events.pipe(Chunk.filter((event) => Event.is(event)))
//     )
//   );
// alternative:
export const searchEvents = <A>(
  state: BlockchainState,
  eventVariant: Schema.Schema<A, Event>
) =>
  state.chain.pipe(
    Chunk.flatMap((block) =>
      block.events.pipe(Chunk.filter(Schema.is(eventVariant)))
    )
  );

// ============================================================================
// EXPORTS (Namespace)
// ============================================================================

export const Blockchain = {
  // Constructors
  make,
  makeStats,
  init,

  // Transformations
  appendEvent,
  appendEvents,
  appendBlockPure,

  // Operations
  forceCreateBlock,
  validateChain,
  getStats,
  searchEvents,
};
