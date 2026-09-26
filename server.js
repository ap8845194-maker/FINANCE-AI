const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const crypto = require("node:crypto");
let firebaseAdmin = null;
let firestore = null;

loadDotEnv();

function initFirebaseAdmin() {
    if (firebaseAdmin) return true;
    try {
        const admin = require("firebase-admin");
        let credential;

        if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
            let jsonString = process.env.FIREBASE_SERVICE_ACCOUNT_JSON.trim();
            if ((jsonString.startsWith("'") && jsonString.endsWith("'")) ||
                (jsonString.startsWith('"') && jsonString.endsWith('"'))) {
                jsonString = jsonString.slice(1, -1);
            }
            const serviceAccount = JSON.parse(jsonString);
            if (serviceAccount.private_key && typeof serviceAccount.private_key === "string") {
                serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
            }
            credential = admin.credential.cert(serviceAccount);
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            credential = admin.credential.applicationDefault();
        } else {
            return false;
        }

        if (!admin.apps.length) {
            admin.initializeApp({ credential });
        }
        firebaseAdmin = admin;
        firestore = admin.firestore();
        return true;
    } catch (error) {
        console.error("Firebase Admin initialization failed:", error.message);
        return false;
    }
}

async function verifyFirebaseUser(request) {
    if (!initFirebaseAdmin()) {
        const error = new Error("Firebase Admin is not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON to .env.");
        error.statusCode = 503;
        throw error;
    }

    const authHeader = String(request.headers.authorization || "");
    if (!authHeader.startsWith("Bearer ")) {
        const error = new Error("Missing Firebase ID token.");
        error.statusCode = 401;
        throw error;
    }

    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
        const error = new Error("Missing Firebase ID token.");
        error.statusCode = 401;
        throw error;
    }

    try {
        return await firebaseAdmin.auth().verifyIdToken(idToken);
    } catch {
        const error = new Error("Invalid or expired Firebase ID token.");
        error.statusCode = 401;
        throw error;
    }
}

function cleanString(value, max = 120) {
    return String(value ?? "").trim().slice(0, max);
}

function buildExpenseFromPayment(payment, userId) {
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
        const error = new Error("Invalid payment amount.");
        error.statusCode = 400;
        throw error;
    }

    const paymentId = cleanString(payment.id, 100);
    if (!paymentId) {
        const error = new Error("Payment ID is required.");
        error.statusCode = 400;
        throw error;
    }

    return {
        id: `exp_${paymentId}`,
        name: cleanString(payment.title || "UPI Payment"),
        amount,
        category: cleanString(payment.category || "Other", 50),
        date: cleanString(payment.date || new Date().toISOString().slice(0, 10), 30),
        sourcePaymentId: paymentId,
        paymentMethod: "UPI",
        utr: cleanString(payment.utr, 100),
        userId,
        status: "Paid",
        createdAt: new Date().toISOString()
    };
}

async function completeUpiPaymentForUser(request, response) {
    try {
        const user = await verifyFirebaseUser(request);
        const body = await readJson(request);
        const payment = body.payment && typeof body.payment === "object" ? body.payment : body;

        const dbUserRef = firestore.collection("users").doc(user.uid);
        const snapshot = await dbUserRef.get();

        if (!snapshot.exists) {
            return sendJson(response, 404, { error: "User finance profile not found." });
        }

        const data = snapshot.data() || {};
        const payments = Array.isArray(data.payments) ? data.payments : [];
        const expenses = Array.isArray(data.expenses) ? data.expenses : [];
        const paymentId = cleanString(payment.id, 100);

        const storedPayment = payments.find(item => String(item?.id || "") === paymentId);
        if (!storedPayment) {
            return sendJson(response, 404, { error: "Payment record not found." });
        }

        const existingExpense = expenses.find(item => String(item?.sourcePaymentId || "") === paymentId);
        if (existingExpense) {
            return sendJson(response, 200, {
                ok: true,
                alreadyAdded: true,
                payment: storedPayment,
                expense: existingExpense
            });
        }

        const expense = buildExpenseFromPayment({ ...storedPayment, ...payment }, user.uid);
        const updatedPayment = {
            ...storedPayment,
            status: "Paid",
            expenseId: expense.id,
            completedAt: new Date().toISOString(),
            verifiedBy: "finai-backend"
        };

        const updatedPayments = payments.map(item =>
            String(item?.id || "") === paymentId ? updatedPayment : item
        );

        await dbUserRef.update({
            payments: updatedPayments,
            expenses: [...expenses, expense]
        });

        return sendJson(response, 200, {
            ok: true,
            alreadyAdded: false,
            payment: updatedPayment,
            expense
        });
    } catch (error) {
        console.error("/api/upi/complete error:", error.message);
        return sendJson(response, error.statusCode || 500, {
            error: error.message || "Unable to complete UPI payment."
        });
    }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 5500);
