import { BagsSDK } from "@bagsfm/bags-sdk";
import { Connection } from "@solana/web3.js";

import { getServerEnv } from "@/lib/env";

let sdkInstance: BagsSDK | null = null;

export function getBagsSdk() {
  const env = getServerEnv();

  if (!env.bagsApiKey) {
    throw new Error("Missing required environment variable: BAGS_API_KEY");
  }

  if (!sdkInstance) {
    sdkInstance = new BagsSDK(
      env.bagsApiKey,
      new Connection(env.solanaRpcUrl, "processed"),
      "processed",
    );
  }

  return sdkInstance;
}
