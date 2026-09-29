import assert from "node:assert/strict";
import test from "node:test";
import { cityFromReverseGeocode } from "./location.js";

test("cityFromReverseGeocode prefers the city and falls back to locality", () => {
  assert.equal(cityFromReverseGeocode({ city: " Los Angeles ", locality: "Hollywood" }), "Los Angeles");
  assert.equal(cityFromReverseGeocode({ locality: "Pasadena" }), "Pasadena");
});

test("cityFromReverseGeocode rejects invalid labels", () => {
  assert.equal(cityFromReverseGeocode(undefined), undefined);
  assert.equal(cityFromReverseGeocode({ city: " " }), undefined);
  assert.equal(cityFromReverseGeocode({ city: "x".repeat(121) }), undefined);
});
