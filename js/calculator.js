/**
 * PRECISION CALCULATOR
 * ====================
 * A production-grade calculator demonstrating:
 * 1. Clean separation of concerns (Engine vs UI)
 * 2. IEEE 754 floating-point precision handling
 * 3. Event delegation pattern
 * 4. State machine architecture
 * 
 * Architecture Philosophy:
 * The CalculatorEngine is a pure logic layer — no DOM, no UI, no side effects.
 * The CalculatorUI is a thin presentation layer — it translates user actions
 * to Engine commands and renders Engine state to the DOM.
 * 
 * This separation means you could:
 * - Unit test the Engine without a browser
 * - Swap the UI for React/Vue without touching the Engine
 * - Add voice commands that call the same Engine API
 */

// =============================================================================
// CALCULATOR ENGINE (The Brain - Pure Logic)
// =============================================================================

class CalculatorEngine {
    /**
     * The Engine manages all calculator state and math operations.
     * It exposes a clean API and knows nothing about how it's displayed.
     */
    constructor() {
        this.reset();
        this.history = [];
        
        // IEEE 754 PRECISION FIX:
        // We'll use a precision of 12 significant digits which handles
        // most floating-point quirks while preserving reasonable accuracy.
        // Why 12? Because JavaScript reliably handles up to 15-17 digits,
        // and 12 gives us a safety margin for intermediate calculations.
        this.PRECISION = 12;
    }

    /**
     * Reset calculator to initial state.
     * This is a "state machine reset" — we return to the starting node.
     */
    reset() {
        // STATE MACHINE COMPONENTS:
        this.currentOperand = '0';      // What's being typed now
        this.previousOperand = '';      // What was typed before operator
        this.operator = null;           // Current pending operator
        this.shouldResetDisplay = false; // Flag: next digit replaces display
        this.lastResult = null;         // For chaining calculations
    }

    /**
     * SMART INPUT: Append a digit with validation.
     * Prevents invalid states like "007" or multiple leading zeros.
     * 
     * @param {string} digit - Single digit character '0'-'9'
     */
    appendDigit(digit) {
        // If we just computed a result, start fresh
        if (this.shouldResetDisplay) {
            this.currentOperand = digit;
            this.shouldResetDisplay = false;
            return;
        }

        // SMART INPUT RULE: Prevent leading zeros (but allow "0.")
        if (this.currentOperand === '0' && digit !== '0') {
            this.currentOperand = digit;
            return;
        }

        // Prevent multiple leading zeros
        if (this.currentOperand === '0' && digit === '0') {
            return;
        }

        // Limit display length to prevent overflow
        if (this.currentOperand.length >= 15) {
            return;
        }

        this.currentOperand += digit;
    }

    /**
     * SMART INPUT: Append decimal point.
     * Prevents multiple decimals — a common calculator bug.
     */
    appendDecimal() {
        if (this.shouldResetDisplay) {
            this.currentOperand = '0.';
            this.shouldResetDisplay = false;
            return;
        }

        // SMART INPUT RULE: Only one decimal allowed
        if (this.currentOperand.includes('.')) {
            return;
        }

        this.currentOperand += '.';
    }

    /**
     * Set the pending operator and prepare for second operand.
     * Handles operator chaining (e.g., "5 + 3 -" should compute 5+3 first).
     * 
     * @param {string} op - One of '+', '-', '*', '/'
     */
    setOperator(op) {
        // SMART INPUT: If we have a pending operation, compute it first
        // This enables "chained calculations" like: 5 + 3 - 2 = 6
        if (this.operator && !this.shouldResetDisplay) {
            this.compute();
        }

        this.operator = op;
        this.previousOperand = this.currentOperand;
        this.shouldResetDisplay = true;
    }

