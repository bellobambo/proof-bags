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

