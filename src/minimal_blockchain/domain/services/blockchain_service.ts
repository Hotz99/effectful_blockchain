/**
 * Blockchain Service — Effect Service Layer
 *
 * Provides blockchain operations as an Effect service with proper
 * dependency injection and error handling.
 *
 * @module BlockchainService
 * @since 0.2.0
 */

import { Context, Effect, Layer, Data, Schema } from "effect";
import * as Chunk from "effect/Chunk";
import * as Array from "effect/Array";
import * as Option from "effect/Option";
import { BlockService, BlockServiceLive } from "./block_service";
import * as Event from "../entities/event";
import * as Primitives from "../primitives";
import type { BlockchainState, BlockchainStats } from "../entities/blockchain";
import { makeState, makeStats } from "../entities/blockchain";
import * as Either from "effect/Either";

// ============================================================================
// ERRORS
// ============================================================================

/**
 * Error raised when blockchain validation fails.
 *
 * @category Errors
 * @since 0.2.0
 */
export class ValidationError extends Data.TaggedError("ValidationError")<{
  readonly blockNumber: Primitives.PositiveInt;
  readonly reason: string;
}> {}

/**
 * Error raised when attempting to create a block from empty pending events.
 *
 * @category Errors
 * @since 0.2.0
 */
export class EmptyPendingEventsError extends Data.TaggedError(
  "EmptyPendingEventsError"
)<{
  readonly message: string;
}> {}

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

/**
 * Blockchain service providing core blockchain operations.
 *
 * Operations include:
 * - Initializing blockchain state
 * - Appending events with automatic block creation
 * - Force creating blocks from pending events
 * - Validating chain integrity
 * - Computing statistics
 * - Searching events by type
 *
 * @category Services
 * @since 0.2.0
 */
export class BlockchainService extends Context.Tag("BlockchainService")<
  BlockchainService,
  {
    /**
     * Initialize blockchain with genesis block.
     *
     * @category Constructors
     * @since 0.2.0
     */
    readonly initState: (
      eventsPerBlock: Primitives.PositiveInt,
      genesisMessage: Option.Option<string>
    ) => Effect.Effect<BlockchainState>;

    /**
     * Append multiple events to blockchain state.
     * Automatically creates blocks as thresholds are reached.
     *
     * @category Transformations
     * @since 0.2.0
     */
    readonly appendEvents: (
      state: BlockchainState,
      events: ReadonlyArray<Event.Event>
    ) => Effect.Effect<BlockchainState>;

    /**
     * Force creation of a block from pending events.
     * Fails if no pending events exist.
     *
     * @category Transformations
     * @since 0.2.0
     */
    readonly forceCreateBlock: (
      state: BlockchainState
    ) => Effect.Effect<BlockchainState, EmptyPendingEventsError>;

    /**
     * Validate blockchain integrity.
     * Checks hashes, chain links, and timestamp ordering.
     *
     * @category Operations
     * @since 0.2.0
     */
    readonly validateChain: (
      state: BlockchainState
    ) => Either.Either<true, ValidationError>;

    /**
     * Compute blockchain statistics (pure operation).
     *
     * @category Operations
     * @since 0.2.0
     */
    readonly getStats: (state: BlockchainState) => BlockchainStats;

    /**
     * Search for events of a specific type across all blocks (pure operation).
     *
     * @category Operations
     * @since 0.2.0
     */
    readonly searchEvents: <A>(
      state: BlockchainState,
      eventVariant: Schema.Schema<A, Event.Event>
    ) => Chunk.Chunk<A>;
  }
>() {}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

