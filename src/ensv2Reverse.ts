// ENSIP-19 "default" (chain-agnostic) reverse resolution — DefaultReverseRegistrar
// is a single, pre-existing contract (not redeployed per contracts-v2
// release, unlike RootRegistry/ETHRegistry/etc.), so its address is a fixed
// per-network constant like the legacy v1 ENSRegistry's, not something
// sourced from contracts-v2/contracts/deployments/sepolia/*.json.
//
// Deliberately scoped to this one event/contract — see schema.graphql's
// comment on ENSv2PrimaryName for why the legacy addr.reverse scheme and
// other chains' L2ReverseRegistrar are out of scope here.
import { createOrLoadAccount } from "./utils";
import { ENSv2PrimaryName } from "./types/schema";
import { NameForAddrChanged } from "./types/DefaultReverseRegistrar/DefaultReverseRegistrar";

export function handleNameForAddrChanged(event: NameForAddrChanged): void {
  let account = createOrLoadAccount(event.params.addr);
  let id = event.params.addr;

  let primaryName = ENSv2PrimaryName.load(id);
  if (primaryName == null) {
    primaryName = new ENSv2PrimaryName(id);
    primaryName.account = account.id;
  }

  // Empty string is this contract's own clearing convention
  // (StandaloneReverseRegistrar._setName always emits unconditionally, with
  // no separate "name removed" event) — matches the clear-to-null pattern
  // used elsewhere in this schema.
  let name = event.params.name;
  primaryName.name = name.length > 0 ? name : null;
  primaryName.blockNumber = event.block.number;
  primaryName.transactionID = event.transaction.hash;
  primaryName.logIndex = event.logIndex;
  primaryName.save();
}
