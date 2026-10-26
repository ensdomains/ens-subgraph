// Per-network ENSv2 constants that networks.json has no room for (it only
// covers data-source address/startBlock). Branches on dataSource.network().
//
// Unknown networks fail loudly because these values participate in entity-ID
// construction and contract classification; zero-value fallbacks would
// silently corrupt indexed state.
import { Address, BigInt, dataSource, log } from "@graphprotocol/graph-ts";

export function getMigrationControllers(): Address[] {
  let network = dataSource.network();
  if (network == "mainnet") {
    return [
      Address.fromString("0xc46bf3b6c7ebcffd4ecfc3b012a1726a2463694d"), // LockedMigrationController
      Address.fromString("0xab821ca676cf2e0790fa273526a165cfa86aeb64"), // UnlockedMigrationController
    ];
  }
  if (network == "sepolia") {
    return [
      Address.fromString("0x6029a063d69b09D23c52a754a90E4FE43aDac3A8"), // LockedMigrationController
      Address.fromString("0x2a35B94DF22cc7354570be2284655E2CDC0e64A2"), // UnlockedMigrationController
    ];
  }
  log.critical(
    "getMigrationControllers: no migration controller addresses configured for network '{}'. Refusing to silently return an empty list (which would make isMigrationController() always return false) — add real addresses for this network or fix the manifest's network label.",
    [network]
  );
  return [];
}

// Use .equals() for graph-ts Address comparison.
export function isMigrationController(sender: Address): boolean {
  let controllers = getMigrationControllers();
  for (let i = 0; i < controllers.length; i++) {
    if (controllers[i].equals(sender)) {
      return true;
    }
  }
  return false;
}

export function getV2GracePeriod(): BigInt {
  // GRACE_PERIOD is an ETHRegistrar *constructor argument*, not a compiled-in
  // protocol constant (contracts-v2/contracts/src/registrar/ETHRegistrar.sol)
  // — a different deployment can legitimately be constructed with a
  // different value, so this must be configured per network.
  let network = dataSource.network();
  if (network == "mainnet" || network == "sepolia") {
    // 28 days (2,419,200s) — contracts-v2/contracts/script/deploy-constants.ts
    // sets GRACE_PERIOD_V2 to this. Verified against the current Sepolia
    // ETHRenewerV1 deployment (0xf2ece44980778966b8a0fccb3a9e339440f6e045):
    // GRACE_PERIOD() returns 7776001, exactly PREMIGRATION_BONUS_PERIOD
    // (5356801) + GRACE_PERIOD_V2 (2419200).
    return BigInt.fromI32(2419200);
  }
  log.critical(
    "getV2GracePeriod: no grace period configured for network '{}'. GRACE_PERIOD is a per-deployment constructor argument — confirm the real on-chain value for this network's ETHRegistrar/ETHRenewerV1 (e.g. via GRACE_PERIOD()) before adding it here; do not assume the Sepolia value applies.",
    [network]
  );
  return BigInt.zero();
}

// graph-ts 0.31.0's `dataSource` host API has no `.name()` (only
// address()/network()/context()), so RootRegistry/ETHRegistry can't be told
// apart from a template-discovered registry by data source name — compare
// event.address against these instead. Network-branched for when real
// mainnet ENSv2 addresses exist.
export function getRootRegistryAddress(): Address {
  let network = dataSource.network();
  if (network == "mainnet") {
    return Address.fromString("0x2553c09be6447beffdb86fa622ad41fb8f77a91e");
  }
  if (network == "sepolia") {
    return Address.fromString("0xB458D6a3a77919449d03e7A6903C26827c1eC43f");
  }
  log.critical(
    "getRootRegistryAddress: no RootRegistry address configured for network '{}'. Refusing to silently return the zero address (which would collapse every registry-id/kind lookup onto one bogus bucket) — add the real address for this network or fix the manifest's network label.",
    [network]
  );
  return Address.zero();
}

