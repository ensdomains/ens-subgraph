// Import types and APIs from graph-ts
import {
  BigInt,
  crypto,
  ens
} from '@graphprotocol/graph-ts'

import {
  createEventID, concat, ROOT_NODE, EMPTY_ADDRESS
} from './utils'

// Import event types from the registry contract ABI
import {
  NewOwner as NewOwnerEvent,
  Transfer as TransferEvent,
  NewResolver as NewResolverEvent,
  NewTTL as NewTTLEvent
} from './types/ENSRegistry/EnsRegistry'

// Import entity types generated from the GraphQL schema
import { Account, Domain, Resolver, NewOwner, Transfer, NewResolver, NewTTL } from './types/schema'

const BIG_INT_ZERO = BigInt.fromI32(0)

function createDomain(node: string, timestamp: BigInt): Domain {
  let domain = new Domain(node)
  if(node == ROOT_NODE) {
    domain = new Domain(node)
    domain.owner = EMPTY_ADDRESS
    domain.isMigrated = true
    domain.createdAt = timestamp
    domain.save()
  }
  return domain
}

function getDomain(node: string, timestamp: BigInt = BIG_INT_ZERO): Domain|null {
  let domain = Domain.load(node)
  if(domain == null && node == ROOT_NODE) {
    return createDomain(node, timestamp)
  }
  return domain
}

// Handler for NewOwner events
function _handleNewOwner(event: NewOwnerEvent, isMigrated: boolean): void {
  let account = new Account(event.params.owner.toHexString())
  account.save()

  let subnode = crypto.keccak256(concat(event.params.node, event.params.label)).toHexString()
  let domain = getDomain(subnode, event.block.timestamp);
  if(domain == null) {
    domain = new Domain(subnode)
    domain.createdAt = event.block.timestamp
  }

  if(domain.name == null) {
    // Get label and node names
    let label = ens.nameByHash(event.params.label.toHexString())
    if (label != null) {
      domain.labelName = label
    }

    if(label == null) {
      label = '[' + event.params.label.toHexString().slice(2) + ']'
    }
    if(event.params.node.toHexString() == '0x0000000000000000000000000000000000000000000000000000000000000000') {
      domain.name = label
    } else {
      let parent = Domain.load(event.params.node.toHexString())
      domain.name = label + '.' + parent.name
    }
  }

  domain.owner = account.id
  domain.parent = event.params.node.toHexString()
  domain.labelhash = event.params.label
  domain.isMigrated = isMigrated
  domain.save()

  let domainEvent = new NewOwner(createEventID(event))
  domainEvent.blockNumber = event.block.number.toI32()
  domainEvent.transactionID = event.transaction.hash
  domainEvent.parentDomain = event.params.node.toHexString()
  domainEvent.domain = domain.id
  domainEvent.owner = account.id
  domainEvent.save()
}

// Handler for Transfer events
export function handleTransfer(event: TransferEvent): void {
  let node = event.params.node.toHexString()

  let account = new Account(event.params.owner.toHexString())
  account.save()

  // Update the domain owner
  let domain = getDomain(node)
  domain.owner = account.id
  domain.save()

  let domainEvent = new Transfer(createEventID(event))
  domainEvent.blockNumber = event.block.number.toI32()
  domainEvent.transactionID = event.transaction.hash
  domainEvent.domain = node
  domainEvent.owner = account.id
  domainEvent.save()
}

// Handler for NewResolver events
export function handleNewResolver(event: NewResolverEvent): void {
  let id = event.params.resolver.toHexString().concat('-').concat(event.params.node.toHexString())

  let node = event.params.node.toHexString()
  let domain = getDomain(node)
  domain.resolver = id

  let resolver = Resolver.load(id)
  if(resolver == null) {
    resolver = new Resolver(id)
    resolver.domain = event.params.node.toHexString()
    resolver.address = event.params.resolver
    resolver.save()
  } else {
    domain.resolvedAddress = resolver.addr
  }

  domain.save()

  let domainEvent = new NewResolver(createEventID(event))
  domainEvent.blockNumber = event.block.number.toI32()
  domainEvent.transactionID = event.transaction.hash
  domainEvent.domain = node
  domainEvent.resolver = id
  domainEvent.save()
}

// Handler for NewTTL events
export function handleNewTTL(event: NewTTLEvent): void {
  let node = event.params.node.toHexString()
  let domain = getDomain(node)
  domain.ttl = event.params.ttl
  domain.save()

  let domainEvent = new NewTTL(createEventID(event))
  domainEvent.blockNumber = event.block.number.toI32()
  domainEvent.transactionID = event.transaction.hash
  domainEvent.domain = node
  domainEvent.ttl = event.params.ttl
  domainEvent.save()
}

export function handleNewOwner(event: NewOwnerEvent): void {
  _handleNewOwner(event, true)
}

export function handleNewOwnerOldRegistry(event: NewOwnerEvent): void {
  let subnode = crypto.keccak256(concat(event.params.node, event.params.label)).toHexString()
  let domain = getDomain(subnode)

  if(domain == null || domain.isMigrated == false){
    _handleNewOwner(event, false)
  }
}

export function handleNewResolverOldRegistry(event: NewResolverEvent): void {
  let node = event.params.node.toHexString()
  let domain = getDomain(node, event.block.timestamp)
  if(node == ROOT_NODE || !domain.isMigrated){
    handleNewResolver(event)
  }
}
export function handleNewTTLOldRegistry(event: NewTTLEvent): void {
  let domain = getDomain(event.params.node.toHexString())

  if(domain.isMigrated == false){
    handleNewTTL(event)
  }
}

export function handleTransferOldRegistry(event: TransferEvent): void {
  let domain = getDomain(event.params.node.toHexString())

  if(domain.isMigrated == false){
    handleTransfer(event)
  }
}
