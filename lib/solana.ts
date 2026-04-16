import {
  Connection,
  Keypair,
  PublicKey,
  clusterApiUrl,
  type ParsedTransactionWithMeta,
  type ParsedInstruction,
  Transaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  getMint,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token";
import bs58 from "bs58";

import { getServerEnv } from "@/lib/env";

export function getSolanaConnection() {
  const rpcUrl = getServerEnv().solanaRpcUrl || clusterApiUrl("devnet");
  return new Connection(rpcUrl, "confirmed");
}

export function getTokenMintPublicKey() {
  return new PublicKey(getServerEnv().tokenMint);
}

export function getPlatformTreasuryPublicKey() {
  return new PublicKey(getServerEnv().platformTreasuryWallet);
}

export function getPlatformTreasuryTokenAccount() {
  return getTokenAccountForOwner(getPlatformTreasuryPublicKey().toBase58());
}

export function getTokenAccountForOwner(walletAddress: string) {
  return getAssociatedTokenAddressSync(
    getTokenMintPublicKey(),
    new PublicKey(walletAddress),
  );
}

export function parseTokenAmountToBaseUnits(amountTokens: number, decimals: number) {
  return BigInt(Math.round(amountTokens * 10 ** decimals));
}

export function formatBaseUnitsToTokenAmount(amount: bigint, decimals: number) {
  return Number(amount) / 10 ** decimals;
}

function getParsedTransferInstructions(
  transaction: ParsedTransactionWithMeta,
): ParsedInstruction[] {
  return (transaction.transaction.message.instructions ?? []).filter(
    (instruction): instruction is ParsedInstruction =>
      "parsed" in instruction && instruction.programId.equals(TOKEN_PROGRAM_ID),
  );
}

export async function getTokenBalance(walletAddress: string) {
  const connection = getSolanaConnection();
  const mint = getTokenMintPublicKey();
  const owner = new PublicKey(walletAddress);
  const tokenAccount = getAssociatedTokenAddressSync(mint, owner);
  const balance = await connection.getTokenAccountBalance(tokenAccount).catch(() => null);

  return {
    walletAddress,
    tokenAccount: tokenAccount.toBase58(),
    amountRaw: balance?.value.amount ?? "0",
    amount: Number(balance?.value.uiAmountString ?? "0"),
    decimals: balance?.value.decimals ?? getServerEnv().tokenDecimals,
  };
}

export async function verifyStudentPayment(params: {
  signature: string;
  studentWallet: string;
  expectedTransfers: Array<{
    recipientTokenAccount: string;
    amountTokens: number;
  }>;
}) {
  const connection = getSolanaConnection();
  const transaction = await connection.getParsedTransaction(params.signature, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!transaction) {
    throw new Error("Transaction not found on-chain.");
  }

  if (transaction.meta?.err) {
    throw new Error("Transaction failed on-chain.");
  }

  const mintAddress = getTokenMintPublicKey().toBase58();
  const parsedTransfers = getParsedTransferInstructions(transaction).map((instruction) => {
    const info = instruction.parsed.info as {
      amount?: string;
      authority?: string;
      destination?: string;
      mint?: string;
      multisigAuthority?: string;
      owner?: string;
      tokenAmount?: {
        amount?: string;
      };
    };

    return {
      amount: BigInt(info.tokenAmount?.amount ?? info.amount ?? "0"),
      authority: info.authority ?? info.multisigAuthority ?? info.owner ?? "",
      destination: info.destination ?? "",
      mint: info.mint ?? "",
    };
  });

  const missingTransfer = params.expectedTransfers.find((expectedTransfer) => {
    const expectedBaseUnits = parseTokenAmountToBaseUnits(
      expectedTransfer.amountTokens,
      getServerEnv().tokenDecimals,
    );

    return !parsedTransfers.some((transfer) => {
      return (
        transfer.mint === mintAddress &&
        transfer.destination === expectedTransfer.recipientTokenAccount &&
        transfer.authority === params.studentWallet &&
        transfer.amount >= expectedBaseUnits
      );
    });
  });

  if (missingTransfer) {
    throw new Error("Transaction does not match the required split token payment.");
  }

  return transaction;
}

function getAuthorityKeypair() {
  const secretKey = getServerEnv().payoutAuthoritySecretKey;

  if (!secretKey) {
    return null;
  }

  const decoded = bs58.decode(secretKey);
  return Keypair.fromSecretKey(decoded);
}

export async function payoutTokens(params: {
  recipientWallet: string;
  amountTokens: number;
}) {
  const authority = getAuthorityKeypair();

  if (!authority || params.amountTokens <= 0) {
    return null;
  }

  if (!authority.publicKey.equals(getPlatformTreasuryPublicKey())) {
    throw new Error(
      "PLATFORM_SIGNER_SECRET_KEY must control the configured PLATFORM_TREASURY_WALLET.",
    );
  }

  const connection = getSolanaConnection();
  const mint = getTokenMintPublicKey();
  const decimals = getServerEnv().tokenDecimals;
  const sourceAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mint,
    authority.publicKey,
  );
  const recipientOwner = new PublicKey(params.recipientWallet);
  const destinationAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    authority,
    mint,
    recipientOwner,
  );

  const instruction = createTransferCheckedInstruction(
    sourceAccount.address,
    mint,
    destinationAccount.address,
    authority.publicKey,
    parseTokenAmountToBaseUnits(params.amountTokens, decimals),
    decimals,
  );

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const transaction = new Transaction({
    feePayer: authority.publicKey,
    recentBlockhash: blockhash,
  }).add(instruction);

  transaction.sign(authority);
  const signature = await connection.sendRawTransaction(transaction.serialize());
  await connection.confirmTransaction(signature, "confirmed");

  return signature;
}

export async function validateTokenMintDecimals() {
  const connection = getSolanaConnection();
  const mint = getTokenMintPublicKey();
  const mintInfo = await getMint(connection, mint);

  if (mintInfo.decimals !== getServerEnv().tokenDecimals) {
    throw new Error("Configured token decimals do not match the on-chain mint.");
  }

  return mintInfo.decimals;
}
