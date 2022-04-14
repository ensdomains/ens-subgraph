import { Address, ByteArray, Bytes, ethereum, Value } from "@graphprotocol/graph-ts";
import {
  ABIChanged as ABIChangedEvent,
  AddrChanged as AddrChangedEvent,
  AddressChanged as AddressChangedEvent,
  AuthorisationChanged as AuthorisationChangedEvent,
  ContenthashChanged as ContenthashChangedEvent,
  InterfaceChanged as InterfaceChangedEvent,
  NameChanged as NameChangedEvent,
  PubkeyChanged as PubkeyChangedEvent,
  TextChanged as TextChangedEvent
} from './types/Resolver/Resolver';
import {
  AbiChanged, Account, AddrChanged, AuthorisationChanged, ContenthashChanged, Domain, InterfaceChanged, MulticoinAddrChanged,
  NameChanged, PubkeyChanged, Resolver, TextChanged
} from './types/schema';



export function handleAddrChanged(event: AddrChangedEvent): void {
  let account = new Account(event.params.a.toHexString())
  account.save()

  let resolver = new Resolver(createResolverID(event.params.node, event.address))
  resolver.domain = event.params.node.toHexString()
  resolver.address = event.address
  resolver.addr = event.params.a.toHexString()
  resolver.save()

  let domain = Domain.load(event.params.node.toHexString())
  if(domain && domain.resolver == resolver.id) {
    domain.resolvedAddress = event.params.a.toHexString()
    domain.save()
  }

  let resolverEvent = new AddrChanged(createEventID(event))
  resolverEvent.resolver = resolver.id
  resolverEvent.blockNumber = event.block.number.toI32()
  resolverEvent.transactionID = event.transaction.hash
  resolverEvent.addr = event.params.a.toHexString()
  resolverEvent.save()
}

export function handleMulticoinAddrChanged(event: AddressChangedEvent): void {
  let resolver = getOrCreateResolver(event.params.node, event.address)

  let coinType = event.params.coinType
  if(resolver.coinTypes == null) {
    resolver.coinTypes = [coinType];
    resolver.save();
  } else {
    let coinTypes = resolver.coinTypes!
    if(!coinTypes.includes(coinType)){
      coinTypes.push(coinType)
      resolver.coinTypes = coinTypes
      resolver.save()
    }
  }

  let resolverEvent = new MulticoinAddrChanged(createEventID(event))
  resolverEvent.resolver = resolver.id
  resolverEvent.blockNumber = event.block.number.toI32()
  resolverEvent.transactionID = event.transaction.hash
  resolverEvent.coinType = coinType
  resolverEvent.addr = event.params.newAddress
  resolverEvent.save()
}

export function handleNameChanged(event: NameChangedEvent): void {
  if(event.params.name.indexOf("\u0000") != -1) return;
  
  let resolverEvent = new NameChanged(createEventID(event))
  resolverEvent.resolver = createResolverID(event.params.node, event.address)
  resolverEvent.blockNumber = event.block.number.toI32()
  resolverEvent.transactionID = event.transaction.hash
  resolverEvent.name = event.params.name
  resolverEvent.save()
}

export function handleABIChanged(event: ABIChangedEvent): void {
  let resolverEvent = new AbiChanged(createEventID(event))
  resolverEvent.resolver = createResolverID(event.params.node, event.address)
  resolverEvent.blockNumber = event.block.number.toI32()
  resolverEvent.transactionID = event.transaction.hash
  resolverEvent.contentType = event.params.contentType
  resolverEvent.save()
}

export function handlePubkeyChanged(event: PubkeyChangedEvent): void {
  let resolverEvent = new PubkeyChanged(createEventID(event))
  resolverEvent.resolver = createResolverID(event.params.node, event.address)
  resolverEvent.blockNumber = event.block.number.toI32()
  resolverEvent.transactionID = event.transaction.hash
  resolverEvent.x = event.params.x
  resolverEvent.y = event.params.y
  resolverEvent.save()
}

