// Import types and APIs from graph-ts
import {
  Bytes
} from '@graphprotocol/graph-ts'
  
import {
  createEventID, concat
} from './utils'
  
// Import event types from the registry contract ABI
import {
  NameWrapped as NameWrappedEvent,
  NameUnwrapped as NameUnwrappedEvent,
  FusesBurned as FusesBurnedEvent
} from './types/NameWrapper/NameWrapper'
  
  
// Import entity types generated from the GraphQL schema
import { Account, Domain, NameWrapped, NameUnwrapped, FusesBurned } from './types/schema'

function decodeName (buf:Bytes):Array<string> {
  let offset = 0
  let list = Bytes.fromHexString('')
  let dot = Bytes.fromHexString('2e')
  let len = buf[offset++]
  let hex = buf.toHexString()
  let firstLabel = ''
  if (len === 0) {
    return [firstLabel, '.']
  }
  
  while (len) {
    let label = hex.slice((offset +1 ) * 2, (offset + 1 + len ) * 2)
    let labelBytes = Bytes.fromHexString(label)
  
    if(offset > 1){
      list = concat(list, dot)
    }else{
      firstLabel = labelBytes.toString()
    }
    list = concat(list, labelBytes)
    offset += len
    len = buf[offset++]
  }
  return [firstLabel, list.toString()]
}

export function handleNameWrapped(event: NameWrappedEvent): void {
  let decoded = decodeName(event.params.name)
  let label = decoded[0]
  let name = decoded[1]
  let node = event.params.node
  let fuses = event.params.fuses
  let blockNumber = event.block.number.toI32()
  let transactionID = event.transaction.hash
  let owner = Account.load(event.params.owner.toHex())
  let domain = Domain.load(node.toHex())

  if(!domain.labelName){
    domain.labelName = label
    domain.name = name
  }
  domain.owner = owner.id
  domain.fuses = fuses
  domain.save()

  let nameWrappedEvent = new NameWrapped(createEventID(event))  
  nameWrappedEvent.domain = domain.id
  nameWrappedEvent.name = name
  nameWrappedEvent.fuses = fuses
  nameWrappedEvent.owner = owner.id
  nameWrappedEvent.blockNumber = blockNumber
  nameWrappedEvent.transactionID = transactionID
  nameWrappedEvent.save()
}

export function handleNameUnwrapped(event: NameUnwrappedEvent): void {
  let node = event.params.node
  let blockNumber = event.block.number.toI32()
  let transactionID = event.transaction.hash
  let owner = Account.load(event.params.owner.toHex())
  let domain = Domain.load(node.toHex())
  domain.owner = owner.id
  domain.fuses = null
  domain.save()

  let nameUnwrappedEvent = new NameUnwrapped(createEventID(event))  
  nameUnwrappedEvent.domain = domain.id
  nameUnwrappedEvent.owner = owner.id
  nameUnwrappedEvent.blockNumber = blockNumber
  nameUnwrappedEvent.transactionID = transactionID
  nameUnwrappedEvent.save()
}

export function handleFusesBurned(event: FusesBurnedEvent): void {
  let node = event.params.node
  let fuses = event.params.fuses
  let blockNumber = event.block.number.toI32()
  let transactionID = event.transaction.hash
  let domain = Domain.load(node.toHex())
  domain.fuses = fuses
  domain.save()
  let fusesBurnedEvent = new FusesBurned(createEventID(event))  
  fusesBurnedEvent.domain = domain.id
  fusesBurnedEvent.fuses = fuses
  fusesBurnedEvent.blockNumber = blockNumber
  fusesBurnedEvent.transactionID = transactionID
  fusesBurnedEvent.save()
}
