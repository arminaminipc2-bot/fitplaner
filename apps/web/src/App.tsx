import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { LoadingState } from "./components/states";
import { SessionProvider, useSession } from "./lib/session";
import { AuthPage, ForgotPassword } from "./routes/Auth";
import { Onboarding } from "./routes/Onboarding";
import { Home } from "./routes/Home";
import { Workouts } from "./routes/Workouts";
import { Nutrition } from "./routes/Nutrition";
import { Progress } from "./routes/Progress";
import { Chat } from "./routes/Chat";
import { Profile } from "./routes/Profile";
import { Settings } from "./routes/Settings";
import { Gallery } from "./routes/Gallery";

/**
 * The session cookie decides what renders. While `/auth/me` is in flight nothing
 * is shown but a skeleton — redirecting first would flash the login page at a
 * user who is already signed in.
 */
function Pending({ children }: { children: ReactNode }) {
  const { status } = useSession();
  if (status === "loading") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-[420px] items-center px-4">
        <LoadingState label="در حال بررسی نشستی شما" rows={2} />
      </div>
    );
  }
  return <>{children}</>;
}

/** The five destinations plus settings: signed in, and past onboarding. */
function Shell() {
  const { status, user } = useSession();
  if (status !== "authenticated" || !user) return <Navigate to="/login" replace />;
  if (!user.onboardingCompleted) return <Navigate to="/onboarding" replace />;
  return <AppShell userName={user.displayName ?? user.email} />;
}

function Protected() {
  const { status, user } = useSession();
  if (status !== "authenticated" || !user) return <Navigate to="/login" replace />;
  return <Onboarding />;
}

export default function App() {
  return (
    <SessionProvider>
      <Pending>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<AuthPage mode="login" />} />
            <Route path="/register" element={<AuthPage mode="register" />} />
            <Route path="/forgot" element={<ForgotPassword />} />
            <Route path="/onboarding" element={<Protected />} />

            <Route element={<Shell />}>
              <Route path="/" element={<Home />} />
              <Route path="/workouts" element={<Workouts />} />
              <Route path="/nutrition" element={<Nutrition />} />
              <Route path="/plan" element={<Navigate to="/workouts" replace />} />
              <Route path="/progress" element={<Progress />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/gallery" element={<Gallery />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </Pending>
    </SessionProvider>
  );
}
