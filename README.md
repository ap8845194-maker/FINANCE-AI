# FinAI - Smart Student Finance AI

FinAI is an intelligent, student-centric financial management and budget tracking application with AI-powered advice, expense tracking, goal management, and secure UPI payment verification.

## 🚀 Features

- **Dashboard & Analytics**: Real-time balance, spending breakdown, monthly budgets, and interactive charts.
- **AI Financial Advisor**: Personalized financial tips and insights powered by Groq AI (`openai/gpt-oss-120b`).
- **Expense & Budget Tracking**: Add, categorize, filter, and monitor daily student expenses.
- **Savings Goals**: Set target goals and track progress towards financial milestones.
- **Firebase Sync**: Cloud authentication and real-time database sync for user data.
- **UPI Payment Verification**: Mock and automated UPI payment flow for premium features.
- **Responsive & Modern UI**: Sleek glassmorphism dark/light design optimized for all screen sizes.

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, Vanilla CSS3, JavaScript (ES6+), Chart.js
- **Backend**: Node.js, Express / Native HTTP Server
- **Database & Auth**: Firebase Authentication & Realtime Database / Firestore
- **AI Integration**: Groq Cloud API
- **Version Control**: Git & GitHub

---

## 📦 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/ap8845194-maker/finai-student-finance.git
cd finai-student-finance
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

Configure your `.env`:
- `GROQ_API_KEY`: Your Groq Cloud API key
- `FIREBASE_SERVICE_ACCOUNT_JSON`: Your Firebase Admin Service Account credentials

### 4. Run the Project
Start the backend server:
```bash
npm start
```
The server will run on `http://127.0.0.1:5500` (or your configured port).
Open `index.html` in your browser or serve it via Live Server.

---

## 🌐 Zero-Config GitHub Pages Support (100% Free for Visitors)

FinAI runs directly in any browser on GitHub Pages with **Zero Setup**:
- **Built-in FinAI Native Engine**: Visitors and customers do **NOT** need any API key or backend! FinAI analyzes live student income, category breakdowns (Food, Travel, Shopping, etc.), and savings rates right inside the browser.
- **Optional Developer Mode**: Developers who wish to plug in their own personal Groq Cloud API key or custom backend server (Render/Vercel) can optionally do so via the **⚙️ AI Setup** button.

---

## 🔒 Security
- `.env` and sensitive credentials are excluded via `.gitignore`.
- Backend endpoints proxy all AI and admin database requests to protect API keys.

---

## 📄 License
This project is open-source and available under the [MIT License](LICENSE).
