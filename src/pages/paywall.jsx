import React, { useEffect, useState } from "react";
import "../styles/paywall.css";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase.js";
import { onAuthStateChanged } from "firebase/auth";
import API_URL from "../config";

export default function Paywall() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setCheckingStatus(false);
        return;
      }

      try {
        const response = await fetch(
          `${API_URL}/api/users/${firebaseUser.uid}`,
        );

        if (response.ok) {
          const data = await response.json();
          setSubscribed(data.subscription_status === "Active");
        }
      } catch {
        // silently fail — assume not subscribed
      } finally {
        setCheckingStatus(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const features = [
    {
      title: "Full AI Access",
      description:
        "Unlock all advanced AI support and remove daily limitations entirely.",
    },
    {
      title: "Most reliable Tutor",
      description:
        "Unlimited AI labelled notes, AI generated practices and cheat sheets",
    },
    {
      title: "Priority Cloud Support",
      description:
        "Get dedicated assistance with guaranteed response times under 2 hours.",
    },
  ];

  const handleCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      const firebaseUser = auth.currentUser;

      if (!firebaseUser) {
        setError("You must be logged in to subscribe.");
        setLoading(false);
        return;
      }

      const response = await fetch(
        `${API_URL}/api/checkout/create-session`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            priceId: "price_1Tnga1PBpS8VD652DUEjjSNb",
            userId: firebaseUser.uid,
          }),
        },
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to initiate payment session.");
      }

      const data = await response.json();
      if (data.url) {
        window.location.href = data.url;
        //navigate("/dashboard"); // Navigate to the dashboard page
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (checkingStatus) {
    return (
      <div className="paywall-container">
        <p className="page-message">Loading...</p>
      </div>
    );
  }

  if (subscribed) {
    return (
      <div className="paywall-container">
        <div className="paywall-card">
          <div className="paywall-glow" />

          <div className="paywall-header">
            <span className="paywall-badge">Premium Active</span>
            <h1 className="paywall-title">You're Already Subscribed!</h1>
            <p className="paywall-subtitle">
              You have full access to all premium features.
            </p>
          </div>

          <button
            className="paywall-btn"
            onClick={() => navigate("/dashboard")}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="paywall-container">
      <div className="paywall-card">
        <div className="paywall-glow" />

        <div className="paywall-header">
          <span className="paywall-badge">Premium Access</span>
          <h1 className="paywall-title">Unlock Full Potential</h1>
          <p className="paywall-subtitle">
            Join thousands of students sharing and learning together.
          </p>
        </div>

        <div className="paywall-features">
          {features.map((feature, index) => (
            <div key={index} className="feature-item">
              <div className="feature-icon">
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <div>
                <h3 className="feature-title">{feature.title}</h3>
                <p className="feature-desc">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="price-box">
          <div className="price-display">
            <span className="price-amount">$15</span>
            <span className="price-period">/ month</span>
          </div>
          <p className="price-note">Cancel anytime • No hidden fees</p>
        </div>

        {error && <div className="paywall-error">{error}</div>}

        <button
          onClick={handleCheckout}
          disabled={loading}
          className="paywall-btn"
        >
          {loading ? "Securing connection..." : "Upgrade to Premium"}
        </button>

        <p className="paywall-footer-text">
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          Secured by Stripe. Automatic billing updates.
        </p>
      </div>
    </div>
  );
}
