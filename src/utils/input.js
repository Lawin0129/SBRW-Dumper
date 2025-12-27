let self = module.exports = {
    askQuestion: async (question, ReadLine) => {
        ReadLine.resume();

        let promise = await new Promise((resolve, reject) => {
            ReadLine.question(question, (ans) => {
                ReadLine.pause();
                resolve(ans);
            });
        });
        
        return promise;
    },
    askForNumber: async (ReadLine) => {
        return Number(await self.askQuestion(`Enter a number: `, ReadLine));
    }
};
