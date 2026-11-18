// v2.3.5: at most MAX_NAMES_BELOW_NAME names are projected below one name
// (ensv2Paths.ts, ENSv2SubtreeSize).
//
// Removing a link, an unregistration and a re-registration retire every name
// below one slot in a single handler, and a handler never gives memory back.
// Without a limit on what can be below a slot, a large enough subtree ends
// in a handler that cannot complete, which stops the subgraph. So the names
// below every name are counted, per path and per slot, and a name that would
// take a slot above it past the limit is not projected.
import { Address, BigInt, ByteArray, Bytes, crypto, log } from "@graphprotocol/graph-ts";
import {
  afterEach,
  assert,
  clearStore,
  dataSourceMock,
  test,
} from "matchstick-as/assembly/index";
import {
  handleLabelRegistered,
  handleLabelUnregistered,
  handleSubregistryUpdated,
} from "../src/ensv2Registry";
import {
  MAX_BACKFILL_SLOTS_PER_EVENT,
  MAX_NAMES_BELOW_NAME,
  setMaxBackfillSlotsPerEventForTesting,
  setMaxNamesBelowNameForTesting,
} from "../src/ensv2Paths";
import {
  namespaceId,
  namespacePathIndexId,
  nameSlotId,
  pathNamehash,
  toSlotId,
} from "../src/ensv2Utils";
import {
  Domain,
  ENSv2NamePath,
  ENSv2Namespace,
  ENSv2NamespacePathIndex,
  ENSv2NameSlot,
  ENSv2SubtreeSize,
} from "../src/types/schema";
import {
  createLabelRegisteredEvent,
  createLabelUnregisteredEvent,
  createSubregistryUpdatedEvent,
} from "./ensv2TestEvents";

const ROOT_REGISTRY = "0xB458D6a3a77919449d03e7A6903C26827c1eC43f";
const ETH_REGISTRY = "0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4";
const R1 = "0xa1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
const R2 = "0xa2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2";
const OWNER = "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7";
const EMPTY = "0x0000000000000000000000000000000000000000";
const ROOT_NODE = Bytes.fromHexString(
  "0x0000000000000000000000000000000000000000000000000000000000000000"
);

function lh(label: string): Bytes {
  return Bytes.fromByteArray(crypto.keccak256(ByteArray.fromUTF8(label)));
}

function tokenOf(label: string): BigInt {
  let hash = lh(label);
  let le = new Bytes(32);
  for (let i = 0; i < 32; i++) {
    le[i] = hash[31 - i];
  }
  return BigInt.fromUnsignedBytes(le);
}

function child(parent: Bytes, label: string): Bytes {
  return pathNamehash(parent, lh(label));
}

function register(registry: string, label: string): void {
  handleLabelRegistered(
    createLabelRegisteredEvent(registry, tokenOf(label), lh(label), label, OWNER)
  );
}

function unregister(registry: string, label: string): void {
  handleLabelUnregistered(createLabelUnregisteredEvent(registry, tokenOf(label)));
}

function link(registry: string, label: string, subregistry: string): void {
  handleSubregistryUpdated(
    createSubregistryUpdatedEvent(registry, tokenOf(label), subregistry)
  );
}

function slotId(registry: string, label: string): Bytes {
  return nameSlotId(Address.fromString(registry), toSlotId(tokenOf(label)));
}

function pathCountOf(registry: string, label: string): i32 {
  return ENSv2NameSlot.load(slotId(registry, label))!.pathCount;
}

// Names counted below a path (by namehash) or a slot (by slot id).
function below(id: Bytes): i32 {
  let row = ENSv2SubtreeSize.load(id);
  return row == null ? 0 : row.paths;
}

function ns(registry: string, base: Bytes): string {
  return namespaceId(Address.fromString(registry), base).toHexString();
}

// "eth" in the RootRegistry with the ETHRegistry below it; returns namehash("eth").
function setUpEth(): Bytes {
  dataSourceMock.setNetwork("sepolia");
  register(ROOT_REGISTRY, "eth");
  link(ROOT_REGISTRY, "eth", ETH_REGISTRY);
  return child(ROOT_NODE, "eth");
}

