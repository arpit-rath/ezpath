import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu, X, RotateCcw, Download, WifiOff } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Button } from '../ui/Button';
import { useOperatorStore } from '../../stores/operatorStore';
import { useJourneyStore } from '../../stores/journeyStore';
import { isDemoMode } from '../../config/runtime';
import { usePwaInstall } from '../../hooks/usePwaInstall';

export const Navbar = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const toggle = useRef<HTMLButtonElement>(null);
  const reduced = useReducedMotion();
  const { disruptions, resetDemo, triggerElevatorFailure, isSimulating } = useOperatorStore();
  const { searchJourneys } = useJourneyStore();
  const { isInstallable, isInstalled, install } = usePwaInstall();

  const active = disruptions.some(d => d.isActive);
  const isHome = location.pathname === '/';

  useEffect(() => { 
    setOpen(false); 
  }, [location.pathname]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const links = [
    { to: '/plan', label: 'Journey planner' },
    { to: '/saved', label: 'Saved journeys' },
    { to: '/operator', label: 'For operators' }
  ];

  return (
    <header 
      className="site-header" 
      onKeyDown={event => { 
        if (event.key === 'Escape') { 
          setOpen(false); 
          toggle.current?.focus(); 
        } 
      }}
    >
      <div className="page-width header-inner">
        <Link to="/" className="brand" aria-label="Ezpath home">
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path d="M5 25 15 7h11L16 25H5Z" stroke="currentColor" strokeWidth="2" />
            <path d="M10 16h12M21 7l-10 18" stroke="currentColor" strokeWidth="2" />
          </svg>
          ezpath<span className="brand-period">.</span>
        </Link>

        {/* Desktop nav links */}
        <nav className="desktop-nav" aria-label="Main navigation">
          {links.map(link => (
            <NavLink key={link.to} to={link.to}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-3">
          {isInstallable && !isInstalled && (
            <button
              onClick={install}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 transition-colors"
              title="Install Ezpath as a standalone web app on your device"
            >
              <Download size={14} />
              Install App
            </button>
          )}

          <Link to="/plan" className="nav-cta">
            Plan a journey <ArrowUpRight size={16} />
          </Link>
        </div>

        {/* Mobile Toggle Button (Min 44x44px for touch targets) */}
        <button 
          ref={toggle} 
          className="mobile-toggle min-w-[44px] min-h-[44px] p-2 flex items-center justify-center text-ink rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent" 
          aria-label={open ? 'Close navigation' : 'Open navigation'} 
          aria-expanded={open} 
          aria-controls="mobile-navigation" 
          onClick={() => setOpen(!open)}
        >
          {open ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Mobile Nav Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.nav 
            id="mobile-navigation" 
            aria-label="Mobile navigation" 
            className="mobile-nav bg-surface border-b border-subtle-border px-5 py-3 space-y-1" 
            initial={{ height: reduced ? 'auto' : 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }} 
            exit={{ height: reduced ? 'auto' : 0, opacity: 0 }} 
            transition={{ duration: reduced ? 0 : 0.2 }}
          >
            {links.map(link => (
              <NavLink 
                key={link.to} 
                to={link.to}
                className="flex items-center justify-between py-3 text-sm font-medium text-ink hover:text-accent border-b border-slate-100"
              >
                <span>{link.label}</span>
                <ArrowUpRight size={16} className="text-slate-400" />
              </NavLink>
            ))}

            {isInstallable && !isInstalled && (
              <div className="pt-2 pb-1">
                <Button 
                  size="md" 
                  variant="primary" 
                  onClick={install} 
                  className="w-full text-xs font-semibold gap-2 py-3"
                >
                  <Download size={16} />
                  Install Ezpath Web App
                </Button>
              </div>
            )}
          </motion.nav>
        )}
      </AnimatePresence>

      {/* Network / Offline Toolbar */}
      {!isOnline ? (
        <div className="bg-amber-100 border-b border-amber-200 text-amber-900 text-xs py-1.5 px-4 font-medium flex items-center justify-center gap-2">
          <WifiOff size={14} className="text-amber-700" />
          <span>Offline Mode Active — Using cached map & saved itineraries</span>
        </div>
      ) : (
        isDemoMode && !isHome && (
          <div className="demo-toolbar">
            <div className="page-width">
              <span>
                <span className="status-dot" />
                Demo network · {active ? 'Disruption reported' : 'All facilities operational'}
              </span>
              <Button 
                size="sm" 
                variant="ghost" 
                isLoading={isSimulating} 
                onClick={async () => { 
                  if (active) { 
                    await resetDemo(); 
                    await searchJourneys(); 
                  } else { 
                    await triggerElevatorFailure(); 
                  } 
                }}
              >
                {active && <RotateCcw size={13} />}
                {active ? 'Reset demo' : 'Simulate outage'}
              </Button>
            </div>
          </div>
        )
      )}
    </header>
  );
};
