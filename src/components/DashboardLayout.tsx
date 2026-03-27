"use client";

import { useState } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from 'recharts';
import { Bell, Activity, Wind, Droplets, Thermometer, User, ShieldAlert, Cpu } from 'lucide-react';
import dynamic from 'next/dynamic';

const MapComponent = dynamic(() => import('./MapComponent'), { ssr: false });

const pm25Data = [
  { time: '12:00', value: 35 },
  { time: '14:00', value: 42 },
  { time: '16:00', value: 38 },
  { time: '18:00', value: 55 },
  { time: '20:00', value: 72 }, // Current
  { time: '22:00', value: 85, predicted: true },
  { time: '00:00', value: 65, predicted: true },
  { time: '02:00', value: 45, predicted: true },
];

export default function DashboardLayout() {
  const [timeOffset, setTimeOffset] = useState(0);

  return (
    <div className="flex flex-col h-screen w-full bg-[#FFFFFF] text-[#111827] overflow-hidden font-sans">
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 border-b-2 border-slate-800 bg-[#FFFFFF] z-10 shadow-[4px_4px_0_0_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2 text-[#0047AB] font-bold text-2xl tracking-tight">
            <Activity className="w-8 h-8" />
            <span>Localized Risk App</span>
          </div>
          <nav className="hidden md:flex gap-6 text-sm font-semibold text-slate-600">
            <button className="text-[#0047AB] border-b-2 border-[#0047AB] pb-1">Live Twin</button>
            <button className="hover:text-[#0047AB] transition-colors">24h Forecast</button>
            <button className="hover:text-[#0047AB] transition-colors">Localized Risks</button>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 border-2 border-slate-800 rounded-full hover:bg-slate-100 transition shadow-[2px_2px_0_0_rgba(0,0,0,0.08)] relative">
            <Bell className="w-5 h-5 text-slate-700" />
            <span className="absolute top-0 right-0 w-3 h-3 bg-[#F97316] border-2 border-white rounded-full"></span>
          </button>
          <div className="w-10 h-10 rounded-full border-2 border-slate-800 bg-[#F8FAFC] overflow-hidden shadow-[2px_2px_0_0_rgba(0,0,0,0.08)] flex items-center justify-center">
            <User className="w-6 h-6 text-slate-400" />
          </div>
        </div>
      </header>

      {/* MAIN CONTENT DIVIDED INTO 3 COLUMNS */}
      <main className="flex-1 flex overflow-hidden">
        
        {/* LEFT SIDEBAR: INSIGHTS */}
        <aside className="w-80 bg-[#F8FAFC] border-r-2 border-slate-800 p-6 flex flex-col gap-6 overflow-y-auto z-10 shadow-[4px_0px_0_0_rgba(0,0,0,0.04)]">
          <div>
            <h2 className="text-xl font-bold mb-4 tracking-tight">Your Localized State</h2>
            {/* Bento Box 1: Local State */}
            <div className="bg-[#FFFFFF] border-2 border-slate-800 p-5 rounded-xl shadow-[4px_4px_0_0_rgba(0,0,0,0.08)] transition-shadow hover:shadow-[6px_6px_0_0_rgba(0,0,0,0.12)]">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-slate-500 uppercase">Current AQI</span>
                <span className="px-2 py-1 bg-[#10B981]/20 text-[#10B981] text-xs font-bold rounded border border-[#10B981]">Stable</span>
              </div>
              <div className="text-5xl font-black mb-4">42</div>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-2">
                  <Thermometer className="w-4 h-4 text-[#0047AB]" />
                  <span className="text-sm font-medium">31°C</span>
                </div>
                <div className="flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-[#0047AB]" />
                  <span className="text-sm font-medium">68%</span>
                </div>
                <div className="flex items-center gap-2 col-span-2">
                  <Wind className="w-4 h-4 text-[#0047AB]" />
                  <span className="text-sm font-medium">12 km/h NW</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-bold mb-4 tracking-tight">ML Prediction (PM2.5)</h2>
            <div className="bg-[#FFFFFF] border-2 border-slate-800 p-4 rounded-xl shadow-[4px_4px_0_0_rgba(0,0,0,0.08)] h-64 flex flex-col transition-shadow hover:shadow-[6px_6px_0_0_rgba(0,0,0,0.12)]">
              <div className="text-xs font-semibold text-slate-500 uppercase mb-4">Next 12 Hours</div>
              <div className="flex-1 w-full min-h-[200px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={pm25Data}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="time" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis fontSize={10} tickLine={false} axisLine={false} width={25} />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: '2px solid #1e293b', boxShadow: '4px 4px 0px rgba(0,0,0,0.08)' }} 
                    />
                    <Line 
                      type="monotone" 
                      dataKey="value" 
                      stroke="#0047AB" 
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#0047AB', strokeWidth: 2, stroke: '#FFFFFF' }}
                      activeDot={{ r: 6, fill: '#F97316', stroke: '#FFFFFF' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </aside>

        {/* CENTRAL AREA: MAP THE TWIN */}
        <section className="flex-1 relative flex flex-col">
          <div className="flex-1 relative z-0">
            <MapComponent timeOffset={timeOffset} />
          </div>
          
          {/* BOTTOM TIMELINE SLIDER */}
          <div className="h-24 bg-[#FFFFFF] border-t-2 border-slate-800 p-6 flex items-center justify-between z-10 shadow-[0_-4px_0_0_rgba(0,0,0,0.04)]">
            <div className="font-bold text-sm tracking-tight w-32 break-none">Time Perspective</div>
            <input 
              type="range" 
              className="flex-1 mx-8 accent-[#0047AB] h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer border-2 border-slate-800"
              min="-12" max="12" step="1" 
              value={timeOffset}
              onChange={(e) => setTimeOffset(Number(e.target.value))}
            />
            <div className="font-bold text-sm text-[#0047AB] w-24 text-right">
              {timeOffset === 0 ? 'Live Now' : timeOffset > 0 ? `+${timeOffset} Hours` : `${timeOffset} Hours`}
            </div>
          </div>
        </section>

        {/* RIGHT SIDEBAR: RISKS (Bento) */}
        <aside className="w-80 bg-[#F8FAFC] border-l-2 border-slate-800 p-6 flex flex-col gap-6 overflow-y-auto z-10 shadow-[-4px_0_0_0_rgba(0,0,0,0.04)]">
          <h2 className="text-xl font-bold tracking-tight">Personalized Risks</h2>
          
          <div className="grid grid-cols-1 gap-4">
            {/* Bento Alert 1 */}
            <div className="bg-[#FFFFFF] border-2 border-slate-800 p-4 rounded-xl shadow-[4px_4px_0_0_rgba(0,0,0,0.08)] border-l-8 border-l-[#10B981] transition-transform hover:-translate-y-1">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-800">Safe for Asthmatics</h3>
                  <p className="text-xs text-slate-500 mt-1">Current zone is stable. Outdoor activity is safe.</p>
                </div>
                <div className="p-2 bg-[#10B981]/10 rounded-lg shrink-0">
                  <Activity className="w-5 h-5 text-[#10B981]" />
                </div>
              </div>
            </div>

            {/* Bento Alert 2 (Warning) */}
            <div className="bg-[#FFFFFF] border-2 border-slate-800 p-4 rounded-xl shadow-[4px_4px_0_0_rgba(249,115,22,0.2)] border-l-8 border-l-[#F97316] transition-transform hover:-translate-y-1">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-slate-800">High Risk at 22:00</h3>
                  <p className="text-xs text-slate-500 mt-1">PM2.5 predicted to spike to 85. Keep windows closed.</p>
                </div>
                <div className="p-2 bg-[#F97316]/10 rounded-lg shrink-0">
                  <ShieldAlert className="w-5 h-5 text-[#F97316]" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h2 className="text-sm font-bold tracking-tight uppercase text-slate-400 mb-3 flex items-center gap-2">
              <Cpu className="w-4 h-4" /> Anomaly Detect Log
            </h2>
            <div className="bg-[#FFFFFF] border-2 border-slate-800 rounded-xl shadow-[4px_4px_0_0_rgba(0,0,0,0.08)] p-4 flex flex-col gap-3">
              <div className="flex gap-3 items-start pb-3 border-b border-slate-200">
                <div className="w-2 h-2 rounded-full bg-[#F97316] mt-1.5 shrink-0"></div>
                <div>
                  <div className="font-semibold text-sm leading-tight">Nearby Construction</div>
                  <div className="text-xs text-slate-500 mt-1">Validated 10 mins ago • +15% Dust</div>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <div className="w-2 h-2 rounded-full bg-slate-300 mt-1.5 shrink-0"></div>
                <div>
                  <div className="font-semibold text-sm leading-tight">Traffic Congestion</div>
                  <div className="text-xs text-slate-500 mt-1">Sector 4 • Normal exhaust levels</div>
                </div>
              </div>
            </div>
          </div>
        </aside>

      </main>
    </div>
  );
}
