import express from "express";
import cors from "cors";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Health check
app.get("/", (req, res) => {
  res.json({ message: "✅ PDF Chatbot API is running with Gemini!" });
});

// Chat route
app.post("/api/chat", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ error: "Question is required" });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API key not configured in environment" });
    }

    //  Define preferred and fallback model names
    const modelPriority = ["gemini-2.0-flash", "gemini-2.0-pro", "gemini-1.5-flash"];
    let aiResponse = null;
    let selectedModel = null;

    //  Try each model until one works
    for (const modelName of modelPriority) {
      try {
        console.log(`🔍 Trying model: ${modelName}`);

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const payload = {
          contents: [
            {
              parts: [{ text: question }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
        };

        const response = await axios.post(url, payload, {
          headers: { "Content-Type": "application/json" },
          timeout: 30000,
        });

        const text =
          response.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
          response.data?.candidates?.[0]?.output ||
          null;

        if (text) {
          aiResponse = text;
          selectedModel = modelName;
          break; //  Stop if one works
        }
      } catch (err) {
        console.warn(` Model ${modelName} failed:`, err.response?.data?.error?.message || err.message);
      }
    }

    // If all models failed
    if (!aiResponse) {
      return res.status(500).json({
        error: "All Gemini models failed to respond",
        details: "Please verify your API key and model availability.",
      });
    }

    res.json({
      success: true,
      model: selectedModel,
      answer: aiResponse,
    });
  } catch (error) {
    console.error(" Gemini API Error:", error.response?.data || error.message);

    let errorMessage = "Failed to get response from AI";
    let statusCode = 500;

    if (error.response?.status === 400) {
      errorMessage = "Invalid request to AI service";
      statusCode = 400;
    } else if (error.response?.status === 401) {
      errorMessage = "Invalid API key";
      statusCode = 401;
    } else if (error.response?.status === 429) {
      errorMessage = "Rate limit exceeded. Please try again later.";
      statusCode = 429;
    } else if (error.code === "ECONNABORTED") {
      errorMessage = "Request timeout. Please try again.";
      statusCode = 408;
    }

    res.status(statusCode).json({
      error: errorMessage,
      details: error.response?.data?.error?.message || error.message,
    });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`🔗 API URL: http://localhost:${PORT}`);
});
