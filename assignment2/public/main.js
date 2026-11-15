// main.js: is the client. It draws the UI and talks to server with fetch()
// all game rules, dice rolls and scoring live on the the server

// label + rule text for every category (presentation only)
const INFO = {
    ones: ["Ones", "Sum of all 1s"],
    twos: ["Twos", "Sum of all 2s"],
    threes: ["Threes", "Sum of all 3s"],
    fours: ["Fours", "Sum of all 4s"],
    fives: ["Fives", "Sum of all 5s"],
    sixes: ["Sixes", "Sum of all 6s"],
    onePair: ["One Pair", "Sum of the two matching dice"],
    twoPairs: ["Two Pairs", "Sum of the four dice in two different pairs"],
    threeOfAKind: ["Three of a Kind", "Sum of the three matching dice"],
    fourOfAKind: ["Four of a Kind", "Sum of the four matching dice"],
    smallStraight: ["Small Straight", "1-2-3-4-5 scores 15"],
    largeStraight: ["Large Straight", "2-3-4-5-6 scores 20"],
    fullHouse: ["Full House", "Three of one number and two of another: sum of all five"],
    chance: ["Chance", "Sum of all five dice"],
    yatzy: ["Yatzy", "Five of the same number scores 50"],
};

// Display order of the two scorecard sections
const UPPER_CATEGORIES = ["ones", "twos", "threes", "fours", "fives", "sixes"];
const LOWER_CATEGORIES = ["onePair", "twoPairs", "threeofAKind", "fourOfAKind", "smallStraight", "largeStraight", "fullHouse", "chance", "yatzy"];

// Which pip positions to show for each die face
const PIPS = {
    1: ["mc"],
    2: ["tl", "br"],
    3: ["tl", "mc", "br"],
    4: ["tl", "tr", "bl", "br"],
    5: ["tl", "tr", "mc", "bl", "br"],
    6: ["tl", "tr", "ml", "mr", "bl", "br"],
};

const GAME_ID_KEY = "yatzyGameId"; // remembered so a page refresh resumes the game

let state = null; // the latest game state sent by the server
let selectedCategory = null; // the category the player has clicked (UI only)
let message = "Press Roll dice to start your turn";
let errorMessage = "" // shown instead of the normal message when a request fails
let busy = false; // true while a request is in flight

// element shortcuts
const $ = (id) => document.getElementById(id);
const rollBtn = $("roll-btn");
const scoreBtn = $("score-btn");

/* Server communication (Fetch API) */

// One helper for every request. Returns parsed JSON (or null for 204)
// On a non-2xx response it throws an Error carrying the server's message + status
async function api(method, url, body) {
    const options = { method };
    if (body !== undefined) {
        options.headers = { "Content-Type": "application/json" };
        options.body = JSON.stringify(body);
    }
    const res = await fetch(url, options);
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if(!res.ok) {
        const err = new Error(data.error || `Request failed (${res.status})`);
        err.status = res.status;
        throw err;
    }
    return data;
}

// Creates a game on the server and remembers its id
async function createGame() {
    state = await api ("POST", "/api/games");
    sessionStorage.setItem(GAME_ID_KEY, state.id);
}

// Runs one player action: blocks double clicks, handles errors, then redraws
async function run(action) {
    if (busy) return;
    busy = true;
    errorMessage = "";
    try {
        await action();
    } catch (err) {
        if (err.status === 404) {
            // server forgot game (restart or timeout): begin a fresh one
            try {
                await createGame();
                selectedCategory = null
                $("gameover").hidden = true
                message = "The server lost your game, so a new one was started";
            } catch (e) {
                errorMessage = "Cannot reach the server. Is it running?";
            }
        } else if (err instanceof TypeError) {
            errorMessage = "Cannot reach the server. Is it Running"; // fetch network failure
        } else {
            errorMessage = err.message;
        }
    } finally {
        busy = false;
        render();
    }
}

/* Rendering */

function renderHeader() {
    $("total-score").textContent = state.totalScore;
    const total = state.totalRounds;
    const done = state.isGameOver ? total : state.currentRound - 1;
    $("round-text").textContent = state.isGameOver
        ? "Game complete"
        : `Round ${state.currentRound} of ${total}`;
    $("round-fill").style.width = `${(done / total) * 100}%`;
    $("round-bar").setAttribute("aria-valuenow", done);
}

function renderRollMeter() {
    const left = state.maxRolls - state.rollsUsed;
    let dots = "";
    for (let i = 0; i < state.maxRolls; i++) {
        dots += `<span class="dot ${i < game.rollsUsed ? "used" : ""}"></span>`;
    }
    $("roll-meter").innerHTML =
        dots + `<p>${left} roll${left === 1 ? "" : "s"} left</p>`;
}

