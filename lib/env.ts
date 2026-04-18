type RequiredServerEnvKey =
  | "MONGODB_URI"
  | "SOLANA_RPC_URL"
  | "BAGS_TOKEN_MINT"
  | "BAGS_TOKEN_DECIMALS"
  | "PLATFORM_TREASURY_WALLET"
  | "BAGS_TOKEN_URL";

function readOptionalEnv(key: string) {
  return process.env[key]?.trim() ?? "";
}

function readEnv(key: RequiredServerEnvKey) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function getServerEnv() {
  return {
    mongodbUri: readEnv("MONGODB_URI"),
    solanaRpcUrl: readEnv("SOLANA_RPC_URL"),
    tokenMint: readEnv("BAGS_TOKEN_MINT"),
    tokenDecimals: Number(readEnv("BAGS_TOKEN_DECIMALS")),
    platformTreasuryWallet: readEnv("PLATFORM_TREASURY_WALLET"),
    bagsTokenUrl: readEnv("BAGS_TOKEN_URL"),
    bagsApiKey: readOptionalEnv("BAGS_API_KEY"),
    openAiApiKey: readOptionalEnv("OPENAI_API_KEY"),
    openAiModel: readOptionalEnv("OPENAI_MODEL"),
    payoutAuthoritySecretKey: process.env.PLATFORM_SIGNER_SECRET_KEY ?? "",
    rewardThresholdPercent: Number(process.env.REWARD_THRESHOLD_PERCENT ?? "80"),
    rewardAmountTokens: Number(process.env.REWARD_AMOUNT_TOKENS ?? "0"),
    examCreationFeeTokens: Number(process.env.EXAM_CREATION_FEE_TOKENS ?? "5"),
  };
}

export function getClientEnv() {
  return {
    tokenMint: process.env.NEXT_PUBLIC_BAGS_TOKEN_MINT ?? "",
    tokenDecimals: Number(process.env.NEXT_PUBLIC_BAGS_TOKEN_DECIMALS ?? "0"),
    bagsTokenUrl: process.env.NEXT_PUBLIC_BAGS_TOKEN_URL ?? "",
    solanaRpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "",
    treasuryWallet: process.env.NEXT_PUBLIC_PLATFORM_TREASURY_WALLET ?? "",
    examCreationFeeTokens: Number(process.env.NEXT_PUBLIC_EXAM_CREATION_FEE_TOKENS ?? "5"),
  };
}
