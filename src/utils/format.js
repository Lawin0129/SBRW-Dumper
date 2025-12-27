module.exports = {
    makeIndexedListString: (linesArray, extraOptions = []) => {
        let lines = [
            ...linesArray.map((val, idx) => ` [${idx}] ${val}`),
            ...extraOptions.map((val, idx) => ` [${linesArray.length + idx}] ${val}`)
        ];

        return lines.join("\n");
    }
};
