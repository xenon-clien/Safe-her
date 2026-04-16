const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = "AIzaSyClZFyLy0YPhwHvOTZN7UZeomajAeHLcJQ";
const genAI = new GoogleGenerativeAI(apiKey);

async function listModels() {
    console.log("Listing available models...");
    try {
        // There isn't a direct listModels in the high-level SDK sometimes,
        // but we can try to fetch the list via the lower level if needed.
        // For now, let's just try 3 likely model names:
        const models = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-pro"];
        for (const m of models) {
            try {
                const model = genAI.getGenerativeModel({ model: m });
                const result = await model.generateContent("hi");
                console.log(`✅ Model '${m}' is WORKING!`);
            } catch (e) {
                console.log(`❌ Model '${m}' FAILED: ${e.message}`);
            }
        }
    } catch (e) {
        console.error("Critical Failure:", e.message);
    }
}

listModels();
