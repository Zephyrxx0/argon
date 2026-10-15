import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { ReplayCache } from '../src/cache/replay-cache.js';

describe('ReplayCache (D-08, T-05-04)', () => {
  let tempDir: string;
  let tempCacheFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argon-cache-test-'));
    tempCacheFile = path.join(tempDir, 'test-cache.json');
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('computes deterministic SHA-256 prompt hashes', () => {
    const cache = new ReplayCache(tempCacheFile);
    const prompt1 = 'Evaluate architectural decision for billing/retry.ts';
    const prompt2 = '  Evaluate architectural decision for billing/retry.ts  \n';

    const hash1 = cache.hashPrompt(prompt1);
    const hash2 = cache.hashPrompt(prompt2);

    const expected = crypto
      .createHash('sha256')
      .update(prompt1.trim())
      .digest('hex');

    expect(hash1).toBe(expected);
    expect(hash2).toBe(expected);
    expect(hash1).toHaveLength(64);
  });

  it('performs set, get, and has round-trips in memory and persists to disk', () => {
    const cache = new ReplayCache(tempCacheFile);
    const prompt = 'Prompt for REV-001 with catalog dump';
    const decisionIds = ['DEC-001', 'DEC-002'];

    expect(cache.has(prompt)).toBe(false);
    expect(cache.get(prompt)).toBeNull();

    cache.set(prompt, decisionIds);

    expect(cache.has(prompt)).toBe(true);
    expect(cache.get(prompt)).toEqual(decisionIds);
    expect(cache.size()).toBe(1);

    // Verify file written to disk
    expect(fs.existsSync(tempCacheFile)).toBe(true);
    const fileContent = JSON.parse(fs.readFileSync(tempCacheFile, 'utf-8'));
    const hash = cache.hashPrompt(prompt);
    expect(fileContent[hash]).toEqual(decisionIds);

    // Verify loading from disk in new instance
    const reloaded = new ReplayCache(tempCacheFile);
    expect(reloaded.has(prompt)).toBe(true);
    expect(reloaded.get(prompt)).toEqual(decisionIds);
    expect(reloaded.size()).toBe(1);
  });

  it('gracefully handles missing cache files', () => {
    const nonExistentFile = path.join(tempDir, 'nested', 'does-not-exist.json');
    const cache = new ReplayCache(nonExistentFile);

    expect(cache.size()).toBe(0);
    expect(cache.get('random prompt')).toBeNull();

    // Can save into non-existent nested directory
    cache.set('new prompt', ['DEC-003']);
    expect(fs.existsSync(nonExistentFile)).toBe(true);
    expect(cache.get('new prompt')).toEqual(['DEC-003']);
  });

  it('gracefully handles corrupted cache files', () => {
    fs.writeFileSync(tempCacheFile, '{ invalid-json-syntax }', 'utf-8');
    const cache = new ReplayCache(tempCacheFile);

    expect(cache.size()).toBe(0);
    expect(cache.get('random prompt')).toBeNull();

    // Can overwrite corrupted file on set
    cache.set('valid prompt', ['DEC-004']);
    expect(cache.size()).toBe(1);
    expect(cache.get('valid prompt')).toEqual(['DEC-004']);
  });

  it('loads default fixture cache if present', () => {
    const defaultCache = new ReplayCache();
    // Default cache should contain pre-populated fixture cases
    expect(defaultCache.size()).toBeGreaterThanOrEqual(24);
  });
});
