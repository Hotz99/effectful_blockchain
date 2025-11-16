/**
 * Crypto — Cryptographic Primitives Service
 *
 * This module provides cryptographic hashing capabilities as Effect services.
 * Pure implementations using ethers for Ethereum-compatible hashing.
 *
 * Capabilities:
 * - HashingService — SHA-256 and Keccak-256 hashing operations
 *
 * @module Crypto
 * @since 0.2.0
 */

import { Context, Layer } from "effect";
import { keccak256 as ethersKeccak256, toUtf8Bytes } from "ethers";
import { MerkleHash } from "./entities/merkle_tree";

// ============================================================================
// PURE IMPLEMENTATIONS
// ============================================================================

/**
 * Pure SHA-256 hash computation using Keccak-256
 * Note: Using Keccak-256 for consistency with Ethereum
 * @internal
 */
const sha256Pure = (data: string): MerkleHash => {
  const hash = ethersKeccak256(toUtf8Bytes(data));
  // Remove '0x' prefix from ethers output
  return hash.slice(2) as MerkleHash;
};

/**
 * Pure Keccak-256 hash computation (Ethereum-compatible)
 * @internal
 */
const keccak256Pure = (data: string): MerkleHash => {
  const hash = ethersKeccak256(toUtf8Bytes(data));
  // Remove '0x' prefix from ethers output
  return hash.slice(2) as MerkleHash;
};

/**
 * Pure hash combination (concatenate left + right, then hash)
 * @internal
 */
const combineHashesPure = (left: MerkleHash, right: MerkleHash): MerkleHash => {
  // Concatenate as hex strings (no 0x prefix)
  const combined = left + right;
  // Hash the combined string
  const hash = ethersKeccak256(toUtf8Bytes(combined));
  return hash.slice(2) as MerkleHash;
};

// ============================================================================
// BACKWARD COMPATIBILITY EXPORTS
// ============================================================================

/**
 * @deprecated Use HashingService instead. Direct exports maintained for backward compatibility.
 */
export const sha256 = sha256Pure;

/**
 * @deprecated Use HashingService instead. Direct exports maintained for backward compatibility.
 */
export const keccak256 = keccak256Pure;

/**
 * @deprecated Use HashingService instead. Direct exports maintained for backward compatibility.
 */
export const combineHashes = combineHashesPure;

// ============================================================================
// CAPABILITY: HASHING SERVICE
// ============================================================================

/**
 * HashingService capability — cryptographic hash operations
 *
 * Provides pure hashing operations for Merkle trees and Patricia tries.
 * All operations are deterministic and side-effect free.
 *
 * @category Capabilities
 * @since 0.2.0
 */
export class HashingService extends Context.Tag(
  "@services/crypto/HashingService"
)<
  HashingService,
  {
    readonly sha256: (data: string) => MerkleHash;
    readonly keccak256: (data: string) => MerkleHash;
    readonly combineHashes: (left: MerkleHash, right: MerkleHash) => MerkleHash;
  }
>() {}

/**
 * Live implementation of HashingService
 *
 * @category Services
 * @since 0.2.0
 */
export const HashingServiceLive = Layer.succeed(
  HashingService,
  HashingService.of({
    sha256: sha256Pure,
    keccak256: keccak256Pure,
    combineHashes: combineHashesPure,
  })
);
