/**
 * Weather client using Open-Meteo API (free, no API key required)
 * https://open-meteo.com/
 */

export interface GameWeatherData {
  temperature: number; // Fahrenheit
  windSpeed: number; // MPH
  windDirection: string; // Cardinal direction
  precipitation: number; // Probability 0-1
  condition: string; // Clear, Cloudy, Rain, Snow, etc.
  isDome: boolean;
}

export interface StadiumInfo {
  name: string;
  team: string;
  lat: number;
  lon: number;
  isDome: boolean;
}

// NFL Stadium coordinates and dome status
export const NFL_STADIUMS: Record<string, StadiumInfo> = {
  // AFC
  BUF: { name: "Highmark Stadium", team: "BUF", lat: 42.7738, lon: -78.787, isDome: false },
  MIA: { name: "Hard Rock Stadium", team: "MIA", lat: 25.958, lon: -80.2389, isDome: false },
  NE: { name: "Gillette Stadium", team: "NE", lat: 42.0909, lon: -71.2643, isDome: false },
  NYJ: { name: "MetLife Stadium", team: "NYJ", lat: 40.8128, lon: -74.0742, isDome: false },
  BAL: { name: "M&T Bank Stadium", team: "BAL", lat: 39.278, lon: -76.6227, isDome: false },
  CIN: { name: "Paycor Stadium", team: "CIN", lat: 39.0954, lon: -84.516, isDome: false },
  CLE: { name: "Cleveland Browns Stadium", team: "CLE", lat: 41.506, lon: -81.6996, isDome: false },
  PIT: { name: "Acrisure Stadium", team: "PIT", lat: 40.4468, lon: -80.0158, isDome: false },
  HOU: { name: "NRG Stadium", team: "HOU", lat: 29.6847, lon: -95.4107, isDome: true },
  IND: { name: "Lucas Oil Stadium", team: "IND", lat: 39.7601, lon: -86.1639, isDome: true },
  JAX: { name: "TIAA Bank Field", team: "JAX", lat: 30.324, lon: -81.6373, isDome: false },
  TEN: { name: "Nissan Stadium", team: "TEN", lat: 36.1665, lon: -86.7713, isDome: false },
  DEN: { name: "Empower Field", team: "DEN", lat: 39.7439, lon: -105.02, isDome: false },
  KC: { name: "GEHA Field at Arrowhead", team: "KC", lat: 39.0489, lon: -94.4839, isDome: false },
  LV: { name: "Allegiant Stadium", team: "LV", lat: 36.0909, lon: -115.1833, isDome: true },
  LAC: { name: "SoFi Stadium", team: "LAC", lat: 33.9535, lon: -118.3392, isDome: true },

  // NFC
  DAL: { name: "AT&T Stadium", team: "DAL", lat: 32.7473, lon: -97.0945, isDome: true },
  NYG: { name: "MetLife Stadium", team: "NYG", lat: 40.8128, lon: -74.0742, isDome: false },
  PHI: { name: "Lincoln Financial Field", team: "PHI", lat: 39.9008, lon: -75.1675, isDome: false },
  WAS: { name: "FedExField", team: "WAS", lat: 38.9076, lon: -76.8645, isDome: false },
  CHI: { name: "Soldier Field", team: "CHI", lat: 41.8623, lon: -87.6167, isDome: false },
  DET: { name: "Ford Field", team: "DET", lat: 42.34, lon: -83.0456, isDome: true },
  GB: { name: "Lambeau Field", team: "GB", lat: 44.5013, lon: -88.0622, isDome: false },
  MIN: { name: "U.S. Bank Stadium", team: "MIN", lat: 44.9736, lon: -93.2575, isDome: true },
  ATL: { name: "Mercedes-Benz Stadium", team: "ATL", lat: 33.7554, lon: -84.401, isDome: true },
  CAR: { name: "Bank of America Stadium", team: "CAR", lat: 35.2258, lon: -80.8528, isDome: false },
  NO: { name: "Caesars Superdome", team: "NO", lat: 29.9511, lon: -90.0812, isDome: true },
  TB: { name: "Raymond James Stadium", team: "TB", lat: 27.9759, lon: -82.5033, isDome: false },
  ARI: { name: "State Farm Stadium", team: "ARI", lat: 33.5276, lon: -112.2626, isDome: true },
  LAR: { name: "SoFi Stadium", team: "LAR", lat: 33.9535, lon: -118.3392, isDome: true },
  SF: { name: "Levi's Stadium", team: "SF", lat: 37.4033, lon: -121.9694, isDome: false },
  SEA: { name: "Lumen Field", team: "SEA", lat: 47.5952, lon: -122.3316, isDome: false },
};

