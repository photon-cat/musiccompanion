import requests
import json
import sys
import os
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad
import zstandard as zstd

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "X-Api-Version": "11",
}

def get_model_info(model_id):
    url = f"https://hub.vroid.com/api/character_models/{model_id}"
    r = requests.get(url, headers=HEADERS)
    r.raise_for_status()
    return r.json()

def download_preview_model(model_id):
    url = f"https://hub.vroid.com/api/character_models/{model_id}/optimized_preview"
    r = requests.get(url, headers=HEADERS)
    r.raise_for_status()
    return r.content

def decrypt_decompress(data):
    # First 16 bytes = IV, next 32 bytes = key, rest = ciphertext
    iv = data[:16]
    key = data[16:48]
    ciphertext = data[48:]

    cipher = AES.new(key, AES.MODE_CBC, iv)
    decrypted = unpad(cipher.decrypt(ciphertext), AES.block_size)

    # Check for zstd magic - may have a header prefix
    zstd_magic = b'\x28\xb5\x2f\xfd'
    zstd_offset = decrypted.find(zstd_magic)
    if zstd_offset >= 0:
        print(f"  Found zstd at offset {zstd_offset}")
        dctx = zstd.ZstdDecompressor()
        reader = dctx.stream_reader(decrypted[zstd_offset:])
        decompressed = reader.read()
        reader.close()
        return decompressed
    elif decrypted[:4] == b'glTF':
        print("  Already glTF")
        return decrypted
    else:
        print(f"  Unknown format, magic: {decrypted[:8].hex()}")
        return decrypted

def download_model(model_id, output_path):
    print(f"Fetching model info for {model_id}...")
    info = get_model_info(model_id)
    name = info.get("data", {}).get("character_model", {}).get("character", {}).get("name", "unknown")
    print(f"Model name: {name}")

    print("Downloading preview model...")
    encrypted_data = download_preview_model(model_id)
    print(f"Downloaded {len(encrypted_data)} bytes")

    print("Decrypting and decompressing...")
    model_data = decrypt_decompress(encrypted_data)
    print(f"Decrypted to {len(model_data)} bytes")

    with open(output_path, "wb") as f:
        f.write(model_data)
    print(f"Saved to: {output_path}")

if __name__ == "__main__":
    model_id = "7526064272727941728"
    output = "/Users/delta/claudehack/musiccompanion/vendor/riko_project/server/static/uruha.vrm"
    download_model(model_id, output)
