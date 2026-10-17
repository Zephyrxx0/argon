'use client';

import React, { memo } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import { clsx } from 'clsx';
import type { FlowEdge } from '@/lib/graph/model';

/**
 * Right-angled, square-cornered connector with a label plate. The label sits on a black
 * plate so it never collides with the line, and dims/highlights with the edge.
 */
export const RelationEdge = memo(function RelationEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<FlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 0,
    offset: 20,
  });

  const visual = data?.visual ?? 'idle';
  const supersession = data?.supersession ?? false;
  const stroke = supersession ? 'var(--color-danger)' : visual === 'active' ? '#ffffff' : '#5a5a5a';

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        interactionWidth={16}
        className={clsx(visual === 'active' && 'argon-edge-march')}
        style={{
          stroke,
          strokeWidth: visual === 'active' ? 2 : 1.25,
          strokeDasharray: supersession ? '6 4' : visual === 'active' ? '8 6' : undefined,
          opacity: visual === 'dim' ? 0.15 : 1,
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              opacity: visual === 'dim' ? 0.2 : 1,
            }}
            className={clsx(
              'nodrag nopan pointer-events-none absolute border bg-black px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase leading-none tracking-[0.16em] transition-opacity',
              supersession
                ? 'border-danger text-danger'
                : visual === 'active'
                  ? 'border-white text-white'
                  : 'border-[#4a4a4a] text-[#9a9a9a]'
            )}
          >
            {data.label.replace(/_/g, ' ')}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export const edgeTypes = { relation: RelationEdge };
