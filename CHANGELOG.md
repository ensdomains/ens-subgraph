# Changelog

Version labels match the Subgraph Studio deployments of the mainnet subgraph
`5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH`.

## Unreleased

- `Account.ensv2PrimaryNames`: derived link from an account to its ENSIP-19
  default primary name (#25, #38).
- README: self-hosting notes (graph-node version, `ens_names` rainbow table
  for ENSv1 subname labels, duplicate log-index RPCs, pruning) (#62, #30,
  #77, #68).
- Refresh `WrappedDomain.expiryDate` when a wrapped `.eth` name is renewed
  through the BaseRegistrar. The NameWrapper normalises its expiry on read
  (registrar expiry + 90 days) without emitting `ExpiryExtended`, so the
  subgraph value went stale after every such renewal: 75,043 wrapped names
  were affected on mainnet at 2026-10-30 (#89).

## v2.0.2 (2026-10-30)

- Classify registries deployed against the ENS app's mainnet
  `UserRegistryImpl` (`0xC927bCaA…`) as `USER`. On v2.0.1 those 286
  registries read `kind: UNKNOWN`; their names were otherwise indexed and
  projected correctly. `ENSv2Registry.kind` is the only field affected.

## v2.0.1 (2026-10-30), published to production

First ENSv2 release. Indexes ENSv2 registries, namespaces, slots, paths,
resources, tokens, registrations, resolvers, roles and ENSIP-19 primary names
alongside the unchanged ENSv1 entities, and projects ENSv2 state into the
legacy `Domain` / `Registration` / `Resolver` / `WrappedDomain` entities.

Behaviour changes for consumers of the legacy entities:

- `Domain.owner` of a migrated name stays the retired ENSv1 registry owner
  (the Graveyard for unwrapped names, the NameWrapper for wrapped ones).
  `registrant`, `wrappedOwner` and the ENSv2 entities carry the real holder.
  List an address's names by `registrant`/`wrappedOwner`/`resolvedAddress` as
  well as `owner`.
- `Domain.expiryDate` for migrated and ENSv2-native names includes the ENSv2
  grace period (28 days), not ENSv1's 90 days. Read `Registration.expiryDate`
  for the raw expiry.
- Never-expiring names (`2^64-1` on chain) are written as `8640000000000` on
  `Domain`, `Registration` and `WrappedDomain` `expiryDate`; native ENSv2
  entities and event entities keep the raw value.
- `indexerHints: prune: auto` is enabled: time-travel queries
  (`block: { number }`) are only served for recent blocks.
- Root paths (`eth`, `reverse`) are native ENSv2 entities only and never
  overwrite the ENSv1 TLD `Domain` rows.
- Legacy `Domain.subdomainCount` is maintained for projected names
  (incremented on registration, decremented on unregister, restored on
  re-registration).

Deployment: specVersion 1.3.0 / apiVersion 0.0.9 (graph-node >= 0.38);
CI pinned to `ubuntu-24.04` for the matchstick binary.

## v1.1.0 and earlier

ENSv1-only subgraph. See git history.
