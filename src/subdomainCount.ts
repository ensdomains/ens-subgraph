// Domain.subdomainCount: how many of a name's direct children are live.
//
// A name is live while it has an owner, a resolver, or a live child of its
// own. That is the ENSv1 subgraph's deletion convention: a name whose owner
// and resolver were both cleared, and which has no children left, reads as
// deleted and stops counting as its parent's child, and that can make the
// parent itself read as deleted, and so on up.
//
// The count only ever changes when a name crosses that line. The original
// mapping decremented the parent on every save of a row that was in the
// deleted state, so a second event for an already deleted subname (another
// NewOwner to the zero address, a Transfer, a NewResolver) took a second
// child off the parent, and it never counted a subname again when it was
// re-created, so a parent whose subname was deleted and made again read as
// having none. Counts went wrong, and negative, for any name with such a
// history. Every writer now goes through the same two steps: note whether the
// row counted before the change (countsAsChild), and after saving it pass the
// difference to the parent (addToSubdomainCount), which carries it upward
// when the parent crosses the line in turn.
//
// Used by the ENSv1 registry handlers (ensRegistry.ts), the ENSv2 projection
// and its retirement (ensv2Domain.ts, ensv2Paths.ts), and the sweeps that
// take a resolver off ENSv1 rows (legacyGovernance.ts).
import { Domain } from "./types/schema";
import { EMPTY_ADDRESS } from "./utils";

// Longest chain of parents followed when a change is carried upward: a name
// has at most 127 labels.
const MAX_DEPTH = 128;

// True when `domain` is counted in its parent's subdomainCount: it has a
// parent and is live. Call it on a row as it is stored, before changing it,
// and again after.
export function countsAsChild(domain: Domain): boolean {
  if (!domain.parent) {
    return false;
  }
  if (domain.resolver) {
    return true;
  }
  return domain.owner != EMPTY_ADDRESS || domain.subdomainCount > 0;
}

// `delta` children of `parentId` became live (positive) or stopped being so
// (negative). Loads the parent fresh and saves it: a caller that holds the
// parent row must not save its own copy afterwards.
export function addToSubdomainCount(parentId: string, delta: i32): void {
  let id = parentId;
  let change = delta;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (change == 0) {
      return;
    }
    let parent = Domain.load(id);
    if (parent == null) {
      return;
    }
    let counted = countsAsChild(parent);
    let next = parent.subdomainCount + change;
    parent.subdomainCount = next < 0 ? 0 : next;
    parent.save();
    if (counted == countsAsChild(parent)) {
      return;
    }
    // It crossed the line, so it has a parent (countsAsChild was true on one
    // side).
    change = counted ? -1 : 1;
    id = parent.parent!;
  }
}
