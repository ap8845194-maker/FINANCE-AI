# FinAI UPI Payments Module

Added features:
- UPI ID and payee settings saved per Firebase user
- UPI deep-link (`upi://pay`) and QR generation
- Payment tracker stored in Firestore under the user's document
- Payment proof uploader for JPG/PNG/WEBP/PDF up to 5 MB
- Firebase Storage proof URLs
- Payment totals, monthly totals, transaction count and proof count
- Payment history with UTR/reference ID and proof links
- Confirmed UPI payments are added to Expenses once, with a payment ID link to prevent duplicates

## Firebase Storage

Enable **Storage** in the Firebase console for project `aiml-76965`.

Recommended Storage Rules:

```text
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/payment-proofs/{fileName} {
      allow read: if request.auth != null
                   && request.auth.uid == userId;

      allow write: if request.auth != null
                    && request.auth.uid == userId
                    && request.resource.size < 5 * 1024 * 1024;
    }
  }
}
```

Your existing Firestore rules must also allow the signed-in user to read/update their own user document.

## Confirm a Payment and Add It to Expenses

After paying in the UPI app and seeing its success screen, check **I have completed this payment** when saving the record, or use **Mark paid & add expense** on an existing record. FinAI then writes the payment and linked expense together to Firestore. Unconfirmed records stay out of Expenses. A linked expense ID/source prevents the same payment being added twice.

The UPI QR/deep link does not let this website independently verify a transfer. Therefore this flow relies on the user confirming success; it does not claim bank-verified completion. For unattended automatic confirmation, connect a payment gateway that provides a server callback/webhook, verify its signature/status on the server, and only then create the expense. Paytm's [callback and webhook documentation](https://www.paytmpayments.com/docs/callback-and-webhook) describes real-time transaction-status notifications for an integrated merchant account.

The legacy `/api/upi/pay` endpoint is intentionally disabled: the project does not process real UPI transfers and must never collect a UPI PIN.

The original uploaded archive contained a `.env` with a live-looking Groq API key. The returned project intentionally does **not** include that secret. Create a local `.env` from `.env.example` and rotate the exposed key if it is real.
