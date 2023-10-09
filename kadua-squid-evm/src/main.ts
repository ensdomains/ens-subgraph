function extractData(evmLog: any): { id: bigint, owner: string, displayName: string, imageUrl: string} {
    if (evmLog.topics[0] === events.NewGravatar.topic) {
      return events.NewGravatar.decode(evmLog)
    }
    if (evmLog.topics[0] === events.UpdatedGravatar.topic) {
      return events.UpdatedGravatar.decode(evmLog)
    }
    throw new Error('Unsupported topic')
  }
  
import { TypeormDatabase } from '@subsquid/typeorm-store'
import { decodeHex } from '@subsquid/evm-processor'
import { events } from './abi/Gravity'
import { Gravatar } from './model'
import { processor, GRAVATAR_CONTRACT } from './processor'

processor.run(new TypeormDatabase({supportHotBlocks: true}), async (ctx) => {
  const gravatars: Map<string, Gravatar> = new Map()
  for (const c of ctx.blocks) {
    for (const e of c.logs) {
      if (!(e.address === GRAVATAR_CONTRACT &&
            (e.topics[0] === events.NewGravatar.topic ||
             e.topics[0] === events.UpdatedGravatar.topic))) continue
      const { id, owner, displayName, imageUrl } = extractData(e)
      let idString = '0x' + id.toString(16)
      gravatars.set(idString, new Gravatar({
        id: idString,
        owner: decodeHex(owner),
        displayName,
        imageUrl
      }))
    }
  }
  await ctx.store.upsert([...gravatars.values()])
})