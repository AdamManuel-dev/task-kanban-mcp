/**
 * @fileoverview Backup deduplication service for storage optimization
 * @lastmodified 2025-07-28T11:50:00Z
 *
 * Features: Content-based deduplication, chunk-level dedup, hash indexing, space optimization
 * Main APIs: deduplicateBackup(), restoreBackup(), calculateSavings(), cleanupOrphans()
 * Constraints: Requires filesystem access, hash storage, chunk management
 * Patterns: Content hashing, chunk-based storage, reference counting, cleanup strategies
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger';

export interface DeduplicationOptions {
  chunkSize?: number;
  hashAlgorithm?: string;
  compressionEnabled?: boolean;
  indexPath?: string;
  chunksPath?: string;
}

export interface BackupChunk {
  hash: string;
  size: number;
  offset: number;
  refCount: number;
  createdAt: string;
  lastAccessed: string;
}

export interface DeduplicatedBackup {
  id: string;
  originalPath: string;
  chunks: BackupChunk[];
  metadata: {
    originalSize: number;
    deduplicatedSize: number;
    compressionRatio: number;
    chunkCount: number;
    timestamp: string;
    checksum: string;
  };
}

export interface DeduplicationStats {
  totalBackups: number;
  totalChunks: number;
  uniqueChunks: number;
  totalOriginalSize: number;
  totalStorageSize: number;
  spaceSaved: number;
  deduplicationRatio: number;
  averageChunkSize: number;
}

export class BackupDeduplicationService {
  private static readonly DEFAULT_CHUNK_SIZE = 64 * 1024; // 64KB

  private static readonly DEFAULT_HASH_ALGORITHM = 'sha256';

  private static readonly INDEX_FILE = 'dedup-index.json';

  private static readonly CHUNKS_DIR = 'chunks';

  private readonly options: Required<DeduplicationOptions>;

  private readonly chunkIndex: Map<string, BackupChunk> = new Map();

  private readonly backupIndex: Map<string, DeduplicatedBackup> = new Map();

  private indexLoaded = false;

  constructor(baseDir = './backups', options: DeduplicationOptions = {}) {
    this.options = {
      chunkSize: options.chunkSize ?? BackupDeduplicationService.DEFAULT_CHUNK_SIZE,
      hashAlgorithm: options.hashAlgorithm ?? BackupDeduplicationService.DEFAULT_HASH_ALGORITHM,
      compressionEnabled: options.compressionEnabled ?? true,
      indexPath: options.indexPath ?? path.join(baseDir, BackupDeduplicationService.INDEX_FILE),
      chunksPath: options.chunksPath ?? path.join(baseDir, BackupDeduplicationService.CHUNKS_DIR),
    };

    logger.info('BackupDeduplicationService initialized', {
      chunkSize: this.options.chunkSize,
      hashAlgorithm: this.options.hashAlgorithm,
      compressionEnabled: this.options.compressionEnabled,
      indexPath: this.options.indexPath,
      chunksPath: this.options.chunksPath,
    });
  }

  /**
   * Load deduplication index from disk
   */
  private async loadIndex(): Promise<void> {
    if (this.indexLoaded) return;

    try {
      const indexData = await fs.readFile(this.options.indexPath, 'utf-8');
      const index = JSON.parse(indexData);

      // Load chunk index
      if (index.chunks) {
        for (const [hash, chunk] of Object.entries(index.chunks)) {
          this.chunkIndex.set(hash, chunk as BackupChunk);
        }
      }

      // Load backup index
      if (index.backups) {
        for (const [id, backup] of Object.entries(index.backups)) {
          this.backupIndex.set(id, backup as DeduplicatedBackup);
        }
      }

      this.indexLoaded = true;
      logger.info('Deduplication index loaded', {
        chunks: this.chunkIndex.size,
        backups: this.backupIndex.size,
      });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.info('No existing deduplication index found, starting fresh');
        this.indexLoaded = true;
      } else {
        logger.error('Failed to load deduplication index', { error });
        throw new Error(`Failed to load deduplication index: ${(error as Error).message}`);
      }
    }
  }

  /**
   * Save deduplication index to disk
   */
  private async saveIndex(): Promise<void> {
    try {
      const index = {
        version: '1.0',
        lastUpdated: new Date().toISOString(),
        chunks: Object.fromEntries(this.chunkIndex),
        backups: Object.fromEntries(this.backupIndex),
        stats: await this.calculateStats(),
      };

      // Ensure directory exists
      await fs.mkdir(path.dirname(this.options.indexPath), { recursive: true });

      // Write index file atomically
      const tempPath = `${this.options.indexPath}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(index, null, 2));
      await fs.rename(tempPath, this.options.indexPath);

      logger.debug('Deduplication index saved', {
        chunks: this.chunkIndex.size,
        backups: this.backupIndex.size,
      });
    } catch (error) {
      logger.error('Failed to save deduplication index', { error });
      throw new Error(`Failed to save deduplication index: ${(error as Error).message}`);
    }
  }

  /**
   * Split data into chunks
   */
  private splitIntoChunks(data: Buffer): Buffer[] {
    const chunks: Buffer[] = [];
    let offset = 0;

    while (offset < data.length) {
      const end = Math.min(offset + this.options.chunkSize, data.length);
      chunks.push(data.subarray(offset, end));
      offset = end;
    }

    return chunks;
  }

  /**
   * Calculate hash for chunk
   */
  private calculateChunkHash(chunk: Buffer): string {
    return crypto.createHash(this.options.hashAlgorithm).update(chunk).digest('hex');
  }

  /**
   * Store chunk if not already exists
   */
  private async storeChunk(chunk: Buffer, hash: string): Promise<void> {
    const chunkPath = path.join(this.options.chunksPath, `${hash}.chunk`);

    // Check if chunk already exists
    try {
      await fs.access(chunkPath);
      return; // Chunk already exists
    } catch {
      // Chunk doesn't exist, store it
    }

    try {
      // Ensure chunks directory exists
      await fs.mkdir(this.options.chunksPath, { recursive: true });

      // Store chunk with optional compression
      let chunkData = chunk;
      if (this.options.compressionEnabled) {
        const zlib = await import('zlib');
        chunkData = await new Promise<Buffer>((resolve, reject) => {
          zlib.gzip(chunk, (err, compressed) => {
            if (err) reject(err);
            else resolve(compressed);
          });
        });
      }

      await fs.writeFile(chunkPath, chunkData);
      logger.debug('Chunk stored', { hash, size: chunk.length, compressed: chunkData.length });
    } catch (error) {
      logger.error('Failed to store chunk', { error, hash });
      throw new Error(`Failed to store chunk ${hash}: ${(error as Error).message}`);
    }
  }

  /**
   * Load chunk from storage
   */
  private async loadChunk(hash: string): Promise<Buffer> {
    const chunkPath = path.join(this.options.chunksPath, `${hash}.chunk`);

    try {
      let chunkData = await fs.readFile(chunkPath);

      // Decompress if compression is enabled
      if (this.options.compressionEnabled) {
        const zlib = await import('zlib');
        chunkData = await new Promise<Buffer>((resolve, reject) => {
          zlib.gunzip(chunkData, (err, decompressed) => {
            if (err) reject(err);
            else resolve(decompressed);
          });
        });
      }

      return chunkData;
    } catch (error) {
      logger.error('Failed to load chunk', { error, hash });
      throw new Error(`Failed to load chunk ${hash}: ${(error as Error).message}`);
    }
  }

  /**
   * Deduplicate a backup file
   */
  async deduplicateBackup(backupPath: string): Promise<DeduplicatedBackup> {
    await this.loadIndex();

    try {
      const startTime = Date.now();
      logger.info('Starting backup deduplication', { backupPath });

      // Read backup data
      const backupData = await fs.readFile(backupPath);
      const originalSize = backupData.length;

      // Calculate overall checksum
      const checksum = crypto
        .createHash(this.options.hashAlgorithm)
        .update(backupData)
        .digest('hex');

      // Split into chunks
      const dataChunks = this.splitIntoChunks(backupData);
      const chunks: BackupChunk[] = [];
      let deduplicatedSize = 0;
      let newChunks = 0;

      for (let i = 0; i < dataChunks.length; i++) {
        const chunk = dataChunks[i];
        const hash = this.calculateChunkHash(chunk);
        let chunkInfo = this.chunkIndex.get(hash);

        if (chunkInfo) {
          // Chunk already exists, increment reference count
          chunkInfo.refCount++;
          chunkInfo.lastAccessed = new Date().toISOString();
          logger.debug('Reusing existing chunk', { hash, refCount: chunkInfo.refCount });
        } else {
          // New chunk, store it
          await this.storeChunk(chunk, hash);
          chunkInfo = {
            hash,
            size: chunk.length,
            offset: i * this.options.chunkSize,
            refCount: 1,
            createdAt: new Date().toISOString(),
            lastAccessed: new Date().toISOString(),
          };
          this.chunkIndex.set(hash, chunkInfo);
          deduplicatedSize += chunk.length;
          newChunks++;
          logger.debug('Stored new chunk', { hash, size: chunk.length });
        }

        chunks.push({ ...chunkInfo });
      }

      // Create deduplicated backup record
      const backupId = crypto.randomUUID();
      const deduplicatedBackup: DeduplicatedBackup = {
        id: backupId,
        originalPath: backupPath,
        chunks,
        metadata: {
          originalSize,
          deduplicatedSize,
          compressionRatio: deduplicatedSize > 0 ? originalSize / deduplicatedSize : 1,
          chunkCount: chunks.length,
          timestamp: new Date().toISOString(),
          checksum,
        },
      };

      this.backupIndex.set(backupId, deduplicatedBackup);
      await this.saveIndex();

      const duration = Date.now() - startTime;
      const spaceSaved = originalSize - deduplicatedSize;
      const deduplicationRatio = spaceSaved / originalSize;

      logger.info('Backup deduplication completed', {
        backupId,
        originalSize,
        deduplicatedSize,
        spaceSaved,
        deduplicationRatio: `${(deduplicationRatio * 100).toFixed(2)}%`,
        newChunks,
        totalChunks: chunks.length,
        duration: `${duration}ms`,
      });

      return deduplicatedBackup;
    } catch (error) {
      logger.error('Backup deduplication failed', { error, backupPath });
      throw new Error(`Backup deduplication failed: ${(error as Error).message}`);
    }
  }

  /**
   * Restore a deduplicated backup
   */
  async restoreBackup(backupId: string, outputPath: string): Promise<void> {
    await this.loadIndex();

    try {
      const startTime = Date.now();
      logger.info('Starting backup restoration', { backupId, outputPath });

      const backup = this.backupIndex.get(backupId);
      if (!backup) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      // Load and reassemble chunks
      const chunkBuffers: Buffer[] = [];
      for (const chunkInfo of backup.chunks) {
        const chunkData = await this.loadChunk(chunkInfo.hash);
        chunkBuffers.push(chunkData);

        // Update last accessed time
        const indexedChunk = this.chunkIndex.get(chunkInfo.hash);
        if (indexedChunk) {
          indexedChunk.lastAccessed = new Date().toISOString();
        }
      }

      // Concatenate chunks
      const restoredData = Buffer.concat(chunkBuffers);

      // Validate integrity
      const checksum = crypto
        .createHash(this.options.hashAlgorithm)
        .update(restoredData)
        .digest('hex');
      if (checksum !== backup.metadata.checksum) {
        throw new Error('Restored backup failed integrity check');
      }

      if (restoredData.length !== backup.metadata.originalSize) {
        throw new Error('Restored backup size mismatch');
      }

      // Write restored data
      await fs.writeFile(outputPath, restoredData);

      const duration = Date.now() - startTime;
      logger.info('Backup restoration completed', {
        backupId,
        outputPath,
        restoredSize: restoredData.length,
        chunks: backup.chunks.length,
        duration: `${duration}ms`,
      });

      await this.saveIndex(); // Update access times
    } catch (error) {
      logger.error('Backup restoration failed', { error, backupId, outputPath });
      throw new Error(`Backup restoration failed: ${(error as Error).message}`);
    }
  }

  /**
   * Delete a deduplicated backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    await this.loadIndex();

    try {
      const backup = this.backupIndex.get(backupId);
      if (!backup) {
        throw new Error(`Backup not found: ${backupId}`);
      }

      logger.info('Deleting deduplicated backup', { backupId, chunks: backup.chunks.length });

      // Decrement reference counts and remove unreferenced chunks
      const orphanedChunks: string[] = [];
      for (const chunkInfo of backup.chunks) {
        const indexedChunk = this.chunkIndex.get(chunkInfo.hash);
        if (indexedChunk) {
          indexedChunk.refCount--;
          if (indexedChunk.refCount <= 0) {
            // Mark chunk for deletion
            orphanedChunks.push(chunkInfo.hash);
            this.chunkIndex.delete(chunkInfo.hash);
          }
        }
      }

      // Remove backup from index
      this.backupIndex.delete(backupId);

      // Delete orphaned chunk files
      for (const chunkHash of orphanedChunks) {
        try {
          const chunkPath = path.join(this.options.chunksPath, `${chunkHash}.chunk`);
          await fs.unlink(chunkPath);
          logger.debug('Deleted orphaned chunk', { hash: chunkHash });
        } catch (error) {
          logger.warn('Failed to delete chunk file', { error, hash: chunkHash });
        }
      }

      await this.saveIndex();

      logger.info('Backup deleted successfully', {
        backupId,
        orphanedChunks: orphanedChunks.length,
      });
    } catch (error) {
      logger.error('Backup deletion failed', { error, backupId });
      throw new Error(`Backup deletion failed: ${(error as Error).message}`);
    }
  }

  /**
   * Calculate deduplication statistics
   */
  async calculateStats(): Promise<DeduplicationStats> {
    await this.loadIndex();

    const backups = Array.from(this.backupIndex.values());
    const chunks = Array.from(this.chunkIndex.values());

    const totalOriginalSize = backups.reduce(
      (sum, backup) => sum + backup.metadata.originalSize,
      0
    );
    const totalStorageSize = chunks.reduce((sum, chunk) => sum + chunk.size, 0);
    const spaceSaved = totalOriginalSize - totalStorageSize;
    const deduplicationRatio = totalOriginalSize > 0 ? spaceSaved / totalOriginalSize : 0;
    const averageChunkSize = chunks.length > 0 ? totalStorageSize / chunks.length : 0;

    return {
      totalBackups: backups.length,
      totalChunks: backups.reduce((sum, backup) => sum + backup.chunks.length, 0),
      uniqueChunks: chunks.length,
      totalOriginalSize,
      totalStorageSize,
      spaceSaved,
      deduplicationRatio,
      averageChunkSize,
    };
  }

  /**
   * Clean up orphaned chunks (chunks with refCount <= 0)
   */
  async cleanupOrphans(): Promise<{ cleanedChunks: number; spaceFree: number }> {
    await this.loadIndex();

    try {
      logger.info('Starting orphaned chunk cleanup');

      const orphanedChunks: string[] = [];
      let spaceFreed = 0;

      // Find orphaned chunks
      for (const [hash, chunk] of this.chunkIndex) {
        if (chunk.refCount <= 0) {
          orphanedChunks.push(hash);
          spaceFreed += chunk.size;
        }
      }

      // Remove orphaned chunks
      for (const chunkHash of orphanedChunks) {
        try {
          const chunkPath = path.join(this.options.chunksPath, `${chunkHash}.chunk`);
          await fs.unlink(chunkPath);
          this.chunkIndex.delete(chunkHash);
          logger.debug('Cleaned orphaned chunk', { hash: chunkHash });
        } catch (error) {
          logger.warn('Failed to clean chunk', { error, hash: chunkHash });
        }
      }

      await this.saveIndex();

      logger.info('Orphaned chunk cleanup completed', {
        cleanedChunks: orphanedChunks.length,
        spaceFreed,
      });

      return {
        cleanedChunks: orphanedChunks.length,
        spaceFree: spaceFreed,
      };
    } catch (error) {
      logger.error('Orphaned chunk cleanup failed', { error });
      throw new Error(`Orphaned chunk cleanup failed: ${(error as Error).message}`);
    }
  }

  /**
   * List all deduplicated backups
   */
  async listBackups(): Promise<DeduplicatedBackup[]> {
    await this.loadIndex();
    return Array.from(this.backupIndex.values());
  }

  /**
   * Get backup information
   */
  async getBackupInfo(backupId: string): Promise<DeduplicatedBackup | null> {
    await this.loadIndex();
    return this.backupIndex.get(backupId) ?? null;
  }

  /**
   * Verify integrity of all stored chunks
   */
  async verifyIntegrity(): Promise<{ verified: number; corrupted: string[] }> {
    await this.loadIndex();

    const corrupted: string[] = [];
    let verified = 0;

    logger.info('Starting chunk integrity verification', { totalChunks: this.chunkIndex.size });

    for (const [hash, chunkInfo] of this.chunkIndex) {
      try {
        const chunkData = await this.loadChunk(hash);
        const calculatedHash = this.calculateChunkHash(chunkData);

        if (calculatedHash === hash && chunkData.length === chunkInfo.size) {
          verified++;
        } else {
          corrupted.push(hash);
          logger.warn('Chunk integrity check failed', {
            hash,
            expectedSize: chunkInfo.size,
            actualSize: chunkData.length,
            hashMatch: calculatedHash === hash,
          });
        }
      } catch (error) {
        corrupted.push(hash);
        logger.error('Failed to load chunk for verification', { error, hash });
      }
    }

    logger.info('Chunk integrity verification completed', {
      verified,
      corrupted: corrupted.length,
    });

    return { verified, corrupted };
  }
}

// Export default instance
export const backupDeduplication = new BackupDeduplicationService();
