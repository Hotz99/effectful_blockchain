/**
 * Merkle Tree — Pure Model & Schema
 *
 * This module contains:
 * - Entity schemas (MerkleNode, MerkleTree)
 * - Pure constructors and utilities for array-based Merkle trees (used by blocks)
 * - No side effects, no async logic, no logging
 *
 */

import { Schema, Chunk, Either, Option } from "effect";
import * as Event from "./event";

export const MerkleHashSchema = Schema.String.pipe(
  Schema.pattern(/^[a-f0-9]{64}$/),
  Schema.brand("MerkleHash")
);

export type MerkleHash = typeof MerkleHashSchema.Type;

/**
 * Branded ValidDataIndex - validated to be non-negative integer
 * Validation of bounds for specific tree happens in makeValidDataIndex
 */
// TODO move validation into this schema
export const ValidDataIndexSchema = Schema.Int.pipe(
  Schema.brand("ValidDataIndex")
);

export type ValidDataIndex = typeof ValidDataIndexSchema.Type;

/**
 * Create a valid data index for a specific tree
 * Validates index is within [0, leafCount)
 */
export const makeValidDataIndex = (
  tree: MerkleTree,
  index: number
): Either.Either<ValidDataIndex, IndexOutOfBoundsError> => {
  const leafCount = Chunk.size(tree.leaves);
  return index >= leafCount
    ? Either.left(
        new IndexOutOfBoundsError({
          message: `Index ${index} out of bounds [0, ${leafCount - 1}]`,
          index,
          maxIndex: (leafCount - 1) as ValidDataIndex,
        })
      )
    : Either.right(index as ValidDataIndex);
};

// ============================================================================
// BASE FIELD SETS
// ============================================================================

const leafBaseFields = {
  _tag: Schema.Literal("leaf"),
  hash: MerkleHashSchema,
  // TODO why is `value` a string ?
  value: Schema.String,
};

const branchBaseFields = {
  _tag: Schema.Literal("branch"),
  hash: MerkleHashSchema,
};

// ============================================================================
// ENCODED
// ============================================================================

interface MerkleLeafEncoded
  extends Schema.Struct.Encoded<typeof leafBaseFields> {}

interface MerkleBranchEncoded
  extends Schema.Struct.Encoded<typeof branchBaseFields> {
  readonly left: MerkleNodeEncoded | null;
  readonly right: MerkleNodeEncoded | null;
}

type MerkleNodeEncoded = MerkleLeafEncoded | MerkleBranchEncoded;

// ============================================================================
// DECODED
// ============================================================================

export interface MerkleLeaf extends Schema.Struct.Type<typeof leafBaseFields> {}

export interface MerkleBranch
  extends Schema.Struct.Type<typeof branchBaseFields> {
  readonly left: Option.Option<MerkleNode>;
  readonly right: Option.Option<MerkleNode>;
}

export type MerkleNode = MerkleLeaf | MerkleBranch;

// ============================================================================
// SCHEMAS
// ============================================================================

export const MerkleLeafSchema = Schema.TaggedStruct("leaf", {
  hash: MerkleHashSchema,
  value: Schema.String,
});

export const MerkleBranchSchema = Schema.TaggedStruct("branch", {
  hash: MerkleHashSchema,
  left: Schema.OptionFromNullOr(
    Schema.suspend(
      (): Schema.Schema<MerkleNode, MerkleNodeEncoded> => MerkleNodeSchema
    )
  ),
  right: Schema.OptionFromNullOr(
    Schema.suspend(
      (): Schema.Schema<MerkleNode, MerkleNodeEncoded> => MerkleNodeSchema
    )
  ),
});

export const MerkleNodeSchema = Schema.Union(
  MerkleLeafSchema,
  MerkleBranchSchema
);

export const MerkleTreeSchema = Schema.Struct({
  root: MerkleNodeSchema,
  leaves: Schema.NonEmptyChunk(MerkleLeafSchema),
  dataBlocks: Schema.NonEmptyChunk(Event.EventSchema),
});

export type MerkleTree = typeof MerkleTreeSchema.Type;

/**
 * MerkleProof is a path from leaf to root
 * Each step contains: (siblingHash, isLeft)
 * - isLeft: true means sibling is on the left
 */
export const MerkleProofStepSchema = Schema.Struct({
  siblingHash: MerkleHashSchema,
  // TODO replace with `Either` ?
  isLeft: Schema.Boolean,
});

export type MerkleProofStep = typeof MerkleProofStepSchema.Type;

export const MerkleProofSchema = Schema.Struct({
  steps: Schema.Chunk(MerkleProofStepSchema),
  dataIndex: ValidDataIndexSchema,
  // TODO why is `data` a string ? or even needed at all ?
  data: Schema.String,
});

export type MerkleProof = typeof MerkleProofSchema.Type;

// ============================================================================
// ERRORS
// ============================================================================

export class MerkleError extends Schema.TaggedError<MerkleError>()(
  "MerkleError",
  {
    message: Schema.String,
  }
) {}

export class InvalidProofError extends Schema.TaggedError<InvalidProofError>()(
  "InvalidProofError",
  {
    message: Schema.String,
    expected: MerkleHashSchema,
    actual: MerkleHashSchema,
  }
) {}

export class EmptyDataError extends Schema.TaggedError<EmptyDataError>()(
  "EmptyDataError",
  {
    message: Schema.String,
  }
) {}

export class IndexOutOfBoundsError extends Schema.TaggedError<IndexOutOfBoundsError>()(
  "IndexOutOfBoundsError",
  {
    message: Schema.String,
    index: Schema.Int,
    maxIndex: ValidDataIndexSchema,
  }
) {}

// ============================================================================
// CONSTRUCTORS
// ============================================================================

/**
 * Create a leaf node
 */
export const makeLeafNode = (props: Omit<MerkleLeaf, "_tag">): MerkleLeaf =>
  MerkleLeafSchema.make({ ...props });

/**
 * Create a branch node
 */
export const makeBranchNode = (
  props: Omit<MerkleBranch, "_tag">
): MerkleBranch => MerkleBranchSchema.make({ ...props });
/**
 * Create a Merkle tree
 */
export const makeMerkleTree = (props: Omit<MerkleTree, "_tag">): MerkleTree =>
  MerkleTreeSchema.make({ ...props });

/**
 * Create a proof step
 */
export const makeProofStep = (
  props: Omit<MerkleProofStep, "_tag">
): MerkleProofStep => MerkleProofStepSchema.make({ ...props });

/**
 * Create a Merkle proof
 */
export const makeMerkleProof = (
  props: Omit<MerkleProof, "_tag">
): MerkleProof => MerkleProofSchema.make({ ...props });