export function getEthRegistryAddress(): Address {
  let network = dataSource.network();
  if (network == "mainnet") {
    return Address.fromString("0xf60aba43e1f7f3dab1186ff03b561401c9df85e2");
  }
  if (network == "sepolia") {
    return Address.fromString("0xD4eBcbBdF463C9c45784603Db0dDD499BC44A8B4");
  }
  log.critical(
    "getEthRegistryAddress: no ETHRegistry address configured for network '{}'. Refusing to silently return the zero address (which would collapse every ENSv2Registration id onto one bogus bucket) — add the real address for this network or fix the manifest's network label.",
    [network]
  );
  return Address.zero();
}

// Implementation (not proxy) addresses behind VerifiableFactory.ProxyDeployed
// — the signal kindForAddress uses to classify a template-discovered
// registry as USER/WRAPPER, and to tell a resolver deployment apart from a
// registry one. Values come from the matching Sepolia deployment artifacts.
// Address comparison is byte-level, so checksum casing has no effect.
export function getUserRegistryImplAddress(): Address {
  let network = dataSource.network();
  if (network == "mainnet") {
    return Address.fromString("0x75ff9adbcfce2469b097ac68f6ae650eae1351bb");
  }
  if (network == "sepolia") {
    return Address.fromString("0x9BD8a88719068D09ecee662f36C0E3856708366a");
  }
  log.critical(
    "getUserRegistryImplAddress: no UserRegistry implementation address configured for network '{}'. Refusing to silently return the zero address (which would misclassify every USER registry as UNKNOWN) — add the real address for this network or fix the manifest's network label.",
    [network]
  );
  return Address.zero();
}

export function getWrapperRegistryImplAddress(): Address {
  let network = dataSource.network();
  if (network == "mainnet") {
    return Address.fromString("0xcf3edb3f5501de63b57254d910b6782ee370039b");
  }
  if (network == "sepolia") {
    return Address.fromString("0xBe768b63E5fBBFBB0Ae97E9064E0002dF8001880");
  }
  log.critical(
    "getWrapperRegistryImplAddress: no WrapperRegistry implementation address configured for network '{}'. Refusing to silently return the zero address (which would misclassify every WRAPPER registry as UNKNOWN) — add the real address for this network or fix the manifest's network label.",
    [network]
  );
  return Address.zero();
}

export function getPermissionedResolverImplAddress(): Address {
  let network = dataSource.network();
  if (network == "mainnet") {
    return Address.fromString("0x565b0f456a04ac9b48758190e90030623cff57c5");
  }
  if (network == "sepolia") {
    return Address.fromString("0x115eb53F0c60696633855F90b138178Fb40b2b2C");
  }
  log.critical(
    "getPermissionedResolverImplAddress: no PermissionedResolver implementation address configured for network '{}'. Refusing to silently return the zero address (which would fail to recognize resolver ProxyDeployed events, creating a bogus ENSv2Registry row for each one) — add the real address for this network or fix the manifest's network label.",
    [network]
  );
  return Address.zero();
}

// StandaloneHCAFactory (HCA = Hierarchical Context Authority, an optional
// ENS execution account — see contracts-v2/docs/HCA.md) shares this
// deployment's VerifiableFactory instance rather than deploying its own, so
// every HCA proxy fires the identical ProxyDeployed event a registry
// deployment does. Without recognizing this implementation, kindForAddress
// falls through to UNKNOWN and handleProxyDeployed wrongly creates an
// ENSv2Registry row for it; an HCA is not a registry.
export function getStandaloneHCAImplAddress(): Address {
  let network = dataSource.network();
  if (network == "mainnet") {
    return Address.fromString("0x116f462fa078ec0009e9b25dcd60309e70aac4f4");
  }
  if (network == "sepolia") {
    return Address.fromString("0xC940e5C5bF263C0e097054AECf73826769A72CEE");
  }
  log.critical(
    "getStandaloneHCAImplAddress: no StandaloneHCA implementation address configured for network '{}'. Refusing to silently return the zero address (which would fail to recognize HCA ProxyDeployed events, creating a bogus ENSv2Registry row for each one) — add the real address for this network or fix the manifest's network label.",
    [network]
  );
  return Address.zero();
}
