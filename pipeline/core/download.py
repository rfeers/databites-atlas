import hashlib
import os
import requests

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", ".cache")

def download(url: str, label: str, force: bool = False) -> bytes:
    """
    Download a URL and cache the result locally.
    If the file is already cached, return it directly unless force=True.
    """
    os.makedirs(CACHE_DIR, exist_ok=True)

    # Build a unique filename from the URL
    filename = hashlib.md5(url.encode()).hexdigest()
    cache_file = os.path.join(CACHE_DIR, filename)

    if not force and os.path.exists(cache_file):
        print(f"  [cache] {label}")
        with open(cache_file, "rb") as f:
            return f.read()

    print(f"  [download] {label} ...")
    response = requests.get(url, timeout=600)
    response.raise_for_status()

    with open(cache_file, "wb") as f:
        f.write(response.content)

    size_mb = len(response.content) / 1_000_000
    print(f"  [done] {size_mb:.1f} MB")
    return response.content