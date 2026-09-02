import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/profile.css";
import { auth } from "../lib/firebase.js";
import { updatePassword, signOut } from "firebase/auth";
import API_URL from "../config";
import Topbar from "../components/Topbar";

export default function Profile() {
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");
  const [error, setError] = useState("");
  const [portrait, setPortrait] = useState(null);
  const [portraitUrl, setPortraitUrl] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const currentUser = auth.currentUser;

        if (!currentUser) {
          setError("You must be logged in.");
          return;
        }

        const response = await fetch(`${API_URL}/api/users/${currentUser.uid}`);

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load profile.");
        }

        setUsername(data.user_name || "");
        setProgram(data.program || "");
        setYear(data.year_of_study ? String(data.year_of_study) : "");
        setPortraitUrl(data.portrait_url || "");
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to load profile.");
      }
    }

    loadProfile();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    const yearNum = Number(year);
    if (isNaN(yearNum) || yearNum < 1 || yearNum > 4) {
      setError("Year of study must be a number between 1 and 4.");
      return;
    }

    setError("");

    try {
      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError("You must be logged in.");
        return;
      }

      const response = await fetch(`${API_URL}/api/users/${currentUser.uid}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userName: username,
          program,
          yearOfStudy: yearNum,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to update profile.");
      }

      if (portrait) {
        const portraitData = new FormData();

        portraitData.append("portrait", portrait);

        const portraitResponse = await fetch(
          `${API_URL}/api/users/${currentUser.uid}/portrait`,
          {
            method: "PATCH",
            body: portraitData,
          },
        );

        const portraitResult = await portraitResponse.json();

        if (!portraitResponse.ok) {
          throw new Error(portraitResult.error || "Failed to upload portrait.");
        }

        setPortraitUrl(portraitResult.portrait_url);
        setPortrait(null);
      }

      if (password) {
        await updatePassword(currentUser, password);
      }

      alert("Profile saved!");
      setPassword("");
    } catch (err) {
      console.error(err);
      setError(err.message || "Failed to save profile.");
    }
  }

  async function handleLogout() {
    await signOut(auth);
    navigate("/landing");
  }

  function handleSaved() {
    navigate("/dashboard");
  }

  return (
    <>
      <Topbar>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </Topbar>

      <div className="form-container">
        <h2>Edit Your Profile</h2>

        <p className="error-message">{error}</p>

        <form onSubmit={handleSubmit}>
          <div className="portrait-section">
            <label htmlFor="portrait-upload">
              <div className="portrait-preview">
                {portrait ? (
                  <img src={URL.createObjectURL(portrait)} alt="Profile" />
                ) : portraitUrl ? (
                  <img src={`${API_URL}${portraitUrl}`} alt="Profile" />
                ) : (
                  <span>{username?.charAt(0)?.toUpperCase() || "P"}</span>
                )}
              </div>
            </label>

            <input
              id="portrait-upload"
              type="file"
              accept="image/*"
              onChange={(e) => setPortrait(e.target.files?.[0] || null)}
              style={{ display: "none" }}
            />

            <p className="portrait-text">Click profile picture to change</p>
          </div>

          <div>
            <label>Username</label>

            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div>
            <label>Password</label>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div>
            <label>Program of Study</label>

            <input
              type="text"
              value={program}
              onChange={(e) => setProgram(e.target.value)}
              required
            />
          </div>

          <div>
            <label>Year of Study</label>

            <input
              type="text"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              required
            />
          </div>

          <div>
            <button type="submit" className="loginbutton">
              Save
            </button>
            <br />
            <button type="button" className="loginbutton" onClick={handleSaved}>
              Return to Dashboard
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
