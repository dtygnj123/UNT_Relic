# UofNoTears(offline)

This is a group project built by David Zhao, Owen Hua, and Pu (Sean) Xiao.
The Website is now offline after the course(cscc09) is over. This is just the code we worked with.
Will be taken down if any contributors involved require.

# Looks and Feel
The html/css pages that gives a peek of what the website pages looks like.

# Project Description: 

A free and open-source, AI-assisted repository aiming to improve the study experience of UofT students across all three campuses. The system has features such as explanations, study tips, notes and an online study room with an AI tutor. Students and instructors can post their own notes, explanations, or interpretations of the subject. The online study room has a maximum capacity of 6 students. Students can chat, discuss a resource in the repository, ask the AI tutor questions or perform many other activities to improve their learning experience.

# AI assistant:

In this project, AI is designed as an internal assistant rather than a conversational chatbot. It works behind the scenes to classify shared notes and questions, generate labels and summaries, and produce content that helps users quickly find key information, choose interesting items, and access learning resources.

# AI design concept:

Add a rating system and a "question solved" tag to the share notes interface. When the question author marks a question as solved, AI automatically generates a summary-style answer base on the replies, providing a fast reference for future viewers.
After a note is posted, AI automatically tags it with the relevant knowledge point, extracts key information, and creates a preview card so readers can quickly decide whether to open the full note.
AI generates multiple sets of practice questions for solved content: a basic version that mostly changes numbers, an intermediate version that changes the problem type, and an advanced thinking version with higher difficulty. All questions are related to the same knowledge point. After studying the content, users can open the questions, answer them, and receive AI-generated explanations. (Need use Stripe to pay to use this function)
AI also categorizes content by course code, and each subject includes a "generate cheat sheet" button. The cheat sheet is generated using note ratings and AI importance estimates, and can be customized for specific weak knowledge points chosen by the user.
AI study room where students can ask (text-to-text or voice-to-voice)questions and receive answers from AI. The AI will provide explanations, hints, and guidance to help students understand the material better. (optional)
Capabilities:

# Authentication: 
Firebase Authentication, Google OAuth (David)
Look and Feel: Add design later (David)
Real-time enablement:Socket.io for real time connections between server and client.(Owen)
Database: Design and Create Data Structures (David, Owen, Sean)
Stripe Integration: Stripe API for payment processing and subscription management. (Owen)
AI Intergration with MCP/Tools: note tagging, summary generation, realtive question generation, and course-based cheat sheet generation. (Sean)
Deployment: uofnotears.app
Architecture: Everyone needs to know, no specific answer (Both)

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
