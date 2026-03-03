/**
 * OrangeShield OTC - CoreEscrow Contract v1.0.0
 * OP_NET Testnet Compatible
 */

const ESCROW_COUNT_KEY = "ec:count";
const BUYER_KEY = "ec:buyer:";
const SELLER_KEY = "ec:seller:";
const STATUS_KEY = "ec:status:";
const AMOUNT_KEY = "ec:amount:";
const ARB_KEY = "ec:arb:";
const CREATED_KEY = "ec:ts:";
const TITLE_KEY = "ec:title:";
const DESC_KEY = "ec:desc:";
const AUTH_KEY = "ec:auth:";
const ADMIN_KEY = "ec:admin";

export const enum EscrowStatus {
  PENDING = 0, FUNDED = 1, ACTIVE = 2,
  DISPUTED = 3, COMPLETED = 4, REFUNDED = 5, FROZEN = 6,
}

export class CoreEscrow {
  public initialize(adminAddress: string): void {
    if (Storage.getString(ADMIN_KEY)) throw new Error("CoreEscrow: already initialized");
    Storage.setString(ADMIN_KEY, adminAddress);
    Blockchain.emit("Initialized", { admin: adminAddress });
  }

  public createEscrow(
    buyer: string, seller: string, amountSats: bigint,
    arbitrators: string[], title: string, description: string,
  ): bigint {
    if (!buyer || !seller) throw new Error("CoreEscrow: missing participants");
    if (buyer === seller) throw new Error("CoreEscrow: buyer cannot equal seller");
    if (amountSats <= 0n) throw new Error("CoreEscrow: amount must be positive");
    if (arbitrators.length !== 5) throw new Error("CoreEscrow: exactly 5 arbitrators required");
    if (!title || title.length > 128) throw new Error("CoreEscrow: title 1-128 chars");
    const seen = new Set<string>();
    for (const arb of arbitrators) {
      if (!arb) throw new Error("CoreEscrow: empty arbitrator slot");
      if (seen.has(arb)) throw new Error("CoreEscrow: duplicate arbitrator");
      if (arb === buyer || arb === seller) throw new Error("CoreEscrow: arbitrator conflict");
      seen.add(arb);
    }
    const prev = Storage.getUint64(ESCROW_COUNT_KEY) ?? 0n;
    const id = prev + 1n;
    Storage.setUint64(ESCROW_COUNT_KEY, id);
    const eid = id.toString();
    Storage.setString(BUYER_KEY + eid, buyer);
    Storage.setString(SELLER_KEY + eid, seller);
    Storage.setUint256(AMOUNT_KEY + eid, amountSats);
    Storage.setUint8(STATUS_KEY + eid, EscrowStatus.PENDING);
    Storage.setUint64(CREATED_KEY + eid, Blockchain.blockTimestamp());
    Storage.setString(TITLE_KEY + eid, title);
    Storage.setString(DESC_KEY + eid, description);
    for (let i = 0; i < 5; i++) Storage.setString(`${ARB_KEY}${eid}:${i}`, arbitrators[i]);
    Blockchain.emit("EscrowCreated", { escrowId: id, buyer, seller, amountSats, title, arbitrators });
    return id;
  }

  public getEscrowInfo(escrowId: bigint) {
    const eid = escrowId.toString();
    if (!Storage.getString(BUYER_KEY + eid)) throw new Error(`CoreEscrow: #${eid} not found`);
    const arbitrators: string[] = [];
    for (let i = 0; i < 5; i++) arbitrators.push(Storage.getString(`${ARB_KEY}${eid}:${i}`) ?? "");
    return {
      buyer: Storage.getString(BUYER_KEY + eid) ?? "",
      seller: Storage.getString(SELLER_KEY + eid) ?? "",
      amount: Storage.getUint256(AMOUNT_KEY + eid) ?? 0n,
      status: Storage.getUint8(STATUS_KEY + eid) ?? 0,
      createdAt: Storage.getUint64(CREATED_KEY + eid) ?? 0n,
      title: Storage.getString(TITLE_KEY + eid) ?? "",
      description: Storage.getString(DESC_KEY + eid) ?? "",
      arbitrators,
    };
  }

  public updateStatus(escrowId: bigint, newStatus: EscrowStatus, caller: string): void {
    if (!Storage.getBool(AUTH_KEY + caller)) throw new Error("CoreEscrow: unauthorized");
    const eid = escrowId.toString();
    if (!Storage.getString(BUYER_KEY + eid)) throw new Error("CoreEscrow: not found");
    const prev = Storage.getUint8(STATUS_KEY + eid) ?? 0;
    Storage.setUint8(STATUS_KEY + eid, newStatus);
    Blockchain.emit("StatusUpdated", { escrowId, prevStatus: prev, newStatus, changedBy: caller });
  }

  public registerSiblingContract(contractAddress: string, caller: string): void {
    if (Storage.getString(ADMIN_KEY) !== caller) throw new Error("CoreEscrow: admin only");
    Storage.setBool(AUTH_KEY + contractAddress, true);
    Blockchain.emit("SiblingRegistered", { contractAddress });
  }

  public getEscrowCount(): bigint { return Storage.getUint64(ESCROW_COUNT_KEY) ?? 0n; }
}