afterEach(() => {
  setMaxNamesBelowNameForTesting(MAX_NAMES_BELOW_NAME);
  setMaxBackfillSlotsPerEventForTesting(MAX_BACKFILL_SLOTS_PER_EVENT);
  dataSourceMock.resetValues();
  clearStore();
});

test("names below a name are counted on the name and on its slot, at every depth, and uncounted when they are retired", () => {
  let eth = setUpEth();
  register(ETH_REGISTRY, "x");
  let x = child(eth, "x");
  link(ETH_REGISTRY, "x", R1);
  register(R1, "a");
  register(R1, "b");
  register(R1, "c");

  assert.i32Equals(3, below(x));
  assert.i32Equals(3, below(slotId(ETH_REGISTRY, "x")));
  assert.i32Equals(3, Domain.load(x.toHexString())!.subdomainCount);
  // Names directly under the RootRegistry are not counted: every .eth
  // registration would rewrite the row.
  assert.notInStore("ENSv2SubtreeSize", eth.toHexString());
  assert.notInStore("ENSv2SubtreeSize", slotId(ROOT_REGISTRY, "eth").toHexString());

  let a = child(x, "a");
  link(R1, "a", R2);
  register(R2, "p");
  register(R2, "q");
  assert.i32Equals(5, below(x));
  assert.i32Equals(5, below(slotId(ETH_REGISTRY, "x")));
  assert.i32Equals(2, below(a));
  assert.i32Equals(2, below(slotId(R1, "a")));

  // A link removed: the names below it go, the name itself stays.
  link(R1, "a", EMPTY);
  assert.i32Equals(3, below(x));
  assert.i32Equals(0, below(a));
  assert.i32Equals(0, below(slotId(R1, "a")));
  // Made again: backfilled and counted again.
  link(R1, "a", R2);
  assert.i32Equals(5, below(x));
  assert.i32Equals(2, below(a));

  unregister(R1, "b");
  assert.i32Equals(4, below(x));
  // An unregistered name takes the names below it along.
  unregister(R1, "a");
  assert.i32Equals(1, below(x));
  assert.i32Equals(1, below(slotId(ETH_REGISTRY, "x")));
  assert.i32Equals(0, below(a));
  assert.i32Equals(0, below(slotId(R1, "a")));
  assert.fieldEquals("ENSv2NamePath", child(a, "p").toHexString(), "active", "false");
  assert.fieldEquals("Domain", child(a, "p").toHexString(), "owner", EMPTY);

  link(ETH_REGISTRY, "x", EMPTY);
  assert.i32Equals(0, below(x));
  assert.i32Equals(0, below(slotId(ETH_REGISTRY, "x")));
  assert.i32Equals(0, Domain.load(x.toHexString())!.subdomainCount);
  assert.fieldEquals("Domain", child(x, "c").toHexString(), "owner", EMPTY);
});

test("a name with the maximum below it takes no more, and a freed place is filled when the link is emitted again", () => {
  let eth = setUpEth();
  register(ETH_REGISTRY, "x");
  let x = child(eth, "x");
  link(ETH_REGISTRY, "x", R1);
  setMaxNamesBelowNameForTesting(2);

  register(R1, "a");
  register(R1, "b");
  register(R1, "c");

  // "c" is registered, and in the native slot graph, but has no path or
  // Domain.
  assert.fieldEquals("ENSv2NameSlot", slotId(R1, "c").toHexString(), "status", "REGISTERED");
  assert.i32Equals(0, pathCountOf(R1, "c"));
  assert.notInStore("ENSv2NamePath", child(x, "c").toHexString());
  assert.notInStore("Domain", child(x, "c").toHexString());
  assert.i32Equals(2, below(x));
  assert.fieldEquals("ENSv2Namespace", ns(R1, x), "materialized", "true");
  assert.fieldEquals("ENSv2Namespace", ns(R1, x), "backfilled", "false");
  assert.fieldEquals("ENSv2Namespace", ns(R1, x), "backfillCursor", "2");
  // Nothing to do until a place is free: not queued.
  assert.entityCount("ENSv2BackfillTask", 0);

  // A place freed by an unregistration goes to the next registration...
  unregister(R1, "a");
  assert.i32Equals(1, below(x));
  register(R1, "d");
  assert.i32Equals(1, pathCountOf(R1, "d"));
  assert.i32Equals(2, below(x));

  // ...and emitting the link again finds no room for "c" while it is full,
  link(ETH_REGISTRY, "x", R1);
  assert.notInStore("ENSv2NamePath", child(x, "c").toHexString());
  assert.fieldEquals("ENSv2Namespace", ns(R1, x), "backfilled", "false");
  // but projects it once there is.
  unregister(R1, "b");
  link(ETH_REGISTRY, "x", R1);
  assert.fieldEquals("Domain", child(x, "c").toHexString(), "name", "c.x.eth");
  assert.fieldEquals("ENSv2Namespace", ns(R1, x), "backfilled", "true");
  assert.i32Equals(2, below(x));
});

