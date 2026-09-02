import "../styles/landing.css";
import { useNavigate } from "react-router-dom";

function Landing() {
  const navigate = useNavigate();

  function goToSignIn() {
    navigate("/Login");
  }

  function goToSignUp() {
    navigate("/Signup");
  }

  return (
    <main className="landing-page">
      <header className="landing-header">
        <div className="landing-logo">UofNoTears</div>

        <div className="landing-buttons">
          <button onClick={goToSignIn}>Sign In</button>
          <button onClick={goToSignUp}>Sign Up</button>
        </div>
      </header>

      <section className="hero-section">
        <h1>Make your study easier with shared resources.</h1>

        <p>
          UofNoTears provides students with a platform to share course
          materials, join study rooms, and receive ai study support.
        </p>

        <button className="main-cta" onClick={goToSignIn}>
          Get Started
        </button>
      </section>

      <section className="features-section">
        <h2>What You Can Do</h2>

        <div className="feature-grid">
          <div className="feature-card">
            <h3>AI Study Help</h3>
            <p>
              Generate quizzes, study tips, and answers based on uploaded course
              files.
            </p>
          </div>

          <div className="feature-card">
            <h3>Study Rooms</h3>
            <p>
              Join course-based rooms to discuss materials and prepare with
              classmates.
            </p>
          </div>

          <div className="feature-card">
            <h3>File Sharing</h3>
            <p>
              Upload and access shared notes, practice questions, and study
              resources.
            </p>
          </div>

          <div className="feature-card">
            <h3>Personal Dashboard</h3>
            <p>
              View recommendations, recent activity, and your academic profile
              in one place.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

export default Landing;
