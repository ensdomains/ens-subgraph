import { Address, BigInt, Bytes, ethereum } from "@graphprotocol/graph-ts";
import {
  assert,
  beforeAll,
  describe,
  newMockEvent,
  test,
} from "matchstick-as/assembly/index";
import { handleNewOwner } from "../src/ensRegistry";
import {
  handleNameRegistered,
  handleNameRegisteredByUnwrappedController,
  handleNameRegisteredByWrappedController,
  handleNameRenewedByUnwrappedController,
} from "../src/ethRegistrar";
import { NameRegistered } from "../src/types/BaseRegistrar/BaseRegistrar";
import { Registration } from "../src/types/schema";
import {
  NameRegistered as UnwrappedEthRegistrarController_NameRegistered,
  NameRenewed as UnwrappedEthRegistrarController_NameRenewed,
} from "../src/types/UnwrappedEthRegistrarController/UnwrappedEthRegistrarController";
import { NameRegistered as WrappedEthRegistrarController_NameRegistered } from "../src/types/WrappedEthRegistrarController/WrappedEthRegistrarController";
import { ETH_NODE } from "../src/utils";
import { createNewOwnerEvent, DEFAULT_OWNER, setEthOwner } from "./testUtils";

describe("legacy/wrapped controller", () => {
  const createWrappedEthRegistrarController_NameRegistered = (
    name: string,
    label: string,
    owner: string,
    expires: string
  ): WrappedEthRegistrarController_NameRegistered => {
    let mockEvent = newMockEvent();
    let nameRegisteredByControllerEvent =
      new WrappedEthRegistrarController_NameRegistered(
        mockEvent.address,
        mockEvent.logIndex,
        mockEvent.transactionLogIndex,
        mockEvent.logType,
        mockEvent.block,
        mockEvent.transaction,
        mockEvent.parameters,
        mockEvent.receipt
      );

    nameRegisteredByControllerEvent.parameters = new Array();
    let nameParam = new ethereum.EventParam(
      "name",
      ethereum.Value.fromString(name)
    );
    let labelParam = new ethereum.EventParam(
      "label",
      ethereum.Value.fromBytes(Bytes.fromHexString(label))
    );
    let ownerParam = new ethereum.EventParam(
      "owner",
      ethereum.Value.fromAddress(Address.fromString(owner))
    );
    let baseCostParam = new ethereum.EventParam(
      "baseCost",
      ethereum.Value.fromSignedBigInt(BigInt.fromI32(0))
    );
    let premiumParam = new ethereum.EventParam(
      "premium",
      ethereum.Value.fromSignedBigInt(BigInt.fromI32(0))
    );
    let expiresParam = new ethereum.EventParam(
      "expires",
      ethereum.Value.fromSignedBigInt(BigInt.fromString(expires))
    );
    nameRegisteredByControllerEvent.parameters.push(nameParam);
    nameRegisteredByControllerEvent.parameters.push(labelParam);
    nameRegisteredByControllerEvent.parameters.push(ownerParam);
    nameRegisteredByControllerEvent.parameters.push(baseCostParam);
    nameRegisteredByControllerEvent.parameters.push(premiumParam);
    nameRegisteredByControllerEvent.parameters.push(expiresParam);

    return nameRegisteredByControllerEvent;
  };

  const createNameRegisteredEvent = (
    id: string,
    owner: string,
    expires: string
  ): NameRegistered => {
    let mockEvent = newMockEvent();
    let newNameRegisteredEvent = new NameRegistered(
      mockEvent.address,
      mockEvent.logIndex,
      mockEvent.transactionLogIndex,
      mockEvent.logType,
      mockEvent.block,
      mockEvent.transaction,
      mockEvent.parameters,
      mockEvent.receipt
    );
    newNameRegisteredEvent.parameters = new Array();
    let idParam = new ethereum.EventParam(
      "id",
      ethereum.Value.fromSignedBigInt(BigInt.fromString(id))
    );
    let ownerParam = new ethereum.EventParam(
      "owner",
      ethereum.Value.fromAddress(Address.fromString(owner))
    );
    let expiresParam = new ethereum.EventParam(
      "expires",
      ethereum.Value.fromSignedBigInt(BigInt.fromString(expires))
    );
    newNameRegisteredEvent.parameters.push(idParam);
    newNameRegisteredEvent.parameters.push(ownerParam);
    newNameRegisteredEvent.parameters.push(expiresParam);
    return newNameRegisteredEvent;
  };

  beforeAll(() => {
    setEthOwner();
  });

  const checkNullLabelName = (
    labelhash: string,
    labelhashAsInt: string,
    label: string
  ): void => {
    const newNewOwnerEvent = createNewOwnerEvent(
      ETH_NODE,
      labelhash,
      DEFAULT_OWNER
    );
    handleNewOwner(newNewOwnerEvent);

    let newRegistrationEvent = createNameRegisteredEvent(
      labelhashAsInt,
      DEFAULT_OWNER,
      "1610000000"
    );
    handleNameRegistered(newRegistrationEvent);

    let fetchedRegistration = Registration.load(labelhash)!;

    // set labelName to null because handleNameRegistered sets it to a mocked value of "default"
    // which comes from ens.nameByHash()
    fetchedRegistration.labelName = null;
    fetchedRegistration.save();

    const nameRegisteredByControllerEvent =
      createWrappedEthRegistrarController_NameRegistered(
        label,
        labelhash,
        DEFAULT_OWNER,
        "1610000000"
      );
    handleNameRegisteredByWrappedController(nameRegisteredByControllerEvent);

    fetchedRegistration = Registration.load(labelhash)!;

    assert.assertNull(fetchedRegistration.labelName);
  };

  test("does not assign label name to null byte label", () => {
    const labelhash =
      "0x465b93df44674596a1f5cd92ec83053bb8a78f6083e1752b3162c739bba1f9ed";
    const labelhashAsInt =
      "31823703059708284547668674100687316300171847632515296374731848165239501748717";
    const label = "default\0";

    checkNullLabelName(labelhash, labelhashAsInt, label);
  });

  test("does not assign label name to label with '.' separator", () => {
    const labelhash =
      "0xf8a2e15376341ae37c90b754e5ef3f1e43d1d136a5c7ba6b34c50b466848dfbc";
    const labelhashAsInt =
      "112461370816196049012812662280597321405198137204162513382374556989424524648380";
    const label = "test.123";

    checkNullLabelName(labelhash, labelhashAsInt, label);
  });

  test("does not assign label name to label with '[' char", () => {
    const labelhash =
      "0x6d2df8d29c51e5e79bce0067df6a093fd7e535f1fe0a509ead1eb5a2171640c9";
    const labelhashAsInt =
      "49383325924636276199200854251362239534766035480602437112552046254651845525705";
    const label =
      "[41ff1915eef2bf5841388d748bfcd23bd49ff5521ca4200c20bc0978b136c3cb";

    checkNullLabelName(labelhash, labelhashAsInt, label);
  });

  test("does not assign label name to label with ']' char", () => {
    const labelhash =
      "0xb9cf267ed9b0cb8caf44655901be5b66f2e6bbedd8dc1436fba973f7a824db58";
    const labelhashAsInt =
      "84043880016553362091807057514212448616446700818045523307434280128309910362968";
    const label =
      "41ff1915eef2bf5841388d748bfcd23bd49ff5521ca4200c20bc0978b136c3cb]";

    checkNullLabelName(labelhash, labelhashAsInt, label);
  });

  test("does not assign label name to label that uses unnormalised label notation", () => {
    const labelhash =
      "0x162894963b59f9b7e47a34709830c0211a6ba5f7de3973839f3ee7002e0c8434";
    const labelhashAsInt =
      "10022582060124759960163130513734713560279061696053801337665848910969813369908";
    const label =
      "[41ff1915eef2bf5841388d748bfcd23bd49ff5521ca4200c20bc0978b136c3cb]";

    checkNullLabelName(labelhash, labelhashAsInt, label);
  });

  test("does assign normal label", () => {
    const labelhash =
      "0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658";
    const labelhashAsInt =
      "70622639689279718371527342103894932928233838121221666359043189029713682937432";
    const label = "test";

    const newNewOwnerEvent = createNewOwnerEvent(
      ETH_NODE,
      labelhash,
      DEFAULT_OWNER
    );
    handleNewOwner(newNewOwnerEvent);

    let newRegistrationEvent = createNameRegisteredEvent(
      labelhashAsInt,
      DEFAULT_OWNER,
      "1610000000"
    );
    handleNameRegistered(newRegistrationEvent);

    let fetchedRegistration = Registration.load(labelhash)!;

    fetchedRegistration.labelName = "eth";
    fetchedRegistration.save();

    const nameRegisteredByControllerEvent =
      createWrappedEthRegistrarController_NameRegistered(
        label,
        labelhash,
        DEFAULT_OWNER,
        "1610000000"
      );
    handleNameRegisteredByWrappedController(nameRegisteredByControllerEvent);

    fetchedRegistration = Registration.load(labelhash)!;

    assert.assertTrue(fetchedRegistration.labelName == label);
  });
});

