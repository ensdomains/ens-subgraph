// Option B compatibility projection: every ENSv2NamePath materialised by
// ensv2Paths.ts::materializePathsForSlot gets a legacy Domain row (this is
// what lets existing ENSv1 consumers keep working unchanged for ENSv2-origin
// names), and real .eth registrations additionally get a legacy Registration
// row. Only ever creates rows for names that never existed in ENSv1.
//
// For migrated names, domain.owner remains the ENSv1 registry-level owner,
// since it reflects ENSv1 ENSRegistry-level
// ownership, which the migration's own "graveyard" voiding step already
// legitimately moved away from the real user (a true fact about the retired
// v1 system, not something to overwrite). wrappedOwner/registrant are
// different — they're what real consumers read to find "who controls this
// name" — so those get corrected, domain.owner does not.
import { BigInt, log } from "@graphprotocol/graph-ts";
import { checkValidLabel, ETH_NODE } from "./utils";
import { getEthRegistryAddress, getV2GracePeriod } from "./ensv2Constants";
import { pathNamehash, registryNamespaceIndexId } from "./ensv2Utils";
import {
  Domain,
  ENSv2NamePath,
  ENSv2NameSlot,
  ENSv2Namespace,
  ENSv2Registry,
  ENSv2RegistryNamespaceIndex,
  Registration,
  WrappedDomain,
} from "./types/schema";
import { LabelRegistered } from "./types/RootRegistry/PermissionedRegistry";
import { syncRegistrationFromSlot } from "./ensv2Registrar";

// Recovers a slot's namehash (Domain.id) without a ENSv2NamePath in hand —
// needed at transfer time, when only the slot is available.
// Read-only mirror of materializePathsForSlot's namespace loop; ENSv2NameSlot
// deliberately has no direct Domain/namehash field of its own, only
// labelhash, so this has to be recomputed rather than stored.
export function getEthDomainId(slot: ENSv2NameSlot): string | null {
  let registry = ENSv2Registry.load(slot.registry);
  if (registry == null) {
    return null;
  }
  for (let i = 0; i < registry.namespaceCount; i++) {
    let index = ENSv2RegistryNamespaceIndex.load(
      registryNamespaceIndexId(registry.id, i)
    );
    if (index == null) {
      continue;
    }
    let namespace = ENSv2Namespace.load(index.namespace);
    if (namespace == null || !namespace.active) {
      continue;
    }
    // Only the genuine "eth" namespace can be the canonical parent —
    // without this check, any active namespace whose namehash happens to
    // resolve ETHRegistry as a subregistry would match, and setSubregistry
    // has no on-chain restriction on which registry a caller points their
    // own subregistry at. Filtering on baseNamehash makes
    // this deterministic instead of "whichever link was indexed first."
    if (!namespace.baseNamehash.equals(ETH_NODE)) {
      continue;
    }
    let pathId = pathNamehash(namespace.baseNamehash, slot.labelhash);
    let path = ENSv2NamePath.load(pathId);
    // Nullable Bytes require a truthy check before dereferencing.
    if (path != null && path.domain) {
      return path.domain!;
    }
  }
  return null;
}

// The single reusable implementation of the wrapped/unwrapped correction
// branch — called both at initial migration-flagged registration and at
// every subsequent TransferSingle/TransferBatch on a migratedFromV1 slot
// (transfers must keep writing to "the same legacy field").
// Re-checks WrappedDomain existence fresh every call rather than caching the
// original classification.
export function correctMigratedLegacyOwner(
  domainId: string,
  registrationId: string,
  ownerId: string
): void {
  let wrappedDomain = WrappedDomain.load(domainId);
  if (wrappedDomain != null) {
    wrappedDomain.owner = ownerId;
    wrappedDomain.save();
    let domain = Domain.load(domainId);
    if (domain != null) {
      domain.wrappedOwner = ownerId;
      domain.save();
    }
  } else {
    let domain = Domain.load(domainId);
    if (domain != null) {
      domain.registrant = ownerId;
      domain.save();
    }
    let registration = Registration.load(registrationId);
    if (registration != null) {
      registration.registrant = ownerId;
      registration.save();
    }
  }
}