test("the limit covers every depth below a name", () => {
  let eth = setUpEth();
  register(ETH_REGISTRY, "x");
  let x = child(eth, "x");
  link(ETH_REGISTRY, "x", R1);
  register(R1, "a");
  let a = child(x, "a");
  link(R1, "a", R2);
  setMaxNamesBelowNameForTesting(3);

  register(R2, "p");
  register(R2, "q");
  // a.x.eth has two names below it and room for a third; x.eth has three.
  register(R2, "r");

  assert.i32Equals(3, below(x));
  assert.i32Equals(2, below(a));
  assert.notInStore("ENSv2NamePath", child(a, "r").toHexString());
  assert.fieldEquals("ENSv2Namespace", ns(R2, a), "backfilled", "false");
  // The registry directly under x.eth is full as well.
  register(R1, "b");
  assert.notInStore("ENSv2NamePath", child(x, "b").toHexString());
});

// A registry reached under several names gives each of its slots several
// paths. One event retires what is below all of them, so the limit is on
// the slot's total.
test("the limit is on a slot's total over every name it is reached under", () => {
  let eth = setUpEth();
  register(ETH_REGISTRY, "x");
  register(ETH_REGISTRY, "y");
  let x = child(eth, "x");
  let y = child(eth, "y");
  link(ETH_REGISTRY, "x", R1);
  link(ETH_REGISTRY, "y", R1);
  register(R1, "s");
  link(R1, "s", R2);
  setMaxNamesBelowNameForTesting(3);

  register(R2, "p");
  assert.i32Equals(2, below(slotId(R1, "s")));
  assert.i32Equals(1, below(child(x, "s")));
  assert.i32Equals(1, below(child(y, "s")));
  // "q" fits under s.x.eth, which takes the slot to three, and no longer
  // under s.y.eth.
  register(R2, "q");
  assert.i32Equals(1, pathCountOf(R2, "q"));
  assert.i32Equals(3, below(slotId(R1, "s")));
  assert.fieldEquals("Domain", child(child(x, "s"), "q").toHexString(), "name", "q.s.x.eth");
  assert.notInStore("ENSv2NamePath", child(child(y, "s"), "q").toHexString());

  // Unregistering "s" retires all of it in one event.
  unregister(R1, "s");
  assert.i32Equals(0, below(slotId(R1, "s")));
  assert.i32Equals(0, below(x));
  assert.i32Equals(0, below(y));
  assert.fieldEquals("Domain", child(child(x, "s"), "q").toHexString(), "owner", EMPTY);
  assert.fieldEquals("Domain", child(child(y, "s"), "p").toHexString(), "owner", EMPTY);
});