function renderDice() {
    const { values, held } = state.dice;
    const rolled = state.rollsUsed > 0;

    $("dice-tray").innerHTML = values.map((value, i) => {
        const pips = (PIPS[value] || [])
            .map((pos) => `<span class="pip ${pos}"></span>`).join("");
        const tag = !rolled ? "" : held[i] ? "Held" : "Will reroll";
        const label = rolled
            ? `Die ${i + 1}: ${value}, ${held[i] ? "held" : "will reroll"}`
            : `Die ${i + 1}: not rolled yet`;
        return `
            <li class="die-slot ${held[i] ? "is-held" : ""}">
                <button class="die ${rolled ? "" : "is-blank"}" data-index="${i}"
                    aria-pressed="${held[i]}" aria-label="${label}"
                    ${rolled && !game.isGameOver ? "" : "disabled"}>${pips}</button>
                <span class="die-tag">${tag}</span>
            </li>`;
    }).join("");
}

function renderScorecard() {
    const canPick = state.rollsUsed > 0 && !state.isGameOver;

    // One row per category : locked score, clickable potential score, or a dash
    const row = (cat) => {
        const [label, rule] = INFO[cat];
        const locked = state.scoreTable[cat];
        let cell;
        if (locked !== null) {
            cell = `<span class="score-value ${locked === 0 ? "zero" : ""}">${locked}</span>`;
        } else if (canPick) {
            const potential = state.calculateScore(cat, dice.values);
            const cls = ["pick", potential === 0 ? "is-zero" : "", cat === selectedCategory ? "is-selected" : ""].join(" ");
            cell = `<button class="${cls}" data-category="${cat}" 
                        aria-pressed="${cat === selectedCategory}" 
                        aria-label="Score ${potential} in ${label}">${potential}</button>`;   
        } else {
            cell = `<span class="score-value dash">-</span>`;
        }
        return `<tr><th scope="row">${label}</th>
                <td class="rule">${rule}</td><td class="num">${cell}</td></tr>`;
    };

    const upper = state.getUpperTotal();
    const pct = Math.min(100, Math.round((upper / 63) * 100));

    $("score-body").innerHTML = `<tr class="section-row upper"><th colspan="3" scope="colgroup">Upper section</th></tr>
        ${UPPER_CATEGORIES.map(row).join("")}
        <tr class="subtotal"><th scope="row">Upper total</th>
            <td class="rule">${upper} of 63 needed
                <span class="bonus-progress"><span style="width:${pct}%"></span></span></td>
            <td class="num">${upper}</td></tr>
        <tr><th scope="row">Bonus</th><td class="rule">50 points at 63 or more</td>
            <td class="num"><span class="score-value">${state.bonus()}</span></td></tr>
        <tr class="section-row lower"><th colspan="3" scope="colgroup">Lower section</th></tr>
        ${LOWER_CATEGORIES.map(row).join("")}
        <tr class="grand-total"><th scope="row" colspan="2">Total score</th>
            <td class="num">${state.getTotalScore()}</td></tr>`;                         
}

