# ENS Subgraph

This Subgraph sources events from the ENS contracts. This includes the ENS registry, the Auction Registrar, and any resolvers that are created and linked to domains. The resolvers are added through dynamic data sources. More information on all of this can be found at [The Graph Documentation](https://thegraph.com/docs/developer/quick-start/).

As of the ENSv2 upgrade, it also indexes the ENSv2 registry/registrar/resolver contracts directly. See "Querying ENSv2" below for the query contract that upgrade adds.

## Network-specific builds and deployments

Network-specific commands validate `networks.json` and the ENSv2 deployment constants before invoking graph-cli. They operate on a temporary sibling manifest because graph-cli rewrites the manifest passed with `--network`; the committed `subgraph.yaml` is left unchanged.

```sh
yarn build:sepolia
yarn deploy:sepolia <studio-subgraph-name> \
  --node https://api.studio.thegraph.com/deploy/ \
  --version-label <version-label>
```

The Studio subgraph name and version label are deliberately explicit rather than repository-wide constants. A failed command removes its temporary manifest as well.

## Self-hosting notes

- **graph-node >= 0.38** is required (`specVersion: 1.3.0`, `apiVersion: 0.0.9`).
- **Labels for ENSv1 subnames come from graph-node's rainbow table.** ENSv1 registry
  events only carry label *hashes*; `labelName`/`name` are filled through
  `ens.nameByHash`, which reads graph-node's `ens_names` table. If that table is
  empty (the default on a fresh node, and incomplete on most indexers) subnames
  appear as `[<labelhash>].parent.eth` with `labelName: null`, and newer
  graph-node versions log `ens_name_by_hash is deprecated`. Load the
  [ens-rainbow](https://github.com/graphprotocol/ens-rainbow) dump into
  `ens_names` before syncing. `.eth` second-level names are unaffected (the
  registrar controllers emit the plain label), and so are all ENSv2 names:
  `LabelRegistered` carries the label, so ENSv2 slots and their projected
  `Domain` rows are always labelled.
- **Event IDs are `<block>-<logIndex>`** for the ENSv1 event entities and are kept
  stable for consumers. An RPC that returns duplicate log indexes within a block
  (reported with Erigon) makes two events collide and aborts the sync; index from
  a client that returns consecutive log indexes.
- **Pruning is on** (`indexerHints: prune: auto`): time-travel queries
  (`block: { number }`) are only served for recent blocks.

# Example Queries (ENSv1 — `Domain`/`Registration`/`Resolver`)

Here we have example queries, so that you don't have to type them in yourself eachtime in the graphiql playground:

```graphql
{
  domains {
    id
    labelName
    labelhash
    parent {
      id
    }
    subdomains {
      id
    }
    owner {
      id
    }
    resolver {
      id
    }
    ttl
  }
  resolvers {
    id
    address
    domain {
      id
    }
    events {
      id
      ... on AddrChanged {
        addr {
          id
        }
      }
      ... on NameChanged {
        name
      }
      ... on AbiChanged {
        contentType
      }
      ... on PubkeyChanged {
        x
        y
      }
      ... on TextChanged {
        indexedKey
        key
      }
      ... on ContenthashChanged {
        hash
      }
      ... on InterfaceChanged {
        interfaceID
        implementer
      }
      ... on AuthorisationChanged {
        owner
        target
        isAuthorized
      }
    }
  }
  registrations(where: { labelName_not: null }, orderBy: expiryDate, orderDirection: asc, first: 10, skip: 0) {
    expiryDate
    labelName
    domain{
      name
      labelName
    }
  }
}

```

(This fixes a staleness bug in the previous version of this example: `events { node ... on AddrChanged { a } }` referenced fields that no longer exist on the current schema — `ResolverEvent` has no top-level `node` field, and `AddrChanged.addr` is an `Account` relation, not a raw value named `a`.)

# Querying ENSv2

The ENSv2 upgrade added a second, parallel set of entities (`ENSv2Registry`, `ENSv2NameSlot`, `ENSv2Namespace`, `ENSv2NamePath`, `ENSv2Registration`, `ENSv2Resolver`, `ENSv2RoleAssignment`, and friends) that index the ENSv2 registry/registrar/resolver contracts directly. `Domain`, `Registration`, and `Resolver` above keep working unchanged for existing consumers, but they are a **projection**, not the full ENSv2 data model. Read this before building anything new against ENSv2 data:

- **`Domain` is a backwards-compatibility projection, not the complete ENSv2 data model.** It's derived from `ENSv2NamePath` rows, which are themselves a materialized-path projection — not a complete existence index for every name reachable through ENSv2.
- **RootRegistry paths are native-only.** Root labels such as `eth` and `reverse` are still materialized as `ENSv2NamePath`/slot state, but are not linked to legacy `Domain` rows. Their namehash IDs collide with existing ENSv1 TLD rows, while RootRegistry owner and expiry values represent ENSv2 deployment/administrative state rather than the legacy ENSv1 semantics. Query the native entities for those root slots.
- **Late-linked registrations are backfilled.** When a registry is linked under a parent *after* it already has registrations ("late-linking", as in the subname copy flow: deploy a registry, register the names, then point the parent at it), the link projects every name already registered there into `ENSv2NamePath` and `Domain`, and does the same for the registries those names link to, down to 16 levels. One event backfills at most 10,000 names, all levels together. A registry with more is projected over the ENSv2 registry events that follow (registrations, renewals, resolver and subregistry changes, in any registry), 10,000 names per event, in the order the links were made (`ENSv2BackfillQueue`). Until the last name is done its namespace has `backfilled: false` and `backfillCursor` says how far it got; names registered in the meantime are projected at once. Emitting the link again (`setSubregistry` with the same address) also takes it 10,000 names further. The same applies when a link is made again after it, or one above it, was removed.
- **The limits below fail towards "no address", never towards an old one.** Each of them leaves names unprojected (no `ENSv2NamePath`, no `Domain`, or a `Domain` that reads as deleted) or leaves a legacy resolver snapshot empty. None of them leaves a name showing a resolver or an address it had earlier: retiring names is never limited, and a name whose record updates cannot be followed is never given the record. Two things remain outside what the mappings can guarantee. A name that expires emits no event, so its `Domain` keeps its resolver and `resolvedAddress` until the name is unregistered or registered again, although `getResolver()` returns zero from the moment of expiry: compare `Registration.expiryDate` or `ENSv2NameSlot.expiryDate` (the raw expiry; `Domain.expiryDate` includes the grace period for `.eth` names) with the current time before trusting an address. Check every name above it the same way: a name below an expired name stops resolving too (`getSubregistry()` returns zero for the expired parent), and its own row, with its own expiry, does not show that. Expiry is deliberately left to consumers; the subgraph does not sweep expired names. And when a link is refused, or while its registry's names are not all projected (`ENSv2Namespace.backfilled: false`), every ENSv1 `Domain` row below the linked name loses its resolver and resolved address (`ENSv2NamePath.legacySubtreeVoided`, described under "An ENSv1 name below an ENSv2 name" further down), because the registry behind the link may hold those names and the subgraph does not look into it. One such sweep visits at most 100,000 ENSv1 rows; rows past that keep their resolver, with a warning in the logs, and a name under the RootRegistry (a whole TLD) that exceeds it is left following ENSv1.
- **A registry is projected under its canonical namespace and at most 8 aliases.** Any name's subregistry can be any address, so a registry can be reached under any number of names, including names of its own, and every namespace costs one path per name. `ENSv2Registry.materializedNamespaces` lists the namespaces a registry's names currently have `ENSv2NamePath`/`Domain` rows under: the canonical one (`ENSv2Namespace.canonical`: its parent name is the one the registry declares with `setParent`, reached through that parent's own canonical name) plus up to 8 others, first come, first served, and never more than 16 in all. A namespace beyond that, one more than 16 registries below the link being processed, or one whose registry has used up its lifetime allowance (next point) stays `active: true` with `materialized: false`: the link is recorded and its names are in the native slot graph, but they have no path or `Domain`. Unlinking an alias frees its place, and emitting the refused link again (`setSubregistry` with the same address) retries it. Because the canonical namespace does not compete with aliases, pointing other names at someone's registry cannot keep that registry's own names out. A registry that declares no parent has no canonical namespace and is projected under aliases only.
- **At most 100,000 names are projected below one name.** Removing a link, an unregistration and a re-registration each retire every projected name below one name, in the handler of that one event, and a handler cannot release memory: retiring a name costs about 11 KB of the 4 GiB a handler has, so a large enough subtree would end in a handler that can never complete, and a subgraph that stops for good. The names below every name are therefore counted (`ENSv2SubtreeSize`: one row per `ENSv2NamePath`, and one per `ENSv2NameSlot` with the total over the names the slot is reached under), at every depth, and a name that would take any name above it past 100,000 is not projected: it is in the native slot graph (`ENSv2NameSlot`, with no entry in `paths`) and has no `ENSv2NamePath` or `Domain`. Its namespace then has `backfilled: false`. Places freed by unregistrations go to later registrations, and emitting the link again projects the names that were left out, as far as there is room. Names directly under the RootRegistry (`eth`) are exempt: the limit is on what is below `name.eth`, not on `.eth`. This also covers a name pointed at the ETHRegistry itself, which would otherwise collect every later `.eth` registration and migration.
- **A registry is projected a limited number of times over its life.** Removing a link and making it again walks every name below it, for two events. `ENSv2Registry.canonicalMaterializations` and `aliasMaterializations` count how often a registry's names have been projected under its canonical namespace and under aliases: first links, and every re-link of its own name or of a name above it. Each stops at 32, after which further links of that kind are recorded but not projected (`materialized: false`), for good. The counts are separate so that aliases, which anyone can create, cannot use up the allowance of the registry's own name. Registrations, transfers and renewals never count, and neither do the RootRegistry and ETHRegistry.
- **Registries that were not deployed through VerifiableFactory are indexed once they emit.** A registry gets its data source from `ProxyDeployed`, or from its own first `LabelRegistered`, `LabelReserved` or `ParentUpdated` (the addressless `ENSv2RegistryDiscovery` source), whichever comes first; `ENSv2Registry.indexed` is then true and, without the factory, its `kind` is `UNKNOWN`. An address that a name merely points at, or that a registry names as its parent, gets a row with `indexed: false` and no data source. Anything a non-factory registry emitted before the block of its first such event is not indexed.
- **Names below an unreachable name are retired.** When a name is unregistered (`getSubregistry()` then returns zero for it) or its parent switches to another subregistry, or the name is registered again (which resets its subregistry on chain without an event), every projected name below it is deactivated and its `Domain` reads as deleted (no owner, no resolver, no resolved address), at every depth and in the same event. That is at most 100,000 names (see "At most 100,000 names are projected below one name" above). Linking the subregistry again restores them, down to 16 registries per event. A name that merely expires emits no event, so the names below it stay as they are.
- **For full ENSv2 coverage, query the registry/namespace/slot graph directly** rather than relying only on `Domain`/`ENSv2NamePath`.
- **Labels are stored exactly as emitted by ENSv2 registry events.** The subgraph does not expose a `normalizedLabel` field and does not perform ENSIP-15 normalization in mappings — normalize user input client-side before hashing or querying by name.
- **PermissionedResolver is recordId-keyed.** Query `ENSv2ResolverLink` for the resolver + node association, then follow `record` to its current addresses, text, contenthash, data, ABI, and interface state.
- **Legacy `Resolver` projection is current-state compatibility, not resolver history.** Explicitly linked PermissionedResolver records project address/contenthash/text-key state into an existing materialized `Domain`; shared record updates fan out to the active explicit links (up to 100 per event, see below). The projection does not synthesize classic `ResolverEvent` rows, never creates a `Domain` row itself, and leaves name/data/ABI/interface values native-only.
- **Default-record fallback is projected.** A PermissionedResolver answers for a name without its own record (never linked, or unlinked to record 0) from its default record, the record linked to the DNS root name. The legacy `Resolver` and `Domain.resolvedAddress` of such a name follow the default record, and a change to the default record reaches the names pointed at that resolver (tracked in `ENSv2ResolverAttachment`; up to 100 per event, see below).
- **Shared-record fanout is capped at 100 names per event, and flagged.** The PermissionedResolver source has no address filter, so any contract can emit `Linked` for any number of nodes and then update the record. One record update refreshes the legacy snapshot of the first 100 names linked to that record, and a default-record change the first 100 names ever pointed at that resolver; the record's snapshot is built once per event, not once per name. A name beyond that is never given a snapshot from the record: its legacy `Resolver` fields and `Domain.resolvedAddress` stay empty, so it shows no address instead of one that later updates could not correct. `ENSv2Resolver.legacyProjectionTruncated` is set on the resolver when it has such names. The `ENSv2Resolver*` entities are always complete, so read those for a resolver with the flag set.
- **PublicResolverV2 remains node-keyed.** It emits classic profile events and is covered once by the existing addressless `Resolver` handlers; its `DataChanged` profile is additionally exposed as `ENSv2ResolverData`.
- **`ENSv2PrimaryName` covers only the ENSIP-19 "default" (chain-agnostic) reverse record**, set via `DefaultReverseRegistrar.setName()`/`setNameForAddr()`/`setNameForAddrWithSignature()` — a flat `address → name` mapping, entirely separate from the legacy node-keyed `addr.reverse` scheme (already covered generically by the existing v1 `ENSRegistry`/`Resolver` handlers, since those match any node including reverse ones). A coin-type-specific (non-default) reverse record, or an L2 chain's own reverse registrar, is a different mechanism and out of scope here.
- **Legacy holder fields never name a sink, and ENSv2 governs a live ENSv2 name (v2.2.0).** `Domain.owner`, `Domain.registrant`, `Domain.wrappedOwner`, `Registration.registrant` and `WrappedDomain.owner` never hold the Graveyard, the GraveyardRepairer or a migration controller. These contracts are where ENSv1 state goes when it is migrated or retired, not holders. While a node has an active ENSv2 path whose slot is `REGISTERED` (native or migrated, in any registry), the ENSv2 projection owns its legacy holder, expiry and resolver fields: `owner` and `registrant` are the ENSv2 holder, v1 NameWrapper state is gone (`WrappedDomain` removed), the resolver is the ENSv2 one, and transfers, renewals and unregistrations in every registry keep the row in sync. ENSv1 registry, BaseRegistrar and NameWrapper events for such a node only write their history rows; ENSv1 resolver record events still apply when the name points at that v1 resolver. `Registration.expiryDate` is the raw ENSv2 expiry; `Domain.expiryDate` includes the ENSv2 grace period for `.eth` names. A migrated name keeps its original `Registration.registrationDate`; a native ENSv2 registration sets a new one.
- **An ENSv1 name below an ENSv2 name has no resolver and no address (v2.3.5).** ENSv2 resolves a name by walking its registries from the root and using the deepest resolver it finds. An unmigrated `.eth` name is reserved in the ETHRegistry with the ENSV1Resolver, which looks the whole name up in ENSv1, so the name and its ENSv1 subnames resolve as before and their rows are unchanged. Once the name is registered in ENSv2 (migrated, or registered again after it lapsed), an ENSv1 subname that was not created again in ENSv2 is answered by the name's ENSv2 resolver if that resolver answers for subnames, and otherwise does not resolve. Its ENSv1 resolver is never used, although the ENSv1 registry still holds the record. So when a name is projected, every ENSv1 `Domain` row below it, at any depth, loses `resolver` and `resolvedAddress`, the name is marked (`ENSv2NamePath.legacySubtreeVoided`), and ENSv1 `NewResolver` events for names below it only write their history rows from then on. The mark is permanent: a name below shows an address again only when it is registered in ENSv2. Owner, wrapped state and expiry of the ENSv1 rows are left as they are, and so are the legacy `Resolver` rows; only the `Domain`'s pointer to them is cleared. What such a subname returns on chain (usually the zero address, from the parent's resolver) is not projected onto its row.
  - **Emancipated subnames of a locked name are kept.** A locked NameWrapper name migrates into a WrapperRegistry, which sends a subname to ENSv1 while it is emancipated (`PARENT_CANNOT_CONTROL`, not expired), has an ENSv1 owner and was never registered in that registry. Such a subname and the ENSv1 names below it keep their rows and still follow ENSv1 events; the migrated name has `legacySubtreeVoided: false`, and its other ENSv1 subnames are cleared all the same. A kept subname is cleared, with everything below it, when it migrates (ENSv2 then writes it), when it leaves the NameWrapper (`ENSv2LegacyCutoff`, permanent), or when the migrated name stops pointing at a WrapperRegistry, is retired or is registered again. Its wrapper expiry emits nothing, like every expiry: compare `Domain.expiryDate` with the current time.
  - **Where this shows no address although the name resolves.** A name whose owner sets its ENSv2 resolver to the ENSV1Resolver by hand sends its ENSv1 subnames back to ENSv1. An emancipated subname that was unwrapped stays eligible on chain until its wrapper expiry. Both are shown without an address, because the subgraph cannot follow them safely (it drops fuses and expiry on unwrap).
  - **Cost.** The sweep runs once per ENSv2 name, issues one store query per ENSv1 row it visits (it does not rely on `Domain.subdomainCount` to skip rows, so that a row with a resolver cannot be missed), and visits at most 100,000 rows. A name that is new in ENSv2 has no ENSv1 rows below it and is marked without a query.
- **`Domain.registryToken` is the ENSv2 token of a live ENSv2 name.** It points at the name's current `ENSv2Token` (id = registry address followed by the uint256 token id) and follows token regeneration; it is null for ENSv1-only names and for names that were unregistered. Subnames of an unregistered ENSv2 name are retired with it (see above).
- **Names retired by the Graveyard read like expired ENSv1 names.** `Graveyard.clear()` (run on mainnet by ENS Labs' Morticia daemon since late October 2026, about 950,000 names) re-registers an expired ENSv1 `.eth` name to the Graveyard with a near-`2^64` expiry, clears its resolver and moves its subnames to the Graveyard; `GraveyardRepairer.repair()` does the same for lapsed names whose record a holder had handed to the Graveyard. The subgraph records those events as history only. A retired `.eth` name keeps its last owner, registrant, wrapped holder, dates and expiry, so it reads exactly as the expired name did before the sweep; its `resolver` is null. A retired subname is deleted with the ENSv1 convention (`owner` = zero address, wrapped state removed, no longer counted in its parent's `subdomainCount`). An unregistered ENSv2 name, or one whose namespace was unlinked, is deleted the same way.
- **`Domain.subdomainCount` is the number of a name's direct children that are live (v2.3.5).** A name is live while it has an owner, a resolver, or a live child of its own; a name with none of these reads as deleted (the ENSv1 subgraph's convention) and is not counted, and a retired ENSv2 name is in that state too. The count changes only when a child crosses that line, in either direction, and the change carries upward when it makes the parent cross it in turn. Earlier versions, like the original ENS subgraph, took a child off its parent every time an already deleted subname was touched again and never counted a subname that was deleted and re-created, so counts were too low, and negative for some names. It is never negative now. It counts rows that are live, not names that resolve: an ENSv1 subname below an ENSv2 name still counts while it has an owner, although it has no resolver.
- **`Registration.cost` is the last payment made in ETH to an ENSv1 controller (v2.3.5).** A name still reserved for migration is renewed through ETHRenewerV1, which is paid in an ERC-20 token and then calls the ENSv1 controller with a duration of zero to bring the NameWrapper expiry up to date; that call emits `NameRenewed` with cost 0, and anyone can trigger it for any name (`syncWrapper`). A cost of 0 on a renewal is not recorded, so the field keeps the last ETH payment instead of reading zero for every name renewed since the ENSv2 launch. A migration keeps the cost; a native ENSv2 registration clears it, because that registration is paid through ETHRegistrar (`ENSv2Registration.base` and `premium`). ETHRenewerV1's own token payments are not indexed.
- **"Never expires" is clamped on the legacy fields.** ENSv2 marks never-expiring names with `expiry = 2^64-1` (root TLDs, the reverse mirror, migrated emancipated subnames with `CAN_EXTEND_EXPIRY`, Graveyard-parked v1 names). `Domain.expiryDate`, `Registration.expiryDate` and `WrappedDomain.expiryDate` never exceed `253402300799` (9999-12-31T23:59:59Z, the last instant of a four-digit ISO 8601 date, which fits JavaScript `Date`, PostgreSQL timestamps, Rust `chrono`, Go `time` and int64 alike), so a never-expiring name reads as the furthest future instant consumers can agree on. `ENSv2NameSlot.expiryDate` and the event entities keep the raw on-chain value.

Note on query field casing: graph-node derives root query field names from entity type names by lowercasing the whole `ENSv2` prefix, not just the first character — so `ENSv2Registry` becomes `ensv2Registry`/`ensv2Registries`, confirmed directly against a live deployment's introspection schema.

## Example query: registry → namespace → slot graph

```graphql
{
  ensv2Registries(where: { kind: ETH }) {
    id
    kind
    namespaceCount
    namespaces {
      id
      baseName
      active
    }
  }
  ensv2NameSlots(where: { status: REGISTERED }, first: 10) {
    id
    label
    owner {
      id
    }
    expiryDate
    subregistry {
      id
    }
    paths {
      name
      domain {
        id
      }
    }
  }
}
```

## Example query: a resource and its role assignments

```graphql
{
  ensv2Resources(where: { registry: "0x<40-hex-address>", resource: "5" }) {
    id
    slot {
      id
      label
    }
    active
  }
  ensv2RoleAssignments(where: { contract: "0x<40-hex-address>", resource: "5" }) {
    id
    account {
      id
    }
    roleBitmap
  }
}
```

ENSv2 native IDs are `Bytes`, encoded as fixed-width concatenation without separators. For example, a resource ID is the 20-byte registry address followed by the 32-byte big-endian resource value. Do not use the older `<address>-<resource>` placeholder form.

## Example query: PermissionedResolver link and record state

```graphql
{
  ensv2ResolverLinks(
    where: {
      resolver: "0x<40-hex-resolver-address>"
      node: "0x<64-hex-namehash>"
    }
  ) {
    node
    nameDecoded
    active
    recordId
    record {
      contenthash
      primaryName
      addresses {
        coinType
        addressBytes
      }
      texts {
        key
        value
      }
      datas {
        key
        value
      }
    }
  }
}
```

## Example query: ENSIP-19 default primary name for an address

```graphql
{
  ensv2PrimaryName(id: "0x<40-hex-address>") {
    name
    blockNumber
  }
}
```
