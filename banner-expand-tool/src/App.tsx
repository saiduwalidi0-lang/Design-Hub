import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Home from "@/pages/Home";
import Settings from "@/pages/Settings";

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/avatar-frame" element={<Home initialAvatarFrame />} />
        <Route path="/settings" element={<Settings />} />
        {/* 误打开插件式路径或其它未知路径时不再白屏，并尽量落到可用手淘页 */}
        <Route path="/tools/kv-to-avatarframe" element={<Navigate to="/avatar-frame" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
