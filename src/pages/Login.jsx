import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useNavigate } from "react-router-dom";
import "../styles/login.css";
import API_URL from "../config";
import Topbar from "../components/Topbar";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      console.log("Logged in successfully:", userCredential.user);

      const profileRes = await fetch(
        `${API_URL}/api/users/${userCredential.user.uid}`,
      );

      if (profileRes.ok) {
        const profile = await profileRes.json();
        navigate(
          profile.subscription_status === "Active" ? "/dashboard" : "/paywall",
        );
      } else {
        navigate("/paywall");
      }
    } catch (err) {
      setError("Incorrect email or password. Please try again.");
    }
  };

  const handleGoogleLogin = async () => {
    // setError("");
    // try {
    //   const provider = new GoogleAuthProvider();
    //   const result = await signInWithPopup(auth, provider);
    //   console.log("Google user:", result.user);
    //   // TODO
    //   // Used for actual user information
    //   // const name = result.user.displayName;
    //   navigate("/dashboard");
    // } catch (err) {
    //   setError("Failed to log in with Google. Please try again.");
    // }
    setError("");

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const googleUser = result.user;
      console.log("Google user:", googleUser);

      const profileResponse = await fetch(
        `${API_URL}/api/users/${googleUser.uid}`,
      );

      let subscriptionStatus = "inactive";

      if (profileResponse.status === 404) {
        const createResponse = await fetch(`${API_URL}/api/users`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            userId: googleUser.uid,
            userName: googleUser.displayName || googleUser.email?.split("@")[0],
            email: googleUser.email,
            program: "",
            yearOfStudy: null,
          }),
        });

        const createData = await createResponse.json();

        if (!createResponse.ok) {
          throw new Error(
            createData.error || "Failed to create Google user profile.",
          );
        }
      } else if (!profileResponse.ok) {
        const profileData = await profileResponse.json();

        throw new Error(
          profileData.error || "Failed to load Google user profile.",
        );
      } else {
        const profileData = await profileResponse.json();
        subscriptionStatus = profileData.subscription_status || "inactive";
      }

      navigate(
        subscriptionStatus === "Active" ? "/dashboard" : "/paywall",
      );
    } catch (err) {
      setError("Failed to log in with Google. Please try again.");
    }
  };

  return (
    <>
      <Topbar showBack={false} />

      <div className="form-container">
        <h2>Login to UofNoTears</h2>
        {error && <p style={{ color: "red" }}>{error}</p>}
        <form onSubmit={handleLogin}>
          <div>
            <label>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <button type="submit" className="loginbutton">
              Sign In
            </button>
          </div>
        </form>
        <button onClick={handleGoogleLogin} className="link-button">
          Continue with Google
        </button>
      </div>
    </>
  );
}
