import express from "express";
import axios from "axios";
import { Resend } from "resend";
import dotenv from "dotenv";
import { sql } from "@vercel/postgres";

dotenv.config();

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function initDB() {
  if (process.env.POSTGRES_URL) {
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS subscriptions (
          email VARCHAR(255) PRIMARY KEY,
          auto_notify BOOLEAN DEFAULT TRUE,
          last_notified_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;
      console.log("Vercel Postgres connected");
    } catch (err) {
      console.error("Vercel Postgres init failed:", err);
    }
    return;
  }

  try {
    const sqlite = await import("better-sqlite3");
    const Database: any = (sqlite as any).default ?? sqlite;
    const db = new Database("asthmaguard.db");
    db.exec(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        email TEXT PRIMARY KEY,
        auto_notify INTEGER DEFAULT 1,
        last_notified_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log("Local SQLite connected");
    return db;
  } catch (err) {
    console.warn("SQLite not available. Using mock DB.");
    return null;
  }
}

let localDb: any = null;
initDB()
  .then((db) => {
    localDb = db;
  })
  .catch((err) => {
    console.error("DB init failed:", err);
    localDb = null;
  });

async function getSubscription(email: string) {
  if (process.env.POSTGRES_URL) {
    try {
      const { rows } = await sql`SELECT * FROM subscriptions WHERE email = ${email}`;
      return rows[0] ? { ...rows[0], auto_notify: rows[0].auto_notify } : null;
    } catch (err) {
      console.error("Postgres read error:", err);
      return null;
    }
  }

  if (localDb) {
    return localDb.prepare("SELECT * FROM subscriptions WHERE email = ?").get(email);
  }

  return null;
}

async function upsertSubscription(email: string, autoNotify: boolean) {
  if (process.env.POSTGRES_URL) {
    try {
      await sql`
        INSERT INTO subscriptions (email, auto_notify)
        VALUES (${email}, ${autoNotify})
        ON CONFLICT (email)
        DO UPDATE SET auto_notify = ${autoNotify};
      `;
    } catch (err) {
      console.error("Postgres write error:", err);
    }
    return;
  }

  if (localDb) {
    const upsert = localDb.prepare(`
      INSERT INTO subscriptions (email, auto_notify)
      VALUES (?, ?)
      ON CONFLICT(email) DO UPDATE SET auto_notify = excluded.auto_notify
    `);
    upsert.run(email, autoNotify ? 1 : 0);
  }
}

async function deleteSubscription(email: string) {
  if (process.env.POSTGRES_URL) {
    await sql`DELETE FROM subscriptions WHERE email = ${email}`;
    return;
  }

  if (localDb) {
    localDb.prepare("DELETE FROM subscriptions WHERE email = ?").run(email);
  }
}

const api = express.Router();

api.get("/weather", async (req, res) => {
  const { lat, lon } = req.query;
  if (!lat || !lon) {
    return res.status(400).json({ error: "Latitude and longitude are required" });
  }

  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (apiKey) {
      const [weatherRes, forecastRes, aqiRes] = await Promise.all([
        axios.get(`https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`),
        axios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`),
        axios.get(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`),
      ]);

      return res.json({
        current: weatherRes.data,
        forecast: forecastRes.data,
        aqi: aqiRes.data,
      });
    }

    return res.json({
      current: {
        main: { temp: 18, humidity: 45, pressure: 1015 },
        weather: [{ main: "Clear", description: "clear sky", icon: "01d" }],
        name: "Demo City (No API Key)",
        wind: { speed: 3.2 },
        visibility: 10000,
      },
      forecast: {
        list: Array.from({ length: 5 }).map((_, i) => ({
          dt: Date.now() / 1000 + i * 86400,
          main: { temp: 18 + i, humidity: 45 },
          weather: [{ main: "Clear" }],
        })),
      },
      aqi: {
        list: [{ main: { aqi: 1 } }],
      },
    });
  } catch (error: any) {
    console.error("Weather API error:", error.response?.data || error.message);
    const status = error.response?.status || 500;
    const message = error.response?.data?.message || "Failed to fetch weather data";
    return res.status(status).json({ error: message });
  }
});

api.get("/weather/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "City name is required" });

  try {
    const apiKey = process.env.OPENWEATHER_API_KEY;
    if (!apiKey) {
      return res.status(400).json({ error: "Search requires an OpenWeather API Key" });
    }

    const response = await axios.get(
      `https://api.openweathermap.org/data/2.5/weather?q=${q}&appid=${apiKey}&units=metric`,
    );
    const { lat, lon } = response.data.coord;

    const [forecastRes, aqiRes] = await Promise.all([
      axios.get(`https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`),
      axios.get(`https://api.openweathermap.org/data/2.5/air_pollution?lat=${lat}&lon=${lon}&appid=${apiKey}`),
    ]);

    return res.json({
      current: response.data,
      forecast: forecastRes.data,
      aqi: aqiRes.data,
    });
  } catch (error: any) {
    console.error("Weather Search error:", error.response?.data || error.message);
    const status = error.response?.status || 404;
    const message = error.response?.data?.message || "City not found";
    return res.status(status).json({ error: message });
  }
});

api.get("/subscription/:email", async (req, res) => {
  const { email } = req.params;
  try {
    const row = await getSubscription(email);
    return res.json({ subscribed: !!row, autoNotify: row ? !!row.auto_notify : false });
  } catch {
    return res.json({ subscribed: false, autoNotify: false, error: "Database unavailable" });
  }
});

api.post("/unsubscribe", async (req, res) => {
  const { email } = req.body;
  try {
    await deleteSubscription(email);
    return res.json({ success: true, message: "Unsubscribed successfully" });
  } catch {
    return res.status(500).json({ error: "Database error" });
  }
});

api.post("/notify", async (req, res) => {
  const { message, subject, toEmail, saveEmail, autoNotify } = req.body;

  if (!toEmail || !emailRegex.test(toEmail)) {
    return res.status(400).json({ error: "Please provide a valid email address." });
  }

  if (saveEmail) {
    try {
      await upsertSubscription(toEmail, autoNotify);
    } catch (err) {
      console.error("Failed to save subscription:", err);
    }
  }

  if (!resend) {
    return res.json({
      success: true,
      message: "Notification simulated (RESEND_API_KEY missing)",
      simulated: true,
    });
  }

  try {
    const fromEmail = process.env.EMAIL_FROM || "AsthmaGuard <onboarding@resend.dev>";
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject,
      html: message,
    });

    if (error) {
      if (error.message.includes("onboarding")) {
        return res.status(403).json({
          error: "Resend Onboarding Limit: You can only send emails to your own verified address while in onboarding mode.",
        });
      }
      return res.status(500).json({ error: error.message || "Failed to send email" });
    }

    return res.json({ success: true, data });
  } catch (err: any) {
    console.error("Notification error:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

const app = express();
app.use(express.json());
app.use("/api", api);
app.use(api);

export default app;
