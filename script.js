/* ==========================================
   STUDENT FINANCE AI V2
   FIREBASE BACKEND VERSION
========================================== */

import {

    auth,
    db,
    storage,

    googleProvider,

    signInWithPopup,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    signOut,
    onAuthStateChanged,
    updateProfile,

    doc,
    getDoc,
    setDoc,
    updateDoc,
    ref,
    uploadBytes,
    getDownloadURL

} from "./firebase-config.js";

// signInWithRedirect + getRedirectResult — locally imported for Google fallback
import {
    signInWithRedirect,
    getRedirectResult
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


/* ==========================================
   DATA
========================================== */

let expenses = [];
let payments = [];
let paymentSettings = { upiId: "", payee: "" };

let financeData = {

    income: 0,
    budget: 0,
    goal: 0

};

let currentUser = null;


/* ==========================================
   ELEMENTS
========================================== */

const navItems =
    document.querySelectorAll(".nav-item");

const sections =
    document.querySelectorAll(".section");

const expenseModal =
    document.getElementById("expenseModal");

const expenseForm =
    document.getElementById("expenseForm");

const toast =
    document.getElementById("toast");

const toastText =
    document.getElementById("toastText");

const currentDate =
    document.getElementById("currentDate");

const loginPage =
    document.getElementById("loginPage");

const loginForm =
    document.getElementById("loginForm");

const loginEmail =
    document.getElementById("loginEmail");

const loginPassword =
    document.getElementById("loginPassword");

const togglePassword =
    document.getElementById("togglePassword");

const googleLogin =
    document.getElementById("googleLogin");

const rememberMe =
    document.getElementById("rememberMe");

try {
    const savedEmail = localStorage.getItem("finai_remember_email");
    if (savedEmail && loginEmail) {
        loginEmail.value = savedEmail;
        if (rememberMe) rememberMe.checked = true;
    }
} catch (_) {}

const forgotPassword =
    document.getElementById("forgotPassword");

const createAccount =
    document.getElementById("createAccount");


/* ==========================================
   DATE
========================================== */

function setCurrentDate() {

    if (!currentDate) return;

    currentDate.textContent =
        new Date().toLocaleDateString(
            "en-IN",
            {
                day: "numeric",
                month: "short",
                year: "numeric"
            }
        );
}

setCurrentDate();


/* ==========================================
   NAVIGATION
========================================== */

navItems.forEach(item => {

    item.addEventListener(
        "click",
        () => {

            const sectionName =
                item.dataset.section;

            navItems.forEach(nav => {
                nav.classList.remove("active");
            });

            item.classList.add("active");

            sections.forEach(section => {

                section.classList.remove(
                    "active-section"
                );

            });

            const target =
                document.getElementById(
                    sectionName
                );

            if (target) {

                target.classList.add(
                    "active-section"
                );

            }

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });

        }
    );

});


/* ==========================================
   GO BUTTONS
========================================== */

document
    .querySelectorAll("[data-go]")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const target =
                    button.dataset.go;

                document
                    .querySelector(
                        `[data-section="${target}"]`
                    )
                    ?.click();

            }
        );

    });


/* ==========================================
   CURRENCY
========================================== */

function money(amount) {

    return "₹" +
        Number(amount || 0)
            .toLocaleString("en-IN");

}


/* ==========================================
   TOTAL EXPENSES
========================================== */

function getTotalExpenses() {

    return expenses.reduce(
        (total, expense) => {

            return total +
                Number(expense.amount || 0);

        },
        0
    );

}


/* ==========================================
   FIRESTORE USER REFERENCE
========================================== */

function userRef() {

    if (!currentUser) {
        throw new Error(
            "User is not authenticated"
        );
    }

    return doc(
        db,
        "users",
        currentUser.uid
    );

}


/* ==========================================
   LOAD USER DATA
========================================== */

async function loadUserData() {

    if (!currentUser) return;

    try {

        const snapshot =
            await getDoc(
                userRef()
            );

        if (snapshot.exists()) {

            const data =
                snapshot.data();

            financeData =
                data.finance || {

                    income: 0,
                    budget: 0,
                    goal: 0

                };

            expenses =
                Array.isArray(
                    data.expenses
                )
                    ? data.expenses
                    : [];

            payments = Array.isArray(data.payments) ? data.payments : [];
            paymentSettings = data.paymentSettings && typeof data.paymentSettings === "object"
                ? data.paymentSettings
                : { upiId: "", payee: "" };

        } else {

            financeData = {

                income: 0,
                budget: 0,
                goal: 0

            };

            expenses = [];
            payments = [];
            paymentSettings = { upiId: "", payee: "" };

            await setDoc(
                userRef(),
                {

                    name:
                        currentUser.displayName ||
                        "",

                    email:
                        currentUser.email ||
                        "",

                    finance:
                        financeData,

                    expenses:
                        [],

                    payments,

                    paymentSettings

                }
            );

        }

        updateDashboard();
        renderUpiSettings();
        renderPayments();

    } catch (error) {

        console.error(
            "LOAD USER DATA ERROR:",
            error
        );

        showToast(
            "Unable to load your finance data",
            "❌"
        );

    }

}


/* ==========================================
   SAVE FINANCE DATA
========================================== */

async function saveFinanceData() {

    if (!currentUser) return;

    try {

        await updateDoc(
            userRef(),
            {
                finance:
                    financeData
            }
        );

    } catch (error) {

        console.error(
            "SAVE FINANCE ERROR:",
            error
        );

        showToast(
            "Failed to save finance data",
            "❌"
        );

    }

}


/* ==========================================
   SAVE EXPENSES
========================================== */

async function saveExpenses() {

    if (!currentUser) return;

    try {

        await updateDoc(
            userRef(),
            {
                expenses:
                    expenses
            }
        );

    } catch (error) {

        console.error(
            "SAVE EXPENSE ERROR:",
            error
        );

        showToast(
            "Failed to save expense data",
            "❌"
        );

    }

}



/* ==========================================
   EXPENSE LIMIT & SAVINGS PROTECTION
========================================== */

function getExpenseLimitInfo() {
    const income = Number(financeData.income || 0);
    const budget = Number(financeData.budget || 0);
    const goal = Number(financeData.goal || 0);
    const currentExpenses = getTotalExpenses();

    if (income <= 0) {
        return {
            income: 0,
            budget: 0,
            goal: 0,
            currentExpenses,
            protectedSavings: 0,
            maxAllowedExpenses: 0,
            remainingSpend: 0,
            limitType: "none"
        };
    }

    let protectedSavings = 0;
    if (goal > 0 && goal < income) {
        protectedSavings = Math.max(protectedSavings, goal);
    }
    if (budget > 0 && budget < income) {
        protectedSavings = Math.max(protectedSavings, income - budget);
    }

    let maxAllowedExpenses = Math.max(0, income - protectedSavings);
    let limitType = "income";

    if (budget > 0) {
        maxAllowedExpenses = Math.min(maxAllowedExpenses, budget);
        limitType = "budget";
    } else if (protectedSavings > 0) {
        limitType = "savings";
    }

    const remainingSpend = Math.max(0, maxAllowedExpenses - currentExpenses);

    return {
        income,
        budget,
        goal,
        currentExpenses,
        protectedSavings,
        maxAllowedExpenses,
        remainingSpend,
        limitType
    };
}

function updateExpenseModalLimit() {
    const info = getExpenseLimitInfo();
    const amountInput = document.getElementById("expenseAmount");
    const hint = document.getElementById("expenseAmountHint");

    if (!amountInput) return;

    if (info.income <= 0) {
        amountInput.removeAttribute("max");
        if (hint) {
            hint.textContent = "Please set your Monthly Income in the Budget tab first.";
            hint.style.color = "#f59e0b";
        }
        return;
    }

    amountInput.max = info.remainingSpend;

    if (hint) {
        if (info.remainingSpend <= 0) {
            hint.textContent = "🚫 Limit reached! Spent " + money(info.currentExpenses) + " of " + money(info.maxAllowedExpenses) + ". Savings (" + money(info.protectedSavings) + ") is protected.";
            hint.style.color = "#ef4444";
        } else if (info.protectedSavings > 0) {
            hint.textContent = "Available to spend: " + money(info.remainingSpend) + " | Protected Savings: " + money(info.protectedSavings);
            hint.style.color = "#10b981";
        } else if (info.budget > 0) {
            hint.textContent = "Available in budget: " + money(info.remainingSpend) + " of " + money(info.budget);
            hint.style.color = "#38bdf8";
        } else {
            hint.textContent = "Available balance: " + money(info.remainingSpend);
            hint.style.color = "#94a3b8";
        }
    }
}


/* ==========================================
   DASHBOARD
========================================== */

function updateDashboard() {

    const total =
        getTotalExpenses();

    const income =
        Number(
            financeData.income || 0
        );

    const savings =
        Math.max(
            income - total,
            0
        );

    const incomeStat =
        document.getElementById(
            "incomeStat"
        );

    const expenseStat =
        document.getElementById(
            "expenseStat"
        );

    const savingsStat =
        document.getElementById(
            "savingsStat"
        );

    const scoreStat =
        document.getElementById(
            "scoreStat"
        );

    if (incomeStat) {

        incomeStat.textContent =
            money(income);

    }

    if (expenseStat) {

        expenseStat.textContent =
            money(total);

    }

    if (savingsStat) {

        savingsStat.textContent =
            money(savings);

    }

    const limitInfo = getExpenseLimitInfo();
    const expenseStatSub = document.getElementById("expenseStatSub");
    const savingsStatSub = document.getElementById("savingsStatSub");

    if (expenseStatSub) {
        if (limitInfo.maxAllowedExpenses > 0) {
            expenseStatSub.textContent = "Limit: " + money(limitInfo.maxAllowedExpenses) + " (Left: " + money(limitInfo.remainingSpend) + ")";
        } else {
            expenseStatSub.textContent = "";
        }
    }

    if (savingsStatSub) {
        if (limitInfo.protectedSavings > 0) {
            savingsStatSub.textContent = "Protected: " + money(limitInfo.protectedSavings);
        } else {
            savingsStatSub.textContent = "";
        }
    }


    const score =
        calculateFinanceScore();

    if (scoreStat) {

        scoreStat.textContent =
            score + "/100";

    }

    updateBreakdown();
    updateGoal();
    updateRecentExpenses();
    updateExpensePage();
    updateBudgetPage();

}


/* ==========================================
   FINANCE SCORE
========================================== */

