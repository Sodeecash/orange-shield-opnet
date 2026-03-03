/**
 * OrangeShield OTC - MultiSigExecution Contract v1.0.0
 * OP_NET Testnet Compatible
 *
 * Final execution layer. Bypass-proof.
 * Only ArbitrationContract may call executePayout().
 * BUYER_WINS  -> full refund to buyer
 * SELLER_WINS -> full release to seller
 * SPLIT_50_50 -> 50/50 split (odd sat goes to seller)
 */

const EXEC_DONE = "ms:exec:";
const EXEC_AT = "ms:ts:";
const EXEC_RESULT = "ms:result:";
const FUND_ADDR = "ms:fund";
const ARB_ADDR = "ms:arb";
const ADMIN_KEY = "ms:admin";

export const enum ArbResult { PENDING = 0, BUYER_WINS = 1, SELLER_WINS = 2, SPLIT_50_50 = 3 }

export class MultiSigExecution {
  public initialize(admin: string, fund: string, arb: string): void {
    if (Storage.getString(ADMIN_KEY)) throw new Error("MultiSigExecution: already initialized");
    Storage.setString(ADMIN_KEY, admin);
    Storage.setString(FUND_ADDR, fund);
    Storage.setString(ARB_ADDR, arb);
  }

  public executePayout(
    escrowId: bigint,
    result: ArbResult,
    escrowInfo: { buyer: string; seller: string },
  ): void {
    if (Blockchain.callerAddress() !== Storage.getString(ARB_ADDR))
      throw new Error("MultiSigExecution: only ArbitrationContract may call");
    const eid = escrowId.toString();
    if (Storage.getBool(EXEC_DONE + eid)) throw new Error("MultiSigExecution: already executed");

    const fund = Blockchain.getContract(Storage.getString(FUND_ADDR)!);
    const locked = fund.getLockedAmount(escrowId);
    if (locked === 0n) throw new Error("MultiSigExecution: no locked funds");

    const self = Blockchain.contractAddress();

    if (result === ArbResult.BUYER_WINS) {
      fund.releaseFunds(escrowId, escrowInfo.buyer, locked, self);
    } else if (result === ArbResult.SELLER_WINS) {
      fund.releaseFunds(escrowId, escrowInfo.seller, locked, self);
    } else if (result === ArbResult.SPLIT_50_50) {
      const half = locked / 2n;
      fund.releaseFunds(escrowId, escrowInfo.buyer,  half,        self);
      fund.releaseFunds(escrowId, escrowInfo.seller, locked - half, self);
    } else {
      throw new Error("MultiSigExecution: invalid result");
    }

    Storage.setBool(EXEC_DONE   + eid, true);
    Storage.setUint8(EXEC_RESULT + eid, result);
    Storage.setUint64(EXEC_AT   + eid, Blockchain.blockTimestamp());

    Blockchain.emit("PayoutExecuted", {
      escrowId, result,
      buyer: escrowInfo.buyer, seller: escrowInfo.seller, lockedSats: locked,
      timestamp: Blockchain.blockTimestamp(),
    });
  }

  public getExecutionRecord(escrowId: bigint) {
    const eid = escrowId.toString();
    return {
      executed:   Storage.getBool(EXEC_DONE    + eid) ?? false,
      result:     Storage.getUint8(EXEC_RESULT + eid) ?? 0,
      executedAt: Storage.getUint64(EXEC_AT    + eid) ?? 0n,
    };
  }
}