function renderControls() {
    const over = state.isGameOver;
    const noRollsLeft = state.rollsUsed >= state.maxRolls;
    const allHeld = state.dice.held.every(Boolean);

    rollBtn.disabled = busy || over || noRollsLeft || allHeld;
    rollBtn.textContent = state.rollsUsed === 0 ? "Roll dice" : "Roll again";

    if (selectedCategory && !over) {
        scoreBtn.disabled = busy;
        scoreBtn.textContent = `Score ${state.potentialScores[selectedCategory]} in ${INFO[selectedCategory][0]}`;
    } else {
        scoreBtn.disabled = true;
        scoreBtn.textContent = "Pick a category";
    }
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five"];

// the sentence case 
const sentenceCase = (text) => text.charAt(0) + text.slice(1).toLowerCase();

// describes which dice are held 
function describeHeld() {
    const counts = {}
    state.dice.held.forEach((isHeld, i) => {
        if (isHeld) {
            const face = state.dice.values[i];
            counts [face] = (counts[face] || 0) + 1;
        }
    });
    const parts = Object.entries(counts)
        .sort((a, b) => b[1] - a[1] || b[0] - a[0])
        .map(([face, n]) => `${NUMBER_WORDS[n]} ${face}${n > 1 ?"s" : ""}`);
    if (parts.length <= 1) return parts.join("");
    return parts.slice(0, -1).join(",") + " and " + parts[parts.length -1];    
}

// second line of message box: what the best open categories would score
// the category the player has clicked (if any) is listed first 
function scoringHint() {
    const open = Object.keys(state.potentialScores).map(([cat, pts]) => ({ cat, pts }));
    
    let options = open.filter((o) => o.pts > 0). sort((a, b) => b.pts - a.pts).slice(0, 3);
    if (selectedCategory && state.potentialScores[selectedCategory] !== undefined) {
        const chosen = open.find((o) => o.cat === selectedCategory);
        options = [chosen, ...options.filter((o) => o.cat !== selectedCategory)].slice(0, 3);
    }
    if (options.length === 0) {
        return "Nothing scores right now. You can enter a 0 in a category you can afford to lose.";
    }
    return options.map((o, i) => {
        const name = sentenceCase(INFO[o.cat][0]);
        const also = i > 0 && o.pts === options[i - 1].pts ? "also" : "";
        return `${name} would ${also} score ${o.pts}`;
    }).join(" ");
}

function renderMessage() {
    let line1 = message;
    let line2 = "";

    if (state.isGameOver) {
        line1 = `Game over. Your final score is ${state.totalScore}.`;
    } else if (state.rollsUsed > 0) {
        const holding = describeHeld();
        if (state.rollsUsed >= 3) {
            line1 = "No rolls left. Pick a category to score.";
        } else if (state.dice.held.every(Boolean)) {
            line1 = "You are holding all five dice. Pick a category to score.";
        } else if (holding) {
            line1 = `You are holding ${holding}. Roll again or score them.`;
        } else {
            line1 = `Roll ${state.rollsUsed} done. Hold dice and roll again or pick a category to score.`
        }
        line2 = scoringHint();
    }
    // a failed request overrides the normal text
    if (errorMessage) {
        line1 = errorMessage;
        line2 = "";
    }

    // textContent keeps server provided text from treated as HTML
    const box = $("message");
    box.innerHTML = "";
    [line1, line2].filter(Boolean).forEach((text) => {
        const p = document.createElement("p");
        p.textContent = text;
        box.appendChild(p);
    });
}

function render() {
    if (!state) return // nothing to draw until the server has answered
    renderHeader();
    renderRollMeter();
    renderDice();
    renderScorecard();
    renderControls();
    renderMessage();
}

/* Actions (each one sends a request, then the server's answer is drawn) */

function handleRoll() {
    return run(async () => {
        state = await api("POST", `/api/games/${state.id}/roll`);
        selectedCategory = null;
        render();
        // tumble animation on the dice that were just rolled 
        document.querySelectorAll(".die-slot:not(.is-held .die")
            .forEach((d) => d.classList.add("is-rolling"));
    });
}

function handleHold(index) {
    const nowHeld = !state.dice.held[index];
    return run(async () => {
        state = await api("PUT", `/api/games/${state.id}/dice/${index}/hold`, {held: nowHeld});
    });
}

// Picking a category is a UI selection, so it needs no server call
function handlePick(category) {
    selectedCategory = category;;
    render()
}

function handleScore() {
    if (!selectedCategory) return;
    const category = selectedCategory;
    return run(async () => {
        const data = await api("POST",`/api/games/${state.id}/score`, { category });
        state = data;
        selectedCategory = null;
        if (state.isGameOver) {
            showGameOver(state.result);
        } else {
            message = `Scored ${data.scored.score} in ${INFO[category][0]}. Round ${state.currentRound}: roll when ready.`;
        }
    });
}

function showGameOver(result) {
    const f = result.finalScore;
    let text;
    if (f >= 200) text = "Outstanding! You cleared the 200 point mark";
    else if (f >= 150) text = "Nice game! A solid score.";
    else text = "Good effort. Better luck next time. You can beat this!";
    if (result.isNewBest) text += " New personal best!";

    $("over-message").textContent = text;
    $("over-final").textContent = f;
    $("over-upper").textContent = result.upperTotal;
    $("over-bonus").textContent = result.bonus;
    $("over-lower").textContent = result.lowerTotal;
    $("over-best").textContent = result.bestScore;
    $("gameover").hidden = false;
    $("gameover").scrollIntoView({ behavior: "smooth"});
}

function newGame() {
    return run(async () => {
        // The server keeps the best score when a game is restarted
        state = await api ("PUT",`/api/games/${state.id}/restart`);
        selectedCategory = null;
        message = "New Game! Press Roll to start.";
        $("gameover").hidden = true
    });
}

/* Events */

rollBtn.addEventListener("click", handleRoll);
scoreBtn.addEventListener("click", handleScore);
$("again-btn").addEventListener("click", newGame);

// Event delegation: dice and scorecard are re-rendered, so listen on parents
$("dice-tray").addEventListener("click", (e) => {
    const die = e.target.closest(".die");
    if (die) handleHold(Number(die.dataset.index));
});
$("score-body").addEventListener("click", (e) => {
    const pick = e.target.closest(".pick");
    if (pick) handlePick(pick.dataset.category);
});

/* Start: resume the saved game if the server still has it. otherwise create one */

async function init() {
    busy = true;
    try {
        const savedId = sessionStorage.getItem(GAME_ID_KEY);
        if (savedId) {
            try {
                state = await api("GET", `/api/games/${savedId}`);
                message = "Welecome back! Your game was restored.";
            } catch (err) {
                if (err.status !== 404) throw err;
            }
        }
        if (!state) {
            await createGame();
            message = "New game! Press Roll dice to start";
        }
        if (state.isGameOver) showGameOver(state.result);
    } catch (err) {
        errorMessage = "Cannot reach the server. Is it running?";
        $("message").innerHTML = `<p>${errorMessage}</p>`;
    } finally {
        busy = false;
        render();
    }
}

init();