function calculateFinanceScore() {

    const income =
        Number(
            financeData.income || 0
        );

    const total =
        getTotalExpenses();

    if (income <= 0) {

        return total === 0
            ? 0
            : 25;

    }

    const savings =
        income - total;

    let score = 50;

    if (savings > 0) {

        const savingRate =
            savings / income;

        score +=
            Math.min(
                savingRate * 100,
                30
            );

    } else {

        score -= 20;

    }

    if (
        financeData.budget > 0 &&
        total <= financeData.budget
    ) {

        score += 15;

    } else if (
        financeData.budget > 0
    ) {

        score -= 10;

    }

    if (expenses.length > 0) {

        score += 5;

    }

    return Math.max(
        0,
        Math.min(
            100,
            Math.round(score)
        )
    );

}


/* ==========================================
   BREAKDOWN
========================================== */

function updateBreakdown() {

    const container =
        document.getElementById(
            "expenseBreakdown"
        );

    if (!container) return;

    if (expenses.length === 0) {

        container.innerHTML = `
            <div class="empty-state">
                No expenses added yet.
            </div>
        `;

        return;

    }

    const categories = {};

    expenses.forEach(expense => {

        const category =
            expense.category;

        categories[category] =
            (
                categories[category] || 0
            ) +
            Number(
                expense.amount || 0
            );

    });

    const total =
        getTotalExpenses();

    const icons = {

        Food: "🍔",
        Education: "📚",
        Travel: "🚌",
        Entertainment: "🎮",
        Shopping: "🛍️",
        Bills: "💡",
        Other: "📦"

    };

    const sorted =
        Object.entries(categories)
            .sort(
                (a, b) =>
                    b[1] - a[1]
            );

    container.innerHTML =
        sorted
            .map(
                ([category, amount]) => {

                    const percentage =
                        total > 0
                            ? Math.round(
                                (
                                    amount /
                                    total
                                ) * 100
                            )
                            : 0;

                    return `

                        <div class="breakdown-item">

                            <div class="breakdown-top">

                                <span>

                                    <span class="category-icon">
                                        ${
                                            icons[category] ||
                                            "📦"
                                        }
                                    </span>

                                    ${
                                        escapeHTML(
                                            category
                                        )
                                    }

                                </span>

                                <span>
                                    ${
                                        money(amount)
                                    }
                                </span>

                            </div>

                            <div class="mini-progress">

                                <div
                                    style="width:${percentage}%"
                                ></div>

                            </div>

                        </div>

                    `;

                }
            )
            .join("");

}


/* ==========================================
   RECENT EXPENSES
========================================== */