/**
 * Live implementation of BlockchainService.
 *
 * Dependencies are provided within the layer - they are NOT leaked through
 * the service interface (`R = never` for all operations).
 *
 * @category Layers
 * @since 0.2.0
 * @example
 * ```typescript
 * import { BlockchainService, BlockchainServiceLive } from "./blockchain_service";
 *
 * const program = Effect.gen(function* () {
 *   const service = yield* BlockchainService;
 *   const state = yield* service.init(10);
 *
 *   const event = Event.makeUserLogin({
 *     _tag: "UserLogin",
 *     timestamp: yield* DateTime.now,
 *     data: { user: "alice", ip: "127.0.0.1" }
 *   });
 *
 *   const newState = yield* service.appendEvent(state, event);
 *   const stats = service.getStats(newState);
 *
 *   console.log(`Blocks: ${stats.totalBlocks}, Events: ${stats.totalEvents}`);
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(BlockchainServiceLive)));
 * ```
 */
export const BlockchainServiceLive = Layer.effect(
  BlockchainService,
  Effect.gen(function* () {
    const blockService = yield* BlockService;

    return BlockchainService.of({
      initState: (eventsPerBlock, genesisMessage) =>
        blockService.createGenesis(genesisMessage).pipe(
          Effect.map((genBlock) =>
            makeState({
              chain: Chunk.make(genBlock),
              pendingEvents: Option.none(),
              eventsPerBlock,
            })
          )
        ),

      appendEvents: (state, events) =>
        Effect.reduce(events, state, (currentState, event) =>
          // Define appendEvent inline to access merkleBuild/merkleRoot
          Effect.gen(function* () {
            const pending = Chunk.append(
              Option.getOrElse(currentState.pendingEvents, () => Chunk.empty()),
              event
            );
            const shouldCreateBlock =
              Chunk.size(pending) >= currentState.eventsPerBlock;

            if (!shouldCreateBlock) {
              return makeState({
                ...currentState,
                pendingEvents: Option.some(pending),
              });
            }

            const block = yield* blockService.createDefault(
              pending as Chunk.NonEmptyChunk<Event.Event>,
              currentState.chain
            );

            return makeState({
              ...currentState,
              chain: Chunk.append(currentState.chain, block),
              pendingEvents: Option.none(),
            });
          })
        ),

      forceCreateBlock: (state) =>
        Option.match(state.pendingEvents, {
          onNone: () =>
            Effect.fail(
              new EmptyPendingEventsError({
                message: "Cannot create block: no pending events",
              })
            ),
          onSome: (pending) =>
            blockService.createDefault(pending, state.chain).pipe(
              Effect.map((block) =>
                makeState({
                  ...state,
                  chain: Chunk.append(state.chain, block),
                  pendingEvents: Option.none(),
                })
              )
            ),
        }),

      validateChain: (state) => {
        const blocks = Chunk.toReadonlyArray(state.chain);

        for (const [prev, cur] of Array.window(blocks, 2)) {
          const { hash, ...rest } = cur;
          const h = blockService.computeHash(rest);

          if (hash !== h)
            return Either.left(
              new ValidationError({
                blockNumber: cur.blockNumber,
                reason: "Hash mismatch",
              })
            );

          if (cur.previousHash !== prev.hash)
            return Either.left(
              new ValidationError({
                blockNumber: cur.blockNumber,
                reason: "Chain link broken",
              })
            );

          if (cur.timestamp < prev.timestamp)
            return Either.left(
              new ValidationError({
                blockNumber: cur.blockNumber,
                reason: "Invalid timestamp ordering",
              })
            );
        }

        return Either.right(true);
      },

      getStats: (state) =>
        makeStats({
          pendingEvents: Option.match(state.pendingEvents, {
            onNone: () => 0,
            onSome: (chunk) => Chunk.size(chunk),
          }),
          eventsPerBlock: state.eventsPerBlock,
          totalBlocks: Chunk.size(state.chain),
          totalEvents: Chunk.reduce(
            state.chain,
            Option.match(state.pendingEvents, {
              onNone: () => 0,
              onSome: (chunk) => Chunk.size(chunk),
            }),
            (count, block) => count + Chunk.size(block.events)
          ),
        }),

      searchEvents: (state, eventVariant) =>
        state.chain.pipe(
          Chunk.flatMap((block) =>
            Chunk.filter(block.events, Schema.is(eventVariant))
          )
        ),
    });
  })
).pipe(Layer.provide(BlockServiceLive));