    /**
     * Delete the last character (backspace functionality).
     */
    deleteLastChar() {
        if (this.shouldResetDisplay) {
            return;
        }

        if (this.currentOperand.length === 1 || 
            (this.currentOperand.length === 2 && this.currentOperand.startsWith('-'))) {
            this.currentOperand = '0';
        } else {
            this.currentOperand = this.currentOperand.slice(0, -1);
        }
    }

    /**
     * Toggle the sign of the current operand.
     */
    toggleSign() {
        if (this.currentOperand === '0') {
            return;
        }

        if (this.currentOperand.startsWith('-')) {
            this.currentOperand = this.currentOperand.slice(1);
        } else {
            this.currentOperand = '-' + this.currentOperand;
        }
    }

    /**
     * Convert current operand to percentage (divide by 100).
     */
    applyPercent() {
        const value = parseFloat(this.currentOperand);
        this.currentOperand = this.formatResult(value / 100);
    }

    /**
     * THE CORE: Execute the pending computation.
     * This is where IEEE 754 precision handling is critical.
     * 
     * @returns {string|null} - The expression that was computed (for history)
     */
    compute() {
        if (!this.operator || this.previousOperand === '') {
            return null;
        }

        const prev = parseFloat(this.previousOperand);
        const current = parseFloat(this.currentOperand);
        let result;

        // Build the expression string for history
        const expression = `${this.previousOperand} ${this.getOperatorSymbol()} ${this.currentOperand}`;

        switch (this.operator) {
            case '+':
                result = prev + current;
                break;
            case '-':
                result = prev - current;
                break;
            case '*':
                result = prev * current;
                break;
            case '/':
                // Handle division by zero gracefully
                if (current === 0) {
                    this.currentOperand = 'Error';
                    this.operator = null;
                    this.previousOperand = '';
                    this.shouldResetDisplay = true;
                    return null;
                }
                result = prev / current;
                break;
            default:
                return null;
        }

        // FORMAT WITH PRECISION FIX
        const formattedResult = this.formatResult(result);
        
        // Store in history
        this.addToHistory(expression, formattedResult);

        // Update state
        this.lastResult = formattedResult;
        this.currentOperand = formattedResult;
        this.operator = null;
        this.previousOperand = '';
        this.shouldResetDisplay = true;

        return expression;
    }

    /**
     * IEEE 754 PRECISION FIX
     * 
     * The classic problem: 0.1 + 0.2 = 0.30000000000000004
     * 
     * Our solution: Round to PRECISION significant digits, then
     * use toPrecision() to clean up trailing zeros.
     * 
     * Why this works:
     * - JavaScript's Number.toPrecision() rounds to significant figures
     * - parseFloat() removes unnecessary trailing zeros
     * - Combined, they give us "0.3" instead of "0.30000000000000004"
     * 
     * @param {number} value - Raw calculation result
     * @returns {string} - Cleaned, precise string representation
     */
    formatResult(value) {
        if (!Number.isFinite(value)) {
            return 'Error';
        }

        // Handle very large or very small numbers with scientific notation
        if (Math.abs(value) > 1e12 || (Math.abs(value) < 1e-10 && value !== 0)) {
            return value.toExponential(6);
        }

        // THE PRECISION FIX:
        // toPrecision() rounds to N significant figures
        // parseFloat() converts back, removing trailing zeros
        // toString() gives us the clean string
        const precise = parseFloat(value.toPrecision(this.PRECISION));
        
        // Format with reasonable decimal places for display
        let formatted = precise.toString();
        
        // If it's a decimal, limit to reasonable length
        if (formatted.includes('.') && formatted.length > 15) {
            formatted = parseFloat(precise.toFixed(10)).toString();
        }

        return formatted;
    }

    /**
     * Convert internal operator to display symbol.
     */
    getOperatorSymbol() {
        const symbols = {
            '+': '+',
            '-': '−',
            '*': '×',
            '/': '÷'
        };
        return symbols[this.operator] || this.operator;
    }

