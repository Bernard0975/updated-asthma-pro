import React, { useState, useEffect, useCallback, useMemo } from "react";
import { 
  Wind, 
  Droplets, 
  Thermometer, 
  AlertTriangle, 
  Bell, 
  CheckCircle2, 
  RefreshCw,
  Info,
  ShieldAlert,
  MapPin,
  Search,
  Send,
  Loader2,
  Navigation,
  Activity,
  Calendar,
  HeartPulse,
  ChevronRight,
  Cloud,
  Mail,
  XCircle,
  BellOff
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";

interface WeatherData {
  current: {
    main: {
      temp: number;
      humidity: number;
      pressure: number;
    };
    weather: Array<{
      main: string;
      description: string;
      icon: string;
    }>;
    name: string;
    wind: {
      speed: number;
    };
  };
  forecast: {
    list: Array<{
      dt: number;
      main: {
        temp: number;
        humidity: number;
      };
      weather: Array<{
        main: string;
      }>;
    }>;
  };
  aqi: {
    list: Array<{
      main: {
        aqi: number;
      };
      components: {
        pm2_5: number;
        pm10: number;
        no2: number;
        o3: number;
      };
    }>;
  };
}

interface RiskAssessment {
  level: "Low" | "Moderate" | "High" | "Extreme";
  color: string;
  bgColor: string;
  advice: string[];
  triggers: string[];
}

const AQI_LEVELS = [
  { label: "Good", color: "text-emerald-500", bg: "bg-emerald-50" },
  { label: "Fair", color: "text-amber-500", bg: "bg-amber-50" },
  { label: "Moderate", color: "text-orange-500", bg: "bg-orange-50" },
  { label: "Poor", color: "text-rose-500", bg: "bg-rose-50" },
  { label: "Very Poor", color: "text-purple-500", bg: "bg-purple-50" },
];

import { generateEmailHtml } from "./email-template";

export default function App() {
  const [data, setData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastAlertTime, setLastAlertTime] = useState<Date | null>(null);
  const [showNotification, setShowNotification] = useState<{show: boolean, msg: string, type: 'success' | 'error'} | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [email, setEmail] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [autoNotify, setAutoNotify] = useState(true);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const fetchWeather = useCallback(async (lat: number, lon: number) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`);
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response, "Failed to fetch weather data");
        throw new Error(errorMessage);
      }
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Could not retrieve environmental data. Please check your API key.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleGeolocation = useCallback(() => {
    if (navigator.geolocation) {
      setLoading(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          fetchWeather(position.coords.latitude, position.coords.longitude);
        },
        (err) => {
          console.warn("Geolocation error:", err);
          fetchWeather(40.7128, -74.0060); // NYC Fallback
          setError("Location access denied. Showing New York. Use search for your city.");
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    } else {
      fetchWeather(40.7128, -74.0060);
      setError("Geolocation not supported. Showing New York.");
    }
  }, [fetchWeather]);

  const searchCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    
    try {
      setLoading(true);
      const response = await fetch(`/api/weather/search?q=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response, "City not found");
        throw new Error(errorMessage);
      }
      const result = await response.json();
      setData(result);
      setError(null);
      setSearchQuery("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkSubscription = useCallback(async (emailAddr: string) => {
    if (!emailAddr.includes("@")) return;
    try {
      const response = await fetch(`/api/subscription/${encodeURIComponent(emailAddr)}`);
      if (!response.ok) {
        const errorMessage = await getErrorMessage(response, "Failed to check subscription");
        throw new Error(errorMessage);
      }
      const result = await response.json();
      setIsSubscribed(result.subscribed);
      setAutoNotify(result.autoNotify);
    } catch (err) {
      console.error("Failed to check subscription", err);
    }
  }, []);

  useEffect(() => {
    handleGeolocation();
  }, [handleGeolocation]);

  const risk = useMemo((): RiskAssessment => {
    if (!data) return { level: "Low", color: "text-emerald-500", bgColor: "bg-emerald-50", advice: [], triggers: [] };

    const temp = data.current.main.temp;
    const humidity = data.current.main.humidity;
    const windSpeed = data.current.wind.speed;
    const aqi = data.aqi.list[0]?.main.aqi || 1;
    
    let score = 0;
    const advice: string[] = [];
    const triggers: string[] = [];

    if (aqi >= 4) {
      score += 3;
      triggers.push("Poor Air Quality");
      advice.push("Air quality is very poor. Avoid all outdoor activities and keep windows closed.");
    } else if (aqi >= 3) {
      score += 2;
      triggers.push("Moderate Air Pollution");
      advice.push("Air quality is moderate. Sensitive individuals should limit prolonged outdoor exertion.");
    }

    if (temp < 10) {
      score += 2;
      triggers.push("Cold Air");
      advice.push("Cold air can trigger bronchospasm. Wear a scarf to warm the air you breathe.");
    } else if (temp > 32) {
      score += 1;
      triggers.push("Extreme Heat");
      advice.push("High heat can increase ozone levels. Stay in air-conditioned spaces.");
    }

    if (humidity > 75) {
      score += 2;
      triggers.push("High Humidity");
      advice.push("High humidity can harbor mold and dust mites. Use a dehumidifier.");
    }

    if (windSpeed > 10) {
      score += 1;
      triggers.push("High Wind (Allergens)");
      advice.push("Wind can stir up pollen and dust. Keep windows closed.");
    }

    if (score >= 5) return { level: "Extreme", color: "text-rose-600", bgColor: "bg-rose-50", advice, triggers };
    if (score >= 3) return { level: "High", color: "text-orange-500", bgColor: "bg-orange-50", advice, triggers };
    if (score >= 1) return { level: "Moderate", color: "text-amber-500", bgColor: "bg-amber-50", advice, triggers };
    
    return { 
      level: "Low", 
      color: "text-emerald-500", 
      bgColor: "bg-emerald-50",
      advice: ["Conditions are currently stable. Enjoy your day but keep your rescue inhaler nearby."], 
      triggers: ["None detected"] 
    };
  }, [data]);

  const validateEmail = (emailAddr: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddr);
  };

  const getErrorMessage = async (response: Response, fallback: string) => {
    try {
      const errorData = await response.json();
      return errorData?.error || fallback;
    } catch {
      return `${fallback} (${response.status} ${response.statusText})`;
    }
  };

  const handleNotify = async () => {
    if (!email || !validateEmail(email)) {
      setShowNotification({ show: true, msg: "Please enter a valid email address.", type: 'error' });
      setTimeout(() => setShowNotification(null), 5000);
      return;
    }
    
    if (!data) return;
    
    setSendingEmail(true);
    try {
      const subject = `[AsthmaGuard] ${risk.level} Risk Alert for ${data.current.name}`;
      const message = generateEmailHtml({
        locationName: data.current.name,
        riskLevel: risk.level,
        riskBgColor: risk.bgColor,
        triggers: risk.triggers,
        advice: risk.advice
      });

      const response = await fetch("/api/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toEmail: email, subject, message, saveEmail: true, autoNotify })
      });

      if (response.ok) {
        const result = await response.json();
        setShowNotification({ 
          show: true, 
          msg: result.simulated ? "Alert simulated (Check server logs)" : "Alert sent successfully!",
          type: 'success'
        });
        setLastAlertTime(new Date());
        setIsSubscribed(true);
        setTimeout(() => setShowNotification(null), 5000);
      } else {
        const errorMessage = await getErrorMessage(response, "Failed to send alert");
        throw new Error(errorMessage);
      }
    } catch (err: any) {
      setShowNotification({ show: true, msg: err.message, type: 'error' });
      setTimeout(() => setShowNotification(null), 5000);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleUnsubscribe = async () => {
    if (!email || !validateEmail(email)) return;
    try {
      const response = await fetch("/api/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      if (response.ok) {
        setIsSubscribed(false);
        setShowNotification({ show: true, msg: "You have been unsubscribed.", type: 'success' });
        setTimeout(() => setShowNotification(null), 5000);
      } else {
        const errorMessage = await getErrorMessage(response, "Failed to unsubscribe");
        setShowNotification({ show: true, msg: errorMessage, type: 'error' });
        setTimeout(() => setShowNotification(null), 5000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.forecast.list.slice(0, 8).map(item => ({
      time: new Date(item.dt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      temp: Math.round(item.main.temp),
      humidity: item.main.humidity
    }));
  }, [data]);

  return (
    <div className="min-h-screen bg-[#F1F5F9] text-slate-900 font-sans selection:bg-indigo-100 pb-12">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-200">
              <ShieldAlert className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-none">AsthmaGuard</h1>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Environmental Intelligence</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <form onSubmit={searchCity} className="relative hidden md:block">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search city..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 pr-6 py-2.5 bg-slate-100 border-none rounded-2xl text-sm focus:ring-2 focus:ring-indigo-500 w-64 transition-all focus:w-80 shadow-inner"
              />
            </form>
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100 shadow-sm">
              <Activity className="w-4 h-4" />
              SYSTEM ACTIVE
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-8 p-5 bg-white border-l-4 border-amber-500 rounded-2xl shadow-sm flex items-start gap-4"
            >
              <div className="w-10 h-10 bg-amber-50 rounded-full flex items-center justify-center flex-shrink-0">
                <Info className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-900">{error}</p>
                <p className="text-xs text-slate-500 mt-1">Try searching for your city manually if location services are unavailable.</p>
              </div>
              <button onClick={() => setError(null)} className="text-slate-300 hover:text-slate-900 transition-colors">
                <CheckCircle2 className="w-5 h-5" />
              </button>
            </motion.div>
          )}
          
          {showNotification?.show && (
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 40 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 40 }}
              className={`fixed bottom-10 right-10 z-50 p-6 rounded-3xl shadow-2xl border flex items-center gap-5 ${
                showNotification.type === 'success' ? 'bg-slate-900 text-white border-slate-800' : 'bg-rose-50 text-rose-900 border-rose-200'
              }`}
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ${
                showNotification.type === 'success' ? 'bg-indigo-500 shadow-indigo-500/20' : 'bg-rose-500 shadow-rose-500/20'
              }`}>
                {showNotification.type === 'success' ? <Bell className="w-6 h-6 text-white" /> : <XCircle className="w-6 h-6 text-white" />}
              </div>
              <div>
                <p className="font-bold text-base">{showNotification.type === 'success' ? 'Success' : 'Error'}</p>
                <p className={`text-xs mt-0.5 ${showNotification.type === 'success' ? 'text-slate-400' : 'text-rose-700'}`}>
                  {showNotification.msg}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Main Stats & Charts (8 cols) */}
          <div className="lg:col-span-8 space-y-8">
            {/* Hero Stats Card */}
            <section className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-200/60 overflow-hidden relative">
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-10">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                      <MapPin className="w-3 h-3" />
                      Current Location
                    </div>
                    <h2 className="text-3xl font-bold text-slate-900 tracking-tight">
                      {data ? data.current.name : "Detecting..."}
                    </h2>
                  </div>
                  <button 
                    onClick={handleGeolocation}
                    className="w-12 h-12 bg-slate-50 text-slate-400 hover:text-indigo-600 transition-all rounded-2xl flex items-center justify-center hover:bg-indigo-50 border border-slate-100"
                  >
                    <Navigation className={`w-5 h-5 ${loading ? 'animate-pulse' : ''}`} />
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                      <Thermometer className="w-3 h-3" />
                      Temp
                    </div>
                    <div className="text-4xl font-bold tracking-tighter">
                      {data ? `${Math.round(data.current.main.temp)}°` : "--"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                      <Droplets className="w-3 h-3" />
                      Humidity
                    </div>
                    <div className="text-4xl font-bold tracking-tighter">
                      {data ? `${data.current.main.humidity}%` : "--"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                      <Wind className="w-3 h-3" />
                      Wind
                    </div>
                    <div className="text-4xl font-bold tracking-tighter">
                      {data ? `${data.current.wind.speed}` : "--"}
                      <span className="text-sm font-medium text-slate-400 ml-1">m/s</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-bold uppercase tracking-widest">
                      <Activity className="w-3 h-3" />
                      AQI
                    </div>
                    <div className={`text-4xl font-bold tracking-tighter ${data ? AQI_LEVELS[(data.aqi.list[0]?.main.aqi || 1) - 1].color : ""}`}>
                      {data ? data.aqi.list[0]?.main.aqi : "--"}
                      <span className="text-xs font-bold ml-2 opacity-60">
                        {data ? AQI_LEVELS[(data.aqi.list[0]?.main.aqi || 1) - 1].label : ""}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Background Decoration */}
              <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -mr-32 -mt-32" />
            </section>

            {/* Forecast Chart Card */}
            <section className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-200/60">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">24-Hour Forecast</h3>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-indigo-500 rounded-full" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Temp</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-indigo-200 rounded-full" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Humidity</span>
                  </div>
                </div>
              </div>

              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorTemp" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="time" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }}
                      dy={10}
                    />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      labelStyle={{ fontWeight: 700, marginBottom: '4px' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="temp" 
                      stroke="#4f46e5" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorTemp)" 
                    />
                    <Area 
                      type="monotone" 
                      dataKey="humidity" 
                      stroke="#e2e8f0" 
                      strokeWidth={2}
                      fill="transparent"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Risk Assessment & Advice */}
            <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-200/60">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Risk Profile</h3>
                </div>

                <div className="flex flex-col items-center text-center space-y-4 py-4">
                  <div className={`w-24 h-24 rounded-full flex items-center justify-center ${risk.bgColor} border-4 border-white shadow-xl`}>
                    <span className={`text-2xl font-black ${risk.color}`}>{risk.level}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Current Risk Level</p>
                    <p className="text-xs text-slate-500 mt-1">Based on real-time environmental triggers</p>
                  </div>
                </div>

                <div className="mt-8 space-y-3">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Identified Triggers</p>
                  <div className="flex flex-wrap gap-2">
                    {risk.triggers.map((t, i) => (
                      <span key={i} className="px-4 py-2 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold border border-slate-100">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-200/60">
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
                    <HeartPulse className="w-5 h-5 text-slate-400" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Medical Guidance</h3>
                </div>

                <div className="space-y-4">
                  {risk.advice.map((a, i) => (
                    <div key={i} className="flex gap-4 p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                      <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm">
                        <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed font-medium">{a}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Alerts & Tips (4 cols) */}
          <div className="lg:col-span-4 space-y-8">
            {/* Alert System Card */}
            <section className="bg-slate-900 rounded-[32px] p-8 shadow-2xl shadow-indigo-200 relative overflow-hidden">
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center">
                    <Bell className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white">Alert Network</h3>
                </div>
                
                <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                  Enter your email to receive real-time alerts when environmental triggers reach dangerous levels.
                </p>

                <div className="space-y-4">
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
                    <input 
                      type="email" 
                      placeholder="Enter your email" 
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        if (validateEmail(e.target.value)) checkSubscription(e.target.value);
                      }}
                      className="w-full pl-11 pr-6 py-4 bg-slate-800/50 border border-slate-700 rounded-2xl text-sm text-white placeholder:text-slate-600 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                    />
                  </div>

                  <div className="flex items-center gap-3 px-2">
                    <button 
                      onClick={() => setAutoNotify(!autoNotify)}
                      className={`w-10 h-6 rounded-full transition-colors relative ${autoNotify ? 'bg-indigo-600' : 'bg-slate-700'}`}
                    >
                      <motion.div 
                        animate={{ x: autoNotify ? 18 : 4 }}
                        className="absolute top-1 w-4 h-4 bg-white rounded-full"
                      />
                    </button>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Auto-Notify Harsh Weather</span>
                  </div>
                  
                  <button 
                    onClick={handleNotify}
                    disabled={sendingEmail || risk.level === "Low" || !email}
                    className={`w-full py-4 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-3 ${
                      risk.level === "Low" || !email
                      ? 'bg-slate-800 text-slate-600 cursor-not-allowed' 
                      : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-xl shadow-indigo-600/20 active:scale-95'
                    }`}
                  >
                    {sendingEmail ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                    {isSubscribed ? 'Update & Send Alert' : 'Subscribe & Send Alert'}
                  </button>

                  {isSubscribed && (
                    <button 
                      onClick={handleUnsubscribe}
                      className="w-full py-2 text-rose-500 text-[10px] font-bold uppercase tracking-widest hover:text-rose-400 transition-colors flex items-center justify-center gap-2"
                    >
                      <BellOff className="w-3 h-3" />
                      Opt-out of all alerts
                    </button>
                  )}
                  
                  {lastAlertTime && (
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                        Last sync: {lastAlertTime.toLocaleTimeString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Decorative background element */}
              <div className="absolute -right-12 -bottom-12 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl" />
            </section>

            {/* Health Tips Card */}
            <section className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-200/60">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
                  <ShieldAlert className="w-5 h-5 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Prevention Tips</h3>
              </div>

              <div className="space-y-6">
                <div className="group cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Indoor Air</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">Keep indoor humidity between 30% and 50% to minimize dust mites and mold.</p>
                </div>
                <div className="group cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Exercise</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">Warm up for 10-15 minutes before exercise and check AQI levels before outdoor activity.</p>
                </div>
                <div className="group cursor-pointer">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-indigo-600 uppercase tracking-widest">Medication</span>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed">Always carry your rescue inhaler and follow your prescribed long-term control plan.</p>
                </div>
              </div>
            </section>

            {/* Weather Detail Card */}
            <section className="bg-white rounded-[32px] p-8 shadow-sm border border-slate-200/60">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center">
                  <Cloud className="w-5 h-5 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Sky Conditions</h3>
              </div>
              
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-slate-50 rounded-[24px] flex items-center justify-center">
                  {data ? (
                    <img 
                      src={`https://openweathermap.org/img/wn/${data.current.weather[0].icon}@2x.png`} 
                      alt="weather icon"
                      className="w-16 h-16"
                    />
                  ) : (
                    <Cloud className="w-10 h-10 text-slate-200" />
                  )}
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-900 capitalize">
                    {data ? data.current.weather[0].description : "--"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Visibility: {data ? `${(data.current as any).visibility / 1000}km` : "--"}</p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-slate-200/60 mt-12">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-slate-200 rounded-lg flex items-center justify-center">
              <ShieldAlert className="w-4 h-4 text-slate-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-900">AsthmaGuard Intelligence</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Version 2.1.0 • Enterprise Grade</p>
            </div>
          </div>
          <div className="flex flex-col md:items-end gap-2">
            <p className="text-xs text-slate-400 max-w-md text-center md:text-right leading-relaxed">
              AsthmaGuard uses advanced environmental modeling to predict trigger risks. 
              This is not medical advice. Always consult your physician.
            </p>
            <div className="flex items-center gap-4 mt-2">
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Privacy Policy</span>
              <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Terms of Service</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
