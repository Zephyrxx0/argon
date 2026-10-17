import { hashAuthorEmail } from '../git/author.js';

export interface KnownPerson {
  id: string;
  name: string;
}

/** `dependabot[bot]`, `github-actions[bot]`, ...: automation, not people who "know" the code. */
export function isBotLogin(login: string | null | undefined): boolean {
  return !login || /\[bot\]$/i.test(login);
}

/** Person.id for a GitHub account that could not be matched to a git author. */
export const githubPersonId = (login: string): string => `gh_${login.toLowerCase()}`;

/**
 * Maps GitHub logins to the `Person` nodes already created from git history.
 *
 * Git history identifies people by a hash of their commit email; GitHub reviews / CODEOWNERS only
 * give a login. Resolution order (most to least reliable):
 *  1. votes: GitHub says commit <sha> is by <login>, and we know who authored <sha> in git
 *  2. the account's `noreply` commit email (`<login>@users.noreply.github.com`, `<id>+<login>@...`)
 *  3. a unique git author whose name equals the login
 *  4. otherwise a new `Person {id: 'gh_<login>'}`, so reviews are never dropped
 * No raw email is ever stored: the noreply addresses are hashed exactly like commit emails.
 */
export class IdentityResolver {
  private readonly personIds = new Set<string>();
  private readonly idsByName = new Map<string, string[]>();
  private readonly votes = new Map<string, Map<string, number>>();
  private readonly resolved = new Map<string, string>();
  private readonly created = new Map<string, string>(); // person id -> login
  private readonly linked = new Map<string, string>(); // existing person id -> login

  constructor(people: Iterable<KnownPerson>) {
    for (const p of people) {
      this.personIds.add(p.id);
      const key = p.name.trim().toLowerCase();
      if (key) this.idsByName.set(key, [...(this.idsByName.get(key) ?? []), p.id]);
    }
  }

  /** Records that GitHub attributes a commit to `login`, and git attributes it to `personId`. */
  observe(login: string | null | undefined, personId: string | undefined): void {
    if (!login || !personId || !this.personIds.has(personId)) return;
    const key = login.toLowerCase();
    const perPerson = this.votes.get(key) ?? new Map<string, number>();
    perPerson.set(personId, (perPerson.get(personId) ?? 0) + 1);
    this.votes.set(key, perPerson);
    this.resolved.delete(key);
  }

  /** The Person.id for a login (never throws; unmatched accounts become `gh_<login>` persons). */
  resolve(login: string, githubUserId?: number): string {
    const key = login.toLowerCase();
    const cached = this.resolved.get(key);
    if (cached) return cached;

    let id = this.fromVotes(key) ?? this.fromNoreply(key, githubUserId) ?? this.fromName(key);
    if (id) {
      this.linked.set(id, this.linked.get(id) ?? login);
    } else {
      id = githubPersonId(login);
      this.created.set(id, login);
    }
    this.resolved.set(key, id);
    return id;
  }

  /** Person.id for an email address that matches a git author, else null (emails are not stored). */
  resolveEmail(email: string): string | null {
    const id = hashAuthorEmail(email);
    return this.personIds.has(id) ? id : null;
  }

  /** `gh_<login>` persons that must be created. */
  get newPersons(): Array<{ id: string; login: string }> {
    return [...this.created].map(([id, login]) => ({ id, login }));
  }

  /** Existing git-history persons now known to have a GitHub login. */
  get linkedPersons(): Array<{ id: string; login: string }> {
    return [...this.linked].map(([id, login]) => ({ id, login }));
  }

  private fromVotes(key: string): string | undefined {
    const perPerson = this.votes.get(key);
    if (!perPerson) return undefined;
    let best: string | undefined;
    let bestN = 0;
    for (const [id, n] of perPerson) {
      if (n > bestN || (n === bestN && best !== undefined && id < best)) {
        best = id;
        bestN = n;
      }
    }
    return best;
  }

  private fromNoreply(key: string, githubUserId?: number): string | undefined {
    const candidates = [`${key}@users.noreply.github.com`];
    if (githubUserId) candidates.unshift(`${githubUserId}+${key}@users.noreply.github.com`);
    for (const email of candidates) {
      const id = hashAuthorEmail(email);
      if (this.personIds.has(id)) return id;
    }
    return undefined;
  }

  private fromName(key: string): string | undefined {
    const ids = this.idsByName.get(key);
    return ids && ids.length === 1 ? ids[0] : undefined;
  }
}
