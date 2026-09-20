import { useState } from "react";

export function RoamlyLogo() {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-center gap-2.5 select-none group cursor-pointer">
      <div className="w-10 h-10 rounded-2xl bg-white/[0.06] border border-white/10 flex items-center justify-center overflow-hidden shadow-[0_0_20px_rgba(16,185,129,0.25)] group-hover:scale-105 transition-transform duration-300 shrink-0">
        {!imgError ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src="/Roamly-Logo.ico"
            alt="Roamly Logo"
            className="w-full h-full object-contain p-0.5"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-emerald-950 font-black text-[18px]">
            R
          </div>
        )}
      </div>
      <div className="flex flex-col">
        <span
          className="text-[20px] font-extrabold tracking-tight text-white leading-none group-hover:text-emerald-400 transition-colors"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Roamly
        </span>
        <span className="text-[9px] font-bold tracking-widest text-emerald-400/90 uppercase mt-0.5">
          Adventure Radar
        </span>
      </div>
    </div>
  );
}
