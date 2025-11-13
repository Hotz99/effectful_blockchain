import os
import secrets
from eth_account import Account
from eth_keys import keys
from web3 import Web3

class EthereumKeyManager:
    """Manage Ethereum private keys, public keys, and addresses"""

    def __init__(self):
        """Initialize the key manager"""
        self.private_key = None
        self.public_key = None
        self.address = None
        self.account = None

    def generate_new_key(self):
        """
        Generate a new random private key and derive public key and address

        Returns:
            dict: Contains private_key, public_key, and address
        """
        # Generate cryptographically secure random 32 bytes
        private_key_bytes = secrets.token_bytes(32)

        # Convert to hex string with 0x prefix
        self.private_key = '0x' + private_key_bytes.hex()

        # Create account from private key
        self.account = Account.from_key(self.private_key)

        # Get address
        self.address = self.account.address

        # Derive public key
        private_key_obj = keys.PrivateKey(private_key_bytes)
        public_key_obj = private_key_obj.public_key
        self.public_key = '0x' + public_key_obj.to_hex()

        print("=" * 70)
        print("         NEW ETHEREUM KEY GENERATED")
        print("=" * 70)
        print(f"Private Key: {self.private_key}")
        print(f"Public Key:  {self.public_key}")
        print(f"Address:     {self.address}")
        print("=" * 70)
        print("\nWARNING: Keep your private key secret!")
        print("Anyone with the private key can control the funds.\n")

        return {
            'private_key': self.private_key,
            'public_key': self.public_key,
            'address': self.address
        }

    def load_private_key(self, private_key_hex):
        """
        Load an existing private key

        Args:
            private_key_hex (str): Private key in hex format (with or without 0x)
        """
        # Add 0x prefix if not present
        if not private_key_hex.startswith('0x'):
            private_key_hex = '0x' + private_key_hex

        self.private_key = private_key_hex
        self.account = Account.from_key(self.private_key)
        self.address = self.account.address

        # Derive public key
        private_key_bytes = bytes.fromhex(private_key_hex[2:])
        private_key_obj = keys.PrivateKey(private_key_bytes)
        public_key_obj = private_key_obj.public_key
        self.public_key = '0x' + public_key_obj.to_hex()

        print("=" * 70)
        print("         PRIVATE KEY LOADED")
        print("=" * 70)
        print(f"Address: {self.address}")
        print("=" * 70)

    def sign_message(self, message):
        """
        Sign a message with the private key

        Args:
            message (str): Message to sign

        Returns:
            dict: Contains message, signature, and components
        """
        if not self.account:
            raise ValueError("No private key loaded. Generate or load a key first.")

        # Encode message
        message_hash = Web3.keccak(text=message)

        # Sign message
        signed_message = self.account.signHash(message_hash)

        print("\n" + "=" * 70)
        print("         MESSAGE SIGNED")
        print("=" * 70)
        print(f"Message:       {message}")
        print(f"Message Hash:  {message_hash.hex()}")
        print(f"Signature:     {signed_message.signature.hex()}")
        print(f" r: {hex(signed_message.r)}")
        print(f" s: {hex(signed_message.s)}")
        print(f" v: {signed_message.v}")
        print("=" * 70)

        return {
            'message': message,
            'message_hash': message_hash.hex(),
            'signature': signed_message.signature.hex(),
            'r': hex(signed_message.r),
            's': hex(signed_message.s),
            'v': signed_message.v
        }

    def verify_signature(self, message, signature):
        """
        Verify a signature and recover the signer's address

        Args:
            message (str): Original message
            signature (str): Signature in hex format

        Returns:
            dict: Contains verification result and recovered address
        """
        # Encode message
        message_hash = Web3.keccak(text=message)

        # Recover address from signature
        recovered_address = Account.recover_message(
            message_hash,
            signature=bytes.fromhex(signature[2:]) if signature.startswith('0x') else signature
        )

        # Check if recovered address matches
        is_valid = recovered_address.lower() == self.address.lower()

        print("\n" + "=" * 70)
        print("         SIGNATURE VERIFICATION")
        print("=" * 70)
        print(f"Message:            {message}")
        print(f"Expected Signer:    {self.address}")
        print(f"Recovered Address:  {recovered_address}")
        print(f"Valid Signature:    {'YES' if is_valid else 'NO'}")
        print("=" * 70)

        return {
            'is_valid': is_valid,
            'recovered_address': recovered_address,
            'expected_address': self.address
        }

    def demonstrate_key_derivation(self):
        """
        Demonstrate the step-by-step key derivation process
        """
        if not self.private_key:
            print("No key loaded. Generate a key first.")
            return

        print("\n" + "=" * 70)
        print("         KEY DERIVATION DEMONSTRATION")
        print("=" * 70)

        # Step 1: Private Key
        print("\nStep 1: Private Key (256 bits / 32 bytes)")
        print(f" Hex:   {self.private_key}")
        print(f" Length: {len(self.private_key[2:])} hex characters (64)")
        print(f" Bytes: {len(bytes.fromhex(self.private_key[2:]))} bytes (32)")

        # Step 2: Public Key
        print("\nStep 2: Public Key (derived using secp256k1 ECC)")
        print(f" Hex:   {self.public_key}")
        print(f" Length: {len(self.public_key[2:])} hex characters (128)")
        print(f" Bytes: {len(bytes.fromhex(self.public_key[2:]))} bytes (64)")

        # Step 3: Address Derivation
        print("\nStep 3: Address (Keccak-256 hash, last 20 bytes)")
        public_key_bytes = bytes.fromhex(self.public_key[2:])
        keccak_hash = Web3.keccak(public_key_bytes)
        print(f" Keccak-256 of public key: {keccak_hash.hex()}")
        print(f" Last 20 bytes: {keccak_hash[-20:].hex()}")
        print(f" Final Address: {self.address}")

        print("\n" + "=" * 70)
        print("Key Insights:")
        print(" Private key is random 32 bytes")
        print(" Public key derived via elliptic curve (one-way)")
        print(" Address is last 20 bytes of Keccak hash")
        print(" Cannot reverse: Address ← Public Key ← Private Key")
        print("=" * 70)

# Demo and testing
if __name__ == "__main__":
    print("=" * 70)
    print("ETHEREUM KEY MANAGEMENT DEMONSTRATION")
    print("=" * 70)

    # Create key manager
    km = EthereumKeyManager()

    # Generate new key
    print("\nGenerating new Ethereum key...")
    key_data = km.generate_new_key()

    # Demonstrate key derivation
    km.demonstrate_key_derivation()

    # Sign a message
    print("\nSigning a message...")
    message = "Hello, Blockchain!"
    signature_data = km.sign_message(message)

    # Verify signature
    print("\nVerifying signature...")
    verification = km.verify_signature(message, signature_data['signature'])

    # Test with wrong message
    print("\nTesting with tampered message...")
    km.verify_signature("Hello, Blockchain!!", signature_data['signature'])
