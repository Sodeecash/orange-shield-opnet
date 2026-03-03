/**
 * OrangeShield OTC - MilestoneContract v1.0.0
 * OP_NET Testnet Compatible
 *
 * Payment milestones with dual buyer+seller approval.
 * Partial funds released on each approved milestone.
 */

const MS_COUNT = "ms:count:";
const MS_TITLE = "ms:title:";
const MS_AMOUNT = "ms:amount:";
const MS_STATUS = "ms:status:";
const MS_BUYER_OK = "ms:ab:";
const MS_SELLER_OK = "ms:as:";
const MS_REL_AT = "ms:rel:";
const CORE_ADDR = "ms:core";
const FUND_ADDR = "ms:fund";
const ADMIN_KEY = "ms:admin";

export const enum MilestoneStatus { PENDING = 0, APPROVED = 1, RELEASED = 2, DISPUTED = 3 }

export class MilestoneContract {
  public initialize(admin: string, core: string, fund: string): void {
    if (Storage.getString(ADMIN_KEY)) throw new Error("MilestoneContract: already initialized");
    Storage.setString(ADMIN_KEY, admin);
    Storage.setString(CORE_ADDR, core);
    Storage.setString(FUND_ADDR, fund);
  }

  public createMilestones(escrowId: bigint, titles: string[], amounts: bigint[], caller: string): void {
    if (!titles.length || titles.length !== amounts.length)
      throw new Error("MilestoneContract: title/amount mismatch");
    if (titles.length > 10) throw new Error("MilestoneContract: max 10 milestones");

    const core = Blockchain.getContract(Storage.getString(CORE_ADDR)!);
    const info = core.getEscrowInfo(escrowId);
    if (info.status !== 1) throw new Error("MilestoneContract: escrow must be FUNDED");
    if (info.buyer !== caller) throw new Error("MilestoneContract: only buyer sets milestones");

    const total = amounts.reduce((a: bigint, b: bigint) => a + b, 0n);
    if (total !== info.amount)
      throw new Error(`MilestoneContract: sum ${total} != escrow ${info.amount}`);

    const eid = escrowId.toString();
    Storage.setUint8(`${MS_COUNT}${eid}`, titles.length);
    for (let i = 0; i < titles.length; i++) {
      Storage.setString(`${MS_TITLE}${eid}:${i}`, titles[i]);
      Storage.setUint256(`${MS_AMOUNT}${eid}:${i}`, amounts[i]);
      Storage.setUint8(`${MS_STATUS}${eid}:${i}`, MilestoneStatus.PENDING);
    }
    core.updateStatus(escrowId, 2, Blockchain.contractAddress());
    Blockchain.emit("MilestonesCreated", { escrowId, titles, amounts, caller });
  }

  public approveMilestone(escrowId: bigint, milestoneIndex: number, caller: string): void {
    const core = Blockchain.getContract(Storage.getString(CORE_ADDR)!);
    const info = core.getEscrowInfo(escrowId);
    if (info.status !== 2) throw new Error("MilestoneContract: escrow not ACTIVE");
    if (caller !== info.buyer && caller !== info.seller)
      throw new Error("MilestoneContract: only buyer or seller");

    const eid = escrowId.toString();
    const count = Storage.getUint8(`${MS_COUNT}${eid}`) ?? 0;
    if (milestoneIndex >= count) throw new Error("MilestoneContract: index out of range");

    const mKey = `${eid}:${milestoneIndex}`;
    if ((Storage.getUint8(`${MS_STATUS}${eid}:${milestoneIndex}`) ?? 0) !== 0)
      throw new Error("MilestoneContract: not pending");

    if (caller === info.buyer)  Storage.setBool(`${MS_BUYER_OK}${mKey}`, true);
    if (caller === info.seller) Storage.setBool(`${MS_SELLER_OK}${mKey}`, true);

    const buyerOk  = Storage.getBool(`${MS_BUYER_OK}${mKey}`)  ?? false;
    const sellerOk = Storage.getBool(`${MS_SELLER_OK}${mKey}`) ?? false;

    if (buyerOk && sellerOk) {
      Storage.setUint8(`${MS_STATUS}${eid}:${milestoneIndex}`, MilestoneStatus.RELEASED);
      Storage.setUint64(`${MS_REL_AT}${mKey}`, Blockchain.blockTimestamp());
      const amount = Storage.getUint256(`${MS_AMOUNT}${eid}:${milestoneIndex}`) ?? 0n;
      const fund = Blockchain.getContract(Storage.getString(FUND_ADDR)!);
      fund.releaseFunds(escrowId, info.seller, amount, Blockchain.contractAddress());

      let allDone = true;
      for (let i = 0; i < count; i++) {
        if ((Storage.getUint8(`${MS_STATUS}${eid}:${i}`) ?? 0) !== MilestoneStatus.RELEASED) {
          allDone = false; break;
        }
      }
      if (allDone) {
        core.updateStatus(escrowId, 4, Blockchain.contractAddress());
        Blockchain.emit("EscrowCompleted", { escrowId, timestamp: Blockchain.blockTimestamp() });
      }
      Blockchain.emit("MilestoneReleased", { escrowId, milestoneIndex, amount, recipient: info.seller });
    }
  }

  public getMilestones(escrowId: bigint) {
    const eid = escrowId.toString();
    const count = Storage.getUint8(`${MS_COUNT}${eid}`) ?? 0;
    const result = [];
    for (let i = 0; i < count; i++) {
      result.push({
        title:    Storage.getString(`${MS_TITLE}${eid}:${i}`) ?? "",
        amount:   Storage.getUint256(`${MS_AMOUNT}${eid}:${i}`) ?? 0n,
        status:   Storage.getUint8(`${MS_STATUS}${eid}:${i}`) ?? 0,
        buyerOk:  Storage.getBool(`${MS_BUYER_OK}${eid}:${i}`) ?? false,
        sellerOk: Storage.getBool(`${MS_SELLER_OK}${eid}:${i}`) ?? false,
      });
    }
    return result;
  }
}