const HOST = process.env.HOST || "127.0.0.1";
const GROQ_MODEL = process.env.GROQ_MODEL || process.env.OPENAI_MODEL || "openai/gpt-oss-120b";
const GROQ_URL = process.env.GROQ_URL || "https://api.groq.com/openai/v1/chat/completions";
const ROOT = __dirname;
const MAX_BODY_BYTES = 32 * 1024;

function loadDotEnv() {
    const envPath = path.join(__dirname, ".env");
    const examplePath = path.join(__dirname, ".env.example");
    const targetPath = fs.existsSync(envPath) ? envPath : (fs.existsSync(examplePath) ? examplePath : null);
    if (!targetPath) return;

    try {
        const content = fs.readFileSync(targetPath, "utf8");
        const lines = content.split(/\r?\n/);
        let currentKey = null;
        let currentValue = "";
        let inQuotes = false;
        let quoteChar = "";

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (!inQuotes) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith("#")) continue;

                const separator = trimmed.indexOf("=");
                if (separator < 1) continue;

                const key = trimmed.slice(0, separator).trim();
                let rawValue = trimmed.slice(separator + 1).trim();

                if ((rawValue.startsWith('"') && !rawValue.endsWith('"')) ||
                    (rawValue.startsWith("'") && !rawValue.endsWith("'"))) {
                    inQuotes = true;
                    quoteChar = rawValue[0];
                    currentKey = key;
                    currentValue = rawValue.slice(1);
                } else if (rawValue.startsWith('{') && !rawValue.endsWith('}')) {
                    inQuotes = true;
                    quoteChar = "}";
                    currentKey = key;
                    currentValue = rawValue;
                } else {
                    let value = rawValue;
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    if (process.env[key] === undefined) process.env[key] = value;
                }
            } else {
                if (quoteChar === "}") {
                    currentValue += "\n" + line;
                    if (line.trim().endsWith("}") || line.trim() === "}") {
                        inQuotes = false;
                        if (process.env[currentKey] === undefined) process.env[currentKey] = currentValue.trim();
                        currentKey = null;
                        currentValue = "";
                    }
                } else if (line.endsWith(quoteChar)) {
                    currentValue += "\n" + line.slice(0, -1);
                    inQuotes = false;
                    if (process.env[currentKey] === undefined) process.env[currentKey] = currentValue;
                    currentKey = null;
                    currentValue = "";
                } else {
                    currentValue += "\n" + line;
                }
            }
        }
    } catch (err) {
        console.error("loadDotEnv warning:", err.message);
    }
}

function sendJson(response, statusCode, payload) {
    const body = JSON.stringify(payload);
    response.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    response.end(body);
}

function readJson(request) {
    return new Promise((resolve, reject) => {
        let raw = "";
        let size = 0;

        request.setEncoding("utf8");
        request.on("data", chunk => {
            size += Buffer.byteLength(chunk);
            if (size > MAX_BODY_BYTES) {
                reject(new Error("Request is too large."));
                request.destroy();
                return;
            }
            raw += chunk;
        });
        request.on("end", () => {
            try {
                resolve(JSON.parse(raw || "{}"));
            } catch {
                reject(new Error("Invalid JSON body."));
            }
        });
        request.on("error", reject);
    });
}