export function handleTextChanged(event: TextChangedEvent): void {
  let resolver = getOrCreateResolver(event.params.node, event.address)
  let key = event.params.key;
  if(resolver.texts == null) {
    resolver.texts = [key];
    resolver.save();
  } else {
    let texts = resolver.texts!
    if(!texts.includes(key)){
      texts.push(key)
      resolver.texts = texts
      resolver.save()
    }
  }

  let resolverEvent = new TextChanged(createEventID(event))
  resolverEvent.resolver = createResolverID(event.params.node, event.address)
  resolverEvent.blockNumber = event.block.number.toI32()
  resolverEvent.transactionID = event.transaction.hash
  resolverEvent.key = event.params.key
  // first, we need to find the total number of setText calls in the logs for the transaction
  // then we get the matched index of the setText calls for this event
  const textChangedEvents: ethereum.Log[] = [];
  let textChangedEventIndex = 0;
  for (let i = 0; i < event.receipt!.logs.length; i++) {
    const log = event.receipt!.logs[i];
    if (log.logType == event.logType) {
      textChangedEvents.push(log);
    }
    if (log.logIndex == event.logIndex) {
      textChangedEventIndex = textChangedEvents.length - 1;
    }
  }
  // we need to find where all the setText calls are, so we can use the index we previously got
  // to find the correct setText input.
  const inputBytes = event.transaction.input;
  // convert bytes to hex string so we can make a string comparison
  const inputBytesAsHex = inputBytes.toHexString();
  const hashIndexes = [];
  for (let i = 0; i < inputBytesAsHex.length; i++) {
    if (inputBytesAsHex.slice(i, i + 8) == "10f13a8c") {
      hashIndexes.push(i / 2 - 1);
    }
  }
  // get the index of the function signature we want
  const wantedIndex = hashIndexes[textChangedEventIndex];
  // get the total length of the abi, so we can slice the right amount of bytes
  const abiLength =
    (wantedIndex === 0
      ? event.transaction.input.byteLength
      : parseInt(
          inputBytes.slice(wantedIndex - 32, wantedIndex).toString(),
          16
        )) as i32;
  // strip the function signature by adding 4 bytes to the index
  const position = wantedIndex as i32 + 4;
  // make a slice of the bytes we want, and remove 4 bytes from the end 
  // to accomodate the function signature removal.
  const functionInput = inputBytes.subarray(position, position + abiLength - 4);
  // ethABI decode doesn't allow non-tuples to be decoded, 
  // so we need to make the abi a tuple manually
  const tuplePrefix = ByteArray.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000020")
  const functionInputAsTuple = new Uint8Array(tuplePrefix.length + functionInput.length);
  functionInputAsTuple.set(tuplePrefix, 0);
  functionInputAsTuple.set(functionInput, tuplePrefix.length);
  const tupleInputBytes = Bytes.fromUint8Array(functionInputAsTuple);
  const decodedAbi = ethereum.decode(
    "(bytes32,string,string)",
    tupleInputBytes
  );
  if (decodedAbi != null) {
    const decodedTuple = decodedAbi.toTuple();
    resolverEvent.value = decodedTuple[2].toString();
  } else {
    resolverEvent.value = null;
  }
  resolverEvent.save()
}

export function handleContentHashChanged(event: ContenthashChangedEvent): void {
  let resolver = getOrCreateResolver(event.params.node, event.address)
  resolver.contentHash = event.params.hash
  resolver.save()
  
  let resolverEvent = new ContenthashChanged(createEventID(event))
  resolverEvent.resolver = createResolverID(event.params.node, event.address)
  resolverEvent.blockNumber = event.block.number.toI32()
  resolverEvent.transactionID = event.transaction.hash
  resolverEvent.hash = event.params.hash
  resolverEvent.save()
}

export function handleInterfaceChanged(event: InterfaceChangedEvent): void {
  let resolverEvent = new InterfaceChanged(createEventID(event))
  resolverEvent.resolver = createResolverID(event.params.node, event.address)
  resolverEvent.blockNumber = event.block.number.toI32()
  resolverEvent.transactionID = event.transaction.hash
  resolverEvent.interfaceID = event.params.interfaceID
  resolverEvent.implementer = event.params.implementer
  resolverEvent.save()
}

export function handleAuthorisationChanged(event: AuthorisationChangedEvent): void {
  let resolverEvent = new AuthorisationChanged(createEventID(event))
  resolverEvent.blockNumber = event.block.number.toI32()
  resolverEvent.transactionID = event.transaction.hash
  resolverEvent.resolver = createResolverID(event.params.node, event.address)
  resolverEvent.owner = event.params.owner
  resolverEvent.target = event.params.target
  resolverEvent.isAuthorized = event.params.isAuthorised
  resolverEvent.save()
}

function getOrCreateResolver(node: Bytes, address: Address): Resolver {
  let id = createResolverID(node, address)
  let resolver = Resolver.load(id)
  if(resolver === null) {
    resolver = new Resolver(id)
    resolver.domain = node.toHexString()
    resolver.address = address
  }
  return resolver as Resolver
}

function createEventID(event: ethereum.Event): string {
  return event.block.number.toString().concat('-').concat(event.logIndex.toString())
}

function createResolverID(node: Bytes, resolver: Address): string {
  return resolver.toHexString().concat('-').concat(node.toHexString())
}
