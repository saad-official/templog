import { convert, displayTemp, formatTemp, roundTenth, toC, toF, toStoredF } from "./units";

describe("roundTenth", () => {
  it("rounds to one decimal", () => {
    expect(roundTenth(21.111)).toBe(21.1);
    expect(roundTenth(73.888)).toBe(73.9);
  });
  it("rounds halves away from zero", () => {
    expect(roundTenth(0.25)).toBe(0.3);
    expect(roundTenth(-0.25)).toBe(-0.3);
    expect(roundTenth(36.65)).toBe(36.7);
  });
  it("never returns negative zero", () => {
    expect(Object.is(roundTenth(-0.04), 0)).toBe(true);
  });
});

describe("toF / toC", () => {
  it("converts the Food Code limits exactly", () => {
    expect(toC(41)).toBe(5);
    expect(toC(135)).toBe(57.2);
    expect(toC(165)).toBe(73.9);
    expect(toC(70)).toBe(21.1);
    expect(toC(0)).toBe(-17.8);
    expect(toC(32)).toBe(0);
  });
  it("converts Celsius to Fahrenheit to 0.1", () => {
    expect(toF(5)).toBe(41);
    expect(toF(100)).toBe(212);
    expect(toF(-40)).toBe(-40);
    expect(toF(4.4)).toBe(39.9);
    expect(toF(57.25)).toBe(135.1);
  });
});

describe("convert", () => {
  it("is a rounded identity for the same unit", () => {
    expect(convert(40.04, "F", "F")).toBe(40);
    expect(convert(5, "C", "C")).toBe(5);
  });
  it("converts between units", () => {
    expect(convert(41, "F", "C")).toBe(5);
    expect(convert(5, "C", "F")).toBe(41);
  });
});

describe("toStoredF / displayTemp", () => {
  it("stores a reading typed in either unit as °F", () => {
    expect(toStoredF(38, "F")).toBe(38);
    expect(toStoredF(3, "C")).toBe(37.4);
  });
  it("shows a stored °F value in the display unit", () => {
    expect(displayTemp(41, "F")).toBe(41);
    expect(displayTemp(41, "C")).toBe(5);
  });
  it("round-trips a Celsius entry through storage", () => {
    for (const c of [-18, -0.5, 0, 3.3, 4.4, 5, 21.1, 57.2, 63.7, 73.9]) {
      expect(displayTemp(toStoredF(c, "C"), "C")).toBe(c);
    }
  });
});

describe("formatTemp", () => {
  it("formats with the unit and drops a trailing .0 by default", () => {
    expect(formatTemp(41, "F")).toBe("41 °F");
    expect(formatTemp(40.5, "F")).toBe("40.5 °F");
    expect(formatTemp(5, "C")).toBe("5 °C");
  });
  it("rounds to a tenth by default", () => {
    expect(formatTemp(21.111, "C")).toBe("21.1 °C");
  });
  it("honours fixed digits", () => {
    expect(formatTemp(41, "F", { digits: 1 })).toBe("41.0 °F");
    expect(formatTemp(40.56, "F", { digits: 0 })).toBe("41 °F");
  });
  it("formats negatives without a negative zero", () => {
    expect(formatTemp(-17.8, "C")).toBe("-17.8 °C");
    expect(formatTemp(-0.01, "F")).toBe("0 °F");
  });
});
