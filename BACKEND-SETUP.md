# FinAI Backend + UPI Auto Expense

## What was added

- `POST /api/upi/pay` creates a UPI intent without collecting a UPI PIN.
- `POST /api/upi/complete` verifies the logged-in Firebase user and atomically updates that user's Firestore `payments` and `expenses` arrays.
- When a payment is completed, an expense is created with `sourcePaymentId`, `paymentMethod: "UPI"`, amount, category, date and UTR.
- Frontend `markPaymentComplete()` now calls the backend first, then refreshes the dashboard.

## Setup

1. Install Node.js 18+.
2. In this folder run:
   `npm install`
3. Create `.env` from `.env.example`.
4. Add your Groq key.
5. Configure Firebase Admin **server-side only**:
   - Preferred: set `FIREBASE_SERVICE_ACCOUNT_JSON` to the Firebase service-account JSON as one line.
   - Or set `GOOGLE_APPLICATION_CREDENTIALS` to the service-account JSON file path.
6. Start:
   `npm start`
7. Open:
   `http://127.0.0.1:5500`

## Important UPI limitation

A generic `upi://pay` link cannot tell a website that a bank payment succeeded. The backend therefore does NOT pretend that opening the UPI app means payment success and it never asks for a UPI PIN.

For fully automatic "payment succeeded -> expense added" behavior, connect a real payment gateway that supports UPI and server-side signed webhooks. The gateway webhook should call a protected backend handler that verifies the signature and then performs the same Firestore update as `/api/upi/complete`.

Never put a Firebase service-account JSON or private API key in frontend JavaScript or GitHub Pages.