// Wind direction degrees to cardinal
function degreesToCardinal(degrees: number): string {
  const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

// Weather codes to conditions (WMO codes used by Open-Meteo)
function weatherCodeToCondition(code: number): string {
  if (code === 0) return "Clear";
  if (code <= 3) return "Cloudy";
  if (code <= 49) return "Fog";
  if (code <= 59) return "Drizzle";
  if (code <= 69) return "Rain";
  if (code <= 79) return "Snow";
  if (code <= 99) return "Thunderstorm";
  return "Unknown";
}

/**
 * Fetch weather forecast for a stadium at a specific time
 */
export async function fetchStadiumWeather(
  homeTeam: string,
  gameTime: Date
): Promise<GameWeatherData | null> {
  const stadium = NFL_STADIUMS[homeTeam];
  if (!stadium) {
    console.warn(`No stadium found for team: ${homeTeam}`);
    return null;
  }

  // If dome stadium, return controlled conditions
  if (stadium.isDome) {
    return {
      temperature: 72,
      windSpeed: 0,
      windDirection: "N/A",
      precipitation: 0,
      condition: "Dome",
      isDome: true,
    };
  }

  try {
    // Open-Meteo API - free, no key required
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", stadium.lat.toString());
    url.searchParams.set("longitude", stadium.lon.toString());
    url.searchParams.set(
      "hourly",
      "temperature_2m,precipitation_probability,weathercode,windspeed_10m,winddirection_10m"
    );
    url.searchParams.set("temperature_unit", "fahrenheit");
    url.searchParams.set("windspeed_unit", "mph");
    url.searchParams.set("timezone", "America/New_York");

    const response = await fetch(url.toString(), {
      next: { revalidate: 1800 }, // Cache for 30 minutes
    });

    if (!response.ok) {
      console.error(`Weather API error: ${response.status}`);
      return null;
    }

    const data = await response.json();

    // Find the hour closest to game time
    const gameHour = gameTime.toISOString().slice(0, 13) + ":00";
    const hourIndex = data.hourly.time.findIndex((t: string) =>
      t.startsWith(gameHour.slice(0, 13))
    );

    if (hourIndex === -1) {
      // If exact hour not found, use the first available hour
      console.warn(`Could not find weather for game time ${gameTime}, using first available`);
      return {
        temperature: Math.round(data.hourly.temperature_2m[0]),
        windSpeed: Math.round(data.hourly.windspeed_10m[0]),
        windDirection: degreesToCardinal(data.hourly.winddirection_10m[0]),
        precipitation: data.hourly.precipitation_probability[0] / 100,
        condition: weatherCodeToCondition(data.hourly.weathercode[0]),
        isDome: false,
      };
    }

    return {
      temperature: Math.round(data.hourly.temperature_2m[hourIndex]),
      windSpeed: Math.round(data.hourly.windspeed_10m[hourIndex]),
      windDirection: degreesToCardinal(data.hourly.winddirection_10m[hourIndex]),
      precipitation: data.hourly.precipitation_probability[hourIndex] / 100,
      condition: weatherCodeToCondition(data.hourly.weathercode[hourIndex]),
      isDome: false,
    };
  } catch (error) {
    console.error("Error fetching weather:", error);
    return null;
  }
}

/**
 * Get weather icon based on conditions
 */
export function getWeatherIcon(weather: GameWeatherData): string {
  if (weather.isDome) return "🏟️";
  if (weather.condition === "Clear") return "☀️";
  if (weather.condition === "Cloudy") return "☁️";
  if (weather.condition === "Rain" || weather.condition === "Drizzle") return "🌧️";
  if (weather.condition === "Snow") return "❄️";
  if (weather.condition === "Thunderstorm") return "⛈️";
  if (weather.condition === "Fog") return "🌫️";
  return "🌤️";
}

/**
 * Get weather impact description for fantasy
 */
export function getWeatherImpact(weather: GameWeatherData): {
  level: "none" | "low" | "medium" | "high";
  description: string;
} {
  if (weather.isDome) {
    return { level: "none", description: "Dome - no weather impact" };
  }

  // Check for significant weather factors
  const factors: string[] = [];
  type ImpactLevel = "none" | "low" | "medium" | "high";
  let impactLevel: ImpactLevel = "none";

  // Helper to upgrade impact level
  const upgradeLevel = (current: ImpactLevel, target: ImpactLevel): ImpactLevel => {
    const levels = { none: 0, low: 1, medium: 2, high: 3 };
    return levels[target] > levels[current] ? target : current;
  };

  // Wind impact
  if (weather.windSpeed >= 20) {
    impactLevel = "high";
    factors.push(`High winds (${weather.windSpeed} mph)`);
  } else if (weather.windSpeed >= 15) {
    impactLevel = upgradeLevel(impactLevel, "medium");
    factors.push(`Moderate winds (${weather.windSpeed} mph)`);
  }

  // Temperature impact
  if (weather.temperature <= 32) {
    impactLevel = upgradeLevel(impactLevel, "medium");
    factors.push(`Freezing (${weather.temperature}°F)`);
  } else if (weather.temperature <= 40) {
    impactLevel = upgradeLevel(impactLevel, "low");
    factors.push(`Cold (${weather.temperature}°F)`);
  }

  // Precipitation impact
  if (weather.precipitation >= 0.5) {
    impactLevel = upgradeLevel(impactLevel, "medium");
    factors.push(`${Math.round(weather.precipitation * 100)}% chance of precipitation`);
  } else if (weather.precipitation >= 0.3) {
    impactLevel = upgradeLevel(impactLevel, "low");
    factors.push(`${Math.round(weather.precipitation * 100)}% chance of precipitation`);
  }

  // Snow/thunderstorm are high impact
  if (weather.condition === "Snow" || weather.condition === "Thunderstorm") {
    impactLevel = "high";
    factors.push(weather.condition);
  }

  if (factors.length === 0) {
    return { level: "none", description: "Good conditions" };
  }

  return {
    level: impactLevel,
    description: factors.join(", "),
  };
}
