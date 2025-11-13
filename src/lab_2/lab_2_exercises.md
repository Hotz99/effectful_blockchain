# Exercises and Challenges

## Exercise 1: Ethereum Address Generation

### Challenge: Keypair Structure and Address Analysis

1. Generate **5 different Ethereum addresses** using the `generate_new_key()` method.
2. For each generated keypair, record:
   - **Private key:** format and number of hexadecimal characters.
   - **Public key:** format and number of hexadecimal characters.
   - **Address:** format and number of hexadecimal characters.
3. Examine the first four hexadecimal characters of each address. Do you observe any visible pattern or repetition?
4. Estimate the **total number of possible Ethereum addresses** (hint: addresses are 160-bit values).

### Reflection

1. Why do private keys always have exactly 64 hexadecimal characters? (Hint: consider how many bits and bytes are used in an Ethereum private key.)
2. Why do all addresses begin with `0x`? What does this prefix indicate about how Ethereum encodes values?
3. Even though each key is randomly generated, Ethereum addresses sometimes appear to start with similar digits. Explain why this does not imply a security issue or any hidden pattern.
4. Suppose \( N = 10^{12} \) (one trillion) Ethereum users each generate a new private key.  
   Use probability reasoning to estimate the likelihood that any two users will accidentally generate the same address.  
   (Hint: apply the birthday paradox approximation for a 160-bit space.)

---

## Exercise 2: Integrity Test

### Challenge: Message Integrity Verification

1. Generate a new key pair.
2. Sign the message: `"Blockchain is secure"`.
3. Verify the signature (it should pass).
4. Modify the message slightly (e.g., change “B” to lowercase).
5. Attempt verification again.

**Question:** Why does the verification fail for the modified message? What property of digital signatures does this demonstrate?

---

## Exercise 3: Authentication Test

### Challenge: Verifying the Right Signer

1. Generate two key pairs (`km1` and `km2`).
2. With `km1`, sign the message: `"Ownership test"`.
3. Attempt to verify that signature using `km2`.
4. Finally, verify the same signature using `km1`.

**Question:** Why can only the correct key pair verify the signature successfully?  
What does this tell us about authentication in blockchain systems?

---

## Exercise 4: Non-repudiation Challenge

### Challenge: Proving Signature Uniqueness

Simulate the following scenario:

1. Generate a key pair for **Alice**.
2. Sign the message: `"I agree to send 1 ETH"`.
3. Save Alice’s private key.
4. Load this same private key in a new instance of `EthereumKeyManager`.
5. Attempt to verify the same signature.
6. Change the message slightly (e.g., `"I agree to send 2 ETH"`) and verify again.

**Questions:**

- Why does the verification succeed when using the same private key on a different instance?
- Why does verification fail when the message changes?
- Can Alice later deny signing the original message?

### Reflection

1. Why does Ethereum use **EIP-191 message prefixes** before hashing and signing?
2. How does non-repudiation relate to accountability in decentralized systems?
3. If a private key is leaked, does non-repudiation still hold? Why or why not?

---

## Exercise 5: Merkle Proof Verification

### Learning Goal

Understand how a **Merkle proof** verifies the inclusion of a transaction in a block and how tampering with data breaks verification.

### Challenge: Verify Inclusion in a Merkle Tree

1. Create a list of at least **6 transactions** (strings).
2. Build a **Merkle tree** and display its structure.
3. Choose one transaction at random and:
   - Generate its Merkle proof using `get_proof()`.
   - Verify the proof using `verify_proof()`.
4. Modify the chosen transaction slightly (e.g., change an amount).
5. Attempt verification again with the tampered message.

**Questions:**

- Why does the verification fail after tampering?
- What property of the Merkle tree guarantees this behavior?
- How many hashes were needed for verification? How does this relate to tree height?

### Reflection

1. Why is the **Merkle root** sufficient to represent all transactions in a block?
2. If two transactions differ by only one character, how will this affect the root hash?

---

## Exercise 6: Merkle Efficiency and Security Analysis

### Learning Goal

Reason about the **logarithmic efficiency** of Merkle proofs and the **security implications** of cryptographic hash functions.

### Challenge: Scaling and Security of Merkle Trees

1. Record the tree height and proof size for various transaction counts: 8, 16, 32, 64, 128.
2. Plot or tabulate **log₂(n)** vs. proof size.
3. Estimate the efficiency gain compared to verifying every transaction directly.
4. Consider what happens if the hash function is weak (e.g., SHA-256 has collisions).
5. Would the Merkle proof system remain secure? Why or why not?

