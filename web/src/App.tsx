import { Routes, Route, Navigate } from "react-router-dom";
import ProfilePage from "./pages/ProfilePage";
import SectionPage from "./pages/SectionPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ProfilePage />} />
      <Route path="/section/:n" element={<SectionPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
