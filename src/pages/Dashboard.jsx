import "../styles/dashboard.css";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "../lib/firebase.js";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { getRecommendations } from "../services/api-service";
import API_URL from "../config";
import Topbar from "../components/Topbar";

function Dashboard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const recommendations = getRecommendations();
  const navigate = useNavigate();

  //real activities
  const [activities, setActivities] = useState([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);

  async function fetchRecentActivity(userId) {
    try {
      const response = await fetch(`${API_URL}/api/files/recent/${userId}`);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch recent activity");
      }

      setActivities(data);
    } catch (err) {
      console.error("Failed to fetch recent activity:", err);
      setActivities([]);
    } finally {
      setActivitiesLoading(false);
    }
  }

  // Fetch user profile on component mount
  useEffect(() => {
    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        navigate("/login");
        return;
      }
      console.log("Firebase UID:", firebaseUser.uid);

      const params = new URLSearchParams(window.location.search);

      if (params.get("payment") === "success") {
        try {
          await fetch(
            `${API_URL}/api/checkout/activate-subscription/${firebaseUser.uid}`,
            {
              method: "PATCH",
            },
          );
        } catch (err) {
          console.error("Failed to activate subscription:", err);
        }
      }

      try {
        const response = await fetch(
          `${API_URL}/api/users/${firebaseUser.uid}`,
        );

        if (!response.ok) {
          throw new Error("Failed to fetch user profile");
        }

        const data = await response.json();

        if (data.subscription_status !== "Active") {
          navigate("/paywall");
          return;
        }

        setUser(data);

        await fetchRecentActivity(firebaseUser.uid);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [navigate]);

  // Navigate to different pages based on activity type
  function goToActivity(item) {
    navigate(`/comments/${item.file_id}`);
  }

  function goToProfile() {
    navigate("/profile");
  }

  function goToGallery() {
    navigate("/Gallery");
  }

  async function handleLogout() {
    await signOut(auth);
    navigate("/landing");
  }

  function goToPaywall() {
    navigate("/paywall");
  }

  function goToCheatSheet() {
    navigate("/cheatsheet");
  }

  if (loading) {
    return <p>Loading dashboard...</p>;
  }

  if (!user) {
    return <p>User profile not found.</p>;
  }

  return (
    <>
      <Topbar showBack={false}>
        <button className="profile-avatar" onClick={goToProfile}>
          {user.portrait_url ? (
            <img
              src={`${API_URL}${user.portrait_url}`}
              alt="Profile"
              className="profile-avatar-image"
            />
          ) : (
            user.user_name.charAt(0).toUpperCase()
          )}
        </button>

        <button className="logout-btn" onClick={handleLogout}>
          Logout
        </button>
      </Topbar>

      <main className="dashboard">
        <section className="user-card">
          <div className="user-info">
            <h2>Welcome back, {user.user_name}!</h2>

            <p>
              <strong>Major:</strong> {user.program || "Not set"}
            </p>

            <p>
              <strong>Year:</strong> {user.year_of_study || "Not set"}
            </p>

            <p>
              <strong>Subscription:</strong> {user.subscription_status}
            </p>
          </div>

          {user.portrait_url && (
            <img
              src={`${API_URL}${user.portrait_url}`}
              alt="Profile"
              className="user-card-portrait"
            />
          )}
        </section>

        <section className="quick-actions">
          <h2>Quick Actions</h2>

          <div className="action-grid">
            <button className="action-card" onClick={goToProfile}>
              Edit Profile
            </button>

            <button className="action-card" onClick={goToGallery}>
              File Sharing Gallery
            </button>

            <button className="action-card" onClick={goToCheatSheet}>
              Generate Cheat Sheet
            </button>

            <button className="action-card" onClick={goToPaywall}>
              {user.subscription_status === "Active"
                ? "Manage Subscription"
                : "Pro Features"}
            </button>
          </div>
        </section>

        <section className="recommendations">
          <h2>Recommended For You</h2>

          <ul>
            {recommendations.map((recommendation, index) => (
              <li key={index}>
                <a
                  href={recommendation.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {recommendation.text}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="recent-activity">
          <h2>Recently Viewed Posts</h2>

          {activitiesLoading ? (
            <p>Loading recent posts...</p>
          ) : activities.length === 0 ? (
            <p>You have not viewed any posts yet.</p>
          ) : (
            <ul>
              {activities.map((item) => (
                <li key={item.file_id}>
                  <button
                    className="link-btn"
                    onClick={() => goToActivity(item)}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

export default Dashboard;
