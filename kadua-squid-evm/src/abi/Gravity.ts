import * as ethers from 'ethers'
import {LogEvent, Func, ContractBase} from './abi.support'
import {ABI_JSON} from './Gravity.abi'

export const abi = new ethers.Interface(ABI_JSON);

export const events = {
    NewGravatar: new LogEvent<([id: bigint, owner: string, displayName: string, imageUrl: string] & {id: bigint, owner: string, displayName: string, imageUrl: string})>(
        abi, '0x9ab3aefb2ba6dc12910ac1bce4692cf5c3c0d06cff16327c64a3ef78228b130b'
    ),
    UpdatedGravatar: new LogEvent<([id: bigint, owner: string, displayName: string, imageUrl: string] & {id: bigint, owner: string, displayName: string, imageUrl: string})>(
        abi, '0x76571b7a897a1509c641587568218a290018fbdc8b9a724f17b77ff0eec22c0c'
    ),
}

export const functions = {
    updateGravatarImage: new Func<[_imageUrl: string], {_imageUrl: string}, []>(
        abi, '0x0081d6e5'
    ),
    setMythicalGravatar: new Func<[], {}, []>(
        abi, '0x1d4f2c6d'
    ),
    getGravatar: new Func<[owner: string], {owner: string}, [_: string, _: string]>(
        abi, '0x359c1f72'
    ),
    gravatarToOwner: new Func<[_: bigint], {}, string>(
        abi, '0x88d0d391'
    ),
    ownerToGravatar: new Func<[_: string], {}, bigint>(
        abi, '0xa5ac3634'
    ),
    updateGravatarName: new Func<[_displayName: string], {_displayName: string}, []>(
        abi, '0xb18588fb'
    ),
    createGravatar: new Func<[_displayName: string, _imageUrl: string], {_displayName: string, _imageUrl: string}, []>(
        abi, '0xcdb3344a'
    ),
    gravatars: new Func<[_: bigint], {}, ([owner: string, displayName: string, imageUrl: string] & {owner: string, displayName: string, imageUrl: string})>(
        abi, '0xd5ce24ed'
    ),
}

export class Contract extends ContractBase {

    getGravatar(owner: string): Promise<[_: string, _: string]> {
        return this.eth_call(functions.getGravatar, [owner])
    }

    gravatarToOwner(arg0: bigint): Promise<string> {
        return this.eth_call(functions.gravatarToOwner, [arg0])
    }

    ownerToGravatar(arg0: string): Promise<bigint> {
        return this.eth_call(functions.ownerToGravatar, [arg0])
    }

    gravatars(arg0: bigint): Promise<([owner: string, displayName: string, imageUrl: string] & {owner: string, displayName: string, imageUrl: string})> {
        return this.eth_call(functions.gravatars, [arg0])
    }
}
