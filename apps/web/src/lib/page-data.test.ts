import assert from "node:assert/strict";
import test from "node:test";
import { bestMatchingEvent, extractJsonScripts, ticketmasterGenres } from "./crawlers/page-data";

test("bestMatchingEvent rejects a same-name event on a different date", () => {
  const match = bestMatchingEvent([{
    name: "Phoenix Suns vs. Golden State Warriors",
    startDate: "2026-10-24T19:00:00-07:00",
    venue: "Mortgage Matchup Center",
    url: "https://example.com/wrong-game",
    lowPrice: 71,
  }], {
    name: "Phoenix Suns vs. Golden State Warriors",
    startsAt: "2026-12-29T02:00:00Z",
    venue: "Mortgage Matchup Center",
  });

  assert.equal(match, undefined);
});

test("bestMatchingEvent keeps a matching event within the timezone tolerance", () => {
  const expected = {
    name: "Phoenix Suns vs. Golden State Warriors",
    startsAt: "2026-12-29T02:00:00Z",
    venue: "Mortgage Matchup Center",
  };
  const matching = {
    name: expected.name,
    startDate: "2026-12-28T19:00:00-07:00",
    venue: expected.venue,
    url: "https://example.com/right-game",
    lowPrice: 89,
  };

  assert.equal(bestMatchingEvent([
    {
      ...matching,
      startDate: "2026-10-24T19:00:00-07:00",
      url: "https://example.com/wrong-game",
      lowPrice: 71,
    },
    matching,
  ], expected), matching);
});

test("ticketmasterGenres prefers the artist's specific subgenre from digitalData", () => {
  const html = `<script id="digitalData">window.digitalData=${JSON.stringify({
    page: {
      attributes: {
        discovery: {
          attraction: [{
            classifications: {
              genre: { id: "genre-pop", name: "Pop" },
              subGenre: { id: "subgenre-kpop", name: "K-Pop" },
            },
          }],
        },
      },
    },
  })}</script>`;

  assert.deepEqual(ticketmasterGenres(extractJsonScripts(html)), ["K-Pop", "Pop"]);
});
