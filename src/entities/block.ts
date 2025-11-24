import { Schema } from "effect";
import * as Event from "./event";
import * as MerkleTree from "./merkle_tree";
import * as Primitives from "./primitives";

export const BlockSchema = Schema.Struct({
  previousHash: Schema.String,
  // `hash` proves integrity of entire block content
  hash: Schema.String,
  // `merkleRoot` proves integrity of events in the block
  merkleRoot: MerkleTree.MerkleHashSchema,
  timestamp: Schema.DateTimeUtcFromSelf,
  blockIdx: Primitives.IntSchema,
  events: Schema.NonEmptyChunk(Event.EventSchema),
});

export type Block = typeof BlockSchema.Type;
