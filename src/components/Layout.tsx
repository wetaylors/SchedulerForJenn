import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard' },
  { to: '/staff', label: 'Staff' },
  { to: '/facilities', label: 'Facilities' },
  { to: '/time-off', label: 'Time Off' },
  { to: '/schedule', label: 'Schedule' },
  { to: '/settings', label: 'Settings' },
];

export default function Layout() {
  return (
    <>
      <nav className="nav-bar">
        <h1 className="nav-title">Schedule Builder</h1>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            end={item.to === '/'}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </>
  );
}
