const fs = require("fs/promises");

module.exports = {
    sleep: (ms) => {
        return new Promise(resolve => setTimeout(resolve, ms));
    },
    askQuestion: async (question, ReadLine) => {
        let promise = await new Promise((resolve, reject) => {
            ReadLine.question(question, (ans) => resolve(ans));
        });

        return promise;
    },
    logError: (msg) => {
        console.log(`\x1b[31mERROR\x1b[0m:`, msg);
    }
};