// Keeps the legacy-compatibility Domain/Registration owner/registrant
// fields live on every transfer for a native ENSv2 (never-migrated) .eth
// name — correctMigratedLegacyOwner above only runs for migratedFromV1
// slots, so without this, a v2-native name's Domain.owner/registrant and
// Registration.registrant permanently retain the original registrant after
// the very first transfer. No WrappedDomain branching is
// needed here the way correctMigratedLegacyOwner has: a v2-native name has
// no legacy NameWrapper-wrapped concept to detect.
export function updateEthDomainOwner(
  domainId: string,
  registrationId: string,
  ownerId: string
): void {
  let domain = Domain.load(domainId);
  if (domain != null) {
    domain.owner = ownerId;
    domain.registrant = ownerId;
    domain.save();
  }
  let registration = Registration.load(registrationId);
  if (registration != null) {
    registration.registrant = ownerId;
    registration.save();
  }
}

function syncEthRegistration(
  slot: ENSv2NameSlot,
  path: ENSv2NamePath,
  event: LabelRegistered,
  isV1Migration: boolean
): void {
  let id = slot.labelhash.toHexString();
  let registration = Registration.load(id);
  let isNewRegistration = registration == null;
  if (registration == null) {
    registration = new Registration(id);
    registration.registrationDate = event.block.timestamp;
  }
  registration.domain = path.id.toHexString();
  let slotExpiryDate = slot.expiryDate;
  if (slotExpiryDate) {
    registration.expiryDate = slotExpiryDate;
  }
  // Existing migrated rows are corrected by correctMigratedLegacyOwner so
  // wrapped names do not receive a registrant. New rows need this required
  // field initialized before they can be saved.
  if (!isV1Migration || isNewRegistration) {
    let registrantId = slot.registrant;
    if (registrantId) {
      registration.registrant = registrantId;
    }
  }
  if (checkValidLabel(slot.label)) {
    registration.labelName = slot.label;
  }
  registration.save();
}

export function projectPathToDomain(
  path: ENSv2NamePath,
  slot: ENSv2NameSlot,
  event: LabelRegistered,
  isV1Migration: boolean
): void {
  let ownerId = slot.owner;
  if (!ownerId) {
    // handleLabelRegistered sets slot.owner before this projection.
    log.warning(
      "projectPathToDomain: slot {} has no owner, skipping projection",
      [slot.id.toHexString()]
    );
    return;
  }

  let domain = Domain.load(path.id.toHexString());
  let isNewDomain = domain == null;
  if (domain == null) {
    domain = new Domain(path.id.toHexString());
    domain.createdAt = event.block.timestamp;
    domain.subdomainCount = 0;
  }

  domain.name = path.name;
  if (checkValidLabel(path.label)) {
    domain.labelName = path.label;
  }
  domain.labelhash = path.labelhash;
  // Preserve the V1 owner on existing migrated rows. A new compatibility row
  // has no legacy value to preserve and needs its required owner initialized.
  if (!isV1Migration || isNewDomain) {
    domain.owner = ownerId!;
  }
  // Migrated names: registrant correction is correctMigratedLegacyOwner's
  // job below (branch-aware), not this generic assignment.
  if (!isV1Migration) {
    let registrantId = slot.registrant;
    if (registrantId) {
      domain.registrant = registrantId;
    }
  }
  domain.isMigrated = true;

  let parentPathId = path.parent;
  if (parentPathId) {
    let parentPath = ENSv2NamePath.load(parentPathId);
    if (parentPath != null && parentPath.domain) {
      domain.parent = parentPath.domain!;
    }
  }

  // v2GracePeriod is ETHRegistrar/ETHRenewerV1-specific policy — only
  // applied for real .eth registrations, where Domain.expiryDate has always
  // meant the true reregistration-availability date, not raw expiry.
  let isEth = slot.registry.equals(getEthRegistryAddress());
  let slotExpiryDate = slot.expiryDate;
  if (isEth && slotExpiryDate) {
    domain.expiryDate = slotExpiryDate.plus(getV2GracePeriod());
  } else {
    domain.expiryDate = slotExpiryDate;
  }
  domain.save();

  path.domain = domain.id;
  path.save();

  if (isEth) {
    syncEthRegistration(slot, path, event, isV1Migration);
    // NameRegistered normally follows the registry events in the deployed
    // registrar, but keeping this reconciliation here makes fixtures and
    // replays with the opposite ordering converge to the same native row.
    syncRegistrationFromSlot(slot);
    if (isV1Migration) {
      correctMigratedLegacyOwner(domain.id, slot.labelhash.toHexString(), ownerId!);
    }
  }
}
