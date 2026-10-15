import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RevertFixtureItemSchema, type RevertFixtureItem } from '../src/types.js';

describe('golden fixtures (reverts.json)', () => {
  const fixturePath = path.resolve(__dirname, '../fixtures/reverts.json');

  it('loads and validates all 24 curated golden fixtures against schema', () => {
    expect(fs.existsSync(fixturePath)).toBe(true);
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const items: unknown[] = JSON.parse(raw);

    expect(items.length).toBe(24);

    const parsed: RevertFixtureItem[] = items.map((item, idx) => {
      const result = RevertFixtureItemSchema.safeParse(item);
      if (!result.success) {
        throw new Error(
          `Fixture index ${idx} (${(item as any)?.caseId}) failed validation: ${result.error.message}`
        );
      }
      return result.data;
    });

    expect(parsed.length).toBe(24);
  });

  it('verifies unique case IDs', () => {
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const items: RevertFixtureItem[] = JSON.parse(raw);
    const caseIds = items.map((i) => i.caseId);
    const uniqueIds = new Set(caseIds);

    expect(uniqueIds.size).toBe(items.length);
  });

  it('verifies timestamps are valid UTC epoch seconds within reasonable bounds', () => {
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const items: RevertFixtureItem[] = JSON.parse(raw);

    for (const item of items) {
      // Must be UTC epoch seconds (between 2014 and 2026: 1400000000 to 1780000000)
      expect(item.revertTimestamp).toBeGreaterThanOrEqual(1400000000);
      expect(item.revertTimestamp).toBeLessThanOrEqual(1780000000);
      // Ensure it is not epoch milliseconds (e.g. > 2500000000)
      expect(item.revertTimestamp).toBeLessThan(2500000000);
    }
  });

  it('verifies non-empty ground truth decision IDs and safe touched file paths', () => {
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const items: RevertFixtureItem[] = JSON.parse(raw);

    for (const item of items) {
      expect(item.groundTruthDecisionIds.length).toBeGreaterThanOrEqual(1);
      expect(item.touchedFiles.length).toBeGreaterThanOrEqual(1);

      for (const f of item.touchedFiles) {
        expect(f).not.toContain('..');
        expect(path.isAbsolute(f)).toBe(false);
      }
    }
  });

  it('verifies distribution across the triad showcase workspaces', () => {
    const raw = fs.readFileSync(fixturePath, 'utf-8');
    const items: RevertFixtureItem[] = JSON.parse(raw);

    const syntheticCases = items.filter((i) => i.workspaceId === 'synthetic-demo');
    const emberCases = items.filter((i) => i.workspaceId === 'ember-adr-showcase');
    const dogfoodCases = items.filter((i) => i.workspaceId === 'argon-dogfood');

    expect(syntheticCases.length).toBe(8);
    expect(emberCases.length).toBe(10);
    expect(dogfoodCases.length).toBe(6);
  });
});