**Hint:**  
Verification using a Merkle proof requires only **log₂(n)** hashes instead of **n**.  
Reflect on how this scaling behavior enables blockchains to store and verify millions of transactions efficiently.

### Reflection

1. Why is the Merkle tree structure essential for **light clients (SPV nodes)**?
2. What would happen if one internal node hash were corrupted or recomputed incorrectly?
3. How does the choice of hash function affect overall blockchain trust?

---

## Exercise 7: Safe Deletion and Structural Pruning

### Learning Goal

Design deletion that preserves shared prefixes and prunes only dead branches, keeping the trie minimal and correct.

### Challenge: Delete with Minimal Impact

1. Extend your existing `PatriciaTrie` with a method `delete(key: str) -> bool` that:

   - Returns `True` iff a full key existed and was deleted; `False` otherwise.
   - Decrements `self.size` only on successful delete.
   - Prunes ancestors that become useless (no children and not `is_end`).
   - Preserves other keys that share prefixes.
   - Works without modifying `display()` or `calculate_root_hash()`.

2. **Edge cases to reason about:**

   - Deleting a non-existent key or a path that is only a prefix.
   - Deleting a key that is a prefix of another (must not break the longer key).
   - Deleting when the trie is empty.
   - Repeated deletes of the same key.

3. **Acceptance ideas:**
   - Insert `a7f1`, `a7f2`, `a821`, `b045`. Delete `a7f2` → `get_all_keys()` drops `a7f2`, `size == 3`.
   - Insert `a7f1x`; delete `a7f1` → `a7f1x` remains intact.
   - `calculate_root_hash()` must differ before vs. after deletion.

---

## Exercise 8: Merkle-Style Inclusion Proofs

### Learning Goal

Write path proofs compatible with your hashing contract so a verifier can recompute the same root using only the proof.

### Challenge: Generate and Verify Proofs Compatible with `calculate_root_hash()`

1. Implement two APIs (attach to `PatriciaTrie` or as specified):

   - `get_proof(key: str) -> list | dict | None`
   - `verify_proof(root_hash: str, key: str, expected_value: str, proof) -> bool`

2. **Constraints (match your current hasher):**

   - For an internal/mixed node:  
     Children are hashed as sorted by child char:  
     `combined = " ".join(f"{c}:{h}" for ...)`  
     If `is_end`, append `" value:{node.value}"`.
   - For a pure leaf (no children, `is_end`): `sha256(value)`.

3. **Proof must include, at each hop:**

   - The traversed char from parent to child.
   - The set of siblings: each `(char, subtree_hash)` exactly as your hasher computes, sorted.
   - The current node’s `is_end` and `value` after moving to that child.

4. **Acceptance ideas:**
   - Build a small trie; compute `root = calculate_root_hash()`.
   - `p = get_proof("a7f1")` → `verify_proof(root, "a7f1", value, p)` must be `True`.
   - Mutate `value` or `key` → verification becomes `False`.
   - Delete the key and recompute root → the old proof must not verify.

---

## Exercise 9: Consensus Output Correction (PoW vs. PoS)

### Learning Goal

Infer different consensus mechanisms from block fields; enforce correct, safe printing with minimal token-level edits.

### Challenge: Make Output Correct for PoW and PoS

**Task (edit existing lines only):**

- You may change ≤3 tokens per edited line, ≤6 lines total.
- You may reorder tokens and replace a dict access with another.
- No new imports, helpers, added lines, or deletes.

**Required behavior:**

1. **Pre-Merge block:** print real `difficulty` and `totalDifficulty`.
2. **Post-Merge block:** print `difficulty == 0` as “PoS” and a safe message for missing `totalDifficulty` (no `KeyError`).
3. **Formatting:** separators and line order remain identical.

**Hints:**

- Replace `block['totalDifficulty']` with a safe lookup on the same line.
- Replace the label `"Miner"` with a neutral post-Merge term.
- Base decisions on observed values without adding conditional statements.

**Edge cases to reason about:**

- Pre-Merge historical block (has both fields).
- Latest block (PoS, `totalDifficulty` may be missing).
- Block where `baseFeePerGas` exists (EIP-1559+) but `totalDifficulty` doesn’t.
