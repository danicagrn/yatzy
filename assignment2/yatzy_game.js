// Game state for one Yatzy game. Lives on the server; one instance per game id
const { Dice } = require("./dice");
const { YatzyEngine } = require("./yatzy_engine");

const TOTAL_ROUNDS = 15;
const MAX_ROLLS_PER_TURN = 3;

class YatzyGame {
    constructor() {
        this.dice = new Dice(5);
        this.engine = new YatzyEngine();

        // Properties for the Yatzy Game
        this.currentPlayer = 1;
        this.currentRound = 1;
        this.totalScore = 0;

        this.rollsUsed = 0;
        this.bestScore = 0;
        this.isGameOver = false;
        this.result = null;
    }

    // Initalizes a new game
    startNewGame() {
        this.engine = new YatzyEngine();
        this.dice.reset();
        this.currentPlayer = 1;
        this.currentRound = 1;
        this.totalScore = 0;
        this.rollsUsed = 0;
        this.isGameOver = false;
        this.result = null;
    }

    // Rolls the dice that are not held (max 3 rolls per turn)
    rollDice() {
        if (this.isGameOver || this.rollsUsed >= MAX_ROLLS_PER_TURN) return null;
        if (this.dice.held.every(Boolean)) return null;
        this.dice.rollAll();
        this.rollsUsed+= 1;
        return this.dice.values;
    }

    // Scores the current dice in the chosen category, then ends the turn
    scoreCategory(category) {
        if (this.isGameOver || this.rollsUsed === 0) return null;
        const score = this.engine.recordScore(category, this.dice.values);
        if (score === null) return null;
        this.totalScore = this.engine.getTotalScore();
        this.endTurn();
        return score;
    }

    // Ends the current player's turn and moves on
    // with one player, this just starts the next round
    endTurn() {
        this.dice.reset();
        this.rollsUsed = 0;
        if (this.engine.isScorecardFull()) {
            this.result = this.endGame();
            return; 
        }
        this.currentRound  +=1
        }
    
    

    // Finalizes the game: shows the final score and updates the best score
    endGame() {
        this.isGameOver = true;
        this.totalScore = this.engine.getTotalScore();
        const isNewBest = this.totalScore > this.bestScore;
        if (isNewBest) this.bestScore = this.totalScore;
        return {
            upperTotal: this.engine.getUpperTotal(),
            bonus: this.engine.getBonus(),
            lowerTotal: this.engine.getLowerTotal(),
            finalScore: this.totalScore,
            bestScore: this.bestScore,
            isNewBest,
        };
    }
}
module.exports = { YatzyGame, TOTAL_ROUNDS, MAX_ROLLS_PER_TURN };
