# Proof

Proof is a Assessment Managment Platform built on Solana. Tutors create courses and exams with a little fee, students enroll with a wallet, pay to access exams, submit answers, and can store their score as proof of assessment on-chain on the solana network.

## Bags and $B4BAMBO

The app uses Bags as the trading and token layer for the platform token, `$B4BAMBO`.
Proof is currently powered by [@BagsApp](https://bags.fm): Bags.fm for token launch, the Bags SDK for swap functionality, and the Bags API for token details. More Bags integrations are coming.

- Tutors pay a little `$B4BAMBO` creation fee before publishing an exam.
- Students access exams by paying the exam price in `$B4BAMBO`.
- Student can request a Bags quote, build a swap from SOL into `$B4BAMBO`, and relay the signed transaction through Bags.
- Verified exam payments are split between the tutor and the platform treasury.
- Passing submissions can receive `$B4BAMBO` rewards when rewards are configured.
- The app also reads Bags token details, holder/creator fee data, recent claims, and live quote information for display in the UI.

## Run Locally

1. Clone the repo:
```bash
   git clone https://github.com/bellobambo/proof-bags
```
2. Navigate into the project directory:
```bash
   cd proof-bags
```
3. Install dependencies:
```bash
   npm install
```
4. Create a `.env.local` file and add:
```
   MONGODB_URI=
   SOLANA_RPC_URL=
   BAGS_TOKEN_MINT=
   BAGS_TOKEN_DECIMALS=
   PLATFORM_TREASURY_WALLET=
   PLATFORM_SIGNER_SECRET_KEY=
   BAGS_TOKEN_URL=
   REWARD_THRESHOLD_PERCENT=
   REWARD_AMOUNT_TOKENS=
   BAGS_API_KEY=
   NEXT_PUBLIC_SOLANA_RPC_URL=
   NEXT_PUBLIC_BAGS_TOKEN_MINT=
   NEXT_PUBLIC_BAGS_TOKEN_DECIMALS=
   NEXT_PUBLIC_PLATFORM_TREASURY_WALLET=
   OPENAI_API_KEY=
   EXAM_CREATION_FEE_TOKENS=
   NEXT_PUBLIC_EXAM_CREATION_FEE_TOKENS=
```
5. Start the dev server:
```bash
   npm run dev
```
