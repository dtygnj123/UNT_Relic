import express from "express";
import Stripe from "stripe";
import dotenv from "dotenv";
import { pool } from "../db.js";

let stripeClient = null;
function getStripe() {
  if (!stripeClient) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      throw new Error("STRIPE_SECRET_KEY is not set in environment");
    }
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

const router = express.Router();

router.post("/create-session", async (req, res) => {
  try {
    const { priceId, userId } = req.body;
    console.log("Request body:", req.body);

    console.log("priceId:", priceId);
    console.log("userId:", userId);

    if (!priceId || !userId) {
      return res.status(400).json({ error: "Missing priceId or userId" });
    }

    if (userId) {
      const userResult = await pool.query(
        `SELECT subscription_status FROM users WHERE user_id = $1`,
        [userId],
      );

      if (
        userResult.rows.length > 0 &&
        userResult.rows[0].subscription_status === "Active"
      ) {
        return res.status(400).json({ error: "You are already subscribed." });
      }
    }

    const stripe = getStripe();

    const baseClientUrl = (process.env.CLIENT_URL || "").replace(/\/$/, "");

    console.log("CLIENT_URL:", process.env.CLIENT_URL);
    console.log("baseClientUrl:", baseClientUrl);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription", // 'payment' is for one time
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId,
      },
      success_url: `${baseClientUrl}/dashboard?payment=success`,
      cancel_url: `${baseClientUrl}/paywall`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe Error:", err);
    res.status(500).json({ error: err.message });
  }
});

router.patch("/activate-subscription/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `UPDATE users
       SET subscription_status = 'Active'
       WHERE user_id = $1
       RETURNING *`,
      [userId],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error." });
  }
});

export default router;
