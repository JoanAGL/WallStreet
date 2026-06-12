import { describe, it, expect } from "vitest";
import { classifyRegime, classifyRegimeSafe, REGIME_BIAS } from "@/services/quantitativeService";

describe("classifyRegime — las 6 ramas (issue #49)", () => {
  it("HIGH_VOLATILITY cuando GARCH anualizada > 0.40 (prioridad máxima)", () => {
    expect(classifyRegime(0.7, 60, 1, 0.41)).toBe("HIGH_VOLATILITY");
    // domina sobre cualquier señal de tendencia
    expect(classifyRegime(0.9, 90, 1, 0.50)).toBe("HIGH_VOLATILITY");
  });

  it("HIGH_VOLATILITY también con pico de volumen > 3×", () => {
    expect(classifyRegime(0.5, 50, 3.1, 0.25)).toBe("HIGH_VOLATILITY");
  });

  it("VOLATILITY_CRUSH cuando GARCH anualizada < 0.15", () => {
    expect(classifyRegime(0.5, 50, 1, 0.14)).toBe("VOLATILITY_CRUSH");
    expect(classifyRegime(0.7, 60, 1, 0.05)).toBe("VOLATILITY_CRUSH");
  });

  it("TRENDING_BULL cuando hurst > 0.6 y RSI > 55", () => {
    expect(classifyRegime(0.61, 56, 1, 0.25)).toBe("TRENDING_BULL");
  });

  it("TRENDING_BEAR cuando hurst > 0.6 y RSI < 45", () => {
    expect(classifyRegime(0.61, 44, 1, 0.25)).toBe("TRENDING_BEAR");
  });

  it("MEAN_REVERTING cuando hurst < 0.45", () => {
    expect(classifyRegime(0.44, 50, 1, 0.25)).toBe("MEAN_REVERTING");
  });

  it("RANDOM_WALK en el resto de casos", () => {
    expect(classifyRegime(0.5, 50, 1, 0.25)).toBe("RANDOM_WALK");
    // hurst alto pero RSI neutro (45–55) no es tendencia
    expect(classifyRegime(0.7, 50, 1, 0.25)).toBe("RANDOM_WALK");
  });

  it("valores frontera exactos no disparan la rama (umbrales estrictos)", () => {
    expect(classifyRegime(0.5, 50, 1, 0.40)).toBe("RANDOM_WALK");      // == 0.40 no es HIGH_VOL
    expect(classifyRegime(0.5, 50, 1, 0.15)).toBe("RANDOM_WALK");      // == 0.15 no es CRUSH
    expect(classifyRegime(0.6, 60, 1, 0.25)).toBe("RANDOM_WALK");      // == 0.6 no es trending
    expect(classifyRegime(0.61, 55, 1, 0.25)).toBe("RANDOM_WALK");     // == 55 no es bull
    expect(classifyRegime(0.61, 45, 1, 0.25)).toBe("RANDOM_WALK");     // == 45 no es bear
    expect(classifyRegime(0.45, 50, 1, 0.25)).toBe("RANDOM_WALK");     // == 0.45 no es mean-rev
    expect(classifyRegime(0.5, 50, 3, 0.25)).toBe("RANDOM_WALK");      // == 3 no es vol spike
  });
});

describe("classifyRegimeSafe — tolerancia a datos ausentes", () => {
  it("null si faltan Hurst o RSI", () => {
    expect(classifyRegimeSafe(null, 50, 1, 25)).toBeNull();
    expect(classifyRegimeSafe(0.5, null, 1, 25)).toBeNull();
  });

  it("asume volumen normal y GARCH neutra cuando faltan", () => {
    expect(classifyRegimeSafe(0.61, 60, null, null)).toBe("TRENDING_BULL");
  });

  it("convierte la GARCH de % (volatility30d) a fracción", () => {
    expect(classifyRegimeSafe(0.5, 50, 1, 41)).toBe("HIGH_VOLATILITY");  // 41% → 0.41
    expect(classifyRegimeSafe(0.5, 50, 1, 14)).toBe("VOLATILITY_CRUSH"); // 14% → 0.14
  });
});

describe("REGIME_BIAS", () => {
  it("define un sesgo para cada uno de los 6 regímenes", () => {
    const states = ["TRENDING_BULL", "TRENDING_BEAR", "MEAN_REVERTING", "RANDOM_WALK", "HIGH_VOLATILITY", "VOLATILITY_CRUSH"] as const;
    for (const st of states) {
      expect(REGIME_BIAS[st]).toBeTruthy();
      // sesgo corto (~15 tokens): nunca más de 80 caracteres
      expect(REGIME_BIAS[st].length).toBeLessThan(80);
    }
  });
});
