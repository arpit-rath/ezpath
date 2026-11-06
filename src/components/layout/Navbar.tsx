import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu, X, RotateCcw } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from '../ui/Button';
import { useOperatorStore } from '../../stores/operatorStore';
import { useJourneyStore } from '../../stores/journeyStore';
import { isDemoMode } from '../../config/runtime';

export const Navbar = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const { disruptions, resetDemo, triggerElevatorFailure, isSimulating } = useOperatorStore();
  const { searchJourneys } = useJourneyStore();
  const active = disruptions.some(d => d.isActive);
  const isHome = location.pathname === '/';
  useEffect(() => { setOpen(false); }, [location.pathname]);
  const links = [{ to: '/plan', label: 'Journey planner' }, { to: '/report', label: 'Report access issue' }, { to: '/saved', label: 'Saved journeys' }, { to: '/operator', label: 'For operators' }];
  return <header className="site-header" onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); toggle.current?.focus(); } }}>
    <div className="page-width header-inner">
      <Link to="/" className="brand" aria-label="Ezpath home"><svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M5 25 15 7h11L16 25H5Z" stroke="currentColor" strokeWidth="2" /><path d="M10 16h12M21 7l-10 18" stroke="currentColor" strokeWidth="2" /></svg>ezpath<span className="brand-period">.</span></Link>
      <nav className="desktop-nav" aria-label="Main navigation">{links.map(link => <NavLink key={link.to} to={link.to}>{link.label}</NavLink>)}</nav>
      <Link to="/plan" className="nav-cta">Plan a journey <ArrowUpRight size={16} /></Link>
      <button ref={toggle} className="mobile-toggle" aria-label={open ? 'Close navigation' : 'Open navigation'} aria-expanded={open} aria-controls="mobile-navigation" onClick={() => setOpen(!open)}>{open ? <X /> : <Menu />}</button>
    </div>
    <AnimatePresence>{open && <motion.nav id="mobile-navigation" aria-label="Mobile navigation" className="mobile-nav" initial={{ height: reduced ? 'auto' : 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: reduced ? 'auto' : 0, opacity: 0 }} transition={{ duration: reduced ? 0 : 0.2 }}>{links.map(link => <NavLink key={link.to} to={link.to}>{link.label}<ArrowUpRight size={16} /></NavLink>)}</motion.nav>}</AnimatePresence>
    {isDemoMode && !isHome && <div className="demo-toolbar"><div className="page-width"><span><span className="status-dot" />Demo network · {active ? 'Disruption reported' : 'All facilities operational'}</span><Button size="sm" variant="ghost" isLoading={isSimulating} onClick={async () => { if (active) { await resetDemo(); await searchJourneys(); } else { await triggerElevatorFailure(); } }}>{active && <RotateCcw size={13} />}{active ? 'Reset demo' : 'Simulate outage'}</Button></div></div>}
  </header>;
};
