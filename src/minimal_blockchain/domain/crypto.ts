// TODO vet this module

/**
 * Crypto — Cryptographic Primitives
 *
 * This module encapsulates hash computation for Merkle trees.
 * Pure implementations using ethers for Ethereum-compatible hashing.
 *
 * Provides:
 * - SHA-256 hashing
 * - Keccak-256 hashing (Ethereum-compatible)
 * - Hash combination utilities
 */

import { keccak256 as ethersKeccak256, toUtf8Bytes } from "ethers";
import { MerkleHash } from "./merkle_tree";

// ============================================================================
// PURE IMPLEMENTATIONS
// ============================================================================

/**
 * Pure SHA-256 hash computation using Keccak-256
 * Note: Using Keccak-256 for consistency with Ethereum
 */
export const sha256 = (data: string): MerkleHash => {
  const hash = ethersKeccak256(toUtf8Bytes(data));
  // Remove '0x' prefix from ethers output
  return hash.slice(2) as MerkleHash;
};

/**
 * Pure Keccak-256 hash computation (Ethereum-compatible)
 */
export const keccak256 = (data: string): MerkleHash => {
  const hash = ethersKeccak256(toUtf8Bytes(data));
  // Remove '0x' prefix from ethers output
  return hash.slice(2) as MerkleHash;
};

/**
 * Pure hash combination (concatenate left + right, then hash)
 */
export const combineHashes = (
  left: MerkleHash,
  right: MerkleHash
): MerkleHash => {
  // Concatenate as hex strings (no 0x prefix)
  const combined = left + right;
  // Hash the combined string
  const hash = ethersKeccak256(toUtf8Bytes(combined));
  return hash.slice(2) as MerkleHash;
};
