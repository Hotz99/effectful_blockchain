/**
 * Block Service — Effect Service Layer
 *
 * Provides block creation operations as an Effect service with proper
 * dependency injection for Merkle tree operations.
 *
 * @module BlockService
 * @since 0.2.0
 */

import { Context, Effect, Layer } from "effect";
import * as Chunk from "effect/Chunk";
import * as Option from "effect/Option";
import { DateTime } from "effect";
import * as Block from "../entities/block";
import * as Event from "../entities/event";
import { keccak256, toUtf8Bytes } from "ethers";
import * as MerkleTree from "../entities/merkle_tree";
import * as MerkleTreeService from "./merkle";

// ============================================================================
// SERVICE INTERFACE
// ============================================================================

/**
 * Block service providing block creation operations.
 *
 * Operations include:
 * - Creating genesis blocks
 * - Creating blocks from events
 * - Computing block hashes
 *
 * @category Services
 * @since 0.2.0
 */
export class BlockService extends Context.Tag("BlockService")<
  BlockService,
  {
    /**
     * Compute hash for a block (pure operation).
     *
     * @category Operations
     * @since 0.2.0
     */
    readonly computeHash: (block: Omit<Block.Block, "hash">) => string;

    /**
     * Create genesis block with initialization message.
     *
     * @category Constructors
     * @since 0.2.0
     */
    readonly createGenesis: (
      message: Option.Option<string>
    ) => Effect.Effect<Block.Block>;

    /**
     * Create block from events and chain context.
     *
     * @category Constructors
     * @since 0.2.0
     */
    readonly createDefault: (
      events: Chunk.NonEmptyChunk<Event.Event>,
      chain: Chunk.NonEmptyChunk<Block.Block>
    ) => Effect.Effect<Block.Block>;
  }
>() {}

// ============================================================================
// SERVICE IMPLEMENTATION
// ============================================================================

// helper shared internally, also exported
const computeHash = (block: Omit<Block.Block, "hash">) => {
  // Explicitly destructure to ensure 'hash' is never included
  const { timestamp, blockIdx, events, previousHash, merkleRoot } = block;
  const blockWithoutHash = {
    timestamp,
    blockIdx,
    events,
    previousHash,
    merkleRoot,
  };
  const hash = keccak256(toUtf8Bytes(JSON.stringify(blockWithoutHash)));
  // Remove '0x' prefix from ethers output
  return hash.slice(2);
};

/**
 * Live implementation of BlockService.
 *
 * Dependencies (MerkleBuild, MerkleRoot) are resolved during layer construction
 * and captured in closures - NOT leaked through the service interface.
 *
 * @category Layers
 * @since 0.2.0
 * @example
 * ```typescript
 * import { BlockService, BlockServiceLive } from "./block_service";
 *
 * const program = Effect.gen(function* () {
 *   const service = yield* BlockService;
 *   const genesisBlock = yield* service.createGenesis();
 *
 *   console.log(`Genesis block: ${genesisBlock.hash}`);
 * });
 *
 * Effect.runPromise(program.pipe(Effect.provide(BlockServiceLive)));
 * ```
 */
export const BlockServiceLive = Layer.effect(
  BlockService,
  Effect.gen(function* () {
    // Dependencies resolved here, not leaked through service interface
    const merkleBuild = yield* MerkleTreeService.MerkleBuildService;
    const merkleRoot = yield* MerkleTreeService.MerkleRoot;

    // TODO move this to `merkle_service` ?
    // Helper: build merkle root from events (captured in closure)
    const buildMerkleRoot = (
      events: Chunk.NonEmptyChunk<Event.Event>
    ): MerkleTree.MerkleHash =>
      merkleRoot.getRootHash(merkleBuild.build(events));

    return BlockService.of({
      computeHash,

      createGenesis: (message = Option.some("Blockchain initialized")) =>
        Effect.gen(function* () {
          const timestamp = yield* DateTime.now;
          const events = Chunk.make(Event.makeGenesis({ timestamp, message }));
          const blockWithoutHash = {
            timestamp,
            blockIdx: 0,
            events,
            previousHash: "0".repeat(64),
            merkleRoot: buildMerkleRoot(events),
          };

          return { ...blockWithoutHash, hash: computeHash(blockWithoutHash) };
        }),

      createDefault: (events, chain) =>
        Effect.gen(function* () {
          const blockWithoutHash = {
            timestamp: yield* DateTime.now,
            blockIdx: Chunk.size(chain),
            events,
            previousHash: Chunk.lastNonEmpty(chain).hash,
            merkleRoot: buildMerkleRoot(events),
          };

          return { ...blockWithoutHash, hash: computeHash(blockWithoutHash) };
        }),
    });
  })
);
