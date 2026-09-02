import { Routes, Route } from "react-router-dom";

import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup.jsx";
import Paywall from "./pages/paywall";
import Gallery from "./pages/Gallery.jsx";
import Profile from "./pages/Profile.jsx";
import Comment from "./pages/Comment.jsx";
import CheatSheet from "./pages/Cheatsheet.jsx";
import Practice from "./pages/Practice.jsx";
import PostPage from "./pages/Postpage.jsx";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/landing" element={<Landing />} />
      <Route path="/Login" element={<Login />} />
      <Route path="/paywall" element={<Paywall />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/gallery" element={<Gallery />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/comments/:fileId" element={<Comment />} />
      <Route path="/cheatsheet" element={<CheatSheet />} />
      <Route path="/practice" element={<Practice />} />
      <Route path="/post" element={<PostPage />} />
    </Routes>
  );
}

export default App;
