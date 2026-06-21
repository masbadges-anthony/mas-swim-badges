import { BrowserRouter, Routes, Route, Link, NavLink } from 'react-router-dom';
import Home from './pages/Home';
import Directory from './pages/Directory';
import Verify from './pages/Verify';
import './styles/public.css';

export default function App() {
  return (
    <BrowserRouter>
      <div className="mas-app">
        <header className="mas-topbar">
          <Link to="/" className="mas-brand">
            <span className="mas-brand-mark">MAS</span>
            <span className="mas-brand-text">Swim Badges</span>
          </Link>
          <nav className="mas-nav">
            <NavLink to="/directory" className={({ isActive }) => isActive ? 'is-active' : ''}>
              Centres
            </NavLink>
            <NavLink to="/verify" className={({ isActive }) => isActive ? 'is-active' : ''}>
              Verify
            </NavLink>
          </nav>
        </header>

        <main className="mas-main">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/directory" element={<Directory />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/verify/:serial" element={<Verify />} />
            <Route path="*" element={<Home />} />
          </Routes>
        </main>

        <footer className="mas-footer">
          <p>Malaysia Aquatics · Swim Badges programme</p>
        </footer>
      </div>
    </BrowserRouter>
  );
}
