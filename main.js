// main.js: connects the game logic to the page

// label + rule text for every category
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

// Which pip positions to show for each die face
const PIPS = {
    1: ["mc"],
    2: ["tl", "br"],
    3: ["tl", "mc", "br"],
    4: ["tl", "tr", "bl", "br"],
    5: ["tl", "tr", "mc", "bl", "br"],
    6: ["tl", "tr", "ml", "mr", "bl", "br"],
};

const game = new YatzyGame();
let selectedCategory = null; // the category the player has clicked
let message = "Press Roll dice to start your turn.";

// element shortcuts
const $ = (id) => document.getElementById(id);
const rollBtn = $("roll-btn");
const scoreBtn = $("score-btn");

/* Rendering */

function renderHeader() {
    $("total-score").textContent = game.totalScore;
    const done = game.isGameOver ? TOTAL_ROUNDS : game.currentRound - 1;
    $("round-text").textContent = game.isGameOver
        ? "Game complete"
        : `Round ${game.currentRound} of ${TOTAL_ROUNDS}`;
    $("round-fill").style.width = `${(done / TOTAL_ROUNDS) * 100}%`;
    $("round-bar").setAttribute("aria-valuenow", done);
}

function renderRollMeter() {
    const left = 3 - game.rollsUsed;
    let dots = "";
    for (let i = 0; i < 3; i++) {
        dots += `<span class="dot ${i < game.rollsUsed ? "used" : ""}"></span>`;
    }
    $("roll-meter").innerHTML =
        dots + `<p>${left} roll${left === 1 ? "" : "s"} left</p>`;
}

function renderDice() {
    const { values, held } = game.dice;
    const rolled = game.rollsUsed > 0;

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
    const { engine, dice, rollsUsed } = game;
    const canPick = rollsUsed > 0 && !game.isGameOver;

    // One row per category : locked score, clickable potential score, or a dash
    const row = (cat) => {
        const [label, rule] = INFO[cat];
        const locked = engine.scoreTable[cat];
        let cell;
        if (locked !== null) {
            cell = `<span class="score-value ${locked === 0 ? "zero" : ""}">${locked}</span>`;
        } else if (canPick) {
            const potential = engine.calculateScore(cat, dice.values);
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

    const upper = engine.getUpperTotal();
    const pct = Math.min(100, Math.round((upper / 63) * 100));

    $("score-body").innerHTML = `<tr class="section-row upper"><th colspan="3" scope="colgroup">Upper section</th></tr>
        ${UPPER_CATEGORIES.map(row).join("")}
        <tr class="subtotal"><th scope="row">Upper total</th>
            <td class="rule">${upper} of 63 needed
                <span class="bonus-progress"><span style="width:${pct}%"></span></span></td>
            <td class="num">${upper}</td></tr>
        <tr><th scope="row">Bonus</th><td class="rule">50 points at 63 or more</td>
            <td class="num"><span class="score-value">${engine.getBonus()}</span></td></tr>
        <tr class="section-row lower"><th colspan="3" scope="colgroup">Lower section</th></tr>
        ${LOWER_CATEGORIES.map(row).join("")}
        <tr class="grand-total"><th scope="row" colspan="2">Total score</th>
            <td class="num">${engine.getTotalScore()}</td></tr>`;                         
}

function renderControls() {
    const over = game.isGameOver;
    const noRollsLeft = game.rollsUsed >= 3;
    const allHeld = game.dice.held.every(Boolean);

    rollBtn.disabled = over || noRollsLeft || allHeld;
    rollBtn.textContent = game.rollsUsed === 0 ? "Roll dice" : "Roll again";

    if (selectedCategory && !over) {
        const pts = game.engine.calculateScore(selectedCategory, game.dice.values);
        scoreBtn.disabled = false;
        scoreBtn.textContent = `Score ${pts} in ${INFO[selectedCategory][0]}`
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
    game.dice.held.forEach((isHeld, i) => {
        if (isHeld) {
            const face = game.dice.values[i];
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
    const open = Object.keys(game.engine.scoreTable)
        .filter((cat) => game.engine.scoreTable[cat] === null)
        .map((cat) => ({cat, pts: game.engine.calculateScore(cat, game.dice.values) }));
    
    let options = open.filter((o) => o.pts > 0). sort((a, b) => b.pts - a.pts).slice(0, 3);
    if (selectedCategory) {
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

    if (game.isGameOver) {
        line1 = `Game over. Your final score is ${game.totalScore}.`;
    } else if (game.rollsUsed > 0) {
        const holding = describeHeld();
        if (game.rollsUsed >= 3) {
            line1 = "No rolls left. Pick a category to score.";
        } else if (game.dice.held.every(Boolean)) {
            line1 = "You are holding all five dice. Pick a category to score.";
        } else if (holding) {
            line1 = `You are holding ${holding}. Roll again or score them.`;
        } else {
            line1 = `Roll ${game.rollsUsed} done. Hold dice and roll again or pick a category to score.`
        }
        line2 = scoringHint();
    }

    $("message").innerHTML = `<p>${line1}</p>` + (line2 ? `<p>${line2}</p>` : "");
}

function render() {
    renderHeader();
    renderRollMeter();
    renderDice();
    renderScorecard();
    renderControls();
    renderMessage();
}

/* Actions */

function handleRoll() {
    if (game.rollDice() === null) return;
    selectedCategory = null;
    render();
    //tumble animation on the dice that were just rolled
    document.querySelectorAll(".die-slot:not(.is-held) .die")
        .forEach((d) => d.classList.add("is-rolling"));
}

function handleHold(index) {
    game.dice.toggleHold(index);
    render();
}

function handlePick(category) {
    selectedCategory = category;;
    render()
}

function handleScore() {
    if (!selectedCategory) return;
    const category = selectedCategory;
    const score = game.scoreCategory(category);
    if (score === null) return;
    selectedCategory = null;

    if (game.isGameOver) {
        showGameOver(game.result);
    } else {
        message = `Scored ${score} in ${INFO[category][0]}. Round ${game.currentRound}: roll when ready.`;
    }
    render();
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
    game.startNewGame(); // best score survives because it's on the game object
    selectedCategory = null;
    message = "New game! Press Roll dice to start.";
    $("gameover").hidden = true;
    render();
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

newGame();