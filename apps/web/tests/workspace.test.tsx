import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WorkspaceSwitcher, SHOWCASE_WORKSPACES } from '@/components/workspace/workspace-switcher';
import { IngestModal, validateGitUrl } from '@/components/workspace/ingest-modal';

describe('validateGitUrl (SSRF & Security Validation)', () => {
  it('approves valid public HTTPS repository URLs', () => {
    expect(validateGitUrl('https://github.com/emberjs/rfcs').valid).toBe(true);
    expect(validateGitUrl('https://gitlab.com/group/subgroup/project.git').valid).toBe(true);
  });

  it('rejects non-HTTPS URLs', () => {
    const resHttp = validateGitUrl('http://github.com/org/repo');
    expect(resHttp.valid).toBe(false);
    expect(resHttp.error).toMatch(/Only secure public https:\/\/ repository URLs are permitted/i);

    const resFile = validateGitUrl('file:///etc/passwd');
    expect(resFile.valid).toBe(false);

    const resSsh = validateGitUrl('git@github.com:org/repo.git');
    expect(resSsh.valid).toBe(false);
  });

  it('rejects loopback and private network IP addresses (Threat T-04-03)', () => {
    expect(validateGitUrl('https://localhost/org/repo').valid).toBe(false);
    expect(validateGitUrl('https://127.0.0.1/org/repo').valid).toBe(false);
    expect(validateGitUrl('https://192.168.1.1/org/repo').valid).toBe(false);
    expect(validateGitUrl('https://10.0.0.5/org/repo').valid).toBe(false);
    expect(validateGitUrl('https://169.254.169.254/latest/meta-data').valid).toBe(false);
  });
});

describe('WorkspaceSwitcher Component', () => {
  it('renders active workspace name and triggers dropdown on click', () => {
    const onSelectMock = vi.fn();
    render(
      <WorkspaceSwitcher
        workspaces={SHOWCASE_WORKSPACES}
        currentWorkspaceId="ember-adr-showcase"
        onSelectWorkspace={onSelectMock}
      />
    );

    expect(screen.getByText('Ember.js ADR Corpus')).toBeInTheDocument();

    const trigger = screen.getByTestId('workspace-switcher-trigger');
    fireEvent.click(trigger);

    expect(screen.getByTestId('workspace-dropdown')).toBeInTheDocument();
    expect(screen.getByText('Astro RFC Corpus')).toBeInTheDocument();
  });

  it('selects new workspace from dropdown list', () => {
    const onSelectMock = vi.fn();
    render(
      <WorkspaceSwitcher
        workspaces={SHOWCASE_WORKSPACES}
        currentWorkspaceId="ember-adr-showcase"
        onSelectWorkspace={onSelectMock}
      />
    );

    fireEvent.click(screen.getByTestId('workspace-switcher-trigger'));
    const astroItem = screen.getByTestId('workspace-item-astro-rfc-showcase');
    fireEvent.click(astroItem);

    expect(onSelectMock).toHaveBeenCalledWith('astro-rfc-showcase');
  });

  it('opens IngestModal when clicking + INGEST GIT REPO', () => {
    render(
      <WorkspaceSwitcher
        workspaces={SHOWCASE_WORKSPACES}
        currentWorkspaceId="ember-adr-showcase"
        onSelectWorkspace={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('workspace-switcher-trigger'));
    const ingestBtn = screen.getByTestId('open-ingest-modal-button');
    fireEvent.click(ingestBtn);

    expect(screen.getByTestId('ingest-modal')).toBeInTheDocument();
  });
});

describe('IngestModal Component', () => {
  it('displays validation error when attempting to ingest invalid URL', () => {
    const onCompleteMock = vi.fn();
    render(
      <IngestModal
        open={true}
        onOpenChange={vi.fn()}
        onIngestComplete={onCompleteMock}
      />
    );

    const publicTab = screen.queryByTestId('tab-public-git-url');
    if (publicTab) {
      fireEvent.click(publicTab);
    }

    const input = screen.getByTestId('ingest-url-input');
    fireEvent.change(input, { target: { value: 'http://insecure-repo.com/foo' } });

    const submitBtn = screen.getByTestId('submit-ingest-button');
    fireEvent.click(submitBtn);

    expect(screen.getByTestId('ingest-validation-error')).toBeInTheDocument();
    expect(onCompleteMock).not.toHaveBeenCalled();
  });
});


describe('WorkspaceSwitcher per-account custom workspaces + removal', () => {
  beforeEach(() => window.localStorage.clear());

  const custom = (ownerId: string | null, items: Array<{ id: string; name: string }>) =>
    window.localStorage.setItem(
      `argon.workspaces.custom.${ownerId ?? 'guest'}`,
      JSON.stringify(items.map((i) => ({ ...i, repoUrl: 'x' })))
    );

  const open = () => fireEvent.click(screen.getByTestId('workspace-switcher-trigger'));

  it('shows only the signed-in account custom workspaces, never another account', () => {
    custom('user-alice', [{ id: 'pub-alice-repo', name: 'alice/repo' }]);
    custom('user-bob', [{ id: 'pub-bob-secret', name: 'bob/secret' }]);
    custom(null, [{ id: 'pub-guest-x', name: 'guest/x' }]);

    render(<WorkspaceSwitcher ownerId="user-alice" onSelectWorkspace={vi.fn()} />);
    open();
    expect(screen.getByTestId('workspace-item-pub-alice-repo')).toBeInTheDocument();
    expect(screen.queryByTestId('workspace-item-pub-bob-secret')).toBeNull();
    expect(screen.queryByTestId('workspace-item-pub-guest-x')).toBeNull();
    // showcase workspaces are always present
    expect(screen.getByTestId('workspace-item-ember-adr-showcase')).toBeInTheDocument();
  });

  it('removes a custom workspace, falls back to showcase when it was active', () => {
    custom('user-alice', [{ id: 'pub-alice-repo', name: 'alice/repo' }]);
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    render(
      <WorkspaceSwitcher
        ownerId="user-alice"
        currentWorkspaceId="pub-alice-repo"
        onSelectWorkspace={onSelect}
        onRemoveWorkspace={onRemove}
      />
    );
    open();
    // showcase entries cannot be removed
    expect(screen.queryByTestId('workspace-remove-ember-adr-showcase')).toBeNull();

    fireEvent.click(screen.getByTestId('workspace-remove-pub-alice-repo'));
    expect(onRemove).toHaveBeenCalledWith('pub-alice-repo');
    // was the active one => falls back to the default showcase
    expect(onSelect).toHaveBeenCalledWith('ember-adr-showcase');
    // and it is gone from storage + the list
    expect(window.localStorage.getItem('argon.workspaces.custom.user-alice')).toBe('[]');
    expect(screen.queryByTestId('workspace-item-pub-alice-repo')).toBeNull();
  });
});
