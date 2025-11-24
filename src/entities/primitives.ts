import { Schema } from "effect";

export const IntSchema = Schema.Number.pipe(Schema.int());
export type Int = typeof IntSchema.Type;

export const PositiveNumberSchema = Schema.Number.pipe(Schema.positive());
export type PositiveNumber = typeof PositiveNumberSchema.Type;

export const PositiveIntSchema = PositiveNumberSchema.pipe(Schema.int());
export type PositiveInt = typeof PositiveIntSchema.Type;
