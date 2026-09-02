import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase.js";
import "../styles/signup.css";
import { createUserWithEmailAndPassword, deleteUser } from "firebase/auth";
import API_URL from "../config";
import Topbar from "../components/Topbar";

export default function Signup() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    username: "",
    program: "",
    yearOfStudy: "",
  });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let firebaseUser = null;

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        formData.email,
        formData.password,
      );
      firebaseUser = userCredential.user;

      const response = await fetch(`${API_URL}/api/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: firebaseUser.uid,
          userName: formData.username,
          email: formData.email,
          program: formData.program || null,
          yearOfStudy: formData.yearOfStudy
            ? parseInt(formData.yearOfStudy, 10)
            : null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save user profile to database.");
      }

      console.log("Success! User authenticated and added to PostgreSQL.");
      navigate("/paywall");
    } catch (err) {
      console.error("Sign-up failed:", err);
      setError(err.message);

      // Rollback orphaned Auth user if Data Connect fails
      if (firebaseUser) {
        try {
          await deleteUser(firebaseUser);
        } catch (rollbackErr) {
          console.error("Rollback failed:", rollbackErr);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Topbar showBack={false} />

      <div className="signup-layout">
        <div className="form-container">
          <h2>Create Account</h2>

          {error && (
            <div style={{ color: "red", padding: "10px", textAlign: "center" }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSignUp}>
            <label>Email *</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
            />

            <label>Password *</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength="6"
            />

            <label>Username *</label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
            />

            <label>Program</label>
            <input
              type="text"
              name="program"
              placeholder="e.g., Computer Science"
              value={formData.program}
              onChange={handleChange}
            />

            <label>Year of Study</label>
            <input
              type="number"
              name="yearOfStudy"
              min="1"
              max="4"
              value={formData.yearOfStudy}
              onChange={handleChange}
            />

            <button type="submit" className="loginbutton" disabled={loading}>
              {loading ? "Loading..." : "Sign Up"}
            </button>
          </form>

          <button
            type="button"
            className="link-button"
            onClick={() => navigate("/Login")}
          >
            Already have an account? Login
          </button>
        </div>

        <div className="welcome-container">
          <h2>Welcome to UofNoTears</h2>
          <p>
            Join our community to make your study sessions easier with shared
            resources, interactive study rooms, and personalized AI support.
            <br />
            <br />
            Sign up today to access course materials and collaborate with your
            peers!
          </p>
        </div>
      </div>
    </>
  );
}
