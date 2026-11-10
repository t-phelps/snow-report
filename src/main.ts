import dotenv from "dotenv";
dotenv.config();
import { Temporal } from "temporal-polyfill";
import { fetchWeatherApi } from "openmeteo";
import nodemailer from "nodemailer";

const params = {
  latitude: 36.2064,
  longitude: -81.8831,
  forecast_days: 14,
  daily: "snowfall_sum",
  timezone: "America/New_York",
  precipitation_unit: "inch",
};

const url = "https://api.open-meteo.com/v1/forecast";
const responses = await fetchWeatherApi(url, params);

const response = responses[0];
if (!response) {
  throw new Error("Something went wrong");
}

const latitude = response.latitude();
const longitude = response.longitude();
const daily = response.daily();

console.log(`Latitude: ${latitude} \nLongitude: ${longitude}`);

if (!daily) {
  throw new Error("No daily data in response");
}

const timezone = response.timezone() ?? "UTC";
const start = Number(daily.time());
const interval = daily.interval();

const snowfall = daily.variables(0)?.valuesArray();

// 1. Define alert priority levels using 'as const'
const ALERT_PRIORITY = {
  "REGULAR DAY": 1,
  "HEADS UP": 2,
  "CALL OUT": 3,
} as const;

// 2. Extract the strict type mapping to ensure compiler safety
type AlertLevel = keyof typeof ALERT_PRIORITY;

// 3. Bind the tracking variable to our strict AlertLevel union
let highestAlert: AlertLevel = "REGULAR DAY";
const daysThatMatter: string[][] = [];

snowfall?.forEach((inches, i) => {
  const date = Temporal.Instant.fromEpochMilliseconds(
    (start + i * interval) * 1000,
  )
    .toZonedDateTimeISO(timezone)
    .toPlainDate();

  const formattedInches = inches.toFixed(1);
  const dayMatters: boolean = Number(formattedInches) > 1;
  const currentDayAlert = snowAlert(inches);

  // Track the highest alert level encountered across all days
  if (ALERT_PRIORITY[currentDayAlert] > ALERT_PRIORITY[highestAlert]) {
    highestAlert = currentDayAlert;
  }

  if (dayMatters) {
    console.log(`${date.toString()}  ${formattedInches} in`);
    daysThatMatter.push([date.toString(), `${formattedInches} in`]);
  }
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "timothy.phelps.dev@gmail.com",
    pass: process.env.GOOGLE_APP_PASSWORD,
  },
});

try {
  const info = await transporter.sendMail({
    from: "timothy.phelps.dev@gmail.com",
    to: "cattlesnorman@gmail.com, timothy.phelps.dev@gmail.com",
    subject: highestAlert,
    text:
      daysThatMatter.length > 0
        ? daysThatMatter.map((row) => row.join(": ")).join("\n")
        : "No significant snowfall forecast for the next 14 days.",
  });

  console.log("Message sent: %s", info.messageId);
} catch (err) {
  console.error("Error while sending mail:", err);
}

// 4. Declare the explicit return type matching our lookup object
function snowAlert(inches: number): AlertLevel {
  if (inches >= 6) return "CALL OUT";
  if (inches >= 2) return "HEADS UP";
  return "REGULAR DAY";
}