function updateRecentExpenses() {

    const tbody =
        document.getElementById(
            "recentExpenses"
        );

    if (!tbody) return;

    const recent =
        [...expenses]
            .sort(
                (a, b) =>
                    new Date(b.date) -
                    new Date(a.date)
            )
            .slice(0, 5);

    if (recent.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="4"
                    class="empty-table"
                >
                    No expenses yet.
                </td>
            </tr>
        `;

        return;

    }

    tbody.innerHTML =
        recent
            .map(expense => {

                return `

                    <tr>

                        <td>
                            <strong>
                                ${
                                    escapeHTML(
                                        expense.name
                                    )
                                }
                            </strong>
                        </td>

                        <td>
                            <span class="category-pill">
                                ${
                                    escapeHTML(
                                        expense.category
                                    )
                                }
                            </span>
                        </td>

                        <td>
                            ${
                                formatDate(
                                    expense.date
                                )
                            }
                        </td>

                        <td>
                            ${
                                money(
                                    expense.amount
                                )
                            }
                        </td>

                    </tr>

                `;

            })
            .join("");

}


/* ==========================================
   EXPENSE PAGE
========================================== */

function updateExpensePage() {

    const tbody =
        document.getElementById(
            "expenseTable"
        );

    if (!tbody) return;

    const total =
        getTotalExpenses();

    const expensePageTotal =
        document.getElementById(
            "expensePageTotal"
        );

    const transactionCount =
        document.getElementById(
            "transactionCount"
        );

    const averageExpense =
        document.getElementById(
            "averageExpense"
        );

    if (expensePageTotal) {

        expensePageTotal.textContent =
            money(total);

    }

    const pageLimitInfo = getExpenseLimitInfo();
    const expensePageLimit = document.getElementById("expensePageLimit");
    if (expensePageLimit) {
        if (pageLimitInfo.maxAllowedExpenses > 0) {
            expensePageLimit.textContent = "Limit: " + money(pageLimitInfo.maxAllowedExpenses) + " | Left: " + money(pageLimitInfo.remainingSpend);
        } else {
            expensePageLimit.textContent = "";
        }
    }


    if (transactionCount) {

        transactionCount.textContent =
            expenses.length;

    }

    const average =
        expenses.length
            ? total / expenses.length
            : 0;

    if (averageExpense) {

        averageExpense.textContent =
            money(
                Math.round(
                    average
                )
            );

    }

    if (expenses.length === 0) {

        tbody.innerHTML = `
            <tr>
                <td
                    colspan="5"
                    class="empty-table"
                >
                    No expenses added.
                </td>
            </tr>
        `;

        return;

    }

    const sorted =
        [...expenses]
            .sort(
                (a, b) =>
                    new Date(b.date) -
                    new Date(a.date)
            );

    tbody.innerHTML =
        sorted
            .map(expense => {

                return `

                    <tr>

                        <td>
                            <strong>
                                ${
                                    escapeHTML(
                                        expense.name
                                    )
                                }
                            </strong>
                        </td>

                        <td>
                            <span class="category-pill">
                                ${
                                    escapeHTML(
                                        expense.category
                                    )
                                }
                            </span>
                        </td>

                        <td>
                            ${
                                formatDate(
                                    expense.date
                                )
                            }
                        </td>

                        <td>
                            ${
                                money(
                                    expense.amount
                                )
                            }
                        </td>

                        <td>

                            <button
                                class="delete-expense"
                                onclick="deleteExpense('${expense.id}')"
                            >
                                ×
                            </button>

                        </td>

                    </tr>

                `;

            })
            .join("");

}


/* ==========================================
   OPEN EXPENSE MODAL
========================================== */

const openExpenseModal =
    document.getElementById(
        "openExpenseModal"
    );

const closeExpenseModal =
    document.getElementById(
        "closeExpenseModal"
    );

if (openExpenseModal) {

    openExpenseModal.addEventListener(
        "click",
        () => {
            updateExpenseModalLimit();

            const dateInput =
                document.getElementById(
                    "expenseDate"
                );

            if (dateInput) {

                dateInput.value =
                    new Date()
                        .toISOString()
                        .split("T")[0];

            }

            checkRecentPaymentForExpenseModal();

            expenseModal?.classList.add(
                "show"
            );

        }
    );

}

if (closeExpenseModal) {

    closeExpenseModal.addEventListener(
        "click",
        () => {

            expenseModal?.classList.remove(
                "show"
            );

        }
    );

}

if (expenseModal) {

    expenseModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                expenseModal
            ) {

                expenseModal.classList.remove(
                    "show"
                );

            }

        }
    );

}


/* ==========================================
   ADD EXPENSE
========================================== */


const expenseAmountInput = document.getElementById("expenseAmount");
if (expenseAmountInput) {
    expenseAmountInput.addEventListener("input", () => {
        const val = Number(expenseAmountInput.value || 0);
        const info = getExpenseLimitInfo();
        const hint = document.getElementById("expenseAmountHint");
        if (hint && info.income > 0) {
            if (val > info.remainingSpend) {
                hint.textContent = "⚠️ Amount exceeds remaining spend limit (" + money(info.remainingSpend) + ")! Savings cannot be touched.";
                hint.style.color = "#ef4444";
            } else {
                updateExpenseModalLimit();
            }
        }
    });
}

if (expenseForm) {

    expenseForm.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            const name =
                document
                    .getElementById(
                        "expenseName"
                    )
                    ?.value
                    .trim();

            const amount =
                Number(
                    document
                        .getElementById(
                            "expenseAmount"
                        )
                        ?.value
                );

            const category =
                document
                    .getElementById(
                        "expenseCategory"
                    )
                    ?.value;

            const date =
                document
                    .getElementById(
                        "expenseDate"
                    )
                    ?.value;

            if (
                !name ||
                amount <= 0 ||
                !category ||
                !date
            ) {

                showToast(
                    "Please fill all fields",
                    "⚠️"
                );

                return;

            }

            const info = getExpenseLimitInfo();

            if (info.income <= 0) {
                showToast(
                    "Please set Monthly Income first in Budget tab",
                    "⚠️"
                );
                return;
            }

            if (amount > info.remainingSpend) {
                if (info.remainingSpend <= 0) {
                    showToast(
                        "Expense blocked! Set limit (" + money(info.maxAllowedExpenses) + ") reached. Savings (" + money(info.protectedSavings) + ") cannot be touched!",
                        "🚫"
                    );
                } else if (info.protectedSavings > 0 && (info.income - (info.currentExpenses + amount) < info.protectedSavings)) {
                    showToast(
                        "Expense blocked! Cannot touch savings (" + money(info.protectedSavings) + " protected). Only " + money(info.remainingSpend) + " remaining to spend.",
                        "🚫"
                    );
                } else if (info.budget > 0) {
                    showToast(
                        "Expense blocked! Exceeds set budget (" + money(info.budget) + "). Only " + money(info.remainingSpend) + " remaining.",
                        "🚫"
                    );
                } else {
                    showToast(
                        "Expense blocked! Only " + money(info.remainingSpend) + " remaining without touching savings.",
                        "🚫"
                    );
                }
                return;
            }

            const expense = {

                id:
                    Date.now().toString(),

                name,

                amount,

                category,

                date

            };

            expenses.push(
                expense
            );

            await saveExpenses();

            expenseForm.reset();

            expenseModal?.classList.remove(
                "show"
            );

            updateDashboard();

            showToast(
                "Expense added successfully",
                "✓"
            );

        }
    );

}


/* ==========================================
   DELETE EXPENSE
========================================== */

async function deleteExpense(id) {

    const confirmed =
        confirm(
            "Delete this expense?"
        );

    if (!confirmed) return;

    expenses =
        expenses.filter(
            expense =>
                expense.id !== id
        );

    await saveExpenses();

    updateDashboard();

    showToast(
        "Expense deleted",
        "🗑️"
    );

}

window.deleteExpense =
    deleteExpense;



/* ==========================================
   UPI PAYMENTS
========================================== */

const upiIdInput = document.getElementById("upiIdInput");
const upiPayeeInput = document.getElementById("upiPayeeInput");
const saveUpiBtn = document.getElementById("saveUpiBtn");
const upiAmountInput = document.getElementById("upiAmountInput");
const upiNoteInput = document.getElementById("upiNoteInput");
const generateUpiBtn = document.getElementById("generateUpiBtn");
const upiPayBtn = document.getElementById("upiPayBtn");
const upiQr = document.getElementById("upiQr");
const paymentForm = document.getElementById("paymentForm");

function setPaymentDateDefault() {
    const input = document.getElementById("paymentDate");
    if (input && !input.value) {
        input.value = new Date().toISOString().slice(0, 10);
    }
}

function renderUpiSettings() {
    if (upiIdInput) upiIdInput.value = paymentSettings.upiId || "";
    if (upiPayeeInput) upiPayeeInput.value = paymentSettings.payee || "";
}

async function savePaymentSettings() {
    if (!currentUser) {
        showToast("Please login first", "⚠️");
        return;
    }

    const upiId = upiIdInput?.value.trim() || "";
    const payee = upiPayeeInput?.value.trim() || "";

    if (!/^[A-Za-z0-9._-]{2,}@[A-Za-z0-9._-]{2,}$/.test(upiId)) {
        showToast("Enter a valid UPI ID, e.g. name@upi", "⚠️");
        return;
    }

    paymentSettings = { upiId, payee };

    try {
        await updateDoc(userRef(), {
            paymentSettings
        });
        showToast("UPI details saved", "✓");
    } catch (error) {
        console.error("SAVE UPI ERROR:", error);
        showToast("Unable to save UPI details", "❌");
    }
}

function buildUpiLink() {
    const pa = (paymentSettings.upiId || upiIdInput?.value || "").trim();
    const pn = (paymentSettings.payee || upiPayeeInput?.value || "FinAI User").trim();
    const amount = Number(upiAmountInput?.value || 0);
    const note = (upiNoteInput?.value || "FinAI Payment").trim();

    if (!pa) {
        showToast("Save your UPI ID first", "⚠️");
        return "";
    }

    if (amount <= 0) {
        showToast("Enter a valid payment amount", "⚠️");
        return "";
    }

    return `upi://pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(pn)}&am=${encodeURIComponent(amount.toFixed(2))}&cu=INR&tn=${encodeURIComponent(note)}`;
}


function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function moneySafe(value) {
    return money(Number(value || 0));
}

function renderPayments() {
    const list = document.getElementById("paymentsList");
    const totalEl = document.getElementById("paymentTotal");
    const monthEl = document.getElementById("paymentMonthTotal");
    const countEl = document.getElementById("paymentCount");
    const proofEl = document.getElementById("paymentProofCount");

    const sorted = [...payments].sort((a, b) =>
        String(b.date || "").localeCompare(String(a.date || ""))
    );

    const confirmedPayments = payments.filter(payment =>
        payment.status === "Paid" && expenses.some(expense => expense.sourcePaymentId === payment.id)
    );
    const total = confirmedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthTotal = confirmedPayments
        .filter(p => String(p.date || "").startsWith(monthKey))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const proofCount = payments.filter(p => p.proofUrl).length;

    if (totalEl) totalEl.textContent = moneySafe(total);
    if (monthEl) monthEl.textContent = moneySafe(monthTotal);
    if (countEl) countEl.textContent = String(confirmedPayments.length);
    if (proofEl) proofEl.textContent = String(proofCount);

    if (!list) return;

    if (!sorted.length) {
        list.innerHTML = `<div class="empty-state">No UPI payments recorded yet.</div>`;
        return;
    }

    list.innerHTML = sorted.map(payment => {
        const hasLinkedExpense = expenses.some(expense => expense.sourcePaymentId === payment.id);
        const isPaid = payment.status === "Paid" && hasLinkedExpense;
        const status = isPaid ? "Paid · added to Expenses" : (payment.status || "Pending verification");
        const proof = payment.proofUrl
            ? `<a class="proof-link" href="${payment.proofUrl}" target="_blank" rel="noopener">📎 View proof</a>`
            : `<span class="no-proof">No proof</span>`;
        const paidClass = isPaid ? " is-paid" : "";
        const completionAction = isPaid
            ? `<span class="expense-sync-mark">✓ In Expenses</span>`
            : `<button class="confirm-payment-btn" type="button" onclick="markPaymentComplete('${payment.id}')">✓ Mark paid &amp; add expense</button>`;

        return `
            <div class="payment-row">
                <div class="payment-row-main">
                    <div class="payment-row-icon">💳</div>
                    <div>
                        <strong>${escapeHtml(payment.title || "UPI Payment")}</strong>
                        <small>${escapeHtml(payment.category || "Other")} · ${escapeHtml(payment.date || "")}</small>
                        ${payment.utr ? `<small>UTR: ${escapeHtml(payment.utr)}</small>` : ""}
                    </div>
                </div>
                <div class="payment-row-right">
                    <strong>${moneySafe(payment.amount)}</strong>
                    <span class="payment-status${paidClass}">${escapeHtml(status)}</span>
                    ${proof}
                    ${completionAction}
                    <button class="delete-payment-btn" type="button" onclick="deletePayment('${payment.id}')">Delete</button>
                </div>
            </div>
        `;
    }).join("");
}

async function uploadPaymentProof(file, paymentId) {
    if (!file) return "";

    if (file.size > 5 * 1024 * 1024) {
        throw new Error("Payment proof must be 5 MB or smaller.");
    }

    const allowed = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf"
    ];

    if (!allowed.includes(file.type)) {
        throw new Error("Only JPG, PNG, WEBP images or PDF files are allowed.");
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storageRef = ref(
        storage,
        `users/${currentUser.uid}/payment-proofs/${paymentId}-${safeName}`
    );

    await uploadBytes(storageRef, file, {
        contentType: file.type
    });

    return await getDownloadURL(storageRef);
}

if (saveUpiBtn) {
    saveUpiBtn.addEventListener("click", savePaymentSettings);
}

/* ==========================================
   AUTO-FILL PAYMENT & EXPENSE ENGINE
   — Payment initiate ya complete hone par
     form fields apne aap auto-fill ho jayein.
========================================== */

function autoFillPaymentForm(data = {}, options = {}) {
    const titleInput = document.getElementById("paymentTitle");
    const amountInput = document.getElementById("paymentAmount");
    const categoryInput = document.getElementById("paymentCategory");
    const utrInput = document.getElementById("paymentUtr");
    const dateInput = document.getElementById("paymentDate");
    const completedCheckbox = document.getElementById("paymentCompleted");
    const banner = document.getElementById("paymentAutoFillBanner");
    const bannerText = document.getElementById("autoFillDetailsText");

    const amount = Number(data.amount || document.getElementById("upiAmountInput")?.value || 0);
    const rawNote = (data.note || data.title || document.getElementById("upiNoteInput")?.value || "").trim();
    const payee = (paymentSettings.payee || document.getElementById("upiPayeeInput")?.value || "").trim();
    const title = rawNote || (payee ? `Payment to ${payee}` : "UPI Payment");
    const category = data.category || document.getElementById("upiCategoryInput")?.value || "Other";
    const date = data.date || new Date().toISOString().slice(0, 10);
    const isRealUtr = data.utr && !String(data.utr).startsWith("UPI") && /^\d{10,22}$/.test(String(data.utr).trim());
    const utr = isRealUtr ? String(data.utr).trim() : (data.utr && !String(data.utr).startsWith("UPI") ? String(data.utr).trim() : "");

    if (titleInput && (!titleInput.value || options.force)) {
        titleInput.value = title;
        titleInput.classList.add("input-autofilled");
    }
    if (amountInput && (amount > 0 || options.force)) {
        amountInput.value = amount > 0 ? amount : "";
        amountInput.classList.add("input-autofilled");
    }
    if (categoryInput && (!categoryInput.value || options.force)) {
        categoryInput.value = category;
        categoryInput.classList.add("input-autofilled");
    }
    if (utrInput) {
        if (utr) {
            utrInput.value = utr;
            utrInput.classList.add("input-autofilled");
        } else if (!utrInput.value) {
            utrInput.placeholder = "e.g. 426912345678 (From GPay / PhonePe / SMS)";
        }
    }
    if (dateInput) {
        dateInput.value = date;
        dateInput.classList.add("input-autofilled");
    }
    if (completedCheckbox && options.completed !== undefined) {
        completedCheckbox.checked = options.completed;
    }

    if (banner && (amount > 0 || title)) {
        if (bannerText) {
            const utrBadge = utr ? ` · UTR: <code>${escapeHtml(utr)}</code>` : ` · <span style="opacity:0.85;">(UTR: Bank SMS ya Screenshot se scan karein)</span>`;
            bannerText.innerHTML = `Auto-filled: <strong>₹${Number(amount || 0).toLocaleString("en-IN")}</strong> · ${escapeHtml(title)} · ${escapeHtml(category)}${utrBadge}`;
        }
        banner.style.display = "flex";
    }

    try {
        sessionStorage.setItem("finai_last_payment_fill", JSON.stringify({
            title,
            amount,
            category,
            date,
            utr,
            timestamp: Date.now()
        }));
    } catch {}
}

function clearPaymentFormAutoFill() {
    const form = document.getElementById("paymentForm");
    if (form) form.reset();
    setPaymentDateDefault();
    const completedCheckbox = document.getElementById("paymentCompleted");
    if (completedCheckbox) completedCheckbox.checked = false;
    const banner = document.getElementById("paymentAutoFillBanner");
    if (banner) banner.style.display = "none";
    document.querySelectorAll(".input-autofilled").forEach(el => el.classList.remove("input-autofilled"));
}

function checkRecentPaymentForExpenseModal() {
    const prompt = document.getElementById("expenseAutoFillPrompt");
    const btn = document.getElementById("useRecentPaymentBtn");
    if (!prompt) return;

    let recent = null;
    try {
        const raw = sessionStorage.getItem("finai_last_payment_fill");
        if (raw) recent = JSON.parse(raw);
    } catch {}

    if (recent && recent.amount && (Date.now() - (recent.timestamp || 0) < 15 * 60 * 1000)) {
        prompt.style.display = "flex";
        const promptSpan = prompt.querySelector("span");
        if (promptSpan) {
            promptSpan.innerHTML = `✨ Auto-fill from recent payment: <strong>₹${Number(recent.amount).toLocaleString("en-IN")} (${escapeHtml(recent.title)})</strong>`;
        }
        if (btn) {
            btn.onclick = () => {
                const nameInput = document.getElementById("expenseName");
                const amountInput = document.getElementById("expenseAmount");
                const categoryInput = document.getElementById("expenseCategory");
                const dateInput = document.getElementById("expenseDate");

                if (nameInput) {
                    nameInput.value = recent.title || "UPI Payment";
                    nameInput.classList.add("input-autofilled");
                }
                if (amountInput) {
                    amountInput.value = recent.amount;
                    amountInput.classList.add("input-autofilled");
                }
                if (categoryInput && recent.category) {
                    categoryInput.value = recent.category;
                    categoryInput.classList.add("input-autofilled");
                }
                if (dateInput && recent.date) {
                    dateInput.value = recent.date;
                    dateInput.classList.add("input-autofilled");
                }

                prompt.style.display = "none";
                showToast("Expense details auto-filled from payment! ✨", "✓");
            };
        }
    } else {
        prompt.style.display = "none";
    }
}

let _pendingAutoPayment = null;  // current pending payment data

/** QR generate hone ke baad UPI UI show karo aur details form mein auto-fill karo */
function generateUpiQr() {
    const link = buildUpiLink();
    if (!link || !upiQr) return;

    upiQr.innerHTML = "";

    if (typeof QRCode === "undefined") {
        showToast("QR library could not load. Check internet connection.", "❌");
        return;
    }

    const amount  = Number(document.getElementById("upiAmountInput")?.value || 0);
    const note    = (document.getElementById("upiNoteInput")?.value  || "UPI Payment").trim();
    const category= document.getElementById("upiCategoryInput")?.value || "Other";

    new QRCode(upiQr, {
        text: link,
        width: 190,
        height: 190,
        correctLevel: QRCode.CorrectLevel.M
    });

    if (upiPayBtn) {
        upiPayBtn.href = link;
        upiPayBtn.style.display = "inline-flex";
    }

    // Hide placeholder text
    const placeholder = document.getElementById("upiQrPlaceholder");
    if (placeholder) placeholder.style.display = "none";

    // Prepare pending payment details
    const pa = (paymentSettings.upiId || document.getElementById("upiIdInput")?.value || "").trim();
    _pendingAutoPayment = {
        amount,
        note,
        category,
        upiId: pa,
        date: new Date().toISOString().slice(0, 10),
        utr: ""
    };

    // Auto-fill payment tracker form immediately
    autoFillPaymentForm(_pendingAutoPayment, { force: true, completed: true });

    _showUpiTrackerUI();
    showToast("UPI QR generated! Details auto-filled below 📲", "📲");
}

function _showUpiTrackerUI() {
    const tracker = document.getElementById("upiAutoTracker");
    if (!tracker || !_pendingAutoPayment) return;

    const p = _pendingAutoPayment;
    tracker.innerHTML = `
        <div class="upi-auto-status">
            <span class="pulse-indicator"></span>
            <strong id="upiAutoStatusText">Scan QR in PhonePe / GPay / Paytm to pay</strong>
        </div>
        <div class="upi-auto-details" id="upiAutoDetails">
            <span>💰 Amount: <strong>₹${Number(p.amount).toLocaleString("en-IN")}</strong></span>&nbsp;·&nbsp;
            <span>📂 ${escapeHtml(p.category)}</span>&nbsp;·&nbsp;
            <span>📝 ${escapeHtml(p.note)}</span>
        </div>
        <div class="upi-auto-actions" style="display:flex; flex-direction:column; gap:8px; width:100%;">
            <button id="simulatePaidBtn" class="primary-btn auto-paid-btn" type="button" style="width:100%; justify-content:center; font-size:0.92rem; padding:12px 16px; font-weight:700;">
                ⚡ I Have Paid — Auto-Record Now
            </button>
            <button id="cancelUpiBtn" class="secondary-btn cancel-upi-btn" type="button" style="width:100%; justify-content:center;">
                ✕ Cancel / New QR
            </button>
        </div>
        <small style="color: rgba(255,255,255,0.6); text-align: center; font-size: 0.78rem; display:block; margin-top:2px;">
            Details have been auto-filled below! Click "⚡ I Have Paid" to auto-record to Tracker &amp; Expenses instantly.
        </small>
    `;

    document.getElementById("simulatePaidBtn")?.addEventListener("click", _handleOneClickAutoRecord);
    document.getElementById("cancelUpiBtn")?.addEventListener("click", _resetAutoTracker);

    tracker.style.display = "flex";
}

function _resetAutoTracker() {
    _pendingAutoPayment = null;

    const tracker     = document.getElementById("upiAutoTracker");
    const placeholder = document.getElementById("upiQrPlaceholder");
    if (tracker)     tracker.style.display = "none";
    if (placeholder) { placeholder.style.display = ""; placeholder.textContent = "Enter amount and click Generate QR"; }
    if (upiQr)       upiQr.innerHTML = "";
    if (upiPayBtn)   upiPayBtn.style.display = "none";
    const amountInput = document.getElementById("upiAmountInput");
    const noteInput   = document.getElementById("upiNoteInput");
    if (amountInput) amountInput.value = "";
    if (noteInput)   noteInput.value   = "";
    clearPaymentFormAutoFill();
}

// "⚡ I Have Paid — Auto-Record Now" handler
// User scans & pays on their phone, then clicks this to instantly auto-record in Tracker & Expenses
async function _handleOneClickAutoRecord() {
    if (!_pendingAutoPayment) {
        showToast("Please generate a QR code first", "⚠️");
        return;
    }

    if (!currentUser) {
        showToast("Please login first to record payment", "⚠️");
        return;
    }

    const p = _pendingAutoPayment;
    const btn = document.getElementById("simulatePaidBtn");
    const tracker = document.getElementById("upiAutoTracker");

    if (btn) {
        btn.disabled = true;
        btn.textContent = "⏳ Recording Payment...";
    }

    const userEnteredUtr = document.getElementById("paymentUtr")?.value.trim();
    const txnRef = userEnteredUtr || p.utr || ("UPI-" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + "-" + Math.floor(1000 + Math.random() * 9000));

    const newPayment = {
        id: `pay_${Date.now()}`,
        title: p.note || "UPI Payment",
        amount: Number(p.amount),
        category: p.category || "Other",
        utr: txnRef,
        date: p.date || new Date().toISOString().slice(0, 10),
        proofUrl: "",
        status: "Paid",
        createdAt: new Date().toISOString()
    };

    const newExpense = {
        id: `exp_${newPayment.id}`,
        name: newPayment.title,
        amount: newPayment.amount,
        category: newPayment.category,
        date: newPayment.date,
        sourcePaymentId: newPayment.id,
        paymentMethod: "UPI",
        utr: txnRef,
        status: "Paid"
    };

    newPayment.expenseId = newExpense.id;

    const prevPayments = payments;
    const prevExpenses = expenses;

    try {
        payments = [newPayment, ...payments];
        expenses = [newExpense, ...expenses];

        await updateDoc(userRef(), { payments, expenses });

        updateDashboard();
        renderPayments();

        // Auto-fill and update form to reflect completed payment
        autoFillPaymentForm(newPayment, { force: true, completed: true });

        // Show prominent success UI inside QR container
        if (tracker) {
            tracker.innerHTML = `
                <div style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 12px; padding: 14px; text-align: center; width: 100%;">
                    <div style="font-size: 1.5rem; margin-bottom: 4px;">🎉</div>
                    <strong style="color: #10b981; font-size: 1rem; display: block;">Payment Auto-Recorded!</strong>
                    <p style="margin: 6px 0 2px 0; font-size: 0.88rem; color: #fff;">
                        ₹${Number(p.amount).toLocaleString("en-IN")} added to <strong>Tracker &amp; Expenses</strong>
                    </p>
                    <small style="color: rgba(255,255,255,0.6); font-size: 0.78rem;">Ref: ${txnRef}</small>
                </div>
                <button id="newQrAfterPayBtn" class="primary-btn" type="button" style="width: 100%; justify-content: center; margin-top: 8px;">
                    🔄 Generate New Payment QR
                </button>
            `;
            document.getElementById("newQrAfterPayBtn")?.addEventListener("click", _resetAutoTracker);
        }

        _pendingAutoPayment = null;
        showToast(`₹${Number(newPayment.amount).toLocaleString("en-IN")} payment recorded in Tracker & Expenses! 🎉`, "✓");

    } catch (err) {
        payments = prevPayments;
        expenses = prevExpenses;
        console.error("AUTO-RECORD ERROR:", err);
        showToast("Could not record payment. Please try again.", "❌");
        if (btn) {
            btn.disabled = false;
            btn.textContent = "⚡ I Have Paid — Auto-Record Now";
        }
    }
}

if (generateUpiBtn) {
    generateUpiBtn.addEventListener("click", generateUpiQr);
}

if (upiPayBtn) {
    upiPayBtn.addEventListener("click", () => {
        if (_pendingAutoPayment) {
            autoFillPaymentForm(_pendingAutoPayment, { force: true, completed: true });
        }
        window._waitingForUpiReturn = true;
        showToast("Opening UPI app... Details are auto-filled below! 📲", "📲");
    });
}

const clearAutoFillBtn = document.getElementById("clearAutoFillBtn");
if (clearAutoFillBtn) {
    clearAutoFillBtn.addEventListener("click", clearPaymentFormAutoFill);
}

// Live typing sync between UPI creator and Payment Tracker form
[upiAmountInput, upiNoteInput, upiCategoryInput].forEach(el => {
    if (!el) return;
    el.addEventListener("input", () => {
        const amt = Number(upiAmountInput?.value || 0);
        const note = (upiNoteInput?.value || "").trim();
        const cat = upiCategoryInput?.value || "Other";
        if (amt > 0 || note) {
            autoFillPaymentForm({ amount: amt, note, category: cat }, { force: false, completed: false });
        }
    });
});

// Auto-fill when returning to FinAI tab after opening UPI app
function handleUpiAppReturn() {
    if (window._waitingForUpiReturn && _pendingAutoPayment) {
        window._waitingForUpiReturn = false;
        autoFillPaymentForm(_pendingAutoPayment, { force: true, completed: true });
        showToast("✨ Welcome back! Payment details auto-filled in form.", "💳");
        const trackerCard = document.querySelector(".tracker-card");
        if (trackerCard) {
            trackerCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }
    }
}

window.addEventListener("focus", handleUpiAppReturn);
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        handleUpiAppReturn();
    }
});

