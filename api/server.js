console.log("📁 Safe-Her Core Initializing...");
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const twilio = require('twilio');
const axios = require('axios');

// --- Configuration Loader ---
require('dotenv').config({ path: path.join(__dirname, '.env') }); // Load api dir .env
const rootPath = path.join(__dirname, '..');
const envPath = path.join(rootPath, '.env');
require('dotenv').config({ path: envPath }); // Merge root .env

if (process.env.MONGODB_URI) {
    console.log("📁 [SYSTEM] Core configuration linked.");
    console.log("🛡️ [AUTH] Key Detect: " + (process.env.GOOGLE_CLIENT_ID ? "PRESENT ✅" : "MISSING ❌"));
    console.log("🚀 [GROQ] Key Detect: " + (process.env.GROQ_API_KEY ? "PRESENT ✅" : "MISSING ❌"));
    console.log("💳 [RAZORPAY] Key Detect: " + (process.env.RAZORPAY_KEY_ID ? "PRESENT ✅" : "MISSING ❌"));
}

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_SaxSkQwrcuFvNW',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '1OcdkE2rgXG42B3sXPPnQbQ8'
});

const app = express();
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

// --- PAYMENT API ---
app.post('/api/create-order', async (req, res) => {
    try {
        const { amount } = req.body;
        const options = {
            amount: amount * 100, // amount in paisa
            currency: "INR",
            receipt: `receipt_${Date.now()}`
        };
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/verify-payment', async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '1OcdkE2rgXG42B3sXPPnQbQ8')
        .update(body.toString())
        .digest('hex');

    if (expectedSignature === razorpay_signature) {
        res.json({ status: "success" });
    } else {
        res.status(400).json({ status: "failure" });
    }
});

// --- CORE API ROUTES ---
app.get('/api/health', (req, res) => {
    res.json({ 
        version: '16.5-STABLE', 
        status: 'online', 
        database: mongoose.connection.readyState === 1 ? 'stable' : 'linking',
        g_client_id: process.env.GOOGLE_CLIENT_ID || "349561521670-d2rns2cnoed3pm3vnsh5k4k3891m1vor.apps.googleusercontent.com",
        rzp_key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_SaxSkQwrcuFvNW'
    });
});

app.post('/api/google-login-verify', async (req, res) => {
    const { token, origin } = req.body;
    const client_id = process.env.GOOGLE_CLIENT_ID || "349561521670-d2rns2cnoed3pm3vnsh5k4k3891m1vor.apps.googleusercontent.com";
    const client = new OAuth2Client(client_id);

    try {
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: client_id,
        });
        const payload = ticket.getPayload();
        
        // Upsert User in DB
        let user = await User.findOne({ email: payload.email });
        if (!user) {
            user = new User({
                name: payload.name,
                email: payload.email,
                emergencyContacts: []
            });
            await user.save();
        }

        res.json({ success: true, user: { id: user._id, name: user.name, email: user.email } });
    } catch (e) {
        console.error("❌ Auth Verify Error:", e.message);
        res.status(401).json({ success: false, message: "Invalid Token" });
    }
});

app.get('/api/danger-zones', async (req, res) => {
    try {
        const zones = await mongoose.model('DangerZone').find({}).limit(50);
        res.json(zones || []);
    } catch (e) { res.status(500).json([]); }
});

app.get('/api/safety-score', async (req, res) => {
    try {
        let score = 8.5;
        const hour = new Date().getHours();
        if (hour > 20 || hour < 5) score -= 1.8;
        res.json({ score, label: score > 7 ? "SECURE" : "CAUTION" });
    } catch (e) { res.status(500).json({ score: 0, label: "OFFLINE" }); }
});

app.post(['/api/chat', '/chat'], async (req, res) => {
    try {
        const { message } = req.body;
        const groqKey = (process.env.GROQ_API_KEY || "").trim();
        const openRouterKey = (process.env.OPENROUTER_API_KEY || "").trim();

        let aiResponse;

        // --- ATTEMPT 1: GROQ (Primary choice per user) ---
        if (groqKey) {
            try {
                console.log("📡 [GROQ] Attempting handshake with model: llama-3.1-8b-instant");
                const response = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
                    model: "llama-3.1-8b-instant",
                    messages: [
                        { role: "system", content: "SYSTEM: You are 'ALEXA SAFE', the AI protector for Safe-Her. Provide tactical, calm safety advice." },
                        { role: "user", content: message }
                    ]
                }, {
                    headers: { 'Authorization': `Bearer ${groqKey}` },
                    timeout: 8000
                });
                aiResponse = response.data.choices[0].message.content;
                console.log("✅ [GROQ] Response Successful.");
            } catch (e) { 
                console.error("🚀 [GROQ ERROR]:", e.response ? e.response.data : e.message); 
                console.warn("🛡️ Switching to OpenRouter Fallback...");
            }
        }

        // --- ATTEMPT 2: OPENROUTER ---
        if (!aiResponse && openRouterKey) {
            try {
                const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                    model: "meta-llama/llama-3.1-8b-instruct:free",
                    messages: [{ role: "user", content: message }]
                }, {
                    headers: { 'Authorization': `Bearer ${openRouterKey}`, 'X-Title': 'Safe-Her AI' },
                    timeout: 10000
                });
                aiResponse = response.data.choices[0].message.content;
            } catch (e) { 
                console.error("❌ [OPENROUTER ERROR]:", e.message); 
            }
        }

        if (!aiResponse) {
            const errorMsg = (!groqKey) ? "GROQ_API_KEY is missing in .env" : "AI Satellite Lost (Check API Key Validity)";
            throw new Error(errorMsg);
        }

        res.json({ reply: aiResponse });
    } catch (e) {
        console.error("❌ Oracle Error:", e.message);
        res.status(500).json({ reply: `Assistant is recalibrating (${e.message}). Stay in the light.` });
    }
});

app.get('/api/get-contacts/:id', async (req, res) => {
    try {
        if (req.params.id === 'guest') return res.json([]);
        const user = await mongoose.model('User').findById(req.params.id);
        res.json(user ? user.emergencyContacts : []);
    } catch (e) { res.json([]); }
});

// Serving logic
app.use(express.static(path.join(__dirname, '..')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

// --- DATABASE LINK ---
const connectDB = async () => {
    try {
        const dbUri = process.env.MONGODB_URI;
        if (!dbUri) throw new Error("No MongoDB URI");
        await mongoose.connect(dbUri, { serverSelectionTimeoutMS: 30000 });
        console.log("✅ [DATABASE] High-Speed Cloud Link Stable.");
    } catch (e) {
        console.error("❌ [DATABASE] Connection failed. Retrying in 5s...");
        setTimeout(connectDB, 5000);
    }
};
connectDB();

// Models Registry
const userSchema = new mongoose.Schema({ name: String, email: { type: String, unique: true }, password: { type: String }, emergencyContacts: [] });
const User = mongoose.models.User || mongoose.model('User', userSchema);

const dangerSchema = new mongoose.Schema({ name: String, lat: Number, lng: Number, risk: String });
const DangerZone = mongoose.models.DangerZone || mongoose.model('DangerZone', dangerSchema);

let PORT = process.env.PORT || 5000;
function startServer(p) {
    app.listen(p, () => {
        console.log(`🚀 [SAFE-HER ONLINE] Serving Dashboard on Port ${p}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️ Port ${p} is busy. Trying ${p + 1}...`);
            startServer(p + 1);
        } else {
            console.error(`❌ [ERROR] Server failure:`, err.message);
        }
    });
}
startServer(PORT);

module.exports = app;