test("a registry linked with more names than fit below the name is projected up to the limit", () => {
  let eth = setUpEth();
  register(ETH_REGISTRY, "x");
  let x = child(eth, "x");
  let labels = ["a", "b", "c", "d", "e"];
  for (let i = 0; i < labels.length; i++) {
    register(R1, labels[i]);
  }
  setMaxNamesBelowNameForTesting(3);

  link(ETH_REGISTRY, "x", R1);

  assert.i32Equals(3, below(x));
  assert.fieldEquals("Domain", child(x, "c").toHexString(), "name", "c.x.eth");
  assert.notInStore("ENSv2NamePath", child(x, "d").toHexString());
  assert.fieldEquals("ENSv2Namespace", ns(R1, x), "backfilled", "false");
  assert.fieldEquals("ENSv2Namespace", ns(R1, x), "backfillCursor", "3");
  assert.fieldEquals("ENSv2Namespace", ns(R1, x), "backfillQueued", "false");
  assert.entityCount("ENSv2BackfillTask", 0);

  // Removing the link retires exactly what was projected.
  link(ETH_REGISTRY, "x", EMPTY);
  assert.i32Equals(0, below(x));
  assert.fieldEquals("ENSv2NamePath", child(x, "a").toHexString(), "active", "false");
});

test("a .eth name itself is never refused: only ENS governance can unlink the ETHRegistry", () => {
  setUpEth();
  setMaxNamesBelowNameForTesting(0);
  register(ETH_REGISTRY, "x");
  register(ETH_REGISTRY, "y");
  assert.i32Equals(1, pathCountOf(ETH_REGISTRY, "x"));
  assert.i32Equals(1, pathCountOf(ETH_REGISTRY, "y"));
});

// Anyone can point a name of theirs at the ETHRegistry. From then on every
// .eth registration and migration is also projected under that name, for
// the price of one transaction, and removing the link retires all of them
// in one event.
test("a name pointed at the ETHRegistry stops collecting .eth names at the limit", () => {
  let eth = setUpEth();
  register(ETH_REGISTRY, "squat");
  let squat = child(eth, "squat");
  link(ETH_REGISTRY, "squat", ETH_REGISTRY);
  setMaxNamesBelowNameForTesting(2);

  register(ETH_REGISTRY, "one");
  register(ETH_REGISTRY, "two");
  register(ETH_REGISTRY, "three");

  // The .eth names themselves are all there.
  assert.fieldEquals("Domain", child(eth, "three").toHexString(), "name", "three.eth");
  assert.fieldEquals("Domain", child(squat, "two").toHexString(), "name", "two.squat.eth");
  assert.notInStore("ENSv2NamePath", child(squat, "three").toHexString());
  assert.i32Equals(2, below(squat));
  assert.i32Equals(1, pathCountOf(ETH_REGISTRY, "three"));

  link(ETH_REGISTRY, "squat", EMPTY);
  assert.i32Equals(0, below(squat));
  assert.fieldEquals("Domain", child(squat, "one").toHexString(), "owner", EMPTY);
  assert.fieldEquals("Domain", child(eth, "one").toHexString(), "owner", OWNER.toLowerCase());
  assert.fieldEquals("ENSv2NamePath", child(eth, "one").toHexString(), "active", "true");
});

// Retiring a namespace walks the list of its paths in one handler. Were the
// list append-only, registering and unregistering names in turn would
// lengthen it without limit while the number of live names stayed small.
test("a namespace lists its live names only, however many it has had", () => {
  let eth = setUpEth();
  register(ETH_REGISTRY, "x");
  let x = child(eth, "x");
  link(ETH_REGISTRY, "x", R1);
  let labels = ["a", "b", "c", "d"];
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < labels.length; i++) {
      register(R1, labels[i]);
      unregister(R1, labels[i]);
    }
  }
  assert.fieldEquals("ENSv2Namespace", ns(R1, x), "pathCount", "0");

  register(R1, "a");
  register(R1, "b");
  register(R1, "c");
  assert.fieldEquals("ENSv2Namespace", ns(R1, x), "pathCount", "3");
  assert.fieldEquals("ENSv2NamePath", child(x, "c").toHexString(), "namespaceIndex", "2");

  // A name retired on its own gives its place to the last one.
  unregister(R1, "a");
  assert.fieldEquals("ENSv2Namespace", ns(R1, x), "pathCount", "2");
  assert.fieldEquals("ENSv2NamePath", child(x, "a").toHexString(), "namespaceIndex", "-1");
  assert.fieldEquals("ENSv2NamePath", child(x, "c").toHexString(), "namespaceIndex", "0");
  assert.fieldEquals("ENSv2NamePath", child(x, "b").toHexString(), "namespaceIndex", "1");

  // Removing the link retires the two that are left and empties the list.
  link(ETH_REGISTRY, "x", EMPTY);
  assert.fieldEquals("ENSv2Namespace", ns(R1, x), "pathCount", "0");
  assert.fieldEquals("ENSv2NamePath", child(x, "b").toHexString(), "active", "false");
  assert.fieldEquals("ENSv2NamePath", child(x, "c").toHexString(), "active", "false");
  assert.fieldEquals("Domain", child(x, "c").toHexString(), "owner", EMPTY);

  // Linked again, the names that are still registered come back.
  link(ETH_REGISTRY, "x", R1);
  assert.fieldEquals("ENSv2Namespace", ns(R1, x), "pathCount", "2");
  assert.fieldEquals("ENSv2NamePath", child(x, "a").toHexString(), "active", "false");
  assert.fieldEquals("ENSv2NamePath", child(x, "b").toHexString(), "active", "true");
});

