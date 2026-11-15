// server.js: Express server for Yatzy.
// The server OWNS the game: dice rolls, holds, score calculation and round
// progress all happen here. The browser only sends actions and draws the
// state the server sends back.

const express = require("express");
const path = require("path");
const { randomUUID } = require("crypto");
const { YatzyGame, TOTAL_ROUNDS, MAX_ROLLS_PER_TURN } = require("./game/yatzy_game");

const app = express();
const PORT = process.env.PORT || 3000;

/* Game state storage (in memory)  */

// id -> { game: YatzyGame, touched: timestamp }
const games = new Map();
const GAME_TTL_MS = 2 * 60 * 60 * 1000; // forget games idle for 2 hours

// Periodically drop abandoned games so memory doesn't grow forever.
// unref() lets the process exit (e.g. in tests) even with the timer active.
setInterval(() => {
    const cutoff = Date.now() - GAME_TTL_MS;
    for (const [id, entry] of games) {
        if (entry.touched < cutoff) games.delete(id);
    }
}, 10 * 60 * 1000).unref();

/*  Helpers  */

// Sends a JSON error: { error: "message" }
const fail = (res, status, message) => res.status(status).json({ error: message });

// Builds the JSON the client needs to draw the whole UI.
// "potentialScores" holds what each still-open category would score with the
// current dice, so the client never has to know the scoring rules.
function toState(id, game) {
    const { engine, dice } = game;
    const potentialScores = {};
    if (game.rollsUsed > 0 && !game.isGameOver) {
        for (const category of Object.keys(engine.scoreTable)) {
            if (engine.scoreTable[category] === null) {
                potentialScores[category] = engine.calculateScore(category, dice.values);
            }
        }
    }
    return {
        id,
        currentRound: game.currentRound,
        totalRounds: TOTAL_ROUNDS,
        rollsUsed: game.rollsUsed,
        maxRolls: MAX_ROLLS_PER_TURN,
        isGameOver: game.isGameOver,
        dice: { values: [...dice.values], held: [...dice.held] },
        scoreTable: { ...engine.scoreTable },
        potentialScores,
        upperTotal: engine.getUpperTotal(),
        bonus: engine.getBonus(),
        lowerTotal: engine.getLowerTotal(),
        totalScore: game.totalScore,
        bestScore: game.bestScore,
        result: game.result,
    };
}

/* Middleware  */

app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // serves the client

// Looks up :id once for every route that has it, and attaches the game to req
app.param("id", (req, res, next, id) => {
    const entry = games.get(id);
    if (!entry) return fail(res, 404, "Game not found. Start a new game.");
    entry.touched = Date.now();
    req.gameId = id;
    req.game = entry.game;
    next();
});

/* ---------- API routes ---------- */

// POST /api/games : create a new game
app.post("/api/games", (req, res) => {
    const id = randomUUID();
    const game = new YatzyGame();
    game.startNewGame();
    games.set(id, { game, touched: Date.now() });
    res.status(201).location(`/api/games/${id}`).json(toState(id, game));
});

// GET /api/games/:id : read the current state (used to resume after a refresh)
app.get("/api/games/:id", (req, res) => {
    res.json(toState(req.gameId, req.game));
});

// POST /api/games/:id/roll : roll every die that is not held
app.post("/api/games/:id/roll", (req, res) => {
    const game = req.game;
    if (game.isGameOver) return fail(res, 409, "The game is over.");
    if (game.rollsUsed >= MAX_ROLLS_PER_TURN) return fail(res, 409, "No rolls left this turn.");
    if (game.dice.held.every(Boolean)) return fail(res, 409, "All dice are held, nothing to roll.");
    game.rollDice();
    res.json(toState(req.gameId, game));
});

// PUT /api/games/:id/dice/:index/hold : set one die held or not held
// body: { "held": true | false }  (PUT is idempotent: sending the same value twice is harmless)
app.put("/api/games/:id/dice/:index/hold", (req, res) => {
    const game = req.game;
    const index = Number(req.params.index);
    const { held } = req.body || {};

    if (!Number.isInteger(index) || index < 0 || index >= game.dice.numberOfDice) {
        return fail(res, 400, "Die index must be 0 to 4.");
    }
    if (typeof held !== "boolean") return fail(res, 400, 'Body must be { "held": true|false }.');
    if (game.isGameOver) return fail(res, 409, "The game is over.");
    if (game.rollsUsed === 0) return fail(res, 409, "Roll the dice before holding any.");

    if (game.dice.held[index] !== held) game.dice.toggleHold(index);
    res.json(toState(req.gameId, game));
});

// POST /api/games/:id/score : lock the current dice into a category
// body: { "category": "fullHouse" }
app.post("/api/games/:id/score", (req, res) => {
    const game = req.game;
    const { category } = req.body || {};

    if (typeof category !== "string" || !(category in game.engine.scoreTable)) {
        return fail(res, 400, "Unknown category.");
    }
    if (game.isGameOver) return fail(res, 409, "The game is over.");
    if (game.rollsUsed === 0) return fail(res, 409, "Roll the dice before scoring.");
    if (game.engine.scoreTable[category] !== null) {
        return fail(res, 409, "That category is already scored.");
    }

    const score = game.scoreCategory(category);
    res.json({ ...toState(req.gameId, game), scored: { category, score } });
});

// PUT /api/games/:id/restart : start over in the same game slot; best score is kept
app.put("/api/games/:id/restart", (req, res) => {
    req.game.startNewGame();
    res.json(toState(req.gameId, req.game));
});

// DELETE /api/games/:id : remove the game from the server
app.delete("/api/games/:id", (req, res) => {
    games.delete(req.gameId);
    res.status(204).end();
});

/*  Error handling */

// Unknown /api routes get JSON, not an HTML page
app.use("/api", (req, res) => fail(res, 404, "Unknown API route."));

// Malformed JSON bodies and any unexpected error
app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") return fail(res, 400, "Invalid JSON body.");
    console.error(err);
    fail(res, 500, "Server error.");
});

/*  Start  */

// Only listen when run directly (node server.js); tests import `app` instead
if (require.main === module) {
    app.listen(PORT, () => console.log(`Yatzy running at http://localhost:${PORT}`));
}

module.exports = { app };