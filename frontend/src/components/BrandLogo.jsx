import React from 'react';

export default function BrandLogo({ size = 32, collapsed = false }) {
  return <div className="brand">
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-[var(--green)]">
      <path d="M3 17 12 10 18 13 23 6 33 14v17H3V17Z" />
      <path d="M3 21c6-5 10 3 16-1s9 0 14-2M3 25c6-5 10 3 16-1s9 0 14-2M3 29c6-5 10 3 16-1s9 0 14-2M23 6V2m0 4-3-2m3 2 3-3" />
    </svg>
    {!collapsed && <div><div className="brand-name">Quan trắc đất</div><div className="brand-subtitle">AgroPrecision · IoT</div></div>}
  </div>;
}
