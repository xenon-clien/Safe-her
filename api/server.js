console.log("📁 Safe-Her Core Initializing...");
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
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
        database: mongoose.connection.readyState === 1 ? 'connected' : 'linking',
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

// --- TWILIO RED-ALERT LOGIC ---
const twilioClient = (process.env.TWILIO_SID && process.env.TWILIO_SID !== 'your_twilio_sid_here') 
    ? require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN) 
    : null;

// Nodemailer transporter for fallback email alerts (use Gmail or any SMTP)
const emailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 465,
    secure: true,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

app.post('/api/sos-trigger', async (req, res) => {
    try {
        const { userId, lat, lng } = req.body;
        console.log(`🚨 SOS SIGNAL RECEIVED FROM USER: ${userId} at ${lat}, ${lng}`);

        let user;
        if (userId === 'guest') {
            user = { name: "Guest User", emergencyContacts: [] };
        } else {
            user = await User.findById(userId);
        }

        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const contacts = user.emergencyContacts || [];
        const googleMapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
        const messageBody = `🚨 EMERGENCY ALERT from Safe-Her: ${user.name} is in danger! Live Location: ${googleMapsLink}`;

        console.log(`💬 Plan: Sending alerts to ${contacts.length} contacts.`);

        const results = [];
        // If no contacts, we still return success but notify in result
        if (contacts.length === 0) {
            console.warn("⚠️ No emergency contacts found for this user.");
        }

        for (const contact of contacts) {
            const phone = contact.phone || contact.number;
            // Log contact details for debugging
            console.log(`🔎 Contact: ${contact.name}, phone: ${phone}, whatsapp: ${contact.whatsapp || 'none'}`);
            if (!phone) continue;

            if (twilioClient) {
                // Send SMS (existing behavior)
                try {
                    const sms = await twilioClient.messages.create({
                        body: messageBody,
                        from: process.env.TWILIO_PHONE,
                        to: phone
                    });
                    results.push({ phone, sid: sms.sid });
                    console.log(`✅ SMS Sent to ${phone}`);
                } catch (err) {
                    console.error(`❌ Twilio SMS Error for ${phone}:`, err.message);
                    results.push({ phone, error: err.message });
                }
                // Optional WhatsApp send if contact has a WhatsApp number
                if (contact.whatsapp) {
                    try {
                        const waMsg = await twilioClient.messages.create({
                            body: messageBody,
                            from: process.env.WHATSAPP_FROM,
                            to: `whatsapp:${contact.whatsapp}`
                        });
                        results.push({ whatsapp: contact.whatsapp, sid: waMsg.sid });
                        console.log(`✅ WhatsApp Sent to ${contact.whatsapp}`);
                    } catch (err) {
                        console.error(`❌ Twilio WhatsApp Error for ${contact.whatsapp}:`, err.message);
                        results.push({ whatsapp: contact.whatsapp, error: err.message });
                    }
                }
            } else {
                // Fallback: send email alert to contacts (if they have email)
                if (contact.email) {
                    const mailOptions = {
                        from: process.env.SMTP_USER,
                        to: contact.email,
                        subject: '🚨 Emergency Alert from Safe-Her',
                        text: `${messageBody}`
                    };
                    try {
                        await emailTransporter.sendMail(mailOptions);
                        console.log(`✅ Email sent to ${contact.email}`);
                        results.push({ email: contact.email, status: 'sent' });
                    } catch (e) {
                        console.error(`❌ Email error for ${contact.email}:`, e.message);
                        results.push({ email: contact.email, status: 'error', error: e.message });
                    }
                } else {
                    console.warn(`🧪 [SIMULATION MODE] No email for contact, Msg: ${messageBody}`);
                    results.push({ phone, sid: 'sim_sid_' + Math.random() });
                }
            }
        }

        res.json({
            success: true,
            alertsSent: results.length,
            details: results,
            address: `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`
        });

    } catch (e) {
        console.error("❌ SOS Processing Error:", e);
        res.status(500).json({ success: false, message: e.message });
    }
});

app.post('/api/add-contact', async (req, res) => {
    try {
        const { userId, contactName, contactPhone } = req.body;
        if (userId === 'guest') return res.json({ success: true, contact: { _id: Date.now(), name: contactName, phone: contactPhone } });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        
        const newContact = { name: contactName, phone: contactPhone, _id: new mongoose.Types.ObjectId() };
        user.emergencyContacts.push(newContact);
        await user.save();
        
        res.json({ success: true, contact: newContact });
    } catch (e) {
        console.error("❌ Add Contact Error:", e.message);
        res.status(500).json({ success: false });
    }
});

app.post('/api/delete-contact', async (req, res) => {
    try {
        const { userId, contactId } = req.body;
        if (userId === 'guest') return res.json({ success: true });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false });

        user.emergencyContacts = user.emergencyContacts.filter(c => 
            (c._id && c._id.toString() !== contactId) && (c.id !== contactId)
        );
        await user.save();
        
        res.json({ success: true });
    } catch (e) {
        console.error("❌ Delete Contact Error:", e.message);
        res.status(500).json({ success: false });
    }
});

app.post('/api/save-contacts', async (req, res) => {
    try {
        const { userId, contacts } = req.body;
        if (userId === 'guest') return res.json({ success: true, message: "Guest mode: Not saved to DB" });
        
        const user = await User.findByIdAndUpdate(userId, { emergencyContacts: contacts }, { new: true });
        res.json({ success: true, contacts: user.emergencyContacts });
    } catch (e) {
        console.error("❌ Save Contacts Error:", e.message);
        res.status(500).json({ success: false });
    }
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
const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: { type: String },
    emergencyContacts: [{ name: String, phone: String, whatsapp: String, email: String }]
});
const User = mongoose.models.User || mongoose.model('User', userSchema);

const dangerSchema = new mongoose.Schema({ name: String, lat: Number, lng: Number, risk: String });
const DangerZone = mongoose.models.DangerZone || mongoose.model('DangerZone', dangerSchema);

// --- SERVER INITIALIZATION ---
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    let PORT = process.env.PORT || 5000;
    function startServer(p) {
        app.listen(p, () => {
            console.log(`🚀 [LOCAL READY] Serving API on Port ${p}`);
        }).on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                startServer(p + 1);
            }
        });
    }
    startServer(PORT);
}

module.exports = app;
