'use client';

import React, { memo, useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { clsx } from 'clsx';
import { NODE_SIZE, type FlowNode, type NodeKind } from '@/lib/graph/model';

/**
 * Shared chrome for every node type: fixed footprint, hard border, state styling.
 * Every text slot inside is clamped (`line-clamp-*` / `truncate`) so copy can never
 * escape the box; the untruncated text is available via `title` and the inspector.
 */
function NodeShell({
  data,
  kind,
  children,
}: {
  data: FlowNode['data'];
  kind: NodeKind;
  children: React.ReactNode;
}) {
  const { width, height } = NODE_SIZE[kind];
  const horizontal = data.direction === 'LR';

  return (
    <div
      style={{ width, height }}
      data-kind={kind}
      data-visual={data.visual}
      data-selected={data.selected || undefined}
      className={clsx(
        'argon-node relative box-border overflow-hidden font-mono transition-[opacity,background-color,border-color] duration-150',
        kind === 'component' ? 'border-2' : 'border',
        // resting
        !data.selected && 'bg-black text-white',
        !data.selected && data.visual !== 'active' && (kind === 'component' ? 'border-white' : 'border-[#4a4a4a]'),
        // hover / neighbourhood
        !data.selected && data.visual === 'active' && 'border-white',
        // selected = inverted
        data.selected && 'border-white bg-white text-black',
        // state: superseded decisions read as retired
        data.superseded && !data.selected && 'border-dashed border-danger',
        data.visual === 'dim' && 'opacity-25',
        data.pulse && 'argon-pulse'
      )}
    >
      <Handle
        type="target"
        position={horizontal ? Position.Left : Position.Top}
        isConnectable={false}
        className="!pointer-events-none !h-px !w-px !border-0 !bg-transparent !opacity-0"
      />
      {children}
      <Handle
        type="source"
        position={horizontal ? Position.Right : Position.Bottom}
        isConnectable={false}
        className="!pointer-events-none !h-px !w-px !border-0 !bg-transparent !opacity-0"
      />
    </div>
  );
}

const Tag = ({ children, selected }: { children: React.ReactNode; selected: boolean }) => (
  <span
    className={clsx(
      'shrink-0 border px-1 py-px text-[9px] font-bold uppercase leading-none tracking-[0.18em]',
      selected ? 'border-black/60 text-black' : 'border-white/40 text-white/70'
    )}
  >
    {children}
  </span>
);

const muted = (selected: boolean) => (selected ? 'text-black/65' : 'text-[#9a9a9a]');
const str = (v: unknown) => (v == null || v === '' ? null : String(v));

/* ───────────────────────── Component ───────────────────────── */
export const ComponentNode = memo(function ComponentNode({ data }: NodeProps<FlowNode>) {
  const reason = str(data.properties.reason) ?? str(data.properties.tier);
  return (
    <NodeShell data={data} kind="component">
      <div className="flex h-full flex-col gap-1 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <Tag selected={data.selected}>Component</Tag>
          {str(data.properties.coupling) && (
            <span className={clsx('truncate text-[9px] uppercase tracking-wider', muted(data.selected))}>
              {String(data.properties.coupling)} coupling
            </span>
          )}
        </div>
        <div className="truncate text-[14px] font-black leading-[18px] tracking-tight" title={data.label}>
          {data.label}
        </div>
        {reason && (
          <p className={clsx('line-clamp-2 text-[11px] leading-[15px]', muted(data.selected))} title={reason}>
            {reason}
          </p>
        )}
      </div>
    </NodeShell>
  );
});

/* ───────────────────────── Decision ───────────────────────── */
export const DecisionNode = memo(function DecisionNode({ data }: NodeProps<FlowNode>) {
  const status = str(data.properties.status);
  const constraint = str(data.properties.constraint) ?? str(data.properties.relevance);
  const dirTitle = str(data.properties.title);
  const hasSeparateTitle = Boolean(dirTitle && dirTitle !== data.label);
  const title = hasSeparateTitle ? dirTitle! : data.label;
  return (
    <NodeShell data={data} kind="decision">
      <div className="flex h-full flex-col gap-1 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Tag selected={data.selected}>Decision</Tag>
            {hasSeparateTitle && (
              <span className={clsx('truncate text-[10px] font-bold', muted(data.selected))} title={data.label}>
                {data.label}
              </span>
            )}
          </div>
          {status && (
            <span
              className={clsx(
                'shrink-0 text-[9px] font-bold uppercase tracking-[0.18em]',
                data.superseded ? 'text-danger' : data.selected ? 'text-black' : 'text-white'
              )}
            >
              {data.superseded ? '✕ ' : '● '}
              {status}
            </span>
          )}
        </div>
        <div
          className={clsx(
            'line-clamp-2 text-[13px] font-bold leading-[18px]',
            data.superseded && !data.selected && 'text-[#9a9a9a] line-through decoration-danger/70'
          )}
          title={title}
        >
          {title}
        </div>
        {constraint && (
          <p className={clsx('line-clamp-2 text-[11px] leading-[15px]', muted(data.selected))} title={constraint}>
            {constraint}
          </p>
        )}
      </div>
    </NodeShell>
  );
});

/* ───────────────────────── Person ───────────────────────── */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || '?';

export const PersonNode = memo(function PersonNode({ data }: NodeProps<FlowNode>) {
  const role = str(data.properties.role);
  const commits = data.properties.commits;
  const meta = [role, commits != null ? `${commits} commits` : null].filter(Boolean).join(' · ');
  const avatarUrl = str(data.properties.avatarUrl) || undefined;
  const [avatarOk, setAvatarOk] = useState(true);
  return (
    <NodeShell data={data} kind="person">
      <div className="flex h-full items-center gap-3 px-3">
        <div
          className={clsx(
            'flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden border text-[12px] font-black',
            data.selected ? 'border-black' : 'border-white/50'
          )}
        >
          {avatarUrl && avatarOk ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              data-testid="person-avatar"
              width={36}
              height={36}
              loading="lazy"
              className="h-full w-full object-cover"
              onError={() => setAvatarOk(false)}
            />
          ) : (
            <span aria-hidden="true">{initials(data.label)}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-bold leading-[17px]" title={data.label}>
            {data.label}
          </div>
          <div className={clsx('truncate text-[10px] uppercase leading-[15px] tracking-wider', muted(data.selected))} title={meta}>
            {meta || 'Contributor'}
          </div>
        </div>
      </div>
    </NodeShell>
  );
});

/* ───────────────────────── File ───────────────────────── */
export const FileNode = memo(function FileNode({ data }: NodeProps<FlowNode>) {
  const path = str(data.properties.path) ?? data.label;
  const slash = path.lastIndexOf('/');
  const dir = slash >= 0 ? path.slice(0, slash + 1) : '';
  const base = slash >= 0 ? path.slice(slash + 1) : path;
  return (
    <NodeShell data={data} kind="file">
      <div className="flex h-full items-center gap-2 px-3" title={path}>
        <span aria-hidden="true" className={clsx('shrink-0 text-[10px]', muted(data.selected))}>
          ▤
        </span>
        <span className="min-w-0 flex-1 truncate text-[12px] leading-4">
          {dir && <span className={muted(data.selected)}>{dir}</span>}
          <span className="font-bold">{base}</span>
        </span>
      </div>
    </NodeShell>
  );
});

/* ───────────────────────── Fallback ───────────────────────── */
export const EntityNode = memo(function EntityNode({ data }: NodeProps<FlowNode>) {
  return (
    <NodeShell data={data} kind="entity">
      <div className="flex h-full flex-col justify-center gap-1 px-3">
        <Tag selected={data.selected}>{data.type}</Tag>
        <div className="truncate text-[13px] font-bold" title={data.label}>
          {data.label}
        </div>
      </div>
    </NodeShell>
  );
});

export const nodeTypes = {
  component: ComponentNode,
  decision: DecisionNode,
  person: PersonNode,
  file: FileNode,
  entity: EntityNode,
};