function numberOrZero(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

function buildFinanceContext(finance, expenses) {
    const safeFinance = finance && typeof finance === "object" ? finance : {};
    const safeExpenses = Array.isArray(expenses) ? expenses.slice(0, 100) : [];

    const cleanedExpenses = safeExpenses.map(expense => ({
        title: String(expense?.title || expense?.name || "Expense").slice(0, 100),
        category: String(expense?.category || "Other").slice(0, 50),
        amount: numberOrZero(expense?.amount),
        date: String(expense?.date || "").slice(0, 30)
    }));

    return {
        income: numberOrZero(safeFinance.income),
        budget: numberOrZero(safeFinance.budget),
        goal: numberOrZero(safeFinance.goal),
        expenses: cleanedExpenses,
        totalExpenses: cleanedExpenses.reduce((sum, expense) => sum + expense.amount, 0)
    };
}

async function askGroq(question, financeContext) {
    const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
        const error = new Error("GROQ_API_KEY is not configured on the server.");
        error.statusCode = 503;
        throw error;
    }

    const response = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            temperature: 0.4,
            max_tokens: 500,
            messages: [
                {
                    role: "system",
                    content: [
                        "You are FinAI, a helpful personal-finance assistant for students.",
                        "Give practical, concise and encouraging advice based on the user's finance context.",
                        "Use Indian rupees (₹) when mentioning amounts, and do not invent facts.",
                        "Do not provide regulated investment, tax, legal, loan-approval or guaranteed-return advice.",
                        "If data is missing, clearly say what the user should add.",
                        "Use short paragraphs or bullets and keep the answer under 180 words.",
                        `Current finance context (JSON): ${JSON.stringify(financeContext)}`
                    ].join("\n")
                },
                { role: "user", content: question }
            ]
        })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        const error = new Error(data?.error?.message || "Groq request failed.");
        error.statusCode = response.status >= 500 ? 502 : 400;
        throw error;
    }

    const answer = data?.choices?.[0]?.message?.content?.trim();
    if (!answer) {
        const error = new Error("Groq returned an empty response.");
        error.statusCode = 502;
        throw error;
    }

    return answer;
}

async function handleAsk(request, response) {
    try {
        const body = await readJson(request);
        const question = typeof body.question === "string" ? body.question.trim() : "";

        if (!question) return sendJson(response, 400, { error: "Please enter a question." });
        if (question.length > 500) return sendJson(response, 400, { error: "Question must be 500 characters or fewer." });

        const financeContext = buildFinanceContext(body.finance, body.expenses);
        const answer = await askGroq(question, financeContext);
        return sendJson(response, 200, { answer });
    } catch (error) {
        console.error("/api/ask error:", error.message);
        return sendJson(response, error.statusCode || 500, {
            error: error.statusCode === 503
                ? "Groq is not configured yet. Add GROQ_API_KEY to your .env file."
                : "Unable to get an AI response right now. Please try again."
        });
    }
}

/* ==========================================
   UPI PAYMENTS PLATFORM BACKEND
========================================== */

const upiTransactions = [];

const KNOWN_VPA_DIRECTORY = {
    "canteen@upi": "Campus Cafeteria [Verified Merchant]",
    "canteen@finai": "Campus Cafeteria [Verified Merchant]",
    "books@upi": "Student Book Depot [Verified Merchant]",
    "xerox@upi": "Campus Print & Copy Center [Verified Merchant]",
    "mess@upi": "Hostel Dining Services [Verified Merchant]",
    "metro@upi": "City Metro Transit [Verified Merchant]",
    "groceries@upi": "Fresh Mart Convenience [Verified Merchant]"
};

function resolveVpaName(vpa) {
    const cleanVpa = String(vpa || "").trim().toLowerCase();
    if (KNOWN_VPA_DIRECTORY[cleanVpa]) {
        return KNOWN_VPA_DIRECTORY[cleanVpa];
    }
    const parts = cleanVpa.split("@");
    if (parts.length === 2 && parts[0].length > 0) {
        const username = parts[0];
        if (/^\d+$/.test(username)) {
            return "User (" + username.slice(0, 2) + "••••" + username.slice(-2) + ")";
        }
        return username.charAt(0).toUpperCase() + username.slice(1) + " (Verified User)";
    }
    return "Verified UPI Recipient";
}

function isValidVpa(vpa) {
    const clean = String(vpa || "").trim().toLowerCase();
    return /^([a-zA-Z0-9._-]+)@([a-zA-Z0-9_-]+)$/.test(clean);
}