// ---------------------------------------------------------------------------
// The counts against a recount
// ---------------------------------------------------------------------------

const R3 = "0xa3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3";
const RUN_REGISTRIES = [ETH_REGISTRY, R1, R2, R3];
const RUN_LABELS = ["a", "b", "c", "d"];

// Every path of the names the random run registers, active or retired,
// through the slots they belong to.
function collectPaths(): Array<Bytes> {
  let out = new Array<Bytes>();
  for (let r = 0; r < RUN_REGISTRIES.length; r++) {
    for (let l = 0; l < RUN_LABELS.length; l++) {
      let slot = ENSv2NameSlot.load(slotId(RUN_REGISTRIES[r], RUN_LABELS[l]));
      if (slot == null) {
        continue;
      }
      let paths = slot.paths.load();
      for (let i = 0; i < paths.length; i++) {
        out.push(paths[i].id);
      }
    }
  }
  return out;
}

// A namespace lists exactly its active paths (ENSv2NamespacePathIndex,
// positions 0 to pathCount - 1), each at the position the path records.
// Retiring a namespace walks that list, so a path missing from it would stay
// live, and one left in it would make the list grow with the namespace's
// history.
function assertNamespaceListsMatch(paths: Array<Bytes>, step: i32): void {
  let activeIn = new Map<string, i32>();
  let namespaces = new Array<Bytes>();
  for (let i = 0; i < paths.length; i++) {
    let path = ENSv2NamePath.load(paths[i])!;
    let key = path.namespace.toHexString();
    if (!activeIn.has(key)) {
      activeIn.set(key, 0);
      namespaces.push(path.namespace);
    }
    if (!path.active) {
      assert.i32Equals(-1, path.namespaceIndex);
      continue;
    }
    activeIn.set(key, activeIn.get(key) + 1);
    let namespace = ENSv2Namespace.load(path.namespace)!;
    if (path.namespaceIndex < 0 || path.namespaceIndex >= namespace.pathCount) {
      log.error("step {}: {} is active at position {} of a list of {}", [
        step.toString(),
        path.name === null ? "?" : (path.name as string),
        path.namespaceIndex.toString(),
        namespace.pathCount.toString(),
      ]);
    }
    assert.assertTrue(path.namespaceIndex >= 0);
    assert.assertTrue(path.namespaceIndex < namespace.pathCount);
    let entry = ENSv2NamespacePathIndex.load(
      namespacePathIndexId(namespace.id, path.namespaceIndex)
    )!;
    assert.bytesEquals(path.id, entry.path);
  }
  for (let i = 0; i < namespaces.length; i++) {
    let namespace = ENSv2Namespace.load(namespaces[i])!;
    assert.i32Equals(activeIn.get(namespaces[i].toHexString()), namespace.pathCount);
  }
}

