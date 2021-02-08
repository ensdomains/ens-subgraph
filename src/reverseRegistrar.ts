import { SetNameCall } from "./types/ReverseRegistrar/ReverseRegistrar";
import { Account, ReverseRegistration } from "./types/schema";

export function handleSetName(call: SetNameCall): void {
    const registration = new ReverseRegistration(call.transaction.hash.toHexString())
    const account = new Account(call.from.toHexString())
    account.save()
    registration.registrant = account.id
    registration.name = call.inputs.name
    registration.block = call.block.number
    registration.timestamp = call.block.timestamp
    registration.save()
}