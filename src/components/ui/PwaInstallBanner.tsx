import React, { useState } from 'react';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import { Download, X, Share, PlusSquare, Smartphone } from 'lucide-react';
import { Button } from './Button';

export const PwaInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  // If already installed or user dismissed it, don't show
  if (isInstalled || dismissed) return null;

  // If not installable and not on iOS, nothing to show
  if (!isInstallable && !isIOS) return null;

  return (
    <aside 
      aria-label="Install App"
      className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-md z-50 p-3.5 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-floating text-ink flex flex-col gap-2.5 animate-in slide-in-from-bottom-5 duration-300"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-accent text-white flex items-center justify-center shrink-0 shadow-sm">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <div className="font-heading font-bold text-xs text-ink leading-tight">
              Install Ezpath on Mobile
            </div>
            <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
              Instant offline access & cached transit maps
            </p>
          </div>
        </div>

        <button
          onClick={() => setDismissed(true)}
          className="p-1 rounded-lg text-slate-400 hover:text-ink hover:bg-slate-100 transition-colors"
          aria-label="Dismiss install banner"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {isInstallable && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="primary"
            onClick={install}
            className="w-full text-xs font-semibold py-2"
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            Install Web App
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setDismissed(true)}
            className="text-xs text-slate-500 px-3"
          >
            Not now
          </Button>
        </div>
      )}

      {isIOS && !isInstallable && (
        <div className="text-[11px] text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
          <div className="font-semibold text-ink flex items-center gap-1.5">
            <Share className="w-3.5 h-3.5 text-accent" />
            <span>Install on iOS Safari:</span>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Tap the <strong className="text-ink">Share button</strong> below in Safari, then scroll down and tap <strong className="text-ink">Add to Home Screen <PlusSquare className="w-3 h-3 inline text-accent" /></strong>.
          </p>
        </div>
      )}
    </aside>
  );
};
