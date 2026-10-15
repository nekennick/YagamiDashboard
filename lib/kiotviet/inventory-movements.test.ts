import { describe, expect, it } from "vitest";
import { transferMovementEndpoints } from "./inventory-movements";

describe("transferMovementEndpoints", () => {
  it("does not require a received date when loading dispatched transfers", () => {
    const [sentEndpoint, receivedEndpoint] = transferMovementEndpoints(
      new Date("2026-10-10T00:00:00.000Z"),
      new Date("2026-10-14T00:00:00.000Z")
    );

    expect(sentEndpoint).toContain("fromTransferDate=");
    expect(sentEndpoint).toContain("toTransferDate=");
    expect(sentEndpoint).not.toContain("ReceivedDate");
    expect(receivedEndpoint).toContain("fromReceivedDate=");
    expect(receivedEndpoint).toContain("toReceivedDate=");
    expect(receivedEndpoint).not.toContain("TransferDate");
  });
});
