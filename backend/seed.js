const mongoose = require('mongoose');
const User = require('./models/User');
const EmergencyContact = require('./models/EmergencyContact');
const Alert = require('./models/Alert');

mongoose.connect('mongodb://127.0.0.1:27017/hersafety')
    .then(async () => {
        console.log('✅ Connected to MongoDB for Seeding');
        
        // Clear Existing Data to prevent duplicates
        await User.deleteMany({});
        await EmergencyContact.deleteMany({});
        await Alert.deleteMany({});

        // 1. Seed Fake User
        const demoUser = new User({
            name: "Jane Doe",
            email: "jane@test.com",
            password: "password123", // Will be hashed via pre-save hook
            phone: "+15551234567"
        });
        await demoUser.save();
        console.log('✅ Demo user seeded');

        // 2. Seed Fake Contacts
        const contactsToInsert = [
            { userId: demoUser._id, contactName: "Mom", contactPhone: "987-654-3210" },
            { userId: demoUser._id, contactName: "Best Friend", contactPhone: "111-222-3333" }
        ];
        await EmergencyContact.insertMany(contactsToInsert);
        console.log('✅ Emergency contacts seeded');

        // 3. Seed Fake Alerts
        const fakeAlerts = [
            {
                userId: demoUser._id,
                location: { latitude: 28.6139, longitude: 77.2090 },
                message: "Test SOS alert sent from UI",
                status: "sent"
            }
        ];
        await Alert.insertMany(fakeAlerts);
        console.log('✅ Mock alerts seeded');

        console.log('🎉 Seeding Complete! Exiting...');
        process.exit();
    })
    .catch(err => {
        console.error('Seeding failed', err);
        process.exit(1);
    });
