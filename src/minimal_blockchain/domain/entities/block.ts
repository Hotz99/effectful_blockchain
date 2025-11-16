import { Schema } from "effect";
import * as Event from "./event";

export const BlockSchema = Schema.Struct({
  timestamp: Schema.DateTimeUtcFromSelf,
  blockNumber: Schema.Number,
  events: Schema.NonEmptyChunk(Event.EventSchema),
  previousHash: Schema.String,
  hash: Schema.String,
  merkleRoot: Schema.String,
});

export type Block = typeof BlockSchema.Type;