    /**
     * Get the expression string for display (e.g., "5 + ").
     */
    getExpression() {
        if (!this.operator) {
            return '';
        }
        return `${this.previousOperand} ${this.getOperatorSymbol()}`;
    }

    /**
     * HISTORY STACK: Add a computation to history.
     * Limited to last 10 entries to prevent memory bloat.
     * 
     * @param {string} expression - The mathematical expression
     * @param {string} result - The computed result
     */
    addToHistory(expression, result) {
        this.history.unshift({
            expression,
            result,
            timestamp: Date.now()
        });

        // Keep history manageable
        if (this.history.length > 10) {
            this.history.pop();
        }
    }

    /**
     * Clear all history.
     */
    clearHistory() {
        this.history = [];
    }

    /**
     * Get current display value.
     */
    getDisplay() {
        return this.currentOperand;
    }

    /**
     * Get history array (immutable copy).
     */
    getHistory() {
        return [...this.history];
    }
}


// =============================================================================
// CALCULATOR UI (The Face - Presentation Layer)
// =============================================================================

class CalculatorUI {
    /**
     * The UI layer handles all DOM interaction.
     * It delegates all logic to the Engine and only concerns itself with:
     * 1. Capturing user input (clicks, keyboard)
     * 2. Rendering state to the DOM
     * 3. Managing UI-only state (like panel visibility)
     * 
     * @param {CalculatorEngine} engine - The logic engine instance
     */
    constructor(engine) {
        this.engine = engine;

        // Cache DOM references once (performance optimization)
        this.display = document.getElementById('display');
        this.expression = document.getElementById('expression');
        this.buttonGrid = document.getElementById('button-grid');
        this.historyToggle = document.getElementById('history-toggle');
        this.historyPanel = document.getElementById('history-panel');
        this.historyList = document.getElementById('history-list');
        this.clearHistoryBtn = document.getElementById('clear-history');

        // Bind all event handlers
        this.initEventListeners();
        
        // Initial render
        this.render();
    }

    /**
     * EVENT DELEGATION PATTERN
     * 
     * Instead of attaching 18 listeners to 18 buttons, we attach ONE listener
     * to the parent grid. When any button is clicked, the event "bubbles up"
     * to the grid, and we inspect which button was actually clicked.
     * 
     * Benefits:
     * 1. Memory efficient (1 listener vs 18)
     * 2. Works with dynamically added buttons
     * 3. Cleaner code — one place to handle all button logic
     */
    initEventListeners() {
        // CLICK DELEGATION: Single listener for all calculator buttons
        this.buttonGrid.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button) return;

