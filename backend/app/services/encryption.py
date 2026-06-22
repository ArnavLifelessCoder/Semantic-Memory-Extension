"""
Server-side encryption validation.

The server NEVER decrypts user data — all encryption/decryption is client-side.
This module validates the structure of encrypted blobs to catch malformed uploads
early, without accessing any plaintext.
"""


# AES-256-GCM blob structure:
# [12 bytes IV] [N bytes ciphertext] [16 bytes auth tag]
AES_GCM_IV_LENGTH = 12
AES_GCM_TAG_LENGTH = 16
AES_GCM_MIN_BLOB_SIZE = AES_GCM_IV_LENGTH + AES_GCM_TAG_LENGTH


def validate_encrypted_blob(blob: bytes) -> bool:
    """
    Validate that an encrypted blob has the minimum structure for AES-256-GCM.
    Returns True if the blob is structurally valid, False otherwise.

    This does NOT verify the encryption — only that the blob is large enough
    to contain an IV, ciphertext, and auth tag.
    """
    if not isinstance(blob, bytes):
        return False
    if len(blob) < AES_GCM_MIN_BLOB_SIZE:
        return False
    return True


def get_blob_metadata(blob: bytes) -> dict:
    """Extract non-sensitive metadata from an encrypted blob."""
    return {
        "total_bytes": len(blob),
        "ciphertext_bytes": len(blob) - AES_GCM_IV_LENGTH - AES_GCM_TAG_LENGTH,
        "is_valid_structure": validate_encrypted_blob(blob),
    }
