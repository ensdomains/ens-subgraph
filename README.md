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
- **A missing `Domain` or `ENSv2NamePath` row does not mean a name is invalid or unregistered.** When a registry is linked under a parent *after* it already has registrations ("late-linking"), those pre-existing registrations are deliberately never backfilled into `Domain`/`ENSv2NamePath` — that's a bounded-cost guarantee, not a bug. They're still reachable through `ENSv2Namespace`, `ENSv2NamespaceLink`, and `ENSv2NameSlot`.
- **For full ENSv2 coverage, query the registry/namespace/slot graph directly** rather than relying only on `Domain`/`ENSv2NamePath`.
- **Labels are stored exactly as emitted by ENSv2 registry events.** The subgraph does not expose a `normalizedLabel` field and does not perform ENSIP-15 normalization in mappings — normalize user input client-side before hashing or querying by name.
- **PermissionedResolver is recordId-keyed.** Query `ENSv2ResolverLink` for the resolver + node association, then follow `record` to its current addresses, text, contenthash, data, ABI, and interface state.
- **Legacy `Resolver` projection is current-state compatibility, not resolver history.** Explicitly linked PermissionedResolver records project address/contenthash/text-key state into an existing materialized `Domain`; shared record updates fan out to every active explicit link. The projection does not synthesize classic `ResolverEvent` rows, does not create late-linked `Domain` rows, and leaves name/data/ABI/interface values native-only.
- **Default-record fallback is native-only.** A name with no explicit `_recordIds` entry resolves through the record linked to the DNS root name. That affected name set is not enumerable, so the subgraph does not copy the root record into every legacy `Resolver`. Query the native link/record graph and call `PermissionedResolver.resolve()` when exact effective resolution, including fallback, is required.
- **Shared-record fanout is an accepted Sepolia operational risk.** A record update currently rebuilds the representable legacy snapshot for every active explicit link, so work grows with both linked-name count and the record's observed address/text keys. ENS expects explicit sharing to remain rare and gates it behind `ROLE_LINK`; monitor indexing lag and subgraph health on Sepolia and revisit field-specific fanout or native-only projection if actual usage is materially higher. There is deliberately no silent fanout cap that could leave only some names stale.
- **PublicResolverV2 remains node-keyed.** It emits classic profile events and is covered once by the existing addressless `Resolver` handlers; its `DataChanged` profile is additionally exposed as `ENSv2ResolverData`.
- **`ENSv2PrimaryName` covers only the ENSIP-19 "default" (chain-agnostic) reverse record**, set via `DefaultReverseRegistrar.setName()`/`setNameForAddr()`/`setNameForAddrWithSignature()` — a flat `address → name` mapping, entirely separate from the legacy node-keyed `addr.reverse` scheme (already covered generically by the existing v1 `ENSRegistry`/`Resolver` handlers, since those match any node including reverse ones). A coin-type-specific (non-default) reverse record, or an L2 chain's own reverse registrar, is a different mechanism and out of scope here.
- **Migrated `.eth` names carry both legacy and ENSv2 state.** Once a migrated name reaches `REGISTERED` status, ENSv2 events keep the legacy `Registration`/`Domain`/`WrappedDomain` owner and expiry fields in sync going forward — `domain.owner` itself is never corrected (it reflects the real, retired ENSv1 registry state), only `wrappedOwner`/`registrant`. `Registration.expiryDate` stays the raw ENSv2 expiry; `Domain.expiryDate` includes the ENSv2 grace period on top of it.

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
