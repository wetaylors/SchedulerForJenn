import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import StaffPage from './pages/StaffPage';
import FacilitiesPage from './pages/FacilitiesPage';
import TimeOffPage from './pages/TimeOffPage';
import SettingsPage from './pages/SettingsPage';
import SchedulePage from './pages/SchedulePage';
import './App.css';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/staff" element={<StaffPage />} />
          <Route path="/facilities" element={<FacilitiesPage />} />
          <Route path="/time-off" element={<TimeOffPage />} />
          <Route path="/schedule" element={<SchedulePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