/* ==========================================
   ORIGINAL UPI UTR EXTRACTOR (SMS & OCR)
========================================== */

function parseUpiDetailsFromText(rawText) {
    if (!rawText) return {};
    const text = String(rawText);
    const res = {};

    // 1. Extract 12-digit UPI UTR / RRN
    const explicitUtrRegex = /(?:UPI(?:\s*Ref(?:\s*no)?)?|Ref(?:\s*no)?|UTR|RRN|Txn(?:\s*ID)?|Transaction(?:\s*ID)?)[:\s#-]*([0-9]{12})/i;
    const matchUtr = text.match(explicitUtrRegex);

    if (matchUtr && matchUtr[1]) {
        res.utr = matchUtr[1];
    } else {
        const digits12 = text.match(/\b([0-9]{12})\b/);
        if (digits12 && digits12[1]) {
            res.utr = digits12[1];
        }
    }

    // 2. Extract Amount: "Rs. 500", "INR 500", "₹500", "debited by 500"
    const amtRegex = /(?:Rs\.?|INR|₹|debited\s*(?:by|with)?(?:\s*INR|\s*Rs\.?)?)\s*([0-9,]+(?:\.[0-9]{1,2})?)/i;
    const matchAmt = text.match(amtRegex);
    if (matchAmt && matchAmt[1]) {
        const cleanAmt = parseFloat(matchAmt[1].replace(/,/g, ""));
        if (!isNaN(cleanAmt) && cleanAmt > 0) {
            res.amount = cleanAmt;
        }
    }

    // 3. Extract Date if available
    const dateRegex = /\b(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/;
    const matchDate = text.match(dateRegex);
    if (matchDate && matchDate[1]) {
        try {
            const parsed = new Date(matchDate[1]);
            if (!isNaN(parsed.getTime())) {
                res.date = parsed.toISOString().slice(0, 10);
            }
        } catch {}
    }

    return res;
}

async function handlePasteSmsClick() {
    let clipboardText = "";
    if (navigator.clipboard && navigator.clipboard.readText) {
        try {
            clipboardText = await navigator.clipboard.readText();
        } catch {}
    }

    if (clipboardText && clipboardText.trim().length > 5) {
        const extracted = parseUpiDetailsFromText(clipboardText);
        if (extracted.utr) {
            applyExtractedUpiData(extracted, "Clipboard");
            return;
        }
    }

    const smsModal = document.getElementById("smsModal");
    const smsTextInput = document.getElementById("smsTextInput");
    if (smsModal) {
        if (smsTextInput) {
            smsTextInput.value = clipboardText || "";
            setTimeout(() => smsTextInput.focus(), 100);
        }
        smsModal.style.display = "flex";
    }
}

function applyExtractedUpiData(extracted, source = "SMS") {
    const utrInput = document.getElementById("paymentUtr");
    const amountInput = document.getElementById("paymentAmount");
    const dateInput = document.getElementById("paymentDate");
    const completedCheckbox = document.getElementById("paymentCompleted");

    if (extracted.utr && utrInput) {
        utrInput.value = extracted.utr;
        utrInput.classList.add("input-autofilled");
    }
    if (extracted.amount && amountInput && (!amountInput.value || Number(amountInput.value) <= 0)) {
        amountInput.value = extracted.amount;
        amountInput.classList.add("input-autofilled");
    }
    if (extracted.date && dateInput) {
        dateInput.value = extracted.date;
        dateInput.classList.add("input-autofilled");
    }
    if (completedCheckbox) {
        completedCheckbox.checked = true;
    }

    const banner = document.getElementById("paymentAutoFillBanner");
    const bannerText = document.getElementById("autoFillDetailsText");
    if (banner && bannerText && extracted.utr) {
        bannerText.innerHTML = `✓ Original 12-digit UTR extracted from ${source}: <code>${escapeHtml(extracted.utr)}</code>`;
        banner.style.display = "flex";
    }

    showToast(`Original 12-digit UTR (${extracted.utr}) auto-filled from ${source}! ✨`, "✓");
}

async function scanScreenshotForUtr(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const statusEl = document.getElementById("proofOcrStatus");
    if (statusEl) {
        statusEl.innerHTML = `<span style="color:#6c5ce7; font-weight:600;">⏳ Scanning screenshot for original 12-digit UTR...</span>`;
    }

    try {
        if (typeof Tesseract === "undefined") {
            if (statusEl) statusEl.textContent = "Upload screenshot (PhonePe/GPay receipt)";
            return;
        }

        const result = await Tesseract.recognize(file, 'eng');
        const text = result?.data?.text || "";
        const extracted = parseUpiDetailsFromText(text);

        if (extracted.utr) {
            applyExtractedUpiData(extracted, "Screenshot");
            if (statusEl) {
                statusEl.innerHTML = `<span style="color:#10b981; font-weight:600;">✓ Scanned original 12-digit UTR: <strong>${extracted.utr}</strong></span>`;
            }
        } else {
            if (statusEl) {
                statusEl.innerHTML = `Screenshot uploaded. Click "📋 Paste SMS" if UTR not auto-detected.`;
            }
        }
    } catch (err) {
        console.warn("Screenshot OCR error:", err);
        if (statusEl) {
            statusEl.textContent = "Screenshot uploaded.";
        }
    }
}

const pasteSmsBtn = document.getElementById("pasteSmsBtn");
if (pasteSmsBtn) {
    pasteSmsBtn.addEventListener("click", handlePasteSmsClick);
}

const closeSmsModal = document.getElementById("closeSmsModal");
const cancelSmsBtn = document.getElementById("cancelSmsBtn");
const smsModal = document.getElementById("smsModal");
[closeSmsModal, cancelSmsBtn].forEach(btn => {
    btn?.addEventListener("click", () => {
        if (smsModal) smsModal.style.display = "none";
    });
});

const extractSmsBtn = document.getElementById("extractSmsBtn");
if (extractSmsBtn) {
    extractSmsBtn.addEventListener("click", () => {
        const text = document.getElementById("smsTextInput")?.value.trim();
        if (!text) {
            showToast("Please paste SMS or transaction message", "⚠️");
            return;
        }
        const extracted = parseUpiDetailsFromText(text);
        if (extracted.utr) {
            applyExtractedUpiData(extracted, "SMS");
            if (smsModal) smsModal.style.display = "none";
        } else {
            showToast("Could not find 12-digit UTR in text. Please check the message.", "⚠️");
        }
    });
}

const paymentProofInput = document.getElementById("paymentProof");
if (paymentProofInput) {
    paymentProofInput.addEventListener("change", event => {
        const file = event.target.files?.[0];
        if (file) {
            scanScreenshotForUtr(file);
        }
    });
}

if (paymentForm) {
    paymentForm.addEventListener("submit", async event => {
        event.preventDefault();

        if (!currentUser) {
            showToast("Please login first", "⚠️");
            return;
        }

        const title = document.getElementById("paymentTitle")?.value.trim();
        const amount = Number(document.getElementById("paymentAmount")?.value || 0);
        const category = document.getElementById("paymentCategory")?.value;
        const utr = document.getElementById("paymentUtr")?.value.trim();
        const date = document.getElementById("paymentDate")?.value;
        const file = document.getElementById("paymentProof")?.files?.[0];
        const completed = Boolean(document.getElementById("paymentCompleted")?.checked);

        if (!title || amount <= 0 || !category || !date) {
            showToast("Please fill the required payment fields", "⚠️");
            return;
        }

        const payment = {
            id: `pay_${Date.now()}`,
            title,
            amount,
            category,
            utr,
            date,
            proofUrl: "",
            status: "Pending verification",
            createdAt: new Date().toISOString()
        };

        const previousPayments = payments;
        const previousExpenses = expenses;
        try {
            if (file) {
                showToast("Uploading payment proof...", "⏳");
                payment.proofUrl = await uploadPaymentProof(file, payment.id);
            }

            payments = [...payments, payment];

            if (completed) {
                const expense = {
                    id: `exp_${payment.id}`,
                    name: title,
                    amount,
                    category,
                    date,
                    sourcePaymentId: payment.id
                };
                payment.status = "Paid";
                payment.expenseId = expense.id;
                expenses = [...expenses, expense];
            }

            await updateDoc(userRef(), completed ? { payments, expenses } : { payments });

            clearPaymentFormAutoFill();
            updateDashboard();
            renderPayments();

            showToast(
                completed
                    ? "Payment saved and added to Expenses"
                    : "Payment saved — confirm after UPI success to add it to Expenses",
                "✓"
            );
        } catch (error) {
            payments = previousPayments;
            expenses = previousExpenses;
            console.error("SAVE PAYMENT ERROR:", error);
            showToast(error.message || "Unable to save payment", "❌");
        }
    });
}

async function markPaymentComplete(id) {
    if (!currentUser) {
        showToast("Please login first", "⚠️");
        return;
    }

    const payment = payments.find(item => item.id === id);
    if (!payment) return;

    const existingExpense = expenses.find(item => item.sourcePaymentId === payment.id);
    if (existingExpense) {
        showToast("This payment is already in Expenses", "ℹ️");
        return;
    }

    const previousPayments = payments;
    const previousExpenses = expenses;

    try {
        showToast("Verifying payment and adding expense...", "⏳");

        const idToken = await currentUser.getIdToken();
        const backendUrl = window.FINAI_BACKEND_URL || "";

        const response = await fetch(`${backendUrl}/api/upi/complete`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${idToken}`
            },
            body: JSON.stringify({
                payment: {
                    id: payment.id,
                    title: payment.title || "UPI Payment",
                    amount: Number(payment.amount || 0),
                    category: payment.category || "Other",
                    date: payment.date || new Date().toISOString().slice(0, 10),
                    utr: payment.utr || ""
                }
            })
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(result.error || "Backend could not verify the payment.");
        }

        const confirmedPayment = result.payment || {
            ...payment,
            status: "Paid",
            expenseId: `exp_${payment.id}`,
            completedAt: new Date().toISOString()
        };

        const confirmedExpense = result.expense || {
            id: confirmedPayment.expenseId || `exp_${payment.id}`,
            name: payment.title || "UPI Payment",
            amount: Number(payment.amount || 0),
            category: payment.category || "Other",
            date: payment.date || new Date().toISOString().slice(0, 10),
            sourcePaymentId: payment.id,
            paymentMethod: "UPI",
            utr: payment.utr || "",
            status: "Paid"
        };

        payments = payments.map(item =>
            item.id === id ? { ...item, ...confirmedPayment } : item
        );

        if (!expenses.some(item => item.sourcePaymentId === payment.id)) {
            expenses = [...expenses, confirmedExpense];
        }

        updateDashboard();
        renderPayments();

        showToast(
            result.alreadyAdded
                ? "Payment was already added to Expenses"
                : `₹${Number(payment.amount).toLocaleString("en-IN")} added to Expenses ✓`,
            "✓"
        );
    } catch (error) {
        payments = previousPayments;
        expenses = previousExpenses;
        console.error("PAYMENT-TO-EXPENSE SYNC ERROR:", error);
        showToast(error.message || "Could not sync payment to Expenses", "❌");
    }
}
window.markPaymentComplete = markPaymentComplete;

async function deletePayment(id) {
    const confirmed = confirm("Delete this payment record?");
    if (!confirmed || !currentUser) return;

    const paymentToDelete = payments.find(p => p.id === id);
    payments = payments.filter(payment => payment.id !== id);
    if (paymentToDelete) {
        expenses = expenses.filter(e => e.sourcePaymentId !== id && (!paymentToDelete.expenseId || e.id !== paymentToDelete.expenseId));
    }

    try {
        await updateDoc(userRef(), { payments, expenses });
        updateDashboard();
        renderPayments();
        showToast("Payment deleted", "🗑️");
    } catch (error) {
        console.error("DELETE PAYMENT ERROR:", error);
        showToast("Unable to delete payment", "❌");
    }
}

window.deletePayment = deletePayment;

setPaymentDateDefault();
renderUpiSettings();
renderPayments();

/* ==========================================
   SAVE BUDGET
========================================== */

const saveBudgetBtn =
    document.getElementById(
        "saveBudgetBtn"
    );

if (saveBudgetBtn) {

    saveBudgetBtn.addEventListener(
        "click",
        async () => {

            const income =
                Number(
                    document
                        .getElementById(
                            "incomeInput"
                        )
                        ?.value
                );

            const budget =
                Number(
                    document
                        .getElementById(
                            "budgetInput"
                        )
                        ?.value
                );

            const goal =
                Number(
                    document
                        .getElementById(
                            "goalInput"
                        )
                        ?.value
                );

            if (income <= 0) {
                showToast(
                    "Enter a valid monthly income",
                    "⚠️"
                );
                return;
            }

            if (budget > income) {
                showToast(
                    "Budget cannot be higher than income",
                    "🚫"
                );
                return;
            }

            if (budget > 0 && goal > 0 && (budget + goal > income)) {
                showToast(
                    "Budget (" + money(budget) + ") + Savings Goal (" + money(goal) + ") cannot exceed Income (" + money(income) + ") to protect savings!",
                    "🚫"
                );
                return;
            }

            const totalExpenses =
                getTotalExpenses();

            if (
                totalExpenses >
                income
            ) {
                showToast(
                    "Income is already below your expenses",
                    "🚫"
                );
                return;
            }

            if (budget > 0 && totalExpenses > budget) {
                showToast(
                    "Budget cannot be less than current expenses (" + money(totalExpenses) + ")",
                    "🚫"
                );
                return;
            }

            financeData = {

                income:
                    Math.max(
                        0,
                        income
                    ),

                budget:
                    Math.max(
                        0,
                        budget
                    ),

                goal:
                    Math.max(
                        0,
                        goal
                    )

            };

            await saveFinanceData();

            updateDashboard();

            showToast(
                "Budget saved successfully",
                "✓"
            );

        }
    );

}


/* ==========================================
   UPDATE BUDGET
========================================== */

function updateBudgetPage() {

    const incomeInput =
        document.getElementById(
            "incomeInput"
        );

    const budgetInput =
        document.getElementById(
            "budgetInput"
        );

    const goalInput =
        document.getElementById(
            "goalInput"
        );

    if (incomeInput) {

        incomeInput.value =
            financeData.income || "";

    }

    if (budgetInput) {

        budgetInput.value =
            financeData.budget || "";

    }

    if (goalInput) {

        goalInput.value =
            financeData.goal || "";

    }

    const spent =
        getTotalExpenses();

    const limit =
        Number(
            financeData.budget || 0
        );

    const remaining =
        Math.max(
            limit - spent,
            0
        );

    const budgetSpent =
        document.getElementById(
            "budgetSpent"
        );

    const budgetLimit =
        document.getElementById(
            "budgetLimit"
        );

    const budgetRemaining =
        document.getElementById(
            "budgetRemaining"
        );

    if (budgetSpent) {

        budgetSpent.textContent =
            money(spent);

    }

    if (budgetLimit) {

        budgetLimit.textContent =
            money(limit);

    }

    if (budgetRemaining) {

        budgetRemaining.textContent =
            money(remaining);

    }

    let percentage = 0;

    if (limit > 0) {

        percentage =
            Math.min(
                (spent / limit) * 100,
                100
            );

    }

    const budgetProgress =
        document.getElementById(
            "budgetProgress"
        );

    if (budgetProgress) {

        budgetProgress.style.width =
            percentage + "%";

    }

    const message =
        document.getElementById(
            "budgetMessage"
        );

    if (!message) return;

    if (limit === 0) {

        message.textContent =
            "Set a monthly budget to start tracking your spending.";

    } else if (spent > limit) {

        message.textContent =
            `⚠️ You are ${money(
                spent - limit
            )} over your monthly budget.`;

    } else if (percentage >= 80) {

        message.textContent =
            "⚠️ You have used more than 80% of your budget. Spend carefully.";

    } else {

        message.textContent =
            "✓ Your spending is currently within your budget.";

    }

}


/* ==========================================
   SAVINGS GOAL
========================================== */

function updateGoal() {

    const target =
        Number(
            financeData.goal || 0
        );

    const income =
        Number(
            financeData.income || 0
        );

    const totalExpenses =
        getTotalExpenses();

    const saved =
        Math.max(
            income -
            totalExpenses,
            0
        );

    const goalTarget =
        document.getElementById(
            "goalTarget"
        );

    const goalSaved =
        document.getElementById(
            "goalSaved"
        );

    const goalRemaining =
        document.getElementById(
            "goalRemaining"
        );

    if (goalTarget) {

        goalTarget.textContent =
            money(target);

    }

    if (goalSaved) {

        goalSaved.textContent =
            money(saved);

    }

    const remaining =
        Math.max(
            target - saved,
            0
        );

    if (goalRemaining) {

        goalRemaining.textContent =
            money(remaining) +
            " remaining";

    }

    let percentage = 0;

    if (target > 0) {

        percentage =
            Math.min(
                (saved / target) * 100,
                100
            );

    }

    const goalPercent =
        document.getElementById(
            "goalPercent"
        );

    const goalProgress =
        document.getElementById(
            "goalProgress"
        );

    if (goalPercent) {

        goalPercent.textContent =
            Math.round(
                percentage
            ) + "%";

    }

    if (goalProgress) {

        goalProgress.style.width =
            percentage + "%";

    }

}


/* ==========================================
   SET GOAL
========================================== */

const setGoalBtn =
    document.getElementById(
        "setGoalBtn"
    );

if (setGoalBtn) {

    setGoalBtn.addEventListener(
        "click",
        () => {

            document
                .querySelector(
                    '[data-section="budget"]'
                )
                ?.click();

            setTimeout(
                () => {

                    document
                        .getElementById(
                            "goalInput"
                        )
                        ?.focus();

                },
                200
            );

        }
    );

}


/* ==========================================
   AI ANALYSIS
========================================== */

const analyzeBtn =
    document.getElementById(
        "analyzeBtn"
    );

if (analyzeBtn) {

    analyzeBtn.addEventListener(
        "click",
        analyzeFinances
    );

}


function analyzeFinances() {

    const income =
        Number(
            financeData.income || 0
        );

    const total =
        getTotalExpenses();

    const savings =
        income - total;

    const score =
        calculateFinanceScore();

    let messages = [];

    let insights = [];

    if (income === 0) {

        messages.push(
            "First, add your monthly income in the Budget section so I can analyze your finances more accurately."
        );

        insights.push({

            type: "warning",

            text:
                "Monthly income has not been added yet."

        });

    } else {

        const savingRate =
            (savings / income) * 100;

        if (savings > 0) {

            messages.push(
                `You currently have approximately ${
                    money(savings)
                } left after your recorded expenses.`
            );

            insights.push({

                type: "good",

                text:
                    `Your current estimated savings are ${
                        money(savings)
                    }.`

            });

        } else {

            messages.push(
                "Your recorded expenses are equal to or higher than your monthly income."
            );

            insights.push({

                type: "danger",

                text:
                    "Your current spending is leaving little or no room for savings."

            });

        }

        if (savingRate >= 20) {

            messages.push(
                `Your estimated saving rate is ${
                    Math.round(
                        savingRate
                    )
               }%. That's a healthy starting point for a student budget.`
            );

        } else if (savingRate > 0) {

            messages.push(
                `Your estimated saving rate is ${
                    Math.round(
                        savingRate
                    )
               }%. Look for one or two expenses you can reduce.`
            );

            insights.push({

                type: "warning",

                text:
                    "Try increasing your savings rate gradually."

            });

        }

        if (
            financeData.budget > 0 &&
            total > financeData.budget
        ) {

            messages.push(
                `You are ${
                    money(
                        total -
                        financeData.budget
                    )
                } above your monthly budget.`
            );

            insights.push({

                type: "danger",

                text:
                    "Your expenses have crossed your monthly budget."

            });

        }

        const categories =
            getCategoryTotals();

        const biggest =
            Object.entries(categories)
                .sort(
                    (a, b) =>
                        b[1] - a[1]
                )[0];

        if (biggest) {

            messages.push(
                `Your biggest spending category is ${
                    escapeHTML(
                        biggest[0]
                    )
                } at ${
                    money(
                        biggest[1]
                    )
                }.`
            );

            insights.push({

                type: "warning",

                text:
                    `${biggest[0]} is currently your largest expense category.`

            });

        }

        if (
            financeData.goal > 0 &&
            savings > 0
        ) {

            const months =
                Math.ceil(
                    financeData.goal /
                    savings
                );

            messages.push(
                `If your current monthly savings continued, your ${
                    money(
                        financeData.goal
                    )
                } goal could take roughly ${
                    months
                } months.`
            );

        }

    }

    showAIResponse(
        messages.join(" ")
    );

    updateAIScore(score);

    updateInsights(
        insights
    );

}


/* ==========================================
   CATEGORY TOTALS
========================================== */

function getCategoryTotals() {

    const categories = {};

    expenses.forEach(expense => {

        categories[
            expense.category
        ] =
            (
                categories[
                    expense.category
                ] || 0
            ) +
            Number(
                expense.amount || 0
            );

    });

    return categories;

}


/* ==========================================
   AI MESSAGE
========================================== */

function showAIResponse(text) {

    const messages =
        document.getElementById(
            "aiMessages"
        );

    if (!messages) return;

    const div =
        document.createElement(
            "div"
        );

    div.className =
        "message ai";

    div.innerHTML = `

        <div class="message-avatar">
            🤖
        </div>

        <div>

            <strong>
                Finance AI
            </strong>

            <p>
                ${
                    escapeHTML(text)
                }
            </p>

        </div>

    `;

    messages.appendChild(
        div
    );

    messages.scrollTop =
        messages.scrollHeight;

}


/* ==========================================
   AI SCORE
========================================== */

function updateAIScore(score) {

    const aiScore =
        document.getElementById(
            "aiScore"
        );

    const scoreLabel =
        document.getElementById(
            "scoreLabel"
        );

    if (aiScore) {

        aiScore.textContent =
            score;

    }

    let label =
        "Needs attention";

    if (score >= 80) {

        label =
            "Excellent financial habits";

    } else if (score >= 65) {

        label =
            "Good financial health";

    } else if (score >= 45) {

        label =
            "Room for improvement";

    }

    if (scoreLabel) {

        scoreLabel.textContent =
            label;

    }

    const ring =
        document.querySelector(
            ".score-ring"
        );

    if (!ring) return;

    const degrees =
        score * 3.6;

    ring.style.background =
        `conic-gradient(
            var(--primary)
            ${degrees}deg,
            #eeeeF3
            ${degrees}deg
        )`;

}


/* ==========================================
   INSIGHTS
========================================== */

function updateInsights(insights) {

    const container =
        document.getElementById(
            "aiInsights"
        );

    if (!container) return;

    if (
        insights.length === 0
    ) {

        container.innerHTML = `
            <div class="empty-state">
                Add your income and expenses
                for personalized insights.
            </div>
        `;

        return;

    }

    container.innerHTML =
        insights
            .map(item => {

                return `

                    <div
                        class="insight ${
                            escapeHTML(
                                item.type
                            )
                        }"
                    >

                        ${
                            escapeHTML(
                                item.text
                            )
                        }

                    </div>

                `;

            })
            .join("");

}


/* ==========================================
   QUICK QUESTIONS
========================================== */

document
    .querySelectorAll(
        ".quick-buttons button"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                answerQuickQuestion(
                    button.dataset.question
                );

            }
        );

    });


