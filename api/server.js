const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Razorpay = require('razorpay');

// Import Models
const User = require('./models/User');
const EmergencyContact = require('./models/EmergencyContact');
const Alert = require('./models/Alert');

const app = express();

// Initialize Razorpay Instance using Environment Variables
const razorpay = new Razorpay({
    key_id: process.env.RZP_KEY_ID || 'rzp_test_default',
    key_secret: process.env.RZP_KEY_SECRET || 'secret_default'
});

// Middleware
app.use(express.json());
app.use(cors());
// For Vercel, static files are usually served from the root/public by the platform,
// but we keep this for local testing as a fallback.
app.use(express.static('public')); 

// MongoDB Connection using Environment Variable
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/hersafety';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB Atlas/Local'))
    .catch(err => console.error('❌ Failed to connect to MongoDB', err));

// =======================
// REST APIs
// =======================

// 1. Register User
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ message: "User with this email already exists" });
        }
        const newUser = new User({ name, email, password, phone });
        await newUser.save();
        res.status(201).json({ message: "User registered successfully", userId: newUser._id });
    } catch (error) {
        console.error("Register Error:", error);
        res.status(500).json({ message: "Error registering user: " + error.message });
    }
});

// 2. Login User
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        res.status(200).json({
            message: "Login successful",
            user: { id: user._id, name: user.name, email: user.email, phone: user.phone }
        });
    } catch (error) {
        res.status(500).json({ message: "Error logging in", error: error.message });
    }
});

// 3. Add Emergency Contact
app.post('/api/add-contact', async (req, res) => {
    try {
        const { userId, contactName, contactPhone } = req.body;
        const contact = new EmergencyContact({ userId, contactName, contactPhone });
        await contact.save();
        res.status(201).json({ message: "Emergency contact added", contact });
    } catch (error) {
        res.status(500).json({ message: "Error adding contact", error: error.message });
    }
});

// 4. Send SOS Alert
app.post('/api/send-alert', async (req, res) => {
    try {
        const { userId, location, message } = req.body;
        const alert = new Alert({
            userId,
            location: {
                latitude: location.latitude,
                longitude: location.longitude
            },
            message: message || "Emergency SOS triggered!",
            status: "sent"
        });
        await alert.save();
        simulateMultiChannelAlert(userId, "SOS");
        res.status(201).json({ message: "Alert sent successfully", alertId: alert._id });
    } catch (error) {
        res.status(500).json({ message: "Error sending alert", error: error.message });
    }
});

// 5. Razorpay Create Order API
app.post('/api/create-order', async (req, res) => {
    try {
        const { amount, currency } = req.body;
        const options = {
            amount: amount * 100, 
            currency: currency || "INR",
            receipt: `receipt_${Date.now()}`
        };
        const order = await razorpay.orders.create(options);
        res.status(200).json(order);
    } catch (error) {
        console.error("Order Creation Error RAW:", JSON.stringify(error, null, 2));
        res.status(500).json({ message: "Razorpay Error", error: error.message });
    }
});

// 6. Professional Security Logs & Evidence Sync (Mock)
app.post('/api/sync-evidence', async (req, res) => {
    try {
        const { userId, type, metadata } = req.body;
        simulateMultiChannelAlert(userId, type);
        res.status(201).json({ 
            message: "Evidence synced to secure cloud bucket", 
            timestamp: new Date().toISOString(),
            status: "Encrypted & Secured"
        });
    } catch (error) {
        res.status(500).json({ message: "Cloud sync failed", error: error.message });
    }
});

// Helper: Multi-Channel Alert Simulator
function simulateMultiChannelAlert(userId, triggerType) {
    const trackingLink = `/track/${userId}`;
    console.log("\n--- EMERGENCY RELAY INITIATED ---");
    console.log(`[SMS] LIVE TRACKING LINK SENT -> ${trackingLink}`);
    console.log("--- ALL CHANNELS VERIFIED ---\n");
}

// 8. Serving tracking.html (For Vercel, this usually happens via rewrites but we keep the endpoint)
app.get('/track/:userId', (req, res) => {
    res.sendFile(process.cwd() + '/api/public/tracking.html');
});

// 9. Get Public User Status (Pollable)
app.get('/api/public/status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const latestAlert = await Alert.findOne({ userId }).sort({ createdAt: -1 });
        if (!latestAlert) return res.json({ status: 'offline' });
        const history = await Alert.find({ userId }).sort({ createdAt: -1 }).limit(5);

        res.json({
            status: 'online',
            location: latestAlert.location,
            message: latestAlert.message,
            updatedAt: latestAlert.createdAt,
            logs: history.map(a => ({
                type: 'SOS',
                message: a.message,
                time: new Date(a.createdAt).toLocaleTimeString(),
                status: 'error'
            }))
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// 7. Get Alert History
app.get('/api/alerts/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const alerts = await Alert.find({ userId }).sort({ createdAt: -1 });
        res.status(200).json({ message: "Alerts retrieved", count: alerts.length, alerts });
    } catch (error) {
        res.status(500).json({ message: "Error fetching alerts", error: error.message });
    }
});

// Start Server locally
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
        console.log(`🚀 Safety Server running on http://localhost:${PORT}`);
    });
}

// Export the Express app for Vercel
module.exports = app;
