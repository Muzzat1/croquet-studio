const fs = require('fs');

const file = './src/App.tsx';
let data = fs.readFileSync(file, 'utf8');

// 1. Strings
data = data.replace(/'striker'/g, "'blue'");
data = data.replace(/'target'/g, "'red'");
data = data.replace(/"striker"/g, '"blue"');
data = data.replace(/"target"/g, '"red"');

// 2. Constants
data = data.replace(/striker: \{ hex/g, "blue: { hex");
data = data.replace(/target: \{ hex/g, "red: { hex");
data = data.replace(/INITIAL_STRIKER_POS/g, "INITIAL_BLUE_POS");
data = data.replace(/INITIAL_TARGET_POS/g, "INITIAL_RED_POS");

// 3. Hooks
data = data.replace(/\[striker,/g, "[blue,");
data = data.replace(/\[target,/g, "[red,");
data = data.replace(/setStriker\(/g, "setBlue(");
data = data.replace(/setTarget\(/g, "setRed(");
data = data.replace(/strikerRef/g, "blueRef");
data = data.replace(/targetRef/g, "redRef");

// 4. Object properties (History format)
data = data.replace(/s: \{ \.\.\.striker \}/g, "blue: { ...blue }");
data = data.replace(/t: \{ \.\.\.target \}/g, "red: { ...red }");
data = data.replace(/s: \{ \.\.\.strikerRef\.current \}/g, "blue: { ...blueRef.current }");
data = data.replace(/t: \{ \.\.\.targetRef\.current \}/g, "red: { ...redRef.current }");
data = data.replace(/\{ s: Ball, t: Ball/g, "{ blue: Ball, red: Ball");
data = data.replace(/\.lastState\.s/g, ".lastState.blue");
data = data.replace(/\.lastState\.t/g, ".lastState.red");
data = data.replace(/lastState\.s/g, "lastState.blue");
data = data.replace(/lastState\.t/g, "lastState.red");
data = data.replace(/startState\.s/g, "startState.blue");

// 5. Catch-all variables
data = data.replace(/\bstriker\b/g, "blue");
data = data.replace(/\btarget\b/g, "red");

fs.writeFileSync(file, data);
console.log('Refactor complete!');
