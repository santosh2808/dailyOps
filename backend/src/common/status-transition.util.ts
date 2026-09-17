import { BadRequestException } from '@nestjs/common';

// QA bug-fix pass (TC-080): shared helper enforcing a simple forward-only
// state machine for entities with a linear production/workflow sequence
// (SalesOrder, JobExecutionOrder). Deliberately generic-but-small — Lead's
// rule is different enough (see leads.service.ts's own inline check) that
// forcing it through this same helper would make both harder to read.
//
// Rules:
// - No-op (current === target) is always allowed.
// - Once `current` is in `terminal` or `sideTerminal`, no further change is
//   allowed via this path at all ("finished/cancelled records cannot be
//   reopened" — there is no separate reopen/revert action to preserve today).
// - Moving to a `sideTerminal` status (e.g. CANCELLED) is allowed from any
//   non-terminal current status — this is the one legitimate "jump" every
//   linear workflow here supports.
// - Otherwise, the only legal move is to the very next status in `order`
//   ("production stages cannot be skipped") — every other target (backward,
//   or forward by more than one stage) is rejected with a clear message.
export function assertForwardOnlyTransition(params: {
  current: string;
  target: string;
  order: readonly string[];
  terminal: readonly string[];
  sideTerminal?: readonly string[];
  entityLabel: string;
}): void {
  const { current, target, order, terminal, sideTerminal = [], entityLabel } = params;

  if (current === target) {
    return;
  }

  if (terminal.includes(current) || sideTerminal.includes(current)) {
    throw new BadRequestException(`${entityLabel} is already ${current} and its status cannot be changed further.`);
  }

  if (sideTerminal.includes(target)) {
    return;
  }

  const currentIndex = order.indexOf(current);
  const targetIndex = order.indexOf(target);

  if (currentIndex === -1 || targetIndex === -1) {
    throw new BadRequestException(`${entityLabel} cannot move from ${current} to ${target}.`);
  }

  if (targetIndex !== currentIndex + 1) {
    const nextStage = order[currentIndex + 1];
    throw new BadRequestException(
      nextStage
        ? `${entityLabel} cannot move from ${current} directly to ${target} — the next stage is ${nextStage}.`
        : `${entityLabel} is already at its final stage (${current}) and cannot move to ${target}.`,
    );
  }
}
