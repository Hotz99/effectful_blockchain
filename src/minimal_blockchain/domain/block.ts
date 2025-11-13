import * as Crypto from "crypto";
import { Schema, DateTime, Chunk, Option, Effect } from "effect";
import { Event } from "./event";
import { MerkleBuild, MerkleRoot } from "./merkle_service";

const BlockSchema = Schema.Struct({
  timestamp: Schema.DateTimeUtcFromSelf,
  blockNumber: Schema.Number,
  events: Schema.Chunk(Event.Schema),
  previousHash: Schema.String,
  hash: Schema.String,
  merkleRoot: Schema.String,
});

export type Block = typeof BlockSchema.Type;

export const Block = {
  // Effect: creates `Genesis` block with initialization event
  // service resolution is effectful, hence `Effect.gen`
  createGenesis: (message: string = "Blockchain initialized") =>
    Effect.gen(function* () {
      const timestamp = yield* DateTime.now;
      const genesisEvent = Event.makeGenesis({
        _tag: "Genesis",
        timestamp,
        data: { message },
      });
      const events = Chunk.make(genesisEvent);

      // Build Merkle tree from event data
      const eventStrings = Chunk.map(events, (e) => JSON.stringify(e));
      const build = yield* MerkleBuild;
      const tree = build.build(eventStrings);
      const root = yield* MerkleRoot;
      const merkleRoot = root.getRootHash(tree);

      const blockWithoutHash = {
        timestamp,
        blockNumber: 0,
        events,
        previousHash: "0".repeat(64),
        merkleRoot,
      };
      const hash = Block.computeHash(blockWithoutHash);
      return { ...blockWithoutHash, hash };
    }),

  // Effect: creates `Default` block from events and chain context
  createDefault: (
    events: Chunk.NonEmptyChunk<Event>,
    chain: Chunk.NonEmptyChunk<Block>
  ) =>
    Effect.gen(function* () {
      const lastBlock = Option.getOrThrow(Chunk.last(chain));

      // Build Merkle tree from event data
      // TODO replace below map with more idiomatic approach from `Chunk` api
      const eventStrings = Chunk.map(events, (e) => JSON.stringify(e));
      const build = yield* MerkleBuild;
      const tree = build.build(eventStrings);
      const root = yield* MerkleRoot;
      const merkleRoot = root.getRootHash(tree);

      const blockWithoutHash = {
        timestamp: yield* DateTime.now,
        blockNumber: Chunk.size(chain),
        events,
        previousHash: lastBlock.hash,
        merkleRoot,
      };
      const hash = Block.computeHash(blockWithoutHash);
      return {
        ...blockWithoutHash,
        hash,
      };
    }),

  computeHash: (block: Omit<Block, "hash">) =>
    Crypto.createHash("sha256").update(JSON.stringify(block)).digest("hex"),

  Schema: BlockSchema,
};
