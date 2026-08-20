import { chainSpec } from "../polkadotChainSpec";

describe("Polkadot chain spec", () => {
  it("starts from the expected relay checkpoint", () => {
    const spec = JSON.parse(chainSpec) as {
      lightSyncState: { finalizedBlockHeader: string };
    };
    const header = Buffer.from(spec.lightSyncState.finalizedBlockHeader.slice(2), "hex");
    const compactBlockNumber = header.readUInt32LE(32);

    expect(compactBlockNumber & 0b11).toBe(0b10);
    expect(compactBlockNumber >>> 2).toBe(32_592_456);
  });
});
