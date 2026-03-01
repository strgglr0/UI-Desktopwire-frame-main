import { useEffect } from 'react';
import { initClinicPortal } from '../app.js';
import { LegacyPortal } from './LegacyPortal';

export default function App() {
  useEffect(() => {
    initClinicPortal();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100">
      <LegacyPortal />
    </div>
  );
}