function answerQuickQuestion(question) {

    const income =
        Number(
            financeData.income || 0
        );

    const total =
        getTotalExpenses();

    const savings =
        income - total;

    let answer = "";

    if (
        question.includes(
            "save more"
        )
    ) {

        answer =
            "Start by identifying your biggest spending category. Try reducing one non-essential expense and move the saved amount toward your savings goal.";

    } else if (
        question.includes(
            "spending too much"
        )
    ) {

        if (income <= 0) {

            answer =
                "Add your monthly income first. Then I can compare your expenses with your available money.";

        } else {

            const rate =
                (total / income) * 100;

            answer =
                `Your recorded expenses use about ${
                    Math.round(rate)
                }% of your monthly income.`;

        }

    } else if (
        question.includes(
            "budget plan"
        )
    ) {

        answer =
            "A simple student budget can start with essential expenses first, then savings, and finally discretionary spending.";

    } else if (
        question.includes(
            "How much should I save"
        )
    ) {

        if (income > 0) {

            answer =
                `Based on your current income of ${
                    money(income)
                }, you could start by targeting around 10–20% if your essential expenses allow it.`;

        } else {

            answer =
                "Add your monthly income first.";

        }

    }

    showAIResponse(
        answer
    );

}


/* ==========================================
   CUSTOM AI QUESTION
========================================== */

