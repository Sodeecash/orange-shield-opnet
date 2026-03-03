/**
 * OrangeShield OTC - DisputeContract v1.0.0
 * OP_NET Testnet Compatible
 *
 * Files disputes, freezes escrow, triggers arbitration.
 * One dispute per escrow. Buyer or seller can file.
 */

const DISPUTE_FILED = "dp:filed:";
const DISPUTE_FILER = "dp:filer:";
const DISPUTE_REASON = "dp:reason:";
const DISPUTE_TS = "dp:ts:";
const CORE_ADDR = "dp:core";
const ARB_ADDR = "dp:arb";
const ADMIN_KEY = "dp:admin";

export class DisputeContract {
  public initialize(admin: string, core: string, arb: string): void {
    if (Storage.getString(ADMIN_KEY)) throw new Error("DisputeContract: already initialized");
    Storage.setString(ADMIN_KEY, admin);
    Storage.setString(CORE_ADDR, core);
    Storage.setString(ARB_ADDR, arb);
  }

  public fileDispute(escrowId: bigint, reason: string, caller: string): void {
    if (!reason || reason.length > 512) throw new Error("DisputeContract: reason required (max 512 chars)");
    const eid = escrowId.toString();
    const core = Blockchain.getContract(Storage.getString(CORE_ADDR)!);
    const info = core.getEscrowInfo(escrowId);
    if (info.status !== 1 && info.status !== 2)
      throw new Error("DisputeContract: only FUNDED or ACTIVE escrows");
    if (caller !== info.buyer && caller !== info.seller)
      throw new Error("DisputeContract: only buyer or seller");
    if (Storage.getBool(DISPUTE_FILED + eid))
      throw new Error("DisputeContract: dispute already filed");

    Storage.setBool(DISPUTE_FILED + eid, true);
    Storage.setString(DISPUTE_FILER + eid, caller);
    Storage.setString(DISPUTE_REASON + eid, reason);
    Storage.setUint64(DISPUTE_TS + eid, Blockchain.blockTimestamp());

    core.updateStatus(escrowId, 6, Blockchain.contractAddress());
    const arb = Blockchain.getContract(Storage.getString(ARB_ADDR)!);
    arb.openArbitrationCase(escrowId, info.arbitrators, caller, reason);

    Blockchain.emit("DisputeFiled", {
      escrowId, filer: caller, reason,
      arbitrators: info.arbitrators,
      timestamp: Blockchain.blockTimestamp(),
    });
  }

  public getDisputeInfo(escrowId: bigint) {
    const eid = escrowId.toString();
    return {
      filed:   Storage.getBool(DISPUTE_FILED   + eid) ?? false,
      filer:   Storage.getString(DISPUTE_FILER  + eid) ?? "",
      reason:  Storage.getString(DISPUTE_REASON + eid) ?? "",
      filedAt: Storage.getUint64(DISPUTE_TS     + eid) ?? 0n,
    };
  }
}
