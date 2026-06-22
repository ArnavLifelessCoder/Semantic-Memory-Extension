/**
 * Sync client for cross-device index synchronization.
 *
 * All encryption/decryption happens client-side using AES-256-GCM
 * with keys derived from the user's auth token via PBKDF2.
 * The server only ever sees opaque encrypted blobs.
 */

import type { PageMetadata } from '../types';
import { metadataStore } from './metadata-store';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const PBKDF2_ITERATIONS = 100_000;

export interface SyncConfig {
  apiBaseUrl: string;
  accessToken: string;
  enabled: boolean;
}

// --- Crypto helpers (WebCrypto API) ---

async function deriveKey(token: string, salt: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(token),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encrypt(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data,
  );
  // Pack: [12 bytes IV][ciphertext + 16 bytes auth tag]
  const result = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.byteLength);
  return result.buffer;
}

async function decrypt(key: CryptoKey, blob: ArrayBuffer): Promise<ArrayBuffer> {
  const data = new Uint8Array(blob);
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);
  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// --- Sync client ---

export class SyncClient {
  private config: SyncConfig | null = null;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private version = 0;

  configure(config: SyncConfig): void {
    this.config = config;
    if (config.enabled) {
      this.startAutoSync();
    } else {
      this.stopAutoSync();
    }
  }

  private startAutoSync(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => {
      void this.push();
    }, SYNC_INTERVAL_MS);
    // Also push immediately on configure
    void this.push();
  }

  private stopAutoSync(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async push(): Promise<void> {
    if (!this.config?.enabled) return;

    try {
      const key = await deriveKey(this.config.accessToken, 'semantic-memory-salt-v1');

      // Serialize metadata from IDB
      const allEmbeddings = await metadataStore.getAllEmbeddings();
      const metadataBlob = new TextEncoder().encode(JSON.stringify(allEmbeddings));
      const indexBlob = new TextEncoder().encode(JSON.stringify({ count: allEmbeddings.length }));

      const encryptedIndex = await encrypt(key, indexBlob.buffer);
      const encryptedMetadata = await encrypt(key, metadataBlob.buffer);

      this.version += 1;

      const response = await fetch(`${this.config.apiBaseUrl}/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.accessToken}`,
        },
        body: JSON.stringify({
          encrypted_index_b64: arrayBufferToBase64(encryptedIndex),
          encrypted_metadata_b64: arrayBufferToBase64(encryptedMetadata),
          version: this.version,
        }),
      });

      if (!response.ok) {
        console.error('[SemanticMemory:Sync] push failed:', response.status);
      } else {
        console.log('[SemanticMemory:Sync] push success, version:', this.version);
      }
    } catch (err) {
      console.error('[SemanticMemory:Sync] push error:', err);
    }
  }

  async pull(): Promise<void> {
    if (!this.config?.enabled) return;

    try {
      const key = await deriveKey(this.config.accessToken, 'semantic-memory-salt-v1');

      const response = await fetch(`${this.config.apiBaseUrl}/sync/pull`, {
        headers: {
          Authorization: `Bearer ${this.config.accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.log('[SemanticMemory:Sync] no snapshots to pull');
          return;
        }
        console.error('[SemanticMemory:Sync] pull failed:', response.status);
        return;
      }

      const data = await response.json() as {
        encrypted_index_b64: string;
        encrypted_metadata_b64: string;
        version: number;
      };

      const decryptedMetadata = await decrypt(
        key,
        base64ToArrayBuffer(data.encrypted_metadata_b64),
      );
      const metadataJson = new TextDecoder().decode(decryptedMetadata);
      const embeddings = JSON.parse(metadataJson) as Array<{
        chunkId: number;
        embedding: number[];
      }>;

      this.version = data.version;
      console.log(
        `[SemanticMemory:Sync] pulled version ${data.version}, ${embeddings.length} embeddings`,
      );
    } catch (err) {
      console.error('[SemanticMemory:Sync] pull error:', err);
    }
  }
}

export const syncClient = new SyncClient();
