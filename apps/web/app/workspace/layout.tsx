import type { Metadata } from 'next';
import { AuthProvider } from '@/app/providers';

export const metadata: Metadata = {
  title: 'Workspace — Argon',
  description: 'Evidence-backed architectural briefings over the FalkorDB knowledge graph.',
};

/**
 * The AuthProvider mints an anonymous guest session on mount, so it is scoped to
 * the workspace only. The public landing page stays free of session side effects.
 */
export default function WorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AuthProvider>{children}</AuthProvider>;
}
