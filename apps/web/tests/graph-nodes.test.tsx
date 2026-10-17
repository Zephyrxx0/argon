import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ReactFlowProvider } from '@xyflow/react';
import { PersonNode } from '@/components/graph/nodes';
import type { FlowNode } from '@/lib/graph/model';

const personData = (props: Record<string, unknown>): FlowNode['data'] => ({
  label: 'Zephyrxx0',
  kind: 'person',
  type: 'Person',
  properties: props,
  superseded: false,
  visual: 'idle',
  selected: false,
  pulse: false,
  direction: 'LR',
});

const renderNode = (data: FlowNode['data']) =>
  render(
    <ReactFlowProvider>
      <PersonNode
        id="p1"
        type="person"
        data={data}
        selected={false}
        zIndex={0}
        isConnectable={false}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
        deletable
        selectable
        draggable
      />
    </ReactFlowProvider>
  );

describe('PersonNode avatar', () => {
  it('renders a GitHub avatar when one is provided', () => {
    renderNode(personData({ role: 'Top contributor', commits: 100, avatarUrl: 'https://avatars.githubusercontent.com/Zephyrxx0?size=80' }));
    const img = screen.getByTestId('person-avatar');
    expect(img).toHaveAttribute('src', 'https://avatars.githubusercontent.com/Zephyrxx0?size=80');
  });

  it('falls back to initials when there is no avatar', () => {
    renderNode(personData({ role: 'Author', commits: 3 }));
    expect(screen.queryByTestId('person-avatar')).toBeNull();
    expect(screen.getByText('Z')).toBeInTheDocument();
  });

  it('falls back to initials if the avatar image fails to load', () => {
    renderNode(personData({ commits: 1, avatarUrl: 'https://avatars.githubusercontent.com/ghost?size=80' }));
    const img = screen.getByTestId('person-avatar');
    fireEvent.error(img);
    expect(screen.queryByTestId('person-avatar')).toBeNull();
    expect(screen.getByText('Z')).toBeInTheDocument();
  });
});