const aiQuestionForm =
    document.getElementById(
        "aiQuestionForm"
    );

const aiQuestionInput =
    document.getElementById(
        "aiQuestionInput"
    );

const aiQuestionCount =
    document.getElementById(
        "aiQuestionCount"
    );

function showUserQuestion(text) {

    const messages =
        document.getElementById(
            "aiMessages"
        );

    if (!messages) return;

    const div =
        document.createElement(
            "div"
        );

    div.className =
        "message user-message";

    div.innerHTML = `
        <div class="message-avatar user-message-avatar">
            👤
        </div>

        <div>
            <strong>You</strong>
            <p>${escapeHTML(text)}</p>
        </div>
    `;

    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;

}

async function answerCustomQuestion(question) {

    const submitButton =
        aiQuestionForm?.querySelector(
            "button[type='submit']"
        );

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.dataset.originalText =
            submitButton.innerHTML;
        submitButton.innerHTML =
            "<span>Thinking...</span><span aria-hidden='true'>…</span>";
    }

    try {

        const backendUrl = window.FINAI_BACKEND_URL || "";
        const response =
            await fetch(`${backendUrl}/api/ask`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    question,
                    finance: financeData,
                    expenses
                })
            });

        const data =
            await response.json()
                .catch(() => ({}));

        if (!response.ok) {
            throw new Error(
                data.error ||
                "Unable to get an AI response."
            );
        }

        showAIResponse(
            data.answer
        );

    } catch (error) {

        console.error(
            "AI QUESTION ERROR:",
            error
        );

        showAIResponse(
            error.message.includes("GROQ_API_KEY") || error.message.includes("OPENAI_API_KEY")
                ? "Groq is not configured yet. Add your API key to the server's .env file."
                : "I could not reach the AI server right now. Please check that you started the app with npm start and try again."
        );

    } finally {

        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML =
                submitButton.dataset.originalText ||
                "<span>Ask AI</span><span aria-hidden='true'>→</span>";
        }

    }

}

