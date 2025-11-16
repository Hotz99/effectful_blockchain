import { Schema } from "effect";

export const PositiveIntSchema = Schema.Number.pipe(
  Schema.int(),
  Schema.positive()
);

export type PositiveInt = typeof PositiveIntSchema.Type;
