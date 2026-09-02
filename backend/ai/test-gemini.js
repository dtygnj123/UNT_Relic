import "dotenv/config";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL;

if (!apiKey) {
  console.error("FAIL: GEMINI_API_KEY is missing from backend/.env");
  process.exit(1);
}

if (!model) {
  console.error("FAIL: GEMINI_MODEL is missing from backend/.env");
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

const interaction = await ai.interactions.create({
  model: model,
  input: "Explain how AI works in a few words",
});
console.log(interaction.output_text);