if (aiQuestionInput && aiQuestionCount) {

    aiQuestionInput.addEventListener(
        "input",
        () => {
            aiQuestionCount.textContent =
                `${aiQuestionInput.value.length}/500`;
        }
    );

}

if (aiQuestionForm) {

    aiQuestionForm.addEventListener(
        "submit",
        event => {

            event.preventDefault();

            const question =
                aiQuestionInput?.value
                    .trim();

            if (!question) return;

            showUserQuestion(question);
            answerCustomQuestion(question);

            aiQuestionForm.reset();

            if (aiQuestionCount) {
                aiQuestionCount.textContent =
                    "0/500";
            }

        }
    );

}


/* ==========================================
   DARK MODE
========================================== */

const themeBtn =
    document.getElementById(
        "themeBtn"
    );

if (themeBtn) {

    themeBtn.addEventListener(
        "click",
        () => {

            document.body.classList.toggle(
                "dark"
            );

            const dark =
                document.body.classList.contains(
                    "dark"
                );

            localStorage.setItem(
                "financeDarkMode",
                dark
            );

            themeBtn.textContent =
                dark
                    ? "☀️"
                    : "🌙";

        }
    );

}

if (
    localStorage.getItem(
        "financeDarkMode"
    ) === "true"
) {

    document.body.classList.add(
        "dark"
    );

    if (themeBtn) {

        themeBtn.textContent =
            "☀️";

    }

}


/* ==========================================
   CLEAR DATA
========================================== */

const clearDataBtn =
    document.getElementById(
        "clearDataBtn"
    );

if (clearDataBtn) {

    clearDataBtn.addEventListener(
        "click",
        async () => {

            const confirmed =
                confirm(
                    "Are you sure you want to delete all finance data?"
                );

            if (!confirmed) return;

            financeData = {

                income: 0,
                budget: 0,
                goal: 0

            };

            expenses = [];

            if (currentUser) {

                await updateDoc(
                    userRef(),
                    {

                        finance:
                            financeData,

                        expenses:
                            []

                    }
                );

            }

            updateDashboard();
            renderUpiSettings();
            renderPayments();

            showToast(
                "All data cleared",
                "🗑️"
            );

        }
    );

}


/* ==========================================
   TOAST
========================================== */

let toastTimer;

function showToast(
    message,
    icon = "✓"
) {

    const toastIcon =
        document.getElementById(
            "toastIcon"
        );

    if (toastIcon) {

        toastIcon.textContent =
            icon;

    }

    if (toastText) {

        toastText.textContent =
            message;

    }

    if (toast) {

        toast.classList.add(
            "show"
        );

        clearTimeout(
            toastTimer
        );

        toastTimer =
            setTimeout(
                () => {

                    toast.classList.remove(
                        "show"
                    );

                },
                2500
            );

    }

}


/* ==========================================
   DATE FORMAT
========================================== */

function formatDate(dateString) {

    if (!dateString) return "-";

    const date =
        new Date(
            dateString +
            "T00:00:00"
        );

    return date.toLocaleDateString(
        "en-IN",
        {

            day: "numeric",
            month: "short",
            year: "numeric"

        }
    );

}


/* ==========================================
   ESCAPE HTML
========================================== */

function escapeHTML(value) {

    return String(value)
        .replaceAll(
            "&",
            "&amp;"
        )
        .replaceAll(
            "<",
            "&lt;"
        )
        .replaceAll(
            ">",
            "&gt;"
        )
        .replaceAll(
            '"',
            "&quot;"
        )
        .replaceAll(
            "'",
            "&#039;"
        );

}


/* ==========================================
   AUTH LOADING
========================================== */

function setAuthLoading(
    button,
    loading,
    text
) {

    if (!button) return;

    if (loading) {

        if (!button.dataset.originalHtml) {
            button.dataset.originalHtml = button.innerHTML;
        }

        button.innerHTML = text;

        button.classList.add(
            "loading"
        );

        button.disabled =
            true;

    } else {

        if (button.dataset.originalHtml) {
            button.innerHTML = button.dataset.originalHtml;
            delete button.dataset.originalHtml;
        } else if (text) {
            button.innerHTML = text;
        }

        button.classList.remove(
            "loading"
        );

        button.disabled =
            false;

    }

}


/* ==========================================
   PASSWORD TOGGLE
========================================== */

if (togglePassword) {

    togglePassword.addEventListener(
        "click",
        () => {

            if (
                loginPassword.type ===
                "password"
            ) {

                loginPassword.type =
                    "text";

                togglePassword.textContent =
                    "🙈";

            } else {

                loginPassword.type =
                    "password";

                togglePassword.textContent =
                    "👁️";

            }

        }
    );

}


/* ==========================================
   EMAIL LOGIN
========================================== */