// Recounts the active paths below every path from the parent pointers and
// compares with ENSv2SubtreeSize, per path and per slot. Returns the number
// of active paths, for the caller to check the run did something.
function assertCountsMatchRecount(eth: Bytes, step: i32, limit: i32): i32 {
  let paths = collectPaths();
  assertNamespaceListsMatch(paths, step);

  let expected = new Map<string, i32>();
  let active = 0;
  for (let i = 0; i < paths.length; i++) {
    let path = ENSv2NamePath.load(paths[i])!;
    if (!path.active) {
      continue;
    }
    active++;
    let parentId = path.parent;
    while (parentId) {
      let parent = ENSv2NamePath.load(parentId)!;
      // No name stays live below one that was retired.
      if (!parent.active) {
        log.error("step {}: {} is active below the retired {}", [
          step.toString(),
          path.name === null ? "?" : (path.name as string),
          parent.name === null ? "?" : (parent.name as string),
        ]);
      }
      assert.assertTrue(parent.active);
      // RootRegistry names are not counted.
      if (!parent.parent) {
        break;
      }
      let key = parent.id.toHexString();
      expected.set(key, (expected.has(key) ? expected.get(key) : 0) + 1);
      parentId = parent.parent;
    }
  }

  let slotTotals = new Map<string, i32>();
  let slotIds = new Array<Bytes>();
  for (let i = 0; i < paths.length; i++) {
    let path = ENSv2NamePath.load(paths[i])!;
    let key = path.id.toHexString();
    let want = expected.has(key) ? expected.get(key) : 0;
    if (below(path.id) != want) {
      log.error("step {}: path {} counts {} below it, recount says {}", [
        step.toString(),
        path.name === null ? key : (path.name as string),
        below(path.id).toString(),
        want.toString(),
      ]);
    }
    assert.i32Equals(want, below(path.id));
    let slotKey = path.slot.toHexString();
    if (!slotTotals.has(slotKey)) {
      slotIds.push(path.slot);
      slotTotals.set(slotKey, 0);
    }
    slotTotals.set(slotKey, slotTotals.get(slotKey) + want);
  }
  for (let i = 0; i < slotIds.length; i++) {
    // The eth slot itself is exempt and has no row.
    assert.i32Equals(slotTotals.get(slotIds[i].toHexString()), below(slotIds[i]));
    if (below(slotIds[i]) > limit) {
      log.error("step {}: slot {} has {} names below it, limit {}", [
        step.toString(),
        slotIds[i].toHexString(),
        below(slotIds[i]).toString(),
        limit.toString(),
      ]);
    }
    assert.assertTrue(below(slotIds[i]) <= limit);
  }
  return active;
}

function isRegistered(registry: string, label: string): boolean {
  let slot = ENSv2NameSlot.load(slotId(registry, label));
  return slot != null && slot.status == "REGISTERED";
}

function runRandomEvents(seed: u32, steps: i32, limit: i32): void {
  let eth = setUpEth();
  setMaxNamesBelowNameForTesting(limit);
  // Small, so that unfinished backfills and the queue are part of the run.
  setMaxBackfillSlotsPerEventForTesting(3);
  let registries = RUN_REGISTRIES;
  let labels = RUN_LABELS;
  let state: u32 = seed;
  let mostActive = 0;
  for (let step = 0; step < steps; step++) {
    state = state * 1664525 + 1013904223;
    let op = (state >> 8) % 8;
    state = state * 1664525 + 1013904223;
    let registry = registries[(state >> 8) % 4];
    state = state * 1664525 + 1013904223;
    let label = labels[(state >> 8) % 4];
    state = state * 1664525 + 1013904223;
    // Links point at the three user registries, the one they are in
    // included.
    let target = registries[1 + ((state >> 8) % 3)];

    if (op < 3) {
      register(registry, label);
    } else if (op < 4) {
      if (isRegistered(registry, label)) {
        unregister(registry, label);
      }
    } else if (op < 7) {
      if (isRegistered(registry, label)) {
        link(registry, label, target);
      }
    } else {
      if (isRegistered(registry, label)) {
        link(registry, label, EMPTY);
      }
    }
    let active = assertCountsMatchRecount(eth, step, limit);
    if (active > mostActive) {
      mostActive = active;
    }
  }
  // The run built real trees, not a handful of names.
  assert.assertTrue(mostActive > 20);
}

test("the counts agree with a recount after every one of 400 random events", () => {
  runRandomEvents(12345, 400, MAX_NAMES_BELOW_NAME);
});

test("the counts agree with a recount when the limit keeps refusing names", () => {
  runRandomEvents(987654321, 400, 6);
});
