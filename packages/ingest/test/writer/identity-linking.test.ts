import { describe, it, expect, vi } from 'vitest';
import { linkUserToMinedPersons, FalkorIngestWriter } from '../../src/writer/falkordb.js';
import { hashAuthorEmail } from '../../src/git/author.js';
import * as queries from '../../src/writer/queries.js';

describe('Author-to-User Identity Linking (Task 07-02-03, TENANT-02, D-13, D-14)', () => {
  it('links user to mined person nodes by computing email hashes, noreply formats, and passing normalized login', async () => {
    let capturedQuery = '';
    let capturedParams: any = null;

    const mockClient: any = {
      query: vi.fn().mockImplementation((_workspaceId: string, query: string, params: any) => {
        capturedQuery = query;
        capturedParams = params;
        return Promise.resolve({
          data: [{ linked_count: 2 }],
        });
      }),
    };

    const userId = 'usr_github_42';
    const userLogin = 'OctocatDeveloper';
    const userEmails = ['octo@github.com', 'work@octo.io'];

    const result = await linkUserToMinedPersons(
      mockClient,
      'test-workspace',
      userId,
      userLogin,
      userEmails
    );

    expect(result.linkedCount).toBe(2);
    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(capturedQuery).toBe(queries.LINK_USER_TO_PERSONS_QUERY);

    // Verify params
    expect(capturedParams.userId).toBe('usr_github_42');
    expect(capturedParams.userLogin).toBe('OctocatDeveloper');
    expect(capturedParams.userEmails).toEqual(['octo@github.com', 'work@octo.io']);

    // Verify computed hashes
    const expectedPrimaryHash1 = hashAuthorEmail('octo@github.com');
    const expectedPrimaryHash2 = hashAuthorEmail('work@octo.io');
    const expectedNoreply1 = hashAuthorEmail('octocatdeveloper@users.noreply.github.com');
    const expectedNoreply2 = hashAuthorEmail('usr_github_42+octocatdeveloper@users.noreply.github.com');

    expect(capturedParams.userEmailHashes).toContain(expectedPrimaryHash1);
    expect(capturedParams.userEmailHashes).toContain(expectedPrimaryHash2);
    expect(capturedParams.userEmailHashes).toContain(expectedNoreply1);
    expect(capturedParams.userEmailHashes).toContain(expectedNoreply2);
  });

  it('FalkorIngestWriter.linkUserToMinedPersons delegates to linkUserToMinedPersons with workspaceId', async () => {
    const mockClient: any = {
      query: vi.fn().mockResolvedValue({
        data: [{ linked_count: 1 }],
      }),
    };

    const writer = new FalkorIngestWriter(mockClient, 'ws-argon-prod');
    const res = await writer.linkUserToMinedPersons('usr_99', 'dev-alice', ['alice@acme.com']);

    expect(res.linkedCount).toBe(1);
    expect(mockClient.query).toHaveBeenCalledWith(
      'ws-argon-prod',
      queries.LINK_USER_TO_PERSONS_QUERY,
      expect.objectContaining({
        userId: 'usr_99',
        userLogin: 'dev-alice',
      })
    );
  });

  it('handles empty user emails gracefully without error', async () => {
    const mockClient: any = {
      query: vi.fn().mockResolvedValue({
        data: [{ linked_count: 0 }],
      }),
    };

    const result = await linkUserToMinedPersons(
      mockClient,
      'test-workspace',
      'usr_anon_named',
      'SoloDeveloper'
    );

    expect(result.linkedCount).toBe(0);
    expect(mockClient.query).toHaveBeenCalled();
  });
});