async function handleUpiPay(request, response) {
    try {
        const body = await readJson(request);
        const amount = Number(body.amount || 0);
        const vpa = String(body.vpa || body.upiId || "").trim();
        const title = String(body.title || "UPI Payment").trim();
        const category = String(body.category || "Other").trim();

        if (!Number.isFinite(amount) || amount <= 0) {
            return sendJson(response, 400, { error: "Enter a valid payment amount." });
        }
        if (!isValidVpa(vpa)) {
            return sendJson(response, 400, { error: "Enter a valid UPI ID." });
        }

        const paymentId = `pay_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
        const upiUri = "upi://pay?pa=" + encodeURIComponent(vpa) +
            "&pn=" + encodeURIComponent(resolveVpaName(vpa)) +
            "&am=" + amount.toFixed(2) +
            "&tn=" + encodeURIComponent(title) +
            "&cu=INR";

        const transaction = {
            id: paymentId,
            title,
            amount,
            category,
            vpa,
            status: "Pending verification",
            createdAt: new Date().toISOString(),
            upiUri
        };

        upiTransactions.push(transaction);

        return sendJson(response, 201, {
            ok: true,
            payment: transaction,
            message: "Open the UPI URI in a UPI app. The backend does not collect a UPI PIN or claim payment success."
        });
    } catch (error) {
        return sendJson(response, 400, { error: error.message || "Unable to create UPI payment." });
    }
}


function serveStatic(request, response, pathname) {
    let cleanPath;
    try {
        cleanPath = decodeURIComponent(pathname);
    } catch {
        cleanPath = pathname;
    }
    const requestedPath = cleanPath === "/" ? "/index.html" : cleanPath;
    const filePath = path.resolve(ROOT, `.${requestedPath}`);

    if (!filePath.startsWith(`${ROOT}${path.sep}`) && filePath !== path.join(ROOT, "index.html")) {
        return sendJson(response, 403, { error: "Forbidden" });
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            response.end("Not found");
            return;
        }

        const extension = path.extname(filePath).toLowerCase();
        const contentTypes = {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".mjs": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".svg": "image/svg+xml",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp",
            ".ico": "image/x-icon",
            ".woff": "font/woff",
            ".woff2": "font/woff2"
        };

        response.writeHead(200, {
            "Content-Type": contentTypes[extension] || "application/octet-stream",
            "X-Content-Type-Options": "nosniff"
        });
        response.end(content);
    });
}

const server = http.createServer(async (request, response) => {
    if (request.method === "OPTIONS") {
        response.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        });
        response.end();
        return;
    }

    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
        const hasKey = Boolean(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY);
        return sendJson(response, 200, {
            ok: true,
            groqConfigured: hasKey,
            openaiConfigured: hasKey,
            model: GROQ_MODEL
        });
    }

    if (request.method === "POST" && url.pathname === "/api/ask") {
        return handleAsk(request, response);
    }

    if (request.method === "GET" && url.pathname === "/api/upi/account") {
        return sendJson(response, 200, {
            upiId: "student@finai",
            accountHolder: "Student User",
            bankName: "State Bank of India",
            accountNumberMasked: "•••• 4821",
            ifsc: "SBIN0012345",
            dailyLimit: 25000
        });
    }

    if (request.method === "GET" && url.pathname === "/api/upi/transactions") {
        return sendJson(response, 200, {
            transactions: upiTransactions
        });
    }

    if (request.method === "POST" && url.pathname === "/api/upi/verify-vpa") {
        const body = await readJson(request).catch(() => ({}));
        const vpa = String(body.vpa || "").trim();
        if (!vpa || !isValidVpa(vpa)) {
            return sendJson(response, 400, { valid: false, error: "Invalid UPI ID format. Example: canteen@upi or mobile@bank" });
        }
        const name = resolveVpaName(vpa);
        return sendJson(response, 200, {
            valid: true,
            vpa,
            name,
            isMerchant: Boolean(KNOWN_VPA_DIRECTORY[vpa.toLowerCase()])
        });
    }

    if (request.method === "POST" && url.pathname === "/api/upi/complete") {
        return completeUpiPaymentForUser(request, response);
    }

    if (request.method === "POST" && url.pathname === "/api/upi/pay") {
        return handleUpiPay(request, response);
    }

    if (request.method === "POST" && url.pathname === "/api/upi/generate-qr") {
        const body = await readJson(request).catch(() => ({}));
        const amount = Number(body.amount || 0);
        const note = String(body.note || "Student Finance Pay").trim();
        const upiId = "student@finai";
        const name = "Student User";
        const upiUri = "upi://pay?pa=" + encodeURIComponent(upiId) + "&pn=" + encodeURIComponent(name) + (amount > 0 ? "&am=" + amount.toFixed(2) : "") + "&tn=" + encodeURIComponent(note) + "&cu=INR";
        const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=" + encodeURIComponent(upiUri);
        return sendJson(response, 200, {
            upiId,
            name,
            amount: amount > 0 ? amount : null,
            note,
            upiUri,
            qrUrl
        });
    }


    if (request.method === "GET") {
        return serveStatic(request, response, url.pathname);
    }

    return sendJson(response, 405, { error: "Method not allowed" });
});

server.listen(PORT, HOST, () => {
    console.log(`FinAI server running at http://${HOST}:${PORT}`);
    console.log(`Groq model: ${GROQ_MODEL}`);
    console.log(`Groq key configured: ${Boolean(process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY)}`);
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
