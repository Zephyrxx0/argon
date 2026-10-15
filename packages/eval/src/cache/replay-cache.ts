import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ReplayCache {
  private cache: Record<string, string[]> = {};
  private readonly cacheFilePath: string;

  constructor(customPath?: string) {
    if (customPath) {
      this.cacheFilePath = path.resolve(customPath);
    } else {
      const fromDir = path.resolve(__dirname, '../../fixtures/cache/llm-cache.json');
      const fromCwd = path.resolve(process.cwd(), 'packages/eval/fixtures/cache/llm-cache.json');
      this.cacheFilePath = fs.existsSync(fromDir) ? fromDir : fromCwd;
    }
    this.load();
  }

  private load(): void {
    if (fs.existsSync(this.cacheFilePath)) {
      try {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          this.cache = parsed;
        } else {
          this.cache = {};
        }
      } catch {
        this.cache = {};
      }
    } else {
      this.cache = {};
    }
  }

  public save(): void {
    const dir = path.dirname(this.cacheFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.cacheFilePath, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  public hashPrompt(prompt: string): string {
    return crypto.createHash('sha256').update(prompt.trim()).digest('hex');
  }

  public has(prompt: string): boolean {
    const key = this.hashPrompt(prompt);
    return Object.prototype.hasOwnProperty.call(this.cache, key);
  }

  public get(prompt: string): string[] | null {
    const key = this.hashPrompt(prompt);
    if (Object.prototype.hasOwnProperty.call(this.cache, key)) {
      return this.cache[key] ?? null;
    }
    return null;
  }

  public set(prompt: string, decisionIds: string[]): void {
    const key = this.hashPrompt(prompt);
    this.cache[key] = decisionIds;
    this.save();
  }

  public size(): number {
    return Object.keys(this.cache).length;
  }

  public getAll(): Record<string, string[]> {
    return { ...this.cache };
  }
}