            // Route to appropriate handler based on data attribute
            if (button.dataset.digit !== undefined) {
                this.handleDigit(button.dataset.digit);
            } else if (button.dataset.operator !== undefined) {
                this.handleOperator(button.dataset.operator);
            } else if (button.dataset.action !== undefined) {
                this.handleAction(button.dataset.action);
            }
        });

        // KEYBOARD LISTENERS: Full keyboard support
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));

        // History panel toggle
        this.historyToggle.addEventListener('click', () => this.toggleHistory());
        this.clearHistoryBtn.addEventListener('click', () => this.clearHistory());
    }

    /**
     * KEYBOARD INPUT HANDLER
     * Maps keyboard keys to calculator actions.
     * 
     * @param {KeyboardEvent} e - The keyboard event
     */
    handleKeyboard(e) {
        // Prevent default for calculator keys (stops page scrolling on Space, etc.)
        const calculatorKeys = ['0','1','2','3','4','5','6','7','8','9',
                                '+','-','*','/','.',
                                'Enter','Escape','Backspace','%'];
        
        if (calculatorKeys.includes(e.key)) {
            e.preventDefault();
        }

        // Digits
        if (/^[0-9]$/.test(e.key)) {
            this.handleDigit(e.key);
            return;
        }

        // Operators
        if (['+', '-', '*', '/'].includes(e.key)) {
            this.handleOperator(e.key);
            return;
        }

        // Special keys
        switch (e.key) {
            case '.':
            case ',': // Some keyboards use comma for decimal
                this.handleAction('decimal');
                break;
            case 'Enter':
            case '=':
                this.handleAction('equals');
                break;
            case 'Escape':
                this.handleAction('clear');
                break;
            case 'Backspace':
                this.handleBackspace();
                break;
            case '%':
                this.handleAction('percent');
                break;
        }
    }

    /**
     * Handle digit input.
     * @param {string} digit - The digit pressed
     */
    handleDigit(digit) {
        this.engine.appendDigit(digit);
        this.render();
    }

    /**
     * Handle operator input.
     * @param {string} operator - The operator pressed
     */
    handleOperator(operator) {
        this.engine.setOperator(operator);
        this.render();
    }

    /**
     * Handle special actions (clear, equals, decimal, etc.)
     * @param {string} action - The action to perform
     */
    handleAction(action) {
        switch (action) {
            case 'clear':
                this.engine.reset();
                break;
            case 'equals':
                this.engine.compute();
                this.renderHistory(); // Update history panel
                break;
            case 'decimal':
                this.engine.appendDecimal();
                break;
            case 'sign':
                this.engine.toggleSign();
                break;
            case 'percent':
                this.engine.applyPercent();
                break;
        }
        this.render();
    }

    /**
     * Handle backspace key.
     */
    handleBackspace() {
        this.engine.deleteLastChar();
        this.render();
    }

    /**
     * Render the current engine state to the DOM.
     * This is the ONLY place where we update the display.
     * Single point of rendering = easier debugging.
     */
    render() {
        this.display.textContent = this.engine.getDisplay();
        this.expression.textContent = this.engine.getExpression();
    }

    /**
     * Render the history list.
     */
    renderHistory() {
        const history = this.engine.getHistory();
        
        if (history.length === 0) {
            this.historyList.innerHTML = '<li class="text-calc-light/30 italic">No history yet</li>';
            return;
        }

        this.historyList.innerHTML = history
            .map(item => `
                <li class="flex justify-between items-center py-1 border-b border-calc-light/10 last:border-0">
                    <span class="text-calc-light/50">${this.escapeHtml(item.expression)}</span>
                    <span class="text-calc-light font-semibold">= ${this.escapeHtml(item.result)}</span>
                </li>
            `)
            .join('');
    }

    /**
     * Toggle history panel visibility.
     */
    toggleHistory() {
        const isHidden = this.historyPanel.classList.contains('hidden');
        
        if (isHidden) {
            this.historyPanel.classList.remove('hidden');
            this.historyToggle.textContent = 'History ▴';
            this.renderHistory();
        } else {
            this.historyPanel.classList.add('hidden');
            this.historyToggle.textContent = 'History ▾';
        }
    }

    /**
     * Clear history and re-render.
     */
    clearHistory() {
        this.engine.clearHistory();
        this.renderHistory();
    }

    /**
     * XSS Prevention: Escape HTML entities.
     * Even in a calculator, always sanitize before innerHTML.
     * 
     * @param {string} text - Text to escape
     * @returns {string} - Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}


// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Bootstrap the application.
 * We wait for DOM ready, then instantiate our classes.
 * 
 * Note the dependency injection pattern: UI receives Engine as a parameter.
 * This makes testing easy — you could inject a mock Engine for unit tests.
 */
document.addEventListener('DOMContentLoaded', () => {
    // Create the logic engine
    const engine = new CalculatorEngine();
    
    // Create the UI, injecting the engine
    const ui = new CalculatorUI(engine);

    // Expose to console for debugging (remove in production)
    if (typeof window !== 'undefined') {
        window.__calculator = { engine, ui };
    }

    console.log('🧮 Precision Calculator initialized. Try 0.1 + 0.2!');
});
