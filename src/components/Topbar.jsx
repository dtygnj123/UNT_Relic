import { useNavigate } from "react-router-dom";

export default function Topbar({ showBack = true, children }) {
  const navigate = useNavigate();

  return (
    <header className="topbar">
      <div className="topbar-left">
        {showBack && (
          <button className="back-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
        )}
        <button className="logo" onClick={() => navigate("/dashboard")}>
          UofNoTears
        </button>
      </div>
      <div className="header-buttons">{children}</div>
    </header>
  );
}
