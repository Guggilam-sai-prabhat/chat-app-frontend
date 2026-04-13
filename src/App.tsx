import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { MessagingProvider } from "./context/MessagingContext";
import { RequireAuth, RedirectIfAuthed } from "./components/RouteGuard";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import OAuthCallback from "./pages/OAuthCallback";
import ChannelsDashboard from "./pages/ChannelsDashboard";

/** Wraps children in MessagingProvider only when authenticated */
function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <MessagingProvider>{children}</MessagingProvider>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route
            path="/login"
            element={
              <RedirectIfAuthed>
                <LoginPage />
              </RedirectIfAuthed>
            }
          />
          <Route
            path="/register"
            element={
              <RedirectIfAuthed>
                <RegisterPage />
              </RedirectIfAuthed>
            }
          />
          <Route path="/auth/callback" element={<OAuthCallback />} />

          {/* Protected routes — wrapped in MessagingProvider */}
          <Route
            path="/channels"
            element={
              <AuthenticatedLayout>
                <ChannelsDashboard />
              </AuthenticatedLayout>
            }
          />
          <Route
            path="/channels/:id"
            element={
              <AuthenticatedLayout>
                <ChannelsDashboard />
              </AuthenticatedLayout>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}