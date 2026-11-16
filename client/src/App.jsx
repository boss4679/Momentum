// The route table. Public pages (login, register) sit outside <RequireAuth>; everything
// else is inside it and shares the <Layout> navigation.
import { Route, Routes } from 'react-router';
import RequireAuth from './auth/RequireAuth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import WorkoutsPage from './pages/WorkoutsPage';
import CalendarPage from './pages/CalendarPage';
import FoodLogPage from './pages/FoodLogPage';
import NotFoundPage from './pages/NotFoundPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="workouts" element={<WorkoutsPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="food" element={<FoodLogPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
