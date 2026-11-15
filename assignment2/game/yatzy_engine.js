// Handles the rules and score calculation 

// Upper section (6 categories) + bonus
const UPPER_CATEGORIES = ["ones", "twos", "threes", "fours", "fives", "sixes"];

// Lower section (9 categories)
const LOWER_CATEGORIES = [
    "onePair",
    "twoPairs",
    "threeOfAKind",
    "fourOfAKind",
    "smallStraight", // 1-2-3-4-5 = 15 points 
    "largeStraight", // 2-3-4-5-6 = 20 points
    "fullHouse",
    "chance",
    "yatzy",        // five of the same = 50 points
];

const BONUS_THRESHOLD = 63;
const BONUS_POINTS = 50;

// Maps each upper category to the die face it counts
const UPPER_FACE = {
    ones: 1,
    twos: 2,
    threes: 3,
    fours: 4,
    fives: 5,
    sixes: 6
};

// helper functions
const sum = (numbers) => numbers.reduce((total, n) => total + n, 0);
const sumDice = sum;

// counts[face] = how many dice show that face (index 0 is unused)
function countFaces(diceValues) {
    const counts = [0, 0, 0, 0 , 0, 0, 0];
    diceValues.forEach((v) => counts[v]++);
    return counts;
}

// Highest face that appears at least n times, or 0 if none
function highestFaceWithCount(counts, n) {
    for (let face = 6; face >= 1; face--) {
        if (counts[face] >= n) return face;
    }
    return 0;
}

class YatzyEngine {
    constructor() {
        // score table: one entry per category (15 total)
        // null = not scored yet, a number = the score locked in (0 is allowed)
        this.scoreTable = {};
        [...UPPER_CATEGORIES, ...LOWER_CATEGORIES].forEach((category) => {
            this.scoreTable[category] = null;
        });
    }
    // Returns the score for the category based on dice values
    calculateScore(category, diceValues) {
        const counts = countFaces(diceValues);

        // Upper section
        if (UPPER_CATEGORIES.includes(category)) {
            const face = UPPER_FACE[category];
            return counts[face] * face;

        }
        switch (category) {
            case "onePair": 
                return highestFaceWithCount(counts, 2) * 2;
        
            case "twoPairs": {
                const pairFaces = [];
                for (let face = 6; face >= 1; face--) {
                    if (counts[face] >= 2) pairFaces.push(face);
                }
                if (pairFaces.length < 2) return 0;
                return (pairFaces[0] + pairFaces[1]) * 2;

            }
            case "threeOfAKind":
                return highestFaceWithCount(counts, 3) * 3; 


            case "fourOfAKind": 
                return highestFaceWithCount(counts, 4) * 4;
            
            case "smallStraight": 
                return [1, 2, 3, 4, 5].every((f) => counts[f] === 1) ? 15 : 0
            
            case "largeStraight": 
                return [2, 3, 4, 5, 6].every((f) => counts[f] === 1) ? 20 : 0;
           
            case "fullHouse": 
                return counts.includes(3) && counts.includes(2) ? sumDice(diceValues) : 0;
            
            case "chance": 
                return sumDice(diceValues);
            
            case "yatzy": 
                return counts.includes(5) ? 50 : 0;
            
            default: 
                return 0;
        }
    }

    // Checks whether the player can score in this category with these dice.
    // Valid means: the category exists, it is still empty, and the dice
    // are a legal 5 dice roll (A 0 score is still allowed, since the rules
    // let the player enter a 0 in a category they can afford to lose.)
    isValidSelection(category, diceValues) {
        if (!(category in this.scoreTable)) return false;
        if (this.scoreTable[category] !== null) return false;
        if (!Array.isArray(diceValues) || diceValues.length !== 5) return false;
        return diceValues.every((v) => Number.isInteger(v) && v >= 1 && v <= 6);
    }

    // Locks a score into the score table for a category, returns score or null if invalid
    recordScore(category, diceValues) {
        if (!this.isValidSelection(category, diceValues)) return null;
        const score = this.calculateScore(category, diceValues);
        this.scoreTable[category] = score;
        return score;
    }

    // Sum of the upper section scores (used for the bonus)
    getUpperTotal() {
        return sum(UPPER_CATEGORIES.map((c) => this.scoreTable[c] ?? 0))
    }

    // Returns 50 if the upper total is 63 or more, otherwise 0.
    getBonus() {
        return this.getUpperTotal() >= BONUS_THRESHOLD ? BONUS_POINTS : 0;
    }

    // Sum of the lower section scores
    getLowerTotal() {
        return sum(LOWER_CATEGORIES.map((c) => this.scoreTable[c] ?? 0));
    }

    // Upper total + bonus + lower total
    getTotalScore() {
        return this.getUpperTotal() + this.getBonus() + this.getLowerTotal();
    }

    // True when all 15 categories have been scored
    isScorecardFull() {
        return Object.values(this.scoreTable).every((score) => score !== null);
        
    }
}

module.exports = { YatzyEngine, UPPER_CATEGORIES, LOWER_CATEGORIES };