describe("unwrapped controller", () => {
  const createUnwrappedEthRegistrarController_NameRegistered = (
    label: string,
    labelhash: string,
    owner: string,
    baseCost: string,
    premium: string,
    expires: string,
    referrer: string = "0x0000000000000000000000000000000000000000000000000000000000000000"
  ): UnwrappedEthRegistrarController_NameRegistered => {
    let mockEvent = newMockEvent();
    let nameRegisteredEvent =
      new UnwrappedEthRegistrarController_NameRegistered(
        mockEvent.address,
        mockEvent.logIndex,
        mockEvent.transactionLogIndex,
        mockEvent.logType,
        mockEvent.block,
        mockEvent.transaction,
        mockEvent.parameters,
        mockEvent.receipt
      );

    nameRegisteredEvent.parameters = new Array();
    let labelParam = new ethereum.EventParam(
      "label",
      ethereum.Value.fromString(label)
    );
    let labelhashParam = new ethereum.EventParam(
      "labelhash",
      ethereum.Value.fromBytes(Bytes.fromHexString(labelhash))
    );
    let ownerParam = new ethereum.EventParam(
      "owner",
      ethereum.Value.fromAddress(Address.fromString(owner))
    );
    let baseCostParam = new ethereum.EventParam(
      "baseCost",
      ethereum.Value.fromSignedBigInt(BigInt.fromString(baseCost))
    );
    let premiumParam = new ethereum.EventParam(
      "premium",
      ethereum.Value.fromSignedBigInt(BigInt.fromString(premium))
    );
    let expiresParam = new ethereum.EventParam(
      "expires",
      ethereum.Value.fromSignedBigInt(BigInt.fromString(expires))
    );
    let referrerParam = new ethereum.EventParam(
      "referrer",
      ethereum.Value.fromBytes(Bytes.fromHexString(referrer))
    );

    nameRegisteredEvent.parameters.push(labelParam);
    nameRegisteredEvent.parameters.push(labelhashParam);
    nameRegisteredEvent.parameters.push(ownerParam);
    nameRegisteredEvent.parameters.push(baseCostParam);
    nameRegisteredEvent.parameters.push(premiumParam);
    nameRegisteredEvent.parameters.push(expiresParam);
    nameRegisteredEvent.parameters.push(referrerParam);

    return nameRegisteredEvent;
  };

  const createUnwrappedEthRegistrarController_NameRenewed = (
    label: string,
    labelhash: string,
    cost: string,
    expires: string,
    referrer: string = "0x0000000000000000000000000000000000000000000000000000000000000000"
  ): UnwrappedEthRegistrarController_NameRenewed => {
    let mockEvent = newMockEvent();
    let nameRenewedEvent = new UnwrappedEthRegistrarController_NameRenewed(
      mockEvent.address,
      mockEvent.logIndex,
      mockEvent.transactionLogIndex,
      mockEvent.logType,
      mockEvent.block,
      mockEvent.transaction,
      mockEvent.parameters,
      mockEvent.receipt
    );

    nameRenewedEvent.parameters = new Array();
    let labelParam = new ethereum.EventParam(
      "label",
      ethereum.Value.fromString(label)
    );
    let labelhashParam = new ethereum.EventParam(
      "labelhash",
      ethereum.Value.fromBytes(Bytes.fromHexString(labelhash))
    );
    let costParam = new ethereum.EventParam(
      "cost",
      ethereum.Value.fromSignedBigInt(BigInt.fromString(cost))
    );
    let expiresParam = new ethereum.EventParam(
      "expires",
      ethereum.Value.fromSignedBigInt(BigInt.fromString(expires))
    );
    let referrerParam = new ethereum.EventParam(
      "referrer",
      ethereum.Value.fromBytes(Bytes.fromHexString(referrer))
    );

    nameRenewedEvent.parameters.push(labelParam);
    nameRenewedEvent.parameters.push(labelhashParam);
    nameRenewedEvent.parameters.push(costParam);
    nameRenewedEvent.parameters.push(expiresParam);
    nameRenewedEvent.parameters.push(referrerParam);

    return nameRenewedEvent;
  };

  const createNameRegisteredEvent = (
    id: string,
    owner: string,
    expires: string
  ): NameRegistered => {
    let mockEvent = newMockEvent();
    let newNameRegisteredEvent = new NameRegistered(
      mockEvent.address,
      mockEvent.logIndex,
      mockEvent.transactionLogIndex,
      mockEvent.logType,
      mockEvent.block,
      mockEvent.transaction,
      mockEvent.parameters,
      mockEvent.receipt
    );
    newNameRegisteredEvent.parameters = new Array();
    let idParam = new ethereum.EventParam(
      "id",
      ethereum.Value.fromSignedBigInt(BigInt.fromString(id))
    );
    let ownerParam = new ethereum.EventParam(
      "owner",
      ethereum.Value.fromAddress(Address.fromString(owner))
    );
    let expiresParam = new ethereum.EventParam(
      "expires",
      ethereum.Value.fromSignedBigInt(BigInt.fromString(expires))
    );
    newNameRegisteredEvent.parameters.push(idParam);
    newNameRegisteredEvent.parameters.push(ownerParam);
    newNameRegisteredEvent.parameters.push(expiresParam);
    return newNameRegisteredEvent;
  };

  beforeAll(() => {
    setEthOwner();
  });

  const checkNullLabelNameForUnwrapped = (
    labelhash: string,
    labelhashAsInt: string,
    label: string
  ): void => {
    const newNewOwnerEvent = createNewOwnerEvent(
      ETH_NODE,
      labelhash,
      DEFAULT_OWNER
    );
    handleNewOwner(newNewOwnerEvent);

    let newRegistrationEvent = createNameRegisteredEvent(
      labelhashAsInt,
      DEFAULT_OWNER,
      "1610000000"
    );
    handleNameRegistered(newRegistrationEvent);

    let fetchedRegistration = Registration.load(labelhash)!;

    // set labelName to null because handleNameRegistered sets it to a mocked value of "default"
    // which comes from ens.nameByHash()
    fetchedRegistration.labelName = null;
    fetchedRegistration.save();

    const nameRegisteredByUnwrappedControllerEvent =
      createUnwrappedEthRegistrarController_NameRegistered(
        label,
        labelhash,
        DEFAULT_OWNER,
        "1000000000",
        "0",
        "1610000000"
      );
    handleNameRegisteredByUnwrappedController(
      nameRegisteredByUnwrappedControllerEvent
    );

    fetchedRegistration = Registration.load(labelhash)!;

    assert.assertNull(fetchedRegistration.labelName);
  };

  test("does not assign label name to null byte label", () => {
    const labelhash =
      "0x465b93df44674596a1f5cd92ec83053bb8a78f6083e1752b3162c739bba1f9ed";
    const labelhashAsInt =
      "31823703059708284547668674100687316300171847632515296374731848165239501748717";
    const label = "default\0";

    checkNullLabelNameForUnwrapped(labelhash, labelhashAsInt, label);
  });

  test("does not assign label name to label with '.' separator", () => {
    const labelhash =
      "0xf8a2e15376341ae37c90b754e5ef3f1e43d1d136a5c7ba6b34c50b466848dfbc";
    const labelhashAsInt =
      "112461370816196049012812662280597321405198137204162513382374556989424524648380";
    const label = "test.123";

    checkNullLabelNameForUnwrapped(labelhash, labelhashAsInt, label);
  });

  test("does not assign label name to label with '[' char", () => {
    const labelhash =
      "0x6d2df8d29c51e5e79bce0067df6a093fd7e535f1fe0a509ead1eb5a2171640c9";
    const labelhashAsInt =
      "49383325924636276199200854251362239534766035480602437112552046254651845525705";
    const label =
      "[41ff1915eef2bf5841388d748bfcd23bd49ff5521ca4200c20bc0978b136c3cb";

    checkNullLabelNameForUnwrapped(labelhash, labelhashAsInt, label);
  });

  test("does not assign label name to label with ']' char", () => {
    const labelhash =
      "0xb9cf267ed9b0cb8caf44655901be5b66f2e6bbedd8dc1436fba973f7a824db58";
    const labelhashAsInt =
      "84043880016553362091807057514212448616446700818045523307434280128309910362968";
    const label =
      "41ff1915eef2bf5841388d748bfcd23bd49ff5521ca4200c20bc0978b136c3cb]";

    checkNullLabelNameForUnwrapped(labelhash, labelhashAsInt, label);
  });

  test("does not assign label name to label that uses unnormalised label notation", () => {
    const labelhash =
      "0x162894963b59f9b7e47a34709830c0211a6ba5f7de3973839f3ee7002e0c8434";
    const labelhashAsInt =
      "10022582060124759960163130513734713560279061696053801337665848910969813369908";
    const label =
      "[41ff1915eef2bf5841388d748bfcd23bd49ff5521ca4200c20bc0978b136c3cb]";

    checkNullLabelNameForUnwrapped(labelhash, labelhashAsInt, label);
  });

  test("does assign normal label", () => {
    const labelhash =
      "0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658";
    const labelhashAsInt =
      "70622639689279718371527342103894932928233838121221666359043189029713682937432";
    const label = "test";

    const newNewOwnerEvent = createNewOwnerEvent(
      ETH_NODE,
      labelhash,
      DEFAULT_OWNER
    );
    handleNewOwner(newNewOwnerEvent);

    let newRegistrationEvent = createNameRegisteredEvent(
      labelhashAsInt,
      DEFAULT_OWNER,
      "1610000000"
    );
    handleNameRegistered(newRegistrationEvent);

    let fetchedRegistration = Registration.load(labelhash)!;

    fetchedRegistration.labelName = "eth";
    fetchedRegistration.save();

    const nameRegisteredByUnwrappedControllerEvent =
      createUnwrappedEthRegistrarController_NameRegistered(
        label,
        labelhash,
        DEFAULT_OWNER,
        "1000000000",
        "500000000",
        "1610000000"
      );
    handleNameRegisteredByUnwrappedController(
      nameRegisteredByUnwrappedControllerEvent
    );

    fetchedRegistration = Registration.load(labelhash)!;

    assert.assertTrue(fetchedRegistration.labelName == label);
    assert.assertTrue(
      fetchedRegistration.cost!.equals(BigInt.fromString("1500000000"))
    );
  });

  test("handles renewal correctly", () => {
    const labelhash =
      "0x9c22ff5f21f0b81b113e63f7db6da94fedef11b2119b4088b89664fb9a3cb658";
    const labelhashAsInt =
      "70622639689279718371527342103894932928233838121221666359043189029713682937432";
    const label = "test";

    // First register the name
    const newNewOwnerEvent = createNewOwnerEvent(
      ETH_NODE,
      labelhash,
      DEFAULT_OWNER
    );
    handleNewOwner(newNewOwnerEvent);

    let newRegistrationEvent = createNameRegisteredEvent(
      labelhashAsInt,
      DEFAULT_OWNER,
      "1610000000"
    );
    handleNameRegistered(newRegistrationEvent);

    let fetchedRegistration = Registration.load(labelhash)!;

    fetchedRegistration.labelName = "eth";
    fetchedRegistration.save();

    // Register via unwrapped controller first
    const nameRegisteredByUnwrappedControllerEvent =
      createUnwrappedEthRegistrarController_NameRegistered(
        label,
        labelhash,
        DEFAULT_OWNER,
        "1000000000",
        "0",
        "1610000000"
      );
    handleNameRegisteredByUnwrappedController(
      nameRegisteredByUnwrappedControllerEvent
    );

    fetchedRegistration = Registration.load(labelhash)!;
    assert.assertTrue(fetchedRegistration.labelName == label);
    assert.assertTrue(
      fetchedRegistration.cost!.equals(BigInt.fromString("1000000000"))
    );

    // Now renew it
    const nameRenewedByUnwrappedControllerEvent =
      createUnwrappedEthRegistrarController_NameRenewed(
        label,
        labelhash,
        "2000000000",
        "1620000000"
      );
    handleNameRenewedByUnwrappedController(
      nameRenewedByUnwrappedControllerEvent
    );

    fetchedRegistration = Registration.load(labelhash)!;
    assert.assertTrue(fetchedRegistration.labelName == label);
    assert.assertTrue(
      fetchedRegistration.cost!.equals(BigInt.fromString("2000000000"))
    );
  });

  test("does not process renewal for invalid label", () => {
    const labelhash =
      "0x5565c8492bfb46737a4c15de29b8ad5011d2510ddf5bc46dc28a1d622beb16a6";
    const labelhashAsInt =
      "38626426005097521807023039862862454575472987906264168594156980995768502130342";
    const invalidLabel = "invalid.label";

    // First register the name
    const newNewOwnerEvent = createNewOwnerEvent(
      ETH_NODE,
      labelhash,
      DEFAULT_OWNER
    );
    handleNewOwner(newNewOwnerEvent);

    let newRegistrationEvent = createNameRegisteredEvent(
      labelhashAsInt,
      DEFAULT_OWNER,
      "1610000000"
    );
    handleNameRegistered(newRegistrationEvent);

    let fetchedRegistration = Registration.load(labelhash)!;
    fetchedRegistration.labelName = null;
    fetchedRegistration.cost = BigInt.fromString("1000000000");
    fetchedRegistration.save();

    // Renew
    const nameRenewedByUnwrappedControllerEvent =
      createUnwrappedEthRegistrarController_NameRenewed(
        invalidLabel,
        labelhash,
        "2000000000",
        "1620000000"
      );
    handleNameRenewedByUnwrappedController(
      nameRenewedByUnwrappedControllerEvent
    );

    fetchedRegistration = Registration.load(labelhash)!;
    assert.assertTrue(
      fetchedRegistration.cost!.equals(BigInt.fromString("1000000000"))
    );
    assert.assertNull(fetchedRegistration.labelName);
  });
});
