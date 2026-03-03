/**
 * OrangeShield OTC - RefundContract v1.0.0
 * OP_NET Testnet Compatible
 *
 * Voluntary refunds (seller-initiated) and timeout auto-refunds (24h).
 * Partial refunds keep escrow ACTIVE. Full refunds set status REFUNDED.
 */

const TIMEOUT_SECS = 86_400n;
const ISSUED_KEY = "rf:issued:";
const AMOUNT_KEY = "rf:amount:";
const AT_KEY = "rf:ts:";
const CORE_ADDR = "rf:core";
const FUND_ADDR = "rf:fund";
const ADMIN_KEY = "rf:admin";

export class RefundContract {
  public initialize(admin: string, core: string, fund: string): void {
    if (Storage.getString(ADMIN_KEY)) throw new Error("RefundContract: already initialized");
    Storage.setString(ADMIN_KEY, admin);
    Storage.setString(CORE_ADDR, core);
    Storage.setString(FUND_ADDR, fund);
  }

  public requestRefund(escrowId: bigint, amountSats: bigint, caller: string): void {
    const core = Blockchain.getContract(Storage.getString(CORE_ADDR)!);
    const info = core.getEscrowInfo(escrowId);
    if (caller !== info.seller) throw new Error("RefundContract: only seller");
    if (info.status !== 1 && info.status !== 2) throw new Error("RefundContract: must be FUNDED or ACTIVE");
    if (amountSats <= 0n) throw new Error("RefundContract: amount must be positive");
    const fund = Blockchain.getContract(Storage.getString(FUND_ADDR)!);
    const locked = fund.getLockedAmount(escrowId);
    if (amountSats > locked) throw new Error("RefundContract: exceeds locked amount");
    this.issue(escrowId, info.buyer, amountSats, locked, core, fund);
  }

  public timeoutRefund(escrowId: bigint): void {
    const core = Blockchain.getContract(Storage.getString(CORE_ADDR)!);
    const info = core.getEscrowInfo(escrowId);
    if (info.status !== 0) throw new Error("RefundContract: only PENDING escrows");
    const elapsed = Blockchain.blockTimestamp() - info.createdAt;
    if (elapsed < TIMEOUT_SECS)
      throw new Error(`RefundContract: ${elapsed}/${TIMEOUT_SECS}s elapsed`);
    const fund = Blockchain.getContract(Storage.getString(FUND_ADDR)!);
    const locked = fund.getLockedAmount(escrowId);
    if (locked === 0n) throw new Error("RefundContract: nothing locked");
    this.issue(escrowId, info.buyer, locked, locked, core, fund);
  }

  private issue(escrowId: bigint, buyer: string, amount: bigint, locked: bigint, core: any, fund: any): void {
    fund.releaseFunds(escrowId, buyer, amount, Blockchain.contractAddress());
    core.updateStatus(escrowId, amount < locked ? 2 : 5, Blockchain.contractAddress());
    const eid = escrowId.toString();
    Storage.setBool(ISSUED_KEY + eid, true);
    Storage.setUint256(AMOUNT_KEY + eid, amount);
    Storage.setUint64(AT_KEY + eid, Blockchain.blockTimestamp());
    Blockchain.emit("RefundIssued", { escrowId, buyer, amountSats: amount, isPartial: amount < locked });
  }

  public getRefundInfo(escrowId: bigint) {
    const eid = escrowId.toString();
    return {
      issued:   Storage.getBool(ISSUED_KEY    + eid) ?? false,
      amount:   Storage.getUint256(AMOUNT_KEY + eid) ?? 0n,
      issuedAt: Storage.getUint64(AT_KEY      + eid) ?? 0n,
    };
  }
}
