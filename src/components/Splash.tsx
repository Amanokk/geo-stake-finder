import { useEffect, useState } from "react";

export function Splash() {
  const [visible, setVisible] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setFading(true), 1400);
    const t2 = setTimeout(() => setVisible(false), 2000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-0 z-50 grid place-items-center bg-slate-950 transition-opacity duration-500 ${
        fading ? "opacity-0" : "opacity-100"
      }`}
    >
      <div className="text-center">
        <img
          src="/app-icon-192.png"
          alt="Ícone do app Estaca GPS"
          width={96}
          height={96}
          className="mx-auto h-24 w-24 rounded-2xl"
        />
        <div className="mt-5 text-2xl font-black tracking-tight text-white">Estaca GPS</div>
        <div className="text-xs uppercase tracking-[0.25em] text-slate-400">
          Retiro São Joaquim
        </div>
        <div className="mt-8 text-sm font-semibold text-yellow-300">By Vitor Lucas</div>
      </div>
    </div>
  );
}
