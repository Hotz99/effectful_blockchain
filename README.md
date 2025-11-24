# Effectful Blockchain Data Structures

A TypeScript library implementing cryptographic data structures for blockchain applications using Effect-TS. This repository implements two core data structures: a **Merkle Tree** implementation for efficient data integrity verification and a **Merkle Patricia Trie (MPT)** for key-value storage with path compression.

## Quick Start

```bash
# Merkle Tree demo - transaction proofs and verification
bun run run:merkle

# MPT demo - key insertion and compression
bun run run:mpt
```

## Testing

```bash
# Run all tests
bun run test

# Run tests with coverage report
bun run test:coverage
```

> **Note:** The test suite is WIP, hence some dubious logic.Pull Requests with quality suggestions are welcome.

## Merkle Tree

The Merkle Tree implementation provides cryptographically secure proof of data inclusion. It guarantees:

- **O(log n) proof size**: Inclusion proofs scale logarithmically with the number of leaves
- **Tamper detection**: Any modification to data invalidates existing proofs
- **Efficient verification**: Proof verification is fast and deterministic

### Merkle Demo

The Merkle demonstration shows:

1. Building a tree from 8 mock transaction payloads
2. Recording the root hash for the initial tree
3. Generating an inclusion proof for transaction at index 3
4. Timing the verification step with microsecond precision
5. Mutating a single transaction and rebuilding the tree
6. Demonstrating that the old proof fails against the new root

**Output includes:**

- Initial root hash (first 16 characters)
- Proof length (number of sibling hashes)
- Verification time in milliseconds
- Mutated root hash
- Verification failure confirmation

**Location:** `examples/merkle_tree_demo.ts`

## Merkle Patricia Trie (MPT)

The MPT implementation provides Ethereum-style hexary tries with automatic path compression. It guarantees:

- **Deterministic structure**: Identical key-value sets produce identical tries
- **Path compression**: Single-child branches automatically compress to extension nodes
- **Space efficiency**: Compression reduces node count and serialized size
- **O(k) operations**: Insertion, deletion, and lookup scale with key length

### MPT Demo

The MPT demonstration shows:

1. Inserting 8 keys designed to create various node types (branch, extension, leaf)
2. Updating 3 existing keys with new values
3. Running automatic compression during inserts
4. Counting nodes by type before and after compression
5. Computing serialized byte size before and after compression

**Output includes:**

- Node counts before and after (branch, extension, leaf)
- Total node count reduction
- Byte size before and after
- Percentage reduction in size

**Location:** `examples/mpt_demo.ts`

# PBT (Property Based Testing)

To ensure our MPT implementation achieves **canonical accuracy** and **deterministic consistency** (as per the Ethereum Yellow Paper), we use PBT via Effect's Schema and FastCheck.

## **1\. Defining Canonical Invariants**

We defined 14 structural and behavioral invariants, ensuring the trie behaves predictably under random inputs. Key properties tested include:

- **Canonical Compression:** The trie structure must always be minimized after mutation (no invalid Branch or Extension nodes).
- **Deterministic Root Consistency:** Identical operation sets, regardless of application order, must yield the same final root hash.
- **Update Locality:** Changes must only affect the hash chain along the mutated key's path; disjoint subtrees remain unchanged.

## **2\. PBT in Practice: Canonical Compression**

We currently only cover the **Canonical Compression** invariant. This test confirms that after any sequence of random inserts and deletes, the resulting trie adheres strictly to the canonical structure rules.

### **`isCanonical` Predicate**

We defined a recursive predicate, `isCanonical(node)`, which enforces the Yellow Paper's rules:

1. **Branch Node:** Canonical _only if_ it has $\\geq 2$ active children **OR** holds a terminal value. (Single child, no value $\\rightarrow$ non-canonical collapse).
2. **Extension Node:** Canonical _only if_ its nextNode is a Branch or Leaf. (Cannot point to another Extension).
3. **Leaf Node:** Canonical if it has a non-empty keyEnd.

### **Test Flow**

1. **Operation Generation:** A generator creates an arbitrary sequence of 5–20 random operations (insert or delete) with hex keys and values.
2. **Trie Mutation:** These operations are applied sequentially to an empty trie.
3. **Property Check:** `isCanonical` predicate runs against the final root. Failures provide the exact seed and operation path for reproduction and debugging.
