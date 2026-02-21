import express from "express";
import axios from "axios";
import { Resend } from "resend";
import Database from "better-sqlite3";
import dotenv from "dotenv";
import path from "path";

dotenv.config();

const app = express();
app.use(express.json());

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Initialize Database
let db: any;
try {
  // Only try to initialize DB if not in Vercel environment or if we want to try anyway
  // In Vercel serverless, writing to files is not supported in the function directory
  // We wrap this in a try-catch to ensure the API doesn't crash
  db = new Database("asthmaguard.db", { verbose: console.log });
  db.exec(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      email TEXT PRIMARY KEY,
      auto_notify INTEGER DEFAULT 1,
      last_notified_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
} catch (err) {
  console.warn("Database initialization failed (running in serverless/read-only mode). Subscriptions will not persist.", err);
  // Create a mock db object to prevent crashes
  db = {
    prepare: () => ({
      get: () => null,
      run: () => {},
      all: () => []
    }),
    exec: () => {}
  };
}

// --- API Routes ---
const api = express.Router();

// Weather by coordinates
api.get("/weather", async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: "Latitude and longitude are required" });
  }

  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (apiKey) {
      // Fetch Current Weather, Forecast, and AQI in parallel
      const [weatherRes, forecastRes, aqiRes] = await Promise.all([
        axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`),
        axios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`),
        axios.get(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`)
      ]);

      res.json({
        current: weatherRes.data,
        forecast: forecastRes.data,
        aqi: aqiRes.data
      });
    } else {
      // Mock data for demonstration if no API key is provided
      res.json({
        current: {
          main: { temp: 18, humidity: 45, pressure: 1015 },
          weather: [{ main: "Clear", description: "clear sky" }],
          name: "Demo City (No API Key)",
          wind: { speed: 3.2 },
        },
        forecast: {
          list: Array.from({ length: 5 }).map((_, i) => ({
            dt: Date.now() / 1000 + i * 86400,
            main: { temp: 18 + i, humidity: 45 },
            weather: [{ main: "Clear" }]
          }))
        },
        aqi: {
          list: [{ main: { aqi: 1 } }]
        }
      });
    }
  } catch (error: any) {
    console.error("Weather API error:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || "Failed to fetch weather data";
    res.status(status).json({ error: message });
  }
});

// Weather by city name
api.get("/weather/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "City name is required" });

  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (apiKey) {
      const response = await axios.get(
        `https://api.openweathermap.org/data/2.5/weather?q=${q}&appid=${apiKey}&units=metric`
      );
      const { lat, lon } = response.data.coord;
      
      // Now fetch full data using coordinates
      const [forecastRes, aqiRes] = await Promise.all([
        axios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`),
        axios.get(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`)
      ]);

      res.json({
        current: response.data,
        forecast: forecastRes.data,
        aqi: aqiRes.data
      });
    } else {
      res.status(400).json({ error: "Search requires an OpenWeather API Key" });
    }
  } catch (error: any) {
    console.error("Weather Search error:", error.response?.data || error.message);
    const status = error.response?.status || 404;
    const message = error.response?.data?.message || "City not found";
    res.status(status).json({ error: message });
  }
});

// Subscription Management
api.get("/subscription/:email", (req, res) => {
  const { email } = req.params;
  try {
    const row = db.prepare("SELECT * FROM subscriptions WHERE email = ?").get(email) as any;
    res.json({ subscribed: !!row, autoNotify: row ? !!row.auto_notify : false });
  } catch (err) {
    res.json({ subscribed: false, autoNotify: false, error: "Database unavailable" });
  }
});

api.post("/unsubscribe", (req, res) => {
  const { email } = req.body;
  try {
    db.prepare("DELETE FROM subscriptions WHERE email = ?").run(email);
    res.json({ success: true, message: "Unsubscribed successfully" });
  } catch (err: any) {
    res.status(500).json({ error: "Database error" });
  }
});

// Real email notification using Resend
api.post("/notify", async (req, res) => {
  const { message, subject, toEmail, saveEmail, autoNotify } = req.body;

  if (!toEmail || !emailRegex.test(toEmail)) {
    return res.status(400).json({ error: "Please provide a valid email address." });
  }

  // Save/Update subscription if requested
  if (saveEmail) {
    try {
      const upsert = db.prepare(`
        INSERT INTO subscriptions (email, auto_notify) 
        VALUES (?, ?) 
        ON CONFLICT(email) DO UPDATE SET auto_notify = excluded.auto_notify
      `);
      upsert.run(toEmail, autoNotify ? 1 : 0);
    } catch (err) {
      console.error("Failed to save subscription:", err);
    }
  }

  if (!resend) {
    console.log("[MOCK NOTIFICATION] Resend API Key missing.");
    return res.json({ 
      success: true, 
      message: "Notification simulated (RESEND_API_KEY missing)",
      simulated: true 
    });
  }

  try {
    const fromEmail = process.env.EMAIL_FROM || "AsthmaGuard <onboarding@resend.dev>";
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: subject,
      html: message,
    });

    if (error) {
      console.error("Resend error:", error);
      // Provide more helpful error messages for Resend onboarding limits
      if (error.message.includes("onboarding")) {
        return res.status(403).json({ 
          error: "Resend Onboarding Limit: You can only send emails to your own verified address while in onboarding mode." 
        });
      }
      return res.status(500).json({ error: error.message || "Failed to send email" });
    }

    res.json({ success: true, data });
  } catch (err: any) {
    console.error("Notification error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Export the router as default
export default api;
