import hashlib
import json
from typing import List, Optional

class MerkleNode:
    """Represents a node in the Merkle tree"""

    def __init__(self, data=None, left=None, right=None, is_leaf=False):
        self.left = left
        self.right = right
        self.is_leaf = is_leaf

        if is_leaf:
            # Leaf node: hash the data
            self.data = data
            self.hash = self.calculate_hash(data)
        else:
            # Non-leaf node: hash of children
            self.data = None
            self.hash = self.calculate_hash(left.hash + right.hash)

    def calculate_hash(self, data):
        """Calculate SHA-256 hash"""
        if isinstance(data, str):
            data = data.encode('utf-8')
        return hashlib.sha256(data).hexdigest()


class MerkleTree:
    """Merkle Tree implementation for efficient data verification"""

    def __init__(self, data_blocks: List[str]):
        """
        Initialize Merkle tree from data blocks

        Args:
            data_blocks: List of data strings to include in tree
        """
        if not data_blocks:
            raise ValueError("Cannot create Merkle tree from empty data")

        self.data_blocks = data_blocks
        self.leaves = []
        self.root = None

        # Build the tree
        self.build_tree()

    def build_tree(self):
        """Build the Merkle tree from data blocks"""
        # Create leaf nodes
        self.leaves = [MerkleNode(data=block, is_leaf=True) for block in self.data_blocks]

        # Build tree bottom-up
        current_level = self.leaves

        while len(current_level) > 1:
            next_level = []

            # Process pairs of nodes
            for i in range(0, len(current_level), 2):
                left = current_level[i]

                # If odd number of nodes, duplicate the last one
                if i + 1 < len(current_level):
                    right = current_level[i + 1]
                else:
                    right = current_level[i]

                # Create parent node
                parent = MerkleNode(left=left, right=right, is_leaf=False)
                next_level.append(parent)

            current_level = next_level

        # Root is the last remaining node
        self.root = current_level[0]

    def get_root_hash(self):
        """Get the Merkle root hash"""
        return self.root.hash if self.root else None

    def get_proof(self, data_index: int):
        """
        Generate Merkle proof for data at given index

        Args:
            data_index: Index of data block to prove

        Returns:
            List of (hash, is_left) tuples representing the proof path
        """
        if data_index < 0 or data_index >= len(self.leaves):
            raise IndexError("Data index out of range")

        proof = []
        current_level = self.leaves
        current_index = data_index

        # Traverse up the tree
        while len(current_level) > 1:
            next_level = []

            for i in range(0, len(current_level), 2):
                left = current_level[i]
                right = current_level[i + 1] if i + 1 < len(current_level) else current_level[i]

                # If current node is in this pair, add sibling to proof
                if current_index == i:
                    # Current is left, add right sibling
                    proof.append((right.hash, False))  # False = right sibling
                    current_index = i // 2
                elif current_index == i + 1:
                    # Current is right, add left sibling
                    proof.append((left.hash, True))   # True = left sibling
                    current_index = i // 2

                parent = MerkleNode(left=left, right=right, is_leaf=False)
                next_level.append(parent)

            current_level = next_level

        return proof

    def verify_proof(self, data: str, data_index: int, proof: List[tuple], root_hash: str):
        """
        Verify a Merkle proof

        Args:
            data: Original data block
            data_index: Index of the data
            proof: List of (hash, is_left) tuples
            root_hash: Expected root hash

        Returns:
            bool: True if proof is valid
        """
        # Start with hash of the data
        current_hash = hashlib.sha256(data.encode('utf-8')).hexdigest()

        # Apply proof steps
        for sibling_hash, is_left in proof:
            if is_left:
                # Sibling is on the left
                combined = sibling_hash + current_hash
            else:
                # Sibling is on the right
                combined = current_hash + sibling_hash

            current_hash = hashlib.sha256(combined.encode('utf-8')).hexdigest()

        # Check if we arrived at the root
        return current_hash == root_hash

    def display_tree(self, node=None, level=0, prefix="Root: "):
        """Display the tree structure"""
        if node is None:
            node = self.root

        if node:
            print(" " * level + prefix + node.hash[:16] + "...")
            if not node.is_leaf:
                if node.left:
                    self.display_tree(node.left, level + 1, "L--- ")
                if node.right and node.right != node.left:
                    self.display_tree(node.right, level + 1, "R--- ")

    def get_statistics(self):
        """Get tree statistics"""
        import math

        num_leaves = len(self.leaves)
        tree_height = math.ceil(math.log2(num_leaves)) if num_leaves > 1 else 1
        proof_size = tree_height

        print("\n" + "="*70)
        print("         MERKLE TREE STATISTICS")
        print("="*70)
        print(f"Number of data blocks:   {num_leaves}")
        print(f"Tree height:             {tree_height}")
        print(f"Merkle root:             {self.get_root_hash()}")
        print(f"Proof size (hashes):     {proof_size}")
        print(f"Verification complexity: O(log n) = O(log {num_leaves}) = {tree_height} steps")
        print("="*70)


# Demo and testing
if __name__ == "__main__":
    print("=" * 70)
    print("MERKLE TREE DEMONSTRATION")
    print("=" * 70)

    # Example 1: Simple Merkle Tree
    print("\nCreating Merkle tree with 4 transactions...")
    transactions = [
        "Alice sends 10 ETH to Bob",
        "Charlie sends 5 ETH to David",
        "Eve sends 3 ETH to Frank",
        "Grace sends 7 ETH to Henry"
    ]
    tree = MerkleTree(transactions)

    print("\nTree Structure:")
    tree.display_tree()

    tree.get_statistics()

    # Example 2: Generate and verify proof
    print("\n" + "="*70)
    print("         MERKLE PROOF DEMONSTRATION")
    print("="*70)

    data_index = 1
    print(f"\nProving inclusion of: '{transactions[data_index]}'")

    # Generate proof
    proof = tree.get_proof(data_index)
    root_hash = tree.get_root_hash()

    print(f"\nMerkle Proof (index {data_index}):")
    for i, (hash_val, is_left) in enumerate(proof):
        position = "LEFT" if is_left else "RIGHT"
        print(f" Step {i+1}: {hash_val[:16]}... (sibling on {position})")

    # Verify proof
    print("\nVerifying proof...")
    is_valid = tree.verify_proof(transactions[data_index], data_index, proof, root_hash)
    print(f"Result: {'VALID' if is_valid else 'INVALID'}")

    # Try with tampered data
    print("\nTesting with tampered data...")
    tampered_data = "Alice sends 100 ETH to Bob"  # Changed amount
    is_valid = tree.verify_proof(tampered_data, data_index, proof, root_hash)
    print(f"Result: {'VALID' if is_valid else 'INVALID (as expected)'}")

    # Example 3: Efficiency comparison
    print("\n" + "="*70)
    print("         EFFICIENCY COMPARISON")
    print("="*70)

    sizes = [10, 100, 1000, 10000]
    print("\n| Data Blocks | Without Merkle | With Merkle | Efficiency Gain |")
    print("|-------------|----------------|-------------|------------------|")

    for size in sizes:
        without_merkle = size  # Need to check all blocks
        with_merkle = math.ceil(math.log2(size))  # Only need log(n) hashes
        efficiency = without_merkle / with_merkle
        print(f"| {size:11d} | {without_merkle:14d} | {with_merkle:11d} | {efficiency:14.1f}x |")
