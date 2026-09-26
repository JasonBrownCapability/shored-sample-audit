import { Toaster } from "sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Login from "./pages/Login";
import Sessions from "./pages/Sessions";
import Customers from "./pages/Customers";
import Book from "./pages/Book";
import Manage from "./pages/Manage";
import Overview from "./pages/admin/Overview";

const queryClient = new QueryClient();

// The founder's account. Only this user gets the /admin overview.
const FOUNDER_EMAIL = "founder@meadowlark.example";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
}

function RequireFounder({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user?.email === FOUNDER_EMAIL ? children : <Navigate to="/" replace />;
}

function Nav() {
  const { user, signOut } = useAuth();
  if (!user) return null;
  return (
    <nav className="border-b bg-card">
      <div className="container flex h-14 items-center gap-6 text-sm">
        <Link to="/" className="font-semibold">Meadowlark</Link>
        <Link to="/">Classes</Link>
        <Link to="/customers">Customers</Link>
        {user.email === FOUNDER_EMAIL && <Link to="/admin">Admin</Link>}
        <button className="ml-auto text-muted-foreground" onClick={signOut}>Sign out</button>
      </div>
    </nav>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <Toaster position="top-center" />
      <BrowserRouter>
        <Nav />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Sessions /></RequireAuth>} />
          <Route path="/customers" element={<RequireAuth><Customers /></RequireAuth>} />
          <Route path="/admin" element={<RequireFounder><Overview /></RequireFounder>} />
          <Route path="/book/:slug" element={<Book />} />
          <Route path="/manage/:token" element={<Manage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
