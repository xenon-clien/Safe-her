const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = "AIzaSyClZFyLy0YPhwHvOTZN7UZeomajAeHLcJQ";
const genAI = new GoogleGenerativeAI(apiKey);

async function testGemini() {
    console.log("Testing Gemini API with model: gemini-1.5-flash...");
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent("Hello, how are you?");
        console.log("✅ SUCCESS:", result.response.text());
    } catch (e) {
        console.error("❌ FAILURE:", e.message);
        console.log("Full Error Object:", e);
    }
}

testGemini();
