const fs = require("fs/promises");

module.exports = {
    sleep: (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    logError: (msg) => {
        console.log(`\x1b[31mERROR\x1b[0m:`, msg);
    }
};