if (loginForm) {

    loginForm.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            const email =
                loginEmail
                    ?.value
                    .trim()
                    .toLowerCase();

            const password =
                loginPassword
                    ?.value;

            if (!email || !password) {

                showToast(
                    "Enter email and password",
                    "⚠️"
                );

                return;

            }

            if (rememberMe && rememberMe.checked) {
                localStorage.setItem("finai_remember_email", email);
            } else {
                localStorage.removeItem("finai_remember_email");
            }

            setAuthLoading(
                loginForm.querySelector(
                    "button[type='submit']"
                ),
                true,
                "Signing in..."
            );

            try {

                await signInWithEmailAndPassword(
                    auth,
                    email,
                    password
                );

                showToast(
                    "Welcome back! 👋",
                    "✓"
                );

            } catch (error) {

                console.error(
                    "LOGIN ERROR:",
                    error
                );

                let message =
                    "Login failed.";

                if (
                    error.code ===
                    "auth/invalid-credential"
                ) {

                    message =
                        "Incorrect email or password.";

                } else if (
                    error.code ===
                    "auth/user-not-found"
                ) {

                    message =
                        "No account found.";

                } else if (
                    error.code ===
                    "auth/invalid-email"
                ) {

                    message =
                        "Please enter a valid email.";

                }

                showToast(
                    message,
                    "❌"
                );

            } finally {

                setAuthLoading(
                    loginForm.querySelector(
                        "button[type='submit']"
                    ),
                    false,
                    "Sign In"
                );

            }

        }
    );

}


/* ==========================================
   GOOGLE LOGIN
========================================== */

/* ── Handle Google Redirect Result (runs on page load after redirect) ── */
getRedirectResult(auth)
    .then(async result => {
        if (!result || !result.user) return;
        const user = result.user;
        await _ensureUserDoc(user);
        showToast("Google login successful! 🎉", "✓");
    })
    .catch(err => {
        if (err && err.code !== "auth/no-current-user") {
            console.error("REDIRECT RESULT ERROR:", err);
        }
    });

/** Ensure Firestore user doc exists for this user */
async function _ensureUserDoc(user) {
    const userDocRef = doc(db, "users", user.uid);
    const snap = await getDoc(userDocRef);
    if (!snap.exists()) {
        await setDoc(userDocRef, {
            name: user.displayName || "",
            email: user.email || "",
            finance: { income: 0, budget: 0, goal: 0 },
            expenses: []
        });
    }
}

if (googleLogin) {

    googleLogin.addEventListener("click", async () => {

        setAuthLoading(googleLogin, true, "Connecting...");

        try {
            // Try popup first (works when domain is authorized in Firebase Console)
            const result = await signInWithPopup(auth, googleProvider);
            await _ensureUserDoc(result.user);
            showToast("Google login successful! 🎉", "✓");

        } catch (error) {
            console.error("GOOGLE LOGIN ERROR:", error);

            const blockedCodes = [
                "auth/unauthorized-domain",
                "auth/operation-not-supported-in-this-environment",
                "auth/popup-blocked",
                "auth/cancelled-popup-request"
            ];

            if (error.code === "auth/popup-closed-by-user") {
                showToast("Google login cancelled", "⚠️");
                setAuthLoading(googleLogin, false, "Continue with Google");
                return;
            }

            if (blockedCodes.includes(error.code)) {
                // Domain not authorized or popup blocked → fallback to redirect
                showToast("Redirecting to Google login…", "🔄");
                try {
                    await signInWithRedirect(auth, googleProvider);
                    // Page will reload after redirect — getRedirectResult above handles it
                    return;
                } catch (redirectErr) {
                    console.error("REDIRECT ERROR:", redirectErr);
                    showToast(
                        "Google login failed. Please add 127.0.0.1 to Firebase Authorized Domains.",
                        "❌"
                    );
                }
            } else {
                showToast("Google login failed: " + (error.message || error.code), "❌");
            }

        } finally {
            setAuthLoading(googleLogin, false, "Continue with Google");
        }

    });

}


/* ==========================================
   FORGOT PASSWORD
========================================== */

const forgotModal =
    document.getElementById(
        "forgotModal"
    );

const closeForgot =
    document.getElementById(
        "closeForgot"
    );

const backToLoginFromForgot =
    document.getElementById(
        "backToLoginFromForgot"
    );

const forgotForm =
    document.getElementById(
        "forgotForm"
    );

if (forgotPassword) {

    forgotPassword.addEventListener(
        "click",
        () => {

            forgotModal?.classList.add(
                "show"
            );

        }
    );

}

if (closeForgot) {

    closeForgot.addEventListener(
        "click",
        () => {

            forgotModal?.classList.remove(
                "show"
            );

        }
    );

}

if (backToLoginFromForgot) {

    backToLoginFromForgot.addEventListener(
        "click",
        () => {

            forgotModal?.classList.remove(
                "show"
            );

        }
    );

}

if (forgotModal) {

    forgotModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                forgotModal
            ) {

                forgotModal.classList.remove(
                    "show"
                );

            }

        }
    );

}


/* ==========================================
   RESET PASSWORD
========================================== */

if (forgotForm) {

    forgotForm.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            const email =
                document
                    .getElementById(
                        "forgotEmail"
                    )
                    ?.value
                    .trim()
                    .toLowerCase();

            if (!email) {

                showToast(
                    "Enter your email",
                    "⚠️"
                );

                return;

            }

            try {

                await sendPasswordResetEmail(
                    auth,
                    email
                );

                showToast(
                    "Password reset email sent 📩",
                    "✓"
                );

                forgotForm.reset();

                forgotModal?.classList.remove(
                    "show"
                );

            } catch (error) {

                console.error(
                    "PASSWORD RESET ERROR:",
                    error
                );

                let message =
                    "Unable to send reset email.";

                if (
                    error.code ===
                    "auth/user-not-found"
                ) {

                    message =
                        "No account found with this email.";

                }

                showToast(
                    message,
                    "❌"
                );

            }

        }
    );

}


/* ==========================================
   SIGNUP
========================================== */

const signupModal =
    document.getElementById(
        "signupModal"
    );

const closeSignup =
    document.getElementById(
        "closeSignup"
    );

const backToLoginFromSignup =
    document.getElementById(
        "backToLoginFromSignup"
    );

const signupForm =
    document.getElementById(
        "signupForm"
    );

if (createAccount) {

    createAccount.addEventListener(
        "click",
        () => {

            signupModal?.classList.add(
                "show"
            );

        }
    );

}

if (closeSignup) {

    closeSignup.addEventListener(
        "click",
        () => {

            signupModal?.classList.remove(
                "show"
            );

        }
    );

}

if (backToLoginFromSignup) {

    backToLoginFromSignup.addEventListener(
        "click",
        () => {

            signupModal?.classList.remove(
                "show"
            );

        }
    );

}

if (signupModal) {

    signupModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                signupModal
            ) {

                signupModal.classList.remove(
                    "show"
                );

            }

        }
    );

}


/* ==========================================
   CREATE ACCOUNT
========================================== */

if (signupForm) {

    signupForm.addEventListener(
        "submit",
        async event => {

            event.preventDefault();

            const name =
                document
                    .getElementById(
                        "signupName"
                    )
                    ?.value
                    .trim();

            const email =
                document
                    .getElementById(
                        "signupEmail"
                    )
                    ?.value
                    .trim()
                    .toLowerCase();

            const password =
                document
                    .getElementById(
                        "signupPassword"
                    )
                    ?.value;

            const confirmPassword =
                document
                    .getElementById(
                        "signupConfirmPassword"
                    )
                    ?.value;

            if (
                !name ||
                !email ||
                !password ||
                !confirmPassword
            ) {

                showToast(
                    "Please fill all fields",
                    "⚠️"
                );

                return;

            }

            if (
                password.length < 6
            ) {

                showToast(
                    "Password must contain at least 6 characters",
                    "⚠️"
                );

                return;

            }

            if (
                password !==
                confirmPassword
            ) {

                showToast(
                    "Passwords do not match",
                    "❌"
                );

                return;

            }

            const submitBtn =
                signupForm.querySelector(
                    "button[type='submit']"
                );

            setAuthLoading(
                submitBtn,
                true,
                "Creating account..."
            );

            try {

                const result =
                    await createUserWithEmailAndPassword(
                        auth,
                        email,
                        password
                    );

                const user =
                    result.user;

                await updateProfile(
                    user,
                    {
                        displayName:
                            name
                    }
                );

                await setDoc(
                    doc(
                        db,
                        "users",
                        user.uid
                    ),
                    {

                        name,

                        email,

                        finance: {

                            income: 0,
                            budget: 0,
                            goal: 0

                        },

                        expenses: []

                    }
                );

                signupForm.reset();

                signupModal?.classList.remove(
                    "show"
                );

                showToast(
                    "Account created successfully! 🎉",
                    "✓"
                );

            } catch (error) {

                console.error(
                    "SIGNUP ERROR:",
                    error
                );

                let message =
                    "Account creation failed.";

                if (
                    error.code ===
                    "auth/email-already-in-use"
                ) {

                    message =
                        "This email is already registered.";

                } else if (
                    error.code ===
                    "auth/invalid-email"
                ) {

                    message =
                        "Invalid email address.";

                } else if (
                    error.code ===
                    "auth/weak-password"
                ) {

                    message =
                        "Password is too weak.";

                }

                showToast(
                    message,
                    "❌"
                );

            } finally {

                setAuthLoading(
                    submitBtn,
                    false,
                    "Create Account"
                );

            }

        }
    );

}


/* ==========================================
   LOGOUT
========================================== */

const logoutBtn =
    document.getElementById(
        "logoutBtn"
    );

if (logoutBtn) {

    logoutBtn.addEventListener(
        "click",
        async () => {

            const confirmed =
                confirm(
                    "Are you sure you want to logout?"
                );

            if (!confirmed) return;

            try {

                await signOut(
                    auth
                );

                expenses = [];

                financeData = {

                    income: 0,
                    budget: 0,
                    goal: 0

                };

                showToast(
                    "Logged out successfully 👋",
                    "✓"
                );

            } catch (error) {

                console.error(
                    "LOGOUT ERROR:",
                    error
                );

                showToast(
                    "Logout failed",
                    "❌"
                );

            }

        }
    );

}


/* ==========================================
   SHOW / HIDE LOGIN
========================================== */

function hideLogin() {

    if (!loginPage) return;

    loginPage.style.opacity =
        "0";

    loginPage.style.pointerEvents =
        "none";

    setTimeout(
        () => {

            loginPage.style.display =
                "none";

        },
        300
    );

}


function showLogin() {

    if (!loginPage) return;

    loginPage.style.display =
        "flex";

    setTimeout(
        () => {

            loginPage.style.opacity =
                "1";

            loginPage.style.pointerEvents =
                "auto";

        },
        10
    );

}


/* ==========================================
   FIREBASE AUTH STATE
========================================== */

onAuthStateChanged(
    auth,
    async user => {

        if (user) {

            currentUser =
                user;

            hideLogin();

            await loadUserData();

        } else {

            currentUser =
                null;

            expenses = [];

            financeData = {

                income: 0,
                budget: 0,
                goal: 0

            };

            showLogin();

        }

    }
);


/* ==========================================
   INITIAL UI
========================================== */

updateDashboard();
