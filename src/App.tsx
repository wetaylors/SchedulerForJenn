import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { initStore } from './store';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';
import StaffPage from './pages/StaffPage';
import FacilitiesPage from './pages/FacilitiesPage';
import TimeOffPage from './pages/TimeOffPage';
import SettingsPage from './pages/SettingsPage';
import SchedulePage from './pages/SchedulePage';
import './App.css';

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    initStore().then(() => setReady(true)).catch(console.error);
  }, []);

  if (!ready) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 16, color: '#666' }}>
        Loading...
      </div>
    );
  }

  return (
    <BrowserRouter basename="/SchedulerForJenn">
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
    </BrowserRouter>
  );